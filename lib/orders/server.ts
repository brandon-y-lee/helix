import "server-only";

import type Stripe from "stripe";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  CHECKOUT_ENVIRONMENT,
  STRIPE_API_VERSION,
  STRIPE_SANDBOX_ACCOUNT_ID,
  SANDBOX_CHECKOUT_NOTICE,
  assertSandboxStripeObject,
  readCheckoutConfig,
  readPaymentProviderConfig,
  type PaymentProviderConfig,
} from "@/lib/checkout/config";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import { CHECKOUT_PAYMENT_METHOD_TYPES } from "@/lib/checkout/payment-methods";
import {
  admitCheckoutCreation,
  cacheCreatedCheckoutSession,
  CheckoutAdmissionError,
  claimPaymentRefresh,
  finishPaymentRefresh,
  type CachedCheckoutSession,
  type PaymentRefreshTarget,
} from "@/lib/checkout/admission";
import {
  checkoutOrderIdempotencyKey,
  checkoutSessionDisposition,
  stripeCheckoutIdempotencyKeyForOrder,
} from "@/lib/checkout/idempotency";
import {
  checkoutCancellationState,
} from "@/lib/checkout/stripe-state";
import {
  getActiveCartIdentity,
  getCheckoutCartSnapshot,
  type CheckoutCartLine,
} from "@/lib/cart/server";
import { CartError } from "@/lib/cart/types";
import {
  CHECKOUT_CANCEL_COOKIE,
  CHECKOUT_CANCEL_COOKIE_MAX_AGE_SECONDS,
  CHECKOUT_CANCEL_COOKIE_PATH,
  buildCheckoutCancelUrl,
} from "@/lib/orders/checkout-cancel";
import {
  calculatePurchasePoints,
  isReferralSubtotalEligible,
  rewardDiscountForTier,
  rewardTierById,
  type RewardTier,
} from "@/lib/rewards/rules";
import {
  PointsReservationUnavailableError,
  awardPaidOrderPoints,
  reservePointsForOrder,
} from "@/lib/rewards/operations";
import {
  qualifiesForFreeStandardShipping,
} from "@/content/support/policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/server";
import {
  expireCheckoutPaymentProviderSession,
  retrieveCheckoutPaymentProviderBundle,
  verifyStripeAccount,
} from "@/lib/stripe/payment-verification";
import {
  verifyCheckoutPayment,
  checkoutSessionDefinitelyExpired,
  type CheckoutPaymentProviderBundle,
} from "@/lib/checkout/payment-verification";
import {
  finalizeVerifiedCheckoutPayment,
  getCheckoutPaymentException,
  isLegacyCheckoutOrder,
  loadCheckoutPaymentContract,
  readVerifiedCheckoutDelivery,
  recordCheckoutPaymentException,
  resolveCheckoutPaymentExceptions,
  type CheckoutPaymentException,
} from "@/lib/orders/payment-contracts";
import { authorizeCheckoutReceipt, ensureGuestReceiptBinding } from "@/lib/orders/receipt-access";
import type { OrderConfirmationDisplay } from "@/lib/orders/confirmation";
import { getCurrentUser } from "@/lib/auth/session";
import { REFERRAL_COOKIE } from "@/lib/referrals/constants";
import {
  qualifyReferralForPaidOrder,
  resolveReferralOfferForCheckout,
  type ReferralOffer,
} from "@/lib/referrals/server";

import { prepareCheckoutAttemptOnce, startCheckoutAttemptSend, readPendingCheckoutAttempt,
  bindCheckoutAttemptSession, findUnresolvedCheckoutOrder } from "@/lib/checkout/attempts";

const CHECKOUT_SCHEMA_VERSION = "checkout_v2";

type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "cancelled" | "refunded";

export type OrderRow = {
  id: string;
  order_number: string;
  user_id: string | null;
  cart_id: string | null;
  checkout_generation: string | null;
  checkout_attempt_token: string | null;
  checkout_attempt_started_at: string | null;
  status: OrderStatus;
  checkout_environment: "sandbox";
  currency: "USD";
  customer_email: string | null;
  merchandise_subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  referral_code: string | null;
  reward_points_redeemed: number;
  reward_discount_cents: number;
  reward_points_earned: number;
  shipping_name: string | null;
  shipping_address: Record<string, unknown>;
  billing_address: Record<string, unknown>;
  metadata: Record<string, unknown>;
  idempotency_key: string;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
};

type OrderItemSnapshot = {
  id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  variant_key: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  line_subtotal_cents: number;
  product_snapshot: Record<string, unknown>;
};

export type OrderConfirmation = OrderConfirmationDisplay;

type CreateCheckoutInput = {
  rewardTierId?: unknown;
};

type CreateCheckoutResult = {
  orderId: string;
  orderNumber: string;
  sessionId: string;
  url: string;
};

class CheckoutError extends Error {
  code:
    | "empty_cart"
    | "unavailable_cart"
    | "checkout_unavailable"
    | "checkout_in_progress"
    | "shipping_unavailable"
    | "reward_unavailable";

  constructor(code: CheckoutError["code"], message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function setPendingCheckoutCookie(orderId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CHECKOUT_CANCEL_COOKIE, orderId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: CHECKOUT_CANCEL_COOKIE_PATH,
    maxAge: CHECKOUT_CANCEL_COOKIE_MAX_AGE_SECONDS,
  });
}

async function clearPendingCheckoutCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CHECKOUT_CANCEL_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: CHECKOUT_CANCEL_COOKIE_PATH,
    maxAge: 0,
  });
}

function stripeLineItem(line: OrderItemSnapshot): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: line.quantity,
    price_data: {
      currency: "usd",
      unit_amount: line.unit_price_cents,
      product_data: {
        name: line.product_name,
        metadata: {
          product_id: line.product_id,
          slug: line.product_slug,
          variant_key: line.variant_key,
          order_line_id: line.id,
        },
      },
    },
  };
}

async function verifiedExistingStripeCustomer(input: {
  config: PaymentProviderConfig; userId: string | null;
}): Promise<string | undefined> {
  if (!input.userId) return undefined;
  const { data, error } = await createSupabaseAdminClient().from("stripe_customers").select("stripe_customer_id")
    .eq("user_id", input.userId).eq("checkout_environment", CHECKOUT_ENVIRONMENT).maybeSingle();
  if (error) throw new CheckoutAdmissionError(503);
  const existing = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!existing) return undefined;
  if (!/^cus_[A-Za-z0-9_]+$/.test(existing)) throw new CheckoutAdmissionError(503);
  const stripe = getStripeClient(input.config);
  await verifyStripeAccount(stripe);
  try {
    const customer = await stripe.customers.retrieve(existing, {}, { apiVersion: STRIPE_API_VERSION, timeout: 4_000, maxNetworkRetries: 2 });
    if (customer.id !== existing || customer.deleted || customer.livemode !== false) throw new CheckoutAdmissionError(503);
    return existing;
  } catch { throw new CheckoutAdmissionError(503); }
}

async function resolvePaidShippingCents(
  config: PaymentProviderConfig,
  stripe: Stripe,
  qualifiesForFreeShipping: boolean,
): Promise<number> {
  if (qualifiesForFreeShipping) return 0;
  if (!config.standardShippingRateId) {
    throw new CheckoutError(
      "shipping_unavailable",
      "Paid standard shipping is not configured for sandbox checkout yet.",
    );
  }

  const target: PaymentRefreshTarget = { kind: "shipping_rate", shippingRateId: config.standardShippingRateId };
  const claim = await claimPaymentRefresh({ accountId: config.accountId, target });
  if (!claim.allowed || !claim.token) {
    if (claim.cached?.kind === "shipping_rate") return claim.cached.amountCents;
    throw new CheckoutAdmissionError(429, Math.max(1, claim.retryAfterSeconds));
  }
  try {
    await verifyStripeAccount(stripe);
    const rate = await stripe.shippingRates.retrieve(config.standardShippingRateId);
    assertSandboxStripeObject(rate);
    if (rate.livemode !== false || rate.id !== config.standardShippingRateId || rate.fixed_amount?.currency !== "usd" ||
      !Number.isSafeInteger(rate.fixed_amount.amount) || rate.fixed_amount.amount < 0) {
      throw new CheckoutError(
        "shipping_unavailable",
        "The configured sandbox shipping rate must be a fixed USD rate.",
      );
    }
    const completed = await finishPaymentRefresh({
      accountId: config.accountId, target, token: claim.token,
      snapshot: { kind: "shipping_rate", id: rate.id, amountCents: rate.fixed_amount.amount, currency: "usd" },
    });
    if (!completed) throw new CheckoutAdmissionError(503);
    return rate.fixed_amount.amount;
  } catch (error) {
    await finishPaymentRefresh({ accountId: config.accountId, target, token: claim.token, snapshot: null });
    throw error;
  }
}

function checkoutRefreshSnapshot(session: Stripe.Checkout.Session): CachedCheckoutSession {
  assertSandboxStripeObject(session);
  if (session.livemode !== false || !session.status) throw new CheckoutAdmissionError(503);
  return {
    kind: "session",
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    expires_at: session.expires_at,
    url: session.url,
    livemode: false,
    payment_method_types: session.payment_method_types,
  };
}

async function refreshOwnedCheckoutSession(
  config: PaymentProviderConfig,
  stripe: Stripe,
  order: OrderRow,
  sessionId: string,
): Promise<{ verified: Stripe.Checkout.Session | null; provider: CheckoutPaymentProviderBundle | null; cached: CachedCheckoutSession | null; retryAfterSeconds: number }> {
  const target: PaymentRefreshTarget = { kind: "session", orderId: order.id, sessionId };
  const claim = await claimPaymentRefresh({ accountId: config.accountId, target });
  const cached = claim.cached?.kind === "session" ? claim.cached : null;
  if (!claim.allowed || !claim.token) return { verified: null, provider: null, cached, retryAfterSeconds: claim.retryAfterSeconds };
  try {
    const provider = await retrieveCheckoutPaymentProviderBundle({ sessionId, stripe });
    const session = provider.session;
    const completed = await finishPaymentRefresh({
      accountId: config.accountId, target, token: claim.token, snapshot: checkoutRefreshSnapshot(session),
    });
    return { verified: completed ? session : null, provider: completed ? provider : null, cached: completed ? checkoutRefreshSnapshot(session) : null, retryAfterSeconds: 5 };
  } catch (error) {
    await finishPaymentRefresh({ accountId: config.accountId, target, token: claim.token, snapshot: null });
    throw error;
  }
}

function shippingOptions(
  config: PaymentProviderConfig,
  qualifiesForFreeShipping: boolean,
): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  if (qualifiesForFreeShipping) {
    return [
      {
        shipping_rate_data: {
          display_name: "Standard shipping",
          type: "fixed_amount",
          fixed_amount: { amount: 0, currency: "usd" },
          delivery_estimate: {
            minimum: { unit: "business_day", value: 3 },
            maximum: { unit: "business_day", value: 10 },
          },
          metadata: {
            environment: CHECKOUT_ENVIRONMENT,
            free_shipping_threshold: "5000",
          },
        },
      },
    ];
  }

  if (!config.standardShippingRateId) {
    throw new CheckoutError(
      "shipping_unavailable",
      "Paid standard shipping is not configured for sandbox checkout yet.",
    );
  }

  return [{ shipping_rate: config.standardShippingRateId }];
}

async function referralCodeFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const code = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (!code) return null;
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 6 ? normalized.slice(0, 16) : null;
}

async function resolveReferralOffer(input: {
  userId: string | null;
  merchandiseSubtotalCents: number;
  rewardTier: RewardTier | null;
}): Promise<ReferralOffer | null> {
  if (!input.userId || input.rewardTier) return null;
  if (!isReferralSubtotalEligible(input.merchandiseSubtotalCents)) return null;

  const code = await referralCodeFromCookie();
  if (!code) return null;

  return resolveReferralOfferForCheckout({
    code,
    userId: input.userId,
    merchandiseSubtotalCents: input.merchandiseSubtotalCents,
  });
}

function couponIdForReward(config: PaymentProviderConfig, tier: RewardTier | null): string | null {
  if (!tier) return null;
  if (tier.id === "points_200") return config.rewardCouponIds.points200;
  if (tier.id === "points_400") return config.rewardCouponIds.points400;
  return config.rewardCouponIds.points600;
}

async function reserveOrderSnapshot(input: {
  cartId: string;
  checkoutGeneration: string;
  userId: string | null;
  email: string | null;
  lines: CheckoutCartLine[];
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingCents: number;
  rewardTier: RewardTier | null;
  referralOffer: ReferralOffer | null;
  idempotencyKey: string;
}): Promise<OrderRow> {
  const admin = createSupabaseAdminClient();
  const totalCents = Math.max(0, input.merchandiseSubtotalCents - input.discountCents) + input.shippingCents;
  const metadata = {
    schema: CHECKOUT_SCHEMA_VERSION,
    sandbox_notice: SANDBOX_CHECKOUT_NOTICE,
    reward_tier_id: input.rewardTier?.id ?? null,
    referral_code: input.referralOffer?.code ?? null,
    checkout_generation: input.checkoutGeneration,
  };
  const { data, error } = await admin
    .rpc("reserve_checkout_order_snapshot_v2", {
      p_idempotency_key: input.idempotencyKey,
      p_user_id: input.userId,
      p_cart_id: input.cartId,
      p_checkout_generation: input.checkoutGeneration,
      p_customer_email: input.email,
      p_currency: "USD",
      p_merchandise_subtotal_cents: input.merchandiseSubtotalCents,
      p_discount_cents: input.discountCents,
      p_shipping_cents: input.shippingCents,
      p_tax_cents: 0,
      p_total_cents: totalCents,
      p_referral_code: input.referralOffer?.code ?? null,
      p_reward_points_redeemed: input.rewardTier?.points ?? 0,
      p_reward_discount_cents: input.rewardTier ? input.discountCents : 0,
      p_checkout_environment: CHECKOUT_ENVIRONMENT,
      p_metadata: metadata,
      p_items: input.lines.map((line) => ({
        product_id: line.productId,
        product_slug: line.slug,
        product_name: line.name,
        variant_key: line.variantId,
        variant_label: line.variantLabel,
        unit_price_cents: line.price,
        quantity: line.quantity,
        line_subtotal_cents: line.lineSubtotal,
        product_snapshot: line.productSnapshot,
      })),
    })
    .single();

  if (error?.code === "P0001" && error.message === "checkout already reserved for cart generation") {
    throw new CheckoutError(
      "checkout_in_progress",
      "This cart already has an active checkout. Return from it before starting another.",
    );
  }
  if (
    error &&
    (error.code === "40001" ||
      (error.code === "P0001" && error.message === "checkout cart changed"))
  ) {
    throw new CheckoutError(
      "checkout_unavailable",
      "Your cart changed. Review it and try again.",
    );
  }
  if (error) throw new Error("[orders] Failed to reserve order snapshot.");
  return data as OrderRow;
}

async function createReferralAttribution(
  order: OrderRow,
  referralOffer: ReferralOffer | null,
): Promise<void> {
  if (!referralOffer || !order.user_id) return;

  const admin = createSupabaseAdminClient();
  const { data: referralCode, error: referralCodeError } = await admin
    .from("referral_codes")
    .select("id")
    .eq("code", referralOffer.code)
    .maybeSingle();
  if (referralCodeError) throw new Error("[referrals] Failed to load checkout attribution.");
  const referralCodeId = (referralCode as { id?: string } | null)?.id;
  if (!referralCodeId) throw new Error("[referrals] Accepted checkout attribution is unavailable.");

  const { error } = await admin.from("referral_attributions").upsert(
    {
      referral_code_id: referralCodeId,
      referrer_user_id: referralOffer.referrerUserId,
      referee_user_id: order.user_id,
      order_id: order.id,
      status: "pending",
      qualified_at: null,
      source_key: `referral:${order.id}`,
    },
    { onConflict: "source_key" },
  );
  if (error) {
    throw new Error("[referrals] Failed to reserve attribution.");
  }
}

async function reserveReward(input: {
  order: OrderRow;
  userId: string | null;
  rewardTier: RewardTier | null;
}): Promise<void> {
  if (!input.rewardTier) return;
  if (!input.userId) {
    throw new CheckoutError("reward_unavailable", "Sign in to redeem points.");
  }

  try {
    await reservePointsForOrder({
      userId: input.userId,
      orderId: input.order.id,
      points: input.rewardTier.points,
      amountCents: input.rewardTier.discountCents,
      description: `Sandbox Checkout ${input.rewardTier.label} Points Reservation.`,
    });
  } catch (error) {
    if (!(error instanceof PointsReservationUnavailableError)) throw error;
    throw new CheckoutError("reward_unavailable", "Selected points reward is no longer available.");
  }
}

function orderCanBeCancelled(order: OrderRow): boolean {
  return (
    order.status === "pending_payment" ||
    order.status === "payment_failed" ||
    order.status === "cancelled"
  );
}

function checkoutOrderBelongsToCurrentIdentity(
  order: OrderRow,
  identity: { cartId: string | null; userId: string | null },
): boolean {
  if (order.user_id) return identity.userId === order.user_id;
  return Boolean(order.cart_id && identity.cartId === order.cart_id);
}

async function cancelLoadedPendingOrder(order: OrderRow, reason: string): Promise<boolean> {
  if (!orderCanBeCancelled(order)) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("cancel_checkout_order_without_session", {
    p_order_id: order.id,
    p_reason: reason,
  });
  if (error) {
    throw new Error("[orders] Failed to cancel checkout order.");
  }
  if (data === true) {
    revalidatePath("/account");
    revalidatePath("/rewards");
  }
  return data === true;
}

async function claimCheckoutAttempt(orderId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_checkout_attempt", {
    p_order_id: orderId,
  });
  if (error?.code === "P0001") {
    throw new CheckoutError(
      "checkout_in_progress",
      "This checkout is already being prepared. Try again in a moment.",
    );
  }
  if (error) {
    throw new Error("[orders] Failed to claim checkout attempt.");
  }
  if (typeof data !== "string") {
    throw new Error("[orders] Checkout attempt claim returned no token.");
  }
  return data;
}

async function releaseCheckoutAttempt(
  orderId: string,
  attemptToken: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("release_checkout_attempt", {
    p_order_id: orderId,
    p_attempt_token: attemptToken,
  });
  if (error) {
    throw new Error("[orders] Failed to release checkout attempt.");
  }
}

async function markAttemptFailed(
  order: OrderRow,
  attemptToken: string,
  reason: string,
  releaseRewards: boolean,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fail_checkout_attempt", {
    p_order_id: order.id,
    p_attempt_token: attemptToken,
    p_reason: reason,
    p_release_rewards: releaseRewards,
  });
  if (error) {
    throw new Error("[orders] Failed to mark checkout attempt failed.");
  }
  return data === true;
}

export async function createStripeCheckoutSession(
  input: CreateCheckoutInput = {},
): Promise<CreateCheckoutResult> {
  const config = readPaymentProviderConfig();
  const stripe = getStripeClient(config);
  const identity = await getActiveCartIdentity();
  const originalId = identity.cartId ? await findUnresolvedCheckoutOrder({ cartId: identity.cartId }) : null;
  if (originalId) {
    const original = await loadOrderById(originalId);
    if (!original || !checkoutOrderBelongsToCurrentIdentity(original, identity)) throw new CheckoutAdmissionError(503);
    return resumeKnownCheckout(original, config, stripe);
  }
  readCheckoutConfig();
  const cart = await getCheckoutCartSnapshot();
  const customerEmail = cart.userEmail?.trim().toLowerCase() ?? null;
  const availableLines = cart.lines.filter((line) => line.available && line.quantity > 0);

  if (availableLines.length === 0 || cart.subtotal <= 0) {
    throw new CheckoutError("empty_cart", "Add an available item before checkout.");
  }
  if (availableLines.length !== cart.lines.length) {
    throw new CheckoutError(
      "unavailable_cart",
      "Remove unavailable items before starting sandbox checkout.",
    );
  }

  const rewardTier = cart.userId ? rewardTierById(input.rewardTierId) : null;
  if (input.rewardTierId && !rewardTier) {
    throw new CheckoutError("reward_unavailable", "Selected points reward is not available.");
  }
  const rewardDiscountCents = rewardDiscountForTier(rewardTier, cart.subtotal);
  const referralOffer = await resolveReferralOffer({
    userId: cart.userId,
    merchandiseSubtotalCents: cart.subtotal,
    rewardTier,
  });
  const referralDiscountCents = rewardTier ? 0 : (referralOffer?.discountCents ?? 0);
  const discountCents = Math.max(rewardDiscountCents, referralDiscountCents);
  const netMerchandiseCents = Math.max(0, cart.subtotal - discountCents);
  const freeShipping = qualifiesForFreeStandardShipping(netMerchandiseCents);
  const shippingCents = await resolvePaidShippingCents(config, stripe, freeShipping);
  if (netMerchandiseCents + shippingCents === 0) {
    throw new CheckoutError(
      "checkout_unavailable",
      "Zero-total sandbox checkout is not supported. Remove the reward or add another item.",
    );
  }
  const couponId =
    couponIdForReward(config, rewardTier) ??
    (referralOffer ? config.rewardCouponIds.referral15 : null);
  if ((rewardTier || referralOffer) && !couponId) {
    throw new CheckoutError(
      "reward_unavailable",
      "Sandbox reward or referral coupons are not configured yet.",
    );
  }

  const orderIdempotencyKey = checkoutOrderIdempotencyKey({
    environment: CHECKOUT_ENVIRONMENT,
    cartId: cart.cartId,
    checkoutGeneration: cart.checkoutGeneration,
    owner: {
      kind: cart.userId ? "user" : "guest",
      id: cart.userId ?? cart.cartId,
    },
    customerEmail,
    currency: "USD",
    lines: availableLines.map((line) => ({
      productId: line.productId,
      variantKey: line.variantId,
      quantity: line.quantity,
      unitPriceCents: line.price,
    })),
    reward: {
      tierId: rewardTier?.id ?? null,
      points: rewardTier?.points ?? 0,
    },
    referralCode: referralOffer?.code ?? null,
    discountCents,
    shippingCents,
    freeShipping,
  });
  const order = await reserveOrderSnapshot({
    cartId: cart.cartId,
    checkoutGeneration: cart.checkoutGeneration,
    userId: cart.userId,
    email: customerEmail,
    lines: availableLines,
    merchandiseSubtotalCents: cart.subtotal,
    discountCents,
    shippingCents,
    rewardTier,
    referralOffer,
    idempotencyKey: orderIdempotencyKey,
  });

  if (order.status === "paid" || order.status === "refunded") {
    const exception = order.stripe_checkout_session_id
      ? await getCheckoutPaymentException({ orderId: order.id, sessionId: order.stripe_checkout_session_id }) : null;
    throw new CheckoutError(
      exception ? "checkout_in_progress" : "checkout_unavailable",
      exception ? "This checkout payment is awaiting verification." : "This checkout has already been completed.",
    );
  }

  if (order.stripe_checkout_session_id) return resumeKnownCheckout(order, config, stripe);
  const pending = await readPendingCheckoutAttempt({ orderId: order.id });
  if (pending?.sendStarted || pending?.legacy) throw uncertainCheckout();
  const attemptToken = await claimCheckoutAttempt(order.id);
  let providerMayHaveStarted = false;
  let benefitsMayBeReserved = false;
  try {
    await verifyStripeAccount(stripe);
    const customerId = await verifiedExistingStripeCustomer({ config, userId: cart.userId });
    const acceptedLines = await loadOrderItems(order.id);
    const stripeIdempotencyKey = stripeCheckoutIdempotencyKeyForOrder(order.id, null, order.metadata.stripe_idempotency_key);
    const prepared = await prepareCheckoutAttemptOnce({ orderId: order.id, attemptToken, stripeIdempotencyKey,
      terms: { orderId: order.id, accountId: config.accountId, apiVersion: STRIPE_API_VERSION,
        environment: CHECKOUT_ENVIRONMENT, currency: "USD", customerId: customerId ?? null,
        lines: acceptedLines.map((line) => ({ lineId: line.id, productId: line.product_id, productSlug: line.product_slug,
          variantKey: line.variant_key, quantity: line.quantity, unitAmountCents: line.unit_price_cents })),
        merchandiseSubtotalCents: order.merchandise_subtotal_cents, discountCents: order.discount_cents,
        shippingCents: order.shipping_cents, preTaxTotalCents: order.total_cents, couponId,
        shippingRateId: freeShipping ? null : config.standardShippingRateId, freeShipping,
        automaticTaxEnabled: config.automaticTaxEnabled, taxBehavior: "unspecified" } });
    if (prepared.sendStarted || prepared.legacy) { providerMayHaveStarted = true; throw uncertainCheckout(); }
    if (prepared.contract.customerId !== (customerId ?? null)) throw new CheckoutAdmissionError(503);
    await admitCheckoutCreation({ accountId: config.accountId, orderId: order.id, attemptToken, stripeIdempotencyKey });
    benefitsMayBeReserved = true;
    await reserveReward({ order, userId: cart.userId, rewardTier });
    await createReferralAttribution(order, referralOffer);
    if (!order.user_id) await ensureGuestReceiptBinding({ orderId: order.id, accountId: config.accountId });
    const origin = resolveCheckoutOrigin();
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment", payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES], line_items: acceptedLines.map(stripeLineItem),
      customer: customerId, customer_update: customerId && prepared.contract.automaticTaxEnabled ? { shipping: "auto" } : undefined,
      customer_email: customerId ? undefined : order.customer_email ?? customerEmail ?? undefined, customer_creation: customerId ? undefined : "always",
      client_reference_id: order.id, success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: buildCheckoutCancelUrl(origin), shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: shippingOptions({ ...config, standardShippingRateId: prepared.contract.shippingRateId }, prepared.contract.freeShipping),
      automatic_tax: { enabled: prepared.contract.automaticTaxEnabled === true },
      after_expiration: { recovery: { enabled: false } }, allow_promotion_codes: false,
      discounts: prepared.contract.couponId ? [{ coupon: prepared.contract.couponId }] : undefined,
      payment_intent_data: { metadata: { order_id: order.id, attempt_id: prepared.attemptId,
        environment: CHECKOUT_ENVIRONMENT, schema: CHECKOUT_SCHEMA_VERSION } },
      metadata: { order_id: order.id, attempt_id: prepared.attemptId, cart_id: cart.cartId,
        environment: CHECKOUT_ENVIRONMENT, schema: CHECKOUT_SCHEMA_VERSION, referral: referralOffer ? "true" : "false" },
    };
    await setPendingCheckoutCookie(order.id);
    // A lost database reply is also uncertain. Once this gate is attempted, only
    // its committed proof or verified Stripe facts can authorize any cleanup.
    providerMayHaveStarted = true;
    if (!await startCheckoutAttemptSend({ orderId: order.id, attemptId: prepared.attemptId, attemptToken, stripeIdempotencyKey })) throw uncertainCheckout();
    let session: Stripe.Checkout.Session;
    try { session = await stripe.checkout.sessions.create(params, { idempotencyKey: stripeIdempotencyKey,
      apiVersion: STRIPE_API_VERSION, timeout: 4_000, maxNetworkRetries: 2 }); }
    catch { throw uncertainCheckout(); }
    const provider = { accountId: config.accountId, apiVersion: STRIPE_API_VERSION, session,
      lineItems: [] as Stripe.LineItem[], lineItemsComplete: true as const };
    if (session.payment_status !== "unpaid" || session.status !== "open") {
      const current = await retrieveCheckoutPaymentProviderBundle({ sessionId: session.id, stripe });
      await bindOriginalCheckoutProvider(current);
      await reconcileLoadedCheckoutPayment(order, current);
      throw uncertainCheckout();
    }
    if (verifyCheckoutPayment({ accepted: { ...prepared.contract, sessionId: session.id }, provider }).status === "exception" ||
        !await bindCheckoutAttemptSession({ orderId: order.id, attemptId: prepared.attemptId, stripeIdempotencyKey,
          sessionId: session.id, customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null })) {
      throw uncertainCheckout();
    }
    await cacheCreatedCheckoutSession({ accountId: config.accountId, orderId: order.id, attemptToken, stripeIdempotencyKey,
      snapshot: checkoutRefreshSnapshot(session) });
    if (!session.url) throw uncertainCheckout();
    return { orderId: order.id, orderNumber: order.order_number, sessionId: session.id, url: session.url };
  } catch (error) {
    if (!providerMayHaveStarted && benefitsMayBeReserved) await markAttemptFailed(order, attemptToken, "Checkout preparation failed before provider send.", true);
    throw error;
  } finally { await releaseCheckoutAttempt(order.id, attemptToken); }
}

function uncertainCheckout(): CheckoutError {
  return new CheckoutError("checkout_in_progress", "This checkout needs verification. Please contact support before starting another.");
}

async function resumeKnownCheckout(order: OrderRow, config: PaymentProviderConfig, stripe: Stripe): Promise<CreateCheckoutResult> {
  if (!order.stripe_checkout_session_id) throw uncertainCheckout();
  const refresh = await refreshOwnedCheckoutSession(config, stripe, order, order.stripe_checkout_session_id);
  const session = refresh.verified ?? refresh.cached;
  if (!session) throw new CheckoutAdmissionError(429, Math.max(1, refresh.retryAfterSeconds));
  const reconciled = refresh.provider ? await reconcileLoadedCheckoutPayment(order, refresh.provider) : null;
  if (await getCheckoutPaymentException({ orderId: order.id, sessionId: session.id })) throw uncertainCheckout();
  if (reconciled?.status === "paid" || reconciled?.status === "refunded") throw new CheckoutError("checkout_unavailable", "This checkout has already been completed.");
  if (checkoutSessionDisposition({ orderStatus: order.status === "paid" || order.status === "refunded" ? "pending_payment" : order.status,
    status: session.status, paymentStatus: session.payment_status, expiresAt: session.expires_at, url: session.url }) === "reuse" && session.url) {
    if (!order.user_id) await ensureGuestReceiptBinding({ orderId: order.id, accountId: config.accountId });
    await setPendingCheckoutCookie(order.id);
    return { orderId: order.id, orderNumber: order.order_number, sessionId: session.id, url: session.url };
  }
  if (!refresh.provider) throw new CheckoutAdmissionError(429, Math.max(1, refresh.retryAfterSeconds));
  if (reconciled?.status === "cancelled") throw new CheckoutError("checkout_unavailable", "Your previous checkout expired. You can start a new checkout.");
  throw uncertainCheckout();
}

async function loadOrderBySession(sessionId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error("[orders] Failed to load order.");
  return data as OrderRow | null;
}

async function loadOrderById(orderId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error("[orders] Failed to load order.");
  return data as OrderRow | null;
}

async function loadOrderItems(orderId: string): Promise<OrderItemSnapshot[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("[orders] Failed to load order items.");
  return (data ?? []) as OrderItemSnapshot[];
}

async function clearPurchasedCartLines(order: OrderRow): Promise<void> {
  if (!order.cart_id) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("clear_paid_order_cart", {
    p_order_id: order.id,
  });
  if (error) {
    throw new Error("[orders] Failed to clear paid cart items.");
  }
}

async function paymentAttemptMetadata(
  sessionId: string,
): Promise<Record<string, unknown>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_attempts")
    .select("metadata")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    throw new Error("[stripe] Failed to load payment attempt metadata.");
  }
  return ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {});
}

async function markStripeSessionProcessing(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const metadata = await paymentAttemptMetadata(session.id);
  const { error } = await admin
    .from("payment_attempts")
    .update({
      status: "processing",
      raw_status: session.payment_status,
      metadata: {
        ...metadata,
        checkout_session_status: session.status,
      },
    })
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid")
    .neq("status", "refunded");
  if (error) throw new Error("[orders] Failed to record payment processing.");
}

async function finalizePaidOrderSideEffects(order: OrderRow): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (order.user_id && order.reward_points_earned > 0) {
    await awardPaidOrderPoints({
      userId: order.user_id,
      orderId: order.id,
      orderNumber: order.order_number,
      points: order.reward_points_earned,
      eligibleNetMerchandiseCents: Math.max(
        0,
        order.merchandise_subtotal_cents - order.discount_cents,
      ),
    });

    const { error: feedbackError } = await admin.from("private_feedback").upsert(
      {
        user_id: order.user_id,
        order_id: order.id,
        status: "available",
      },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    if (feedbackError) {
      throw new Error("[feedback] Failed to make private feedback available.");
    }
  }

  await qualifyReferralForPaidOrder(order.id);
  await clearPurchasedCartLines(order);
}

function paymentObservation(session: Stripe.Checkout.Session): Pick<CheckoutPaymentException, "paymentIntentId" | "paymentStatus" | "amountCents"> {
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  return {
    paymentIntentId: paymentIntent && /^pi_[A-Za-z0-9_]{1,200}$/.test(paymentIntent) ? paymentIntent : null,
    paymentStatus: ["paid", "unpaid", "no_payment_required"].includes(session.payment_status) ? session.payment_status : "unknown",
    amountCents: Number.isSafeInteger(session.amount_total) && (session.amount_total ?? -1) >= 0 &&
      (session.amount_total ?? 0) <= 2_147_483_647 ? session.amount_total : null,
  };
}

async function bindOriginalCheckoutProvider(provider: CheckoutPaymentProviderBundle): Promise<void> {
  const session = provider.session;
  const orderId = session.client_reference_id;
  const attemptId = session.metadata?.attempt_id;
  if (!orderId || !isUuid(orderId) || !attemptId || !isUuid(attemptId)) throw uncertainCheckout();
  const pending = await readPendingCheckoutAttempt({ orderId, attemptId });
  if (!pending || (!pending.sendStarted && !pending.legacy) ||
      verifyCheckoutPayment({ accepted: { ...pending.contract, sessionId: session.id }, provider }).status === "exception" ||
      !await bindCheckoutAttemptSession({ orderId, attemptId, stripeIdempotencyKey: pending.stripeIdempotencyKey,
        sessionId: session.id, customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null })) {
    throw uncertainCheckout();
  }
}

export type CheckoutSessionOutcome = { status: "completed" | "pending" | "ignored" | "exception"; order: OrderRow | null };

/** Signed webhooks re-read provider facts. Missing bindings and incomplete effects
 * stay retryable; only a positively unrelated application can be ignored. */
export async function reconcileCheckoutSessionOutcome(sessionId: string): Promise<CheckoutSessionOutcome> {
  let order = await loadOrderBySession(sessionId);
  const provider = await retrieveCheckoutPaymentProviderBundle({ sessionId });
  if (!order) {
    const session = provider.session;
    const application = session.metadata?.application;
    const intent = session.payment_intent;
    if (session.client_reference_id === null && typeof application === "string" && application.length > 0 && application !== "helix" &&
      !session.metadata?.order_id && (intent === null || typeof intent === "object" && intent.livemode === false &&
        intent.metadata.application === application && !intent.metadata.order_id)) return { status: "ignored", order: null };
    if (session.metadata?.schema === "checkout_v2" && session.metadata.attempt_id) {
      await bindOriginalCheckoutProvider(provider);
      order = await loadOrderBySession(sessionId);
    }
    if (!order) {
      const legacyOrderId = session.client_reference_id;
      if (legacyOrderId && isUuid(legacyOrderId) && session.metadata?.order_id === legacyOrderId &&
          session.metadata.environment === CHECKOUT_ENVIRONMENT && await isLegacyCheckoutOrder(legacyOrderId)) {
        const legacyOrder = await loadOrderById(legacyOrderId);
        if (legacyOrder?.checkout_environment === CHECKOUT_ENVIRONMENT) {
          await recordCheckoutPaymentException({ orderId: legacyOrder.id, attemptId: null, sessionId,
            code: "missing_contract", ...paymentObservation(session) });
          return { status: "exception", order: legacyOrder };
        }
      }
      throw uncertainCheckout();
    }
  }
  const reconciled = await reconcileLoadedCheckoutPayment(order, provider);
  if (!reconciled) return { status: "pending", order: null };
  if (await getCheckoutPaymentException({ orderId: order.id, sessionId })) return { status: "exception", order: reconciled };
  const completed = (provider.session.payment_status === "paid" && (reconciled.status === "paid" || reconciled.status === "refunded")) ||
    (checkoutSessionDefinitelyExpired(provider.session) && reconciled.status === "cancelled");
  return { status: completed ? "completed" : "pending", order: reconciled };
}

/** Customer callers must separately prove ownership before retrieving private facts. */
export async function reconcileCheckoutSession(sessionId: string): Promise<OrderRow | null> {
  return (await reconcileCheckoutSessionOutcome(sessionId)).order;
}


async function reconcileLoadedCheckoutPayment(
  order: OrderRow,
  provider: CheckoutPaymentProviderBundle,
): Promise<OrderRow | null> {
  const session = provider.session;
  const accepted = await loadCheckoutPaymentContract({ orderId: order.id, sessionId: session.id });
  if (!accepted) {
    await recordCheckoutPaymentException({
      orderId: order.id, attemptId: null, sessionId: session.id,
      code: "missing_contract", ...paymentObservation(session),
    });
    return order;
  }

  const verification = verifyCheckoutPayment({ accepted, provider });
  if (verification.status === "exception") {
    await recordCheckoutPaymentException({
      orderId: order.id, attemptId: accepted.attemptId, sessionId: session.id,
      code: verification.code, ...paymentObservation(session),
    });
    return order;
  }
  // Provider evidence must never reverse a terminal local financial outcome.
  if (order.status === "refunded") return order;
  if (verification.status === "pending") {
    if (order.status !== "paid" && session.status === "complete") await markStripeSessionProcessing(session);
    return order;
  }
  if (verification.status === "expired") {
    await expireStripeSession(session);
    return loadOrderById(order.id);
  }
  if (verification.status === "failed") return order;

  if (verification.status !== "paid") throw new Error("[orders] Payment verification outcome is unsupported.");
  const facts = verification.facts;
  const earnedPoints = order.user_id
    ? calculatePurchasePoints(Math.max(0, facts.merchandiseSubtotalCents - facts.discountCents)) : 0;
  let paidOrder: OrderRow | null;
  try {
    paidOrder = await finalizeVerifiedCheckoutPayment({ accepted, facts, rewardPointsEarned: earnedPoints }) as OrderRow | null;
    if (!paidOrder) throw new Error("[orders] Verified Checkout Session lost its accepted Order binding.");
    if (paidOrder.status === "refunded") return paidOrder;
    if (paidOrder.status !== "paid") throw new Error("[orders] Verified checkout did not finalize.");
  } catch (error) {
    await recordCheckoutPaymentException({
      orderId: order.id, attemptId: accepted.attemptId, sessionId: session.id,
      code: "finalization_failed", paymentIntentId: facts.paymentIntentId,
      paymentStatus: "paid", amountCents: facts.totalCents,
    });
    throw error;
  }
  try {
    await finalizePaidOrderSideEffects(paidOrder);
  } catch (error) {
    await recordCheckoutPaymentException({
      orderId: order.id, attemptId: accepted.attemptId, sessionId: session.id,
      code: "side_effects_failed", paymentIntentId: facts.paymentIntentId,
      paymentStatus: "paid", amountCents: facts.totalCents,
    });
    throw error;
  }
  await resolveCheckoutPaymentExceptions({ orderId: order.id, sessionId: session.id });
  return paidOrder;
}

async function cancelStripeCheckoutOrder(
  initialOrder: OrderRow,
  reason: string,
): Promise<"cancelled" | "paid" | "processing"> {
  let order = initialOrder;
  if (!order.stripe_checkout_session_id) {
    if (await cancelLoadedPendingOrder(order, reason)) return "cancelled";
    const current = await loadOrderById(order.id);
    if (!current || current.status === "cancelled") return "cancelled";
    if (current.status === "paid" || current.status === "refunded") return "paid";
    if (!current.stripe_checkout_session_id) return "processing";
    order = current;
  }
  const sessionId = order.stripe_checkout_session_id;
  if (!sessionId) return "processing";
  const config = readPaymentProviderConfig();
  const stripe = getStripeClient(config);
  const refresh = await refreshOwnedCheckoutSession(config, stripe, order, sessionId);
  if (!refresh.provider) return "processing";
  let provider = refresh.provider;
  if (checkoutCancellationState(provider.session) === "open") {
    // A browser's ownership proof is not proof that a contradictory provider
    // object belongs to this accepted attempt. Verify its binding before expiry.
    await reconcileLoadedCheckoutPayment(order, provider);
    if (await getCheckoutPaymentException({ orderId: order.id, sessionId })) return "processing";
    // An expiration race is uncertain until the next separately admitted read.
    // Do not bypass the shared cooldown by retrieving again in the catch path.
    try {
      const expired = await expireCheckoutPaymentProviderSession({ sessionId, stripe });
      // The newly expanded Session and PaymentIntent determine cancellation.
      // The helper accepts only an expired response, so retained line observations
      // cannot enter paid finalization or substitute an older PaymentIntent.
      provider = { ...provider, session: expired };
    } catch {
      return "processing";
    }
  }
  const reconciled = await reconcileLoadedCheckoutPayment(order, provider);
  if (!reconciled || await getCheckoutPaymentException({ orderId: order.id, sessionId })) return "processing";
  if (reconciled.status === "paid" || reconciled.status === "refunded") return "paid";
  if (reconciled.status === "cancelled") return "cancelled";
  return "processing";
}

export async function cancelPendingCheckoutFromCookie(
  reason = "customer requested checkout cancellation",
): Promise<{
  status:
    | "missing"
    | "cancelled"
    | "paid"
    | "processing"
    | "not_found"
    | "not_owned"
    | "not_cancellable";
}> {
  const cookieStore = await cookies();
  const orderId = cookieStore.get(CHECKOUT_CANCEL_COOKIE)?.value ?? null;

  if (!orderId) {
    return { status: "missing" };
  }
  if (!isUuid(orderId)) {
    await clearPendingCheckoutCookie();
    return { status: "missing" };
  }

  const order = await loadOrderById(orderId);
  if (!order) {
    await clearPendingCheckoutCookie();
    return { status: "not_found" };
  }
  const user = await getCurrentUser();
  const owned = order.stripe_checkout_session_id
    ? await authorizeCheckoutReceipt({ orderId: order.id, sessionId: order.stripe_checkout_session_id,
      accountId: STRIPE_SANDBOX_ACCOUNT_ID, verifiedUserId: user?.id ?? null })
    : checkoutOrderBelongsToCurrentIdentity(order, await getActiveCartIdentity());
  if (!owned) {
    await clearPendingCheckoutCookie();
    return { status: "not_owned" };
  }
  if (!orderCanBeCancelled(order)) {
    await clearPendingCheckoutCookie();
    return { status: "not_cancellable" };
  }

  const status = await cancelStripeCheckoutOrder(order, reason);
  // Processing and uncertain failures must retain the capability for a retry.
  if (status !== "processing") await clearPendingCheckoutCookie();
  return { status };
}

async function expireStripeSession(session: Stripe.Checkout.Session): Promise<void> {
  assertSandboxStripeObject(session);
  const order = await loadOrderBySession(session.id);
  if (!order || !orderCanBeCancelled(order)) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("expire_checkout_order_from_stripe", {
    p_order_id: order.id,
    p_session_id: session.id,
    p_reason: "Stripe Checkout expiration",
  });
  if (error) {
    throw new Error("[orders] Failed to expire Stripe checkout.");
  }
}

export async function getOrderConfirmationBySession(
  sessionId: string,
): Promise<OrderConfirmation | null> {
  if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) return null;
  // Inspect only the local binding before authorization; provider reads and the
  // private Order/line records are unavailable to a Session-ID bearer alone.
  const admin = createSupabaseAdminClient();
  const { data: binding, error: bindingError } = await admin.from("orders")
    .select("id").eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (bindingError) throw new Error("[orders] Failed to inspect receipt binding.");
  const orderId = (binding as { id: string } | null)?.id;
  if (!orderId) return null;
  const user = await getCurrentUser();
  if (!await authorizeCheckoutReceipt({ orderId, sessionId, accountId: STRIPE_SANDBOX_ACCOUNT_ID, verifiedUserId: user?.id ?? null })) return null;
  const config = readPaymentProviderConfig();
  let order = await loadOrderBySession(sessionId);
  if (!order || order.id !== orderId) return null;
  let retryAfterSeconds = 5;
  try {
    const refresh = await refreshOwnedCheckoutSession(config, getStripeClient(config), order, sessionId);
    retryAfterSeconds = Math.max(5, refresh.retryAfterSeconds);
    if (refresh.provider) order = await reconcileLoadedCheckoutPayment(order, refresh.provider) ?? order;
  } catch (error) {
    // Shared admission failure defers refresh but cannot invent a payment state.
    if (!(error instanceof CheckoutAdmissionError)) throw error;
    retryAfterSeconds = Math.max(5, error.retryAfterSeconds);
  }
  const currentOrder = await loadOrderBySession(sessionId);
  if (!currentOrder || currentOrder.id !== orderId) return null;
  order = currentOrder;
  const exception = await getCheckoutPaymentException({ orderId: order.id, sessionId });
  const items = await loadOrderItems(order.id);
  const state = exception ? "exception" : order.status === "pending_payment" ? "pending"
    : order.status === "payment_failed" ? "failed" : order.status;
  const delivery = state === "paid" || state === "refunded"
    ? await readVerifiedCheckoutDelivery({ orderId: order.id, sessionId }) : null;
  // Ownership and Session binding can change while an admitted provider read runs.
  if (!await authorizeCheckoutReceipt({ orderId, sessionId, accountId: config.accountId, verifiedUserId: user?.id ?? null })) return null;
  // Historical Orders may contain billing details in their shipping columns.
  // Only immutable delivery facts established by the verifier reach the receipt.
  const address = delivery?.shippingAddress;
  const shipping = delivery && address &&
    typeof address.line1 === "string" && typeof address.city === "string" &&
    typeof address.state === "string" && typeof address.postal_code === "string" && typeof address.country === "string"
    ? { name: delivery.shippingName, line1: address.line1, line2: typeof address.line2 === "string" ? address.line2 : null,
      city: address.city, state: address.state, postal_code: address.postal_code, country: address.country } : null;
  return {
    notice: SANDBOX_CHECKOUT_NOTICE, state, retryAfterSeconds, shipping,
    verificationIssue: exception?.code === "full_refund_reconciliation_failed" && exception.paymentStatus === "refunded"
      ? "refund_reconciliation" : null,
    order: {
      order_number: order.order_number, status: order.status,
      reward_points_earned: state === "paid" ? order.reward_points_earned : 0,
      reward_points_redeemed: order.reward_points_redeemed,
      merchandise_subtotal_cents: order.merchandise_subtotal_cents, discount_cents: order.discount_cents,
      shipping_cents: order.shipping_cents, tax_cents: order.tax_cents, total_cents: order.total_cents,
    },
    items: items.map(({ product_name, variant_label, quantity, line_subtotal_cents }) => ({
      product_name, variant_label, quantity, line_subtotal_cents,
    })),
  };
}

export async function getOrdersForCurrentUser(): Promise<Array<{
  id: string;
  order_number: string;
  status: OrderStatus;
  total_cents: number;
  reward_points_earned: number;
  reward_points_redeemed: number;
  created_at: string;
}>> {
  const user = await getCurrentUser();
  if (!user) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, status, total_cents, reward_points_earned, reward_points_redeemed, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error("[orders] Failed to load account orders.");
  return (data ?? []) as Array<{
    id: string;
    order_number: string;
    status: OrderStatus;
    total_cents: number;
    reward_points_earned: number;
    reward_points_redeemed: number;
    created_at: string;
  }>;
}

export function checkoutErrorResponseMessage(error: unknown): { message: string; status: number; retryAfterSeconds?: number } {
  if (error instanceof CheckoutAdmissionError) {
    return { message: error.message, status: error.status, retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error instanceof CartError || error instanceof CheckoutError) {
    return { message: error.message, status: 400 };
  }
  return {
    message: "Sandbox checkout is temporarily unavailable. Try again in a moment.",
    status: 503,
  };
}
