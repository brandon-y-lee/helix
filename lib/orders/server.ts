import "server-only";

import Stripe from "stripe";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  CHECKOUT_ENVIRONMENT,
  SANDBOX_CHECKOUT_NOTICE,
  assertSandboxStripeObject,
  readCheckoutConfig,
  type CheckoutConfig,
} from "@/lib/checkout/config";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import {
  checkoutOrderIdempotencyKey,
  checkoutSessionDisposition,
  stripeCheckoutIdempotencyKeyForOrder,
} from "@/lib/checkout/idempotency";
import {
  checkoutCancellationState,
  checkoutSessionIsPaid,
  orderCanTransitionToPaymentFailed,
  sanitizedStripeEventPayload,
  stripeWebhookClaimIsFresh,
  stripeWebhookProcessingMarker,
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
  calculateReferralDiscount,
  calculatePurchasePoints,
  isReferralSubtotalEligible,
  rewardDiscountForTier,
  rewardTierById,
  type RewardTier,
} from "@/lib/rewards/rules";
import {
  qualifiesForFreeStandardShipping,
} from "@/content/support/policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/server";
import { getCurrentUser } from "@/lib/auth/session";
import { REFERRAL_COOKIE } from "@/lib/referrals/constants";

export const CHECKOUT_SCHEMA_VERSION = "checkout_v1";

type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "cancelled" | "refunded";

type OrderRow = {
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

export type OrderItemSnapshot = {
  id: string;
  product_slug: string;
  product_name: string;
  variant_key: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  line_subtotal_cents: number;
  product_snapshot: Record<string, unknown>;
};

export type OrderConfirmation = {
  notice: typeof SANDBOX_CHECKOUT_NOTICE;
  order: OrderRow;
  items: OrderItemSnapshot[];
  webhookPending: boolean;
};

type CreateCheckoutInput = {
  rewardTierId?: unknown;
};

type ReferralOffer = {
  code: string;
  referrerUserId: string;
  discountCents: number;
};

type CreateCheckoutResult = {
  orderId: string;
  orderNumber: string;
  sessionId: string;
  url: string;
};

export class CheckoutError extends Error {
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

async function originFromRequest(): Promise<string> {
  const headerList = await headers();
  return resolveCheckoutOrigin({ requestOrigin: headerList.get("origin") });
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

function stripeLineItem(line: CheckoutCartLine): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: line.quantity,
    price_data: {
      currency: "usd",
      unit_amount: line.price,
      product_data: {
        name: line.name,
        metadata: {
          product_id: line.productId,
          slug: line.slug,
          variant_key: line.variantId,
        },
      },
    },
  };
}

async function ensurePaymentAttempt(input: {
  order: OrderRow;
  session: Stripe.Checkout.Session;
  stripeIdempotencyKey: string | null;
  rewardTier: RewardTier | null;
  referralOffer: ReferralOffer | null;
  reactivate: boolean;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("payment_attempts").upsert(
    {
      order_id: input.order.id,
      provider: "stripe",
      checkout_environment: CHECKOUT_ENVIRONMENT,
      status: "requires_payment",
      amount_cents: input.order.total_cents,
      currency: "USD",
      stripe_checkout_session_id: input.session.id,
      idempotency_key: `payment-attempt:${input.session.id}`,
      raw_status: input.session.status,
      last_error: null,
      metadata: {
        schema: CHECKOUT_SCHEMA_VERSION,
        payment_method_configuration: "stripe_dynamic",
        stripe_idempotency_key: input.stripeIdempotencyKey,
        recovered_from_session: input.stripeIdempotencyKey === null,
        reward_tier_id: input.rewardTier?.id ?? null,
        referral_code: input.referralOffer?.code ?? null,
      },
    },
    {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    throw new Error(`[stripe] Failed to store payment attempt: ${error.message}`);
  }
  if (input.reactivate) {
    const { error: updateError } = await admin
      .from("payment_attempts")
      .update({
        status: "requires_payment",
        raw_status: input.session.status,
        last_error: null,
      })
      .eq("idempotency_key", `payment-attempt:${input.session.id}`)
      .neq("status", "paid");
    if (updateError) {
      throw new Error(`[stripe] Failed to reactivate payment attempt: ${updateError.message}`);
    }
  }
}

function publicAddressSnapshot(address: Stripe.Address | null | undefined): Record<string, unknown> {
  if (!address) return {};
  return {
    city: address.city ?? null,
    country: address.country ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    postal_code: address.postal_code ?? null,
    state: address.state ?? null,
  };
}

async function getLoyaltyBalance(userId: string | null): Promise<number> {
  if (!userId) return 0;
  const admin = createSupabaseAdminClient();
  await admin.rpc("ensure_loyalty_account", { p_user_id: userId });
  const { data, error } = await admin
    .from("loyalty_accounts")
    .select("points_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`[rewards] Failed to load balance: ${error.message}`);
  return Number((data as { points_balance?: number } | null)?.points_balance ?? 0);
}

async function getOrCreateStripeCustomer(input: {
  config: CheckoutConfig;
  userId: string | null;
  email: string | null;
}): Promise<string | undefined> {
  if (!input.userId) return undefined;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", input.userId)
    .eq("checkout_environment", CHECKOUT_ENVIRONMENT)
    .maybeSingle();

  if (error) throw new Error(`[stripe] Failed to load customer mapping: ${error.message}`);
  const existing = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (existing) return existing;

  const stripe = getStripeClient(input.config);
  const customer = await stripe.customers.create(
    {
      email: input.email ?? undefined,
      metadata: {
        environment: CHECKOUT_ENVIRONMENT,
        schema: CHECKOUT_SCHEMA_VERSION,
      },
    },
    { idempotencyKey: `customer:${input.userId}:${CHECKOUT_ENVIRONMENT}` },
  );
  assertSandboxStripeObject(customer);

  const { error: insertError } = await admin.from("stripe_customers").upsert(
    {
      user_id: input.userId,
      stripe_customer_id: customer.id,
      checkout_environment: CHECKOUT_ENVIRONMENT,
      email: input.email,
    },
    { onConflict: "user_id,checkout_environment" },
  );
  if (insertError) throw new Error(`[stripe] Failed to store customer mapping: ${insertError.message}`);

  return customer.id;
}

async function resolvePaidShippingCents(
  config: CheckoutConfig,
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

  const rate = await stripe.shippingRates.retrieve(config.standardShippingRateId);
  assertSandboxStripeObject(rate);
  if (rate.fixed_amount?.currency !== "usd" || typeof rate.fixed_amount.amount !== "number") {
    throw new CheckoutError(
      "shipping_unavailable",
      "The configured sandbox shipping rate must be a fixed USD rate.",
    );
  }

  return rate.fixed_amount.amount;
}

function shippingOptions(
  config: CheckoutConfig,
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

  const admin = createSupabaseAdminClient();
  const { data: referral, error } = await admin
    .from("referral_codes")
    .select("code, user_id, active")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (error || !referral) return null;

  const referralRow = referral as { user_id: string; code: string };
  if (referralRow.user_id === input.userId) return null;

  const { data: priorOrders, error: ordersError } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "paid")
    .limit(1);
  if (ordersError || (priorOrders?.length ?? 0) > 0) return null;

  return {
    code: referralRow.code,
    referrerUserId: referralRow.user_id,
    discountCents: calculateReferralDiscount(input.merchandiseSubtotalCents),
  };
}

function couponIdForReward(config: CheckoutConfig, tier: RewardTier | null): string | null {
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
  if (error) throw new Error(`[orders] Failed to reserve order snapshot: ${error.message}`);
  return data as OrderRow;
}

async function createReferralAttribution(
  order: OrderRow,
  referralOffer: ReferralOffer | null,
): Promise<void> {
  if (!referralOffer || !order.user_id) return;

  const admin = createSupabaseAdminClient();
  const { data: referralCode } = await admin
    .from("referral_codes")
    .select("id")
    .eq("code", referralOffer.code)
    .maybeSingle();
  const referralCodeId = (referralCode as { id?: string } | null)?.id;
  if (!referralCodeId) return;

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
    throw new Error(`[referrals] Failed to reserve attribution: ${error.message}`);
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

  const admin = createSupabaseAdminClient();
  const { data: reservations, error: existingError } = await admin
    .from("loyalty_redemptions")
    .select("id,status")
    .eq("order_id", input.order.id);
  if (existingError) {
    throw new Error(`[rewards] Failed to load reservation: ${existingError.message}`);
  }
  if ((reservations ?? []).some((reservation) => reservation.status === "applied")) {
    return;
  }
  const reservationNumber = (reservations?.length ?? 0) + 1;

  const { error } = await admin.rpc("redeem_loyalty_points", {
    p_user_id: input.userId,
    p_points: input.rewardTier.points,
    p_amount_cents: input.rewardTier.discountCents,
    p_source_key: `reward-reserve:${input.order.id}:${reservationNumber}`,
    p_description: `${input.rewardTier.label} sandbox checkout reward reserved.`,
    p_order_id: input.order.id,
  });
  if (error) {
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
    throw new Error(`[orders] Failed to cancel checkout order: ${error.message}`);
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
    throw new Error(`[orders] Failed to claim checkout attempt: ${error.message}`);
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
    throw new Error(`[orders] Failed to release checkout attempt: ${error.message}`);
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
    throw new Error(`[orders] Failed to mark checkout attempt failed: ${error.message}`);
  }
  return data === true;
}

async function prepareCheckoutAttempt(input: {
  orderId: string;
  attemptToken: string;
  expectedSessionId: string | null;
  detachSession: boolean;
  stripeIdempotencyKey: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("prepare_checkout_attempt", {
    p_order_id: input.orderId,
    p_attempt_token: input.attemptToken,
    p_expected_session_id: input.expectedSessionId,
    p_detach_session: input.detachSession,
    p_stripe_idempotency_key: input.stripeIdempotencyKey,
  });
  if (error) {
    throw new Error(`[orders] Failed to prepare checkout attempt: ${error.message}`);
  }
  if (data !== true) {
    throw new CheckoutError(
      "checkout_in_progress",
      "This checkout changed while it was being prepared. Try again in a moment.",
    );
  }
}

async function attachCheckoutSession(input: {
  orderId: string;
  attemptToken: string;
  session: Stripe.Checkout.Session;
  stripeIdempotencyKey: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const customerId =
    typeof input.session.customer === "string" ? input.session.customer : null;
  const { data, error } = await admin.rpc("attach_checkout_session", {
    p_order_id: input.orderId,
    p_attempt_token: input.attemptToken,
    p_session_id: input.session.id,
    p_customer_id: customerId,
    p_stripe_idempotency_key: input.stripeIdempotencyKey,
  });
  if (error) {
    throw new Error(`[orders] Failed to attach Checkout Session: ${error.message}`);
  }
  if (data !== true) {
    const currentOrder = await loadOrderById(input.orderId);
    if (
      currentOrder?.status === "cancelled" &&
      currentOrder.stripe_checkout_session_id === null &&
      checkoutCancellationState(input.session) === "open"
    ) {
      await getStripeClient().checkout.sessions.expire(input.session.id);
    }
    throw new CheckoutError(
      "checkout_in_progress",
      "This checkout changed while it was being prepared. Try again in a moment.",
    );
  }
}

function stripeSessionCreationDefinitelyFailed(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeAuthenticationError ||
    error instanceof Stripe.errors.StripePermissionError
  );
}

export async function createStripeCheckoutSession(
  input: CreateCheckoutInput = {},
): Promise<CreateCheckoutResult> {
  const config = readCheckoutConfig();
  const stripe = getStripeClient(config);
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
  if (rewardTier) {
    const balance = await getLoyaltyBalance(cart.userId);
    if (balance < rewardTier.points) {
      throw new CheckoutError("reward_unavailable", "Selected points reward is not available.");
    }
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
    if (order.status === "paid") await clearPurchasedCartLines(order);
    throw new CheckoutError(
      "checkout_unavailable",
      "This checkout has already been completed.",
    );
  }

  const attemptToken = await claimCheckoutAttempt(order.id);
  try {
    const previousSessionId = order.stripe_checkout_session_id;
    const stripeIdempotencyKey = stripeCheckoutIdempotencyKeyForOrder(
      order.id,
      previousSessionId,
      order.metadata.stripe_idempotency_key,
    );
    if (previousSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(previousSessionId);
      assertSandboxStripeObject(existingSession);
      const disposition = checkoutSessionDisposition({
        orderStatus: order.status,
        status: existingSession.status,
        paymentStatus: existingSession.payment_status,
        expiresAt: existingSession.expires_at,
        url: existingSession.url,
      });

      if (disposition === "reuse" && existingSession.url) {
        await prepareCheckoutAttempt({
          orderId: order.id,
          attemptToken,
          expectedSessionId: existingSession.id,
          detachSession: false,
          stripeIdempotencyKey: null,
        });
        try {
          await reserveReward({ order, userId: cart.userId, rewardTier });
          await createReferralAttribution(order, referralOffer);
          await ensurePaymentAttempt({
            order,
            session: existingSession,
            stripeIdempotencyKey: null,
            rewardTier,
            referralOffer,
            reactivate: true,
          });
          await setPendingCheckoutCookie(order.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Checkout recovery failed.";
          await markAttemptFailed(order, attemptToken, message, false);
          throw error;
        }
        return {
          orderId: order.id,
          orderNumber: order.order_number,
          sessionId: existingSession.id,
          url: existingSession.url,
        };
      }

      if (disposition === "paid") {
        await ensurePaymentAttempt({
          order,
          session: existingSession,
          stripeIdempotencyKey: null,
          rewardTier,
          referralOffer,
          reactivate: false,
        });
        await finalizePaidStripeSession(existingSession);
        throw new CheckoutError(
          "checkout_unavailable",
          "This checkout has already been completed.",
        );
      }
      if (disposition === "processing") {
        await ensurePaymentAttempt({
          order,
          session: existingSession,
          stripeIdempotencyKey: null,
          rewardTier,
          referralOffer,
          reactivate: false,
        });
        await finalizePaidStripeSession(existingSession);
        throw new CheckoutError(
          "checkout_in_progress",
          "This checkout payment is still processing.",
        );
      }

      const admin = createSupabaseAdminClient();
      await ensurePaymentAttempt({
        order,
        session: existingSession,
        stripeIdempotencyKey: null,
        rewardTier,
        referralOffer,
        reactivate: false,
      });
      await prepareCheckoutAttempt({
        orderId: order.id,
        attemptToken,
        expectedSessionId: existingSession.id,
        detachSession: true,
        stripeIdempotencyKey,
      });
      const { error: attemptError } = await admin
        .from("payment_attempts")
        .update({
          status: "cancelled",
          raw_status: existingSession.status ?? "unusable",
        })
        .eq("stripe_checkout_session_id", existingSession.id)
        .neq("status", "paid");
      if (attemptError) {
        throw new Error(`[stripe] Failed to retire checkout attempt: ${attemptError.message}`);
      }
    }

    if (!previousSessionId) {
      await prepareCheckoutAttempt({
        orderId: order.id,
        attemptToken,
        expectedSessionId: null,
        detachSession: true,
        stripeIdempotencyKey,
      });
    }
    let session: Stripe.Checkout.Session;
    let stripeCreationStarted = false;
    try {
      await reserveReward({ order, userId: cart.userId, rewardTier });
      await createReferralAttribution(order, referralOffer);

      const origin = await originFromRequest();
      const cancelUrl = buildCheckoutCancelUrl(origin);
      const customerId = await getOrCreateStripeCustomer({
        config,
        userId: cart.userId,
        email: customerEmail,
      });
      stripeCreationStarted = true;
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: availableLines.map(stripeLineItem),
          customer: customerId,
          customer_email: customerId ? undefined : customerEmail ?? undefined,
          customer_creation: customerId ? undefined : "always",
          client_reference_id: order.id,
          success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          shipping_address_collection: {
            allowed_countries: ["US"],
          },
          shipping_options: shippingOptions(config, freeShipping),
          automatic_tax: {
            enabled: config.automaticTaxEnabled,
          },
          payment_intent_data: {
            metadata: {
              order_id: order.id,
              environment: CHECKOUT_ENVIRONMENT,
              schema: CHECKOUT_SCHEMA_VERSION,
            },
          },
          allow_promotion_codes: false,
          discounts: couponId ? [{ coupon: couponId }] : undefined,
          metadata: {
            order_id: order.id,
            cart_id: cart.cartId,
            environment: CHECKOUT_ENVIRONMENT,
            schema: CHECKOUT_SCHEMA_VERSION,
            referral: referralOffer ? "true" : "false",
          },
        },
        { idempotencyKey: stripeIdempotencyKey },
      );
      assertSandboxStripeObject(session);
      await attachCheckoutSession({
        orderId: order.id,
        attemptToken,
        session,
        stripeIdempotencyKey,
      });

      await ensurePaymentAttempt({
        order,
        session,
        stripeIdempotencyKey,
        rewardTier,
        referralOffer,
        reactivate: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe Checkout creation failed.";
      await markAttemptFailed(
        order,
        attemptToken,
        message,
        !stripeCreationStarted || stripeSessionCreationDefinitelyFailed(error),
      );
      throw error;
    }

    const createdDisposition = checkoutSessionDisposition({
      orderStatus: "pending_payment",
      status: session.status,
      paymentStatus: session.payment_status,
      expiresAt: session.expires_at,
      url: session.url,
    });
    if (createdDisposition === "paid") {
      await finalizePaidStripeSession(session);
      throw new CheckoutError(
        "checkout_unavailable",
        "This checkout has already been completed.",
      );
    }
    if (createdDisposition === "processing") {
      await finalizePaidStripeSession(session);
      throw new CheckoutError(
        "checkout_in_progress",
        "This checkout payment is still processing.",
      );
    }
    if (createdDisposition !== "reuse" || !session.url) {
      await markAttemptFailed(
        order,
        attemptToken,
        "Stripe did not return a usable Checkout URL.",
        false,
      );
      throw new CheckoutError("checkout_unavailable", "Stripe did not return a Checkout URL.");
    }

    await setPendingCheckoutCookie(order.id);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      sessionId: session.id,
      url: session.url,
    };
  } finally {
    await releaseCheckoutAttempt(order.id, attemptToken);
  }
}

async function loadOrderBySession(sessionId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`[orders] Failed to load order: ${error.message}`);
  return data as OrderRow | null;
}

async function loadOrderByPaymentIntent(paymentIntentId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error(`[orders] Failed to load order by payment intent: ${error.message}`);
  return data as OrderRow | null;
}

async function loadOrderById(orderId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`[orders] Failed to load order: ${error.message}`);
  return data as OrderRow | null;
}

async function loadOrderItems(orderId: string): Promise<OrderItemSnapshot[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[orders] Failed to load order items: ${error.message}`);
  return (data ?? []) as OrderItemSnapshot[];
}

async function clearPurchasedCartLines(order: OrderRow): Promise<void> {
  if (!order.cart_id) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("clear_paid_order_cart", {
    p_order_id: order.id,
  });
  if (error) {
    throw new Error(`[orders] Failed to clear paid cart items: ${error.message}`);
  }
}

async function qualifyReferralForPaidOrder(order: OrderRow): Promise<void> {
  if (!order.referral_code || !order.user_id) return;
  const admin = createSupabaseAdminClient();
  const { data: attribution, error } = await admin
    .from("referral_attributions")
    .select("id, referrer_user_id, status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (error) throw new Error(`[referrals] Failed to load attribution: ${error.message}`);
  const row = attribution as { id: string; referrer_user_id: string; status: string } | null;
  if (!row || row.status === "qualified" || row.status === "rewarded") return;

  await admin
    .from("referral_attributions")
    .update({ status: "qualified", qualified_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending");
  await admin.from("referral_rewards").insert({
    user_id: row.referrer_user_id,
    referral_attribution_id: row.id,
    status: "available",
    source_key: `referral-reward:${row.id}`,
  });
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
    throw new Error(`[stripe] Failed to load payment attempt metadata: ${error.message}`);
  }
  return ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {});
}

async function paymentMethodTypeForSession(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) return null;

  const paymentIntent =
    typeof session.payment_intent === "object" &&
    session.payment_intent &&
    typeof session.payment_intent.payment_method === "object"
      ? session.payment_intent
      : await getStripeClient().paymentIntents.retrieve(paymentIntentId, {
          expand: ["payment_method"],
        });
  assertSandboxStripeObject(paymentIntent);

  const paymentMethod = paymentIntent.payment_method;
  return typeof paymentMethod === "object" && paymentMethod
    ? paymentMethod.type
    : null;
}

async function markStripeSessionProcessing(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const metadata = await paymentAttemptMetadata(session.id);
  await admin
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
    .neq("status", "paid");
}

async function finalizePaidOrderSideEffects(order: OrderRow): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (order.user_id && order.reward_points_earned > 0) {
    const { error: pointsError } = await admin.rpc("award_loyalty_points", {
      p_user_id: order.user_id,
      p_points: order.reward_points_earned,
      p_entry_type: "purchase_earn",
      p_source_key: `purchase:${order.id}`,
      p_description: `Sandbox order ${order.order_number} purchase points.`,
      p_order_id: order.id,
      p_metadata: {
        eligible_net_merchandise_cents: Math.max(
          0,
          order.merchandise_subtotal_cents - order.discount_cents,
        ),
      },
    });
    if (pointsError) {
      throw new Error(`[rewards] Failed to award purchase points: ${pointsError.message}`);
    }

    const { error: feedbackError } = await admin.from("private_feedback").upsert(
      {
        user_id: order.user_id,
        order_id: order.id,
        status: "available",
      },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    if (feedbackError) {
      throw new Error(`[feedback] Failed to make private feedback available: ${feedbackError.message}`);
    }
  }

  await qualifyReferralForPaidOrder(order);
  await clearPurchasedCartLines(order);
  revalidatePath("/account");
  revalidatePath("/rewards");
}

export async function finalizePaidStripeSession(
  session: Stripe.Checkout.Session,
): Promise<OrderRow | null> {
  assertSandboxStripeObject(session);
  if (session.currency && session.currency !== "usd") {
    throw new Error("[stripe] Checkout Session currency mismatch.");
  }
  if (!checkoutSessionIsPaid(session)) {
    if (session.status === "complete") {
      await markStripeSessionProcessing(session);
    }
    return loadOrderBySession(session.id);
  }

  const order = await loadOrderBySession(session.id);
  if (!order) return null;
  if (order.status === "paid") {
    await finalizePaidOrderSideEffects(order);
    return order;
  }
  if (!["pending_payment", "payment_failed"].includes(order.status)) return order;

  const stripeTotal = typeof session.amount_total === "number" ? session.amount_total : order.total_cents;
  const details = session.total_details;
  const shippingCents = details?.amount_shipping ?? order.shipping_cents;
  const discountCents = details?.amount_discount ?? order.discount_cents;
  const taxCents = details?.amount_tax ?? Math.max(0, stripeTotal - Math.max(0, order.merchandise_subtotal_cents - discountCents) - shippingCents);
  const earnedPoints = order.user_id
    ? calculatePurchasePoints(Math.max(0, order.merchandise_subtotal_cents - discountCents))
    : 0;

  const admin = createSupabaseAdminClient();
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentMethodType = await paymentMethodTypeForSession(session);

  const { data, error } = await admin
    .rpc("finalize_paid_checkout_order", {
      p_order_id: order.id,
      p_session_id: session.id,
      p_customer_email: session.customer_details?.email ?? order.customer_email,
      p_discount_cents: discountCents,
      p_shipping_cents: shippingCents,
      p_tax_cents: taxCents,
      p_total_cents: stripeTotal,
      p_payment_intent_id: paymentIntent,
      p_customer_id: customerId,
      p_reward_points_earned: earnedPoints,
      p_shipping_name: session.customer_details?.name ?? order.shipping_name,
      p_shipping_address: publicAddressSnapshot(session.customer_details?.address),
      p_billing_address: publicAddressSnapshot(session.customer_details?.address),
      p_payment_method_type: paymentMethodType,
      p_payment_raw_status: session.payment_status,
    })
    .maybeSingle();
  if (error) throw new Error(`[orders] Failed to finalize order: ${error.message}`);
  const paidOrder = data as OrderRow | null;
  if (!paidOrder) {
    throw new Error(
      "[orders] Paid Checkout Session no longer owns this order or its reward reservation.",
    );
  }

  await finalizePaidOrderSideEffects(paidOrder);
  return paidOrder;
}

export async function cancelPendingOrder(orderId: string | null, reason = "checkout cancellation"): Promise<void> {
  if (!orderId) return;
  const order = await loadOrderById(orderId);
  if (!order) return;
  await cancelLoadedPendingOrder(order, reason);
}

async function cancelStripeCheckoutOrder(
  initialOrder: OrderRow,
  reason: string,
): Promise<"cancelled" | "paid" | "processing"> {
  let order = initialOrder;
  if (!order.stripe_checkout_session_id) {
    if (await cancelLoadedPendingOrder(order, reason)) return "cancelled";

    const refreshedOrder = await loadOrderById(order.id);
    if (!refreshedOrder || refreshedOrder.status === "cancelled") return "cancelled";
    if (refreshedOrder.status === "paid" || refreshedOrder.status === "refunded") {
      return "paid";
    }
    if (!refreshedOrder.stripe_checkout_session_id) return "processing";
    order = refreshedOrder;
  }

  const sessionId = order.stripe_checkout_session_id;
  if (!sessionId) return "processing";

  const stripe = getStripeClient();
  let session = await stripe.checkout.sessions.retrieve(sessionId);
  assertSandboxStripeObject(session);

  let cancellationState = checkoutCancellationState(session);
  if (cancellationState === "paid") {
    await finalizePaidStripeSession(session);
    return "paid";
  }

  if (cancellationState === "processing") {
    await finalizePaidStripeSession(session);
    return "processing";
  }

  if (cancellationState === "open") {
    try {
      session = await stripe.checkout.sessions.expire(session.id);
      assertSandboxStripeObject(session);
    } catch {
      session = await stripe.checkout.sessions.retrieve(session.id);
      assertSandboxStripeObject(session);
      if (checkoutSessionIsPaid(session)) {
        await finalizePaidStripeSession(session);
        return "paid";
      }
      cancellationState = checkoutCancellationState(session);
      if (cancellationState === "processing") {
        await finalizePaidStripeSession(session);
        return "processing";
      }
      if (cancellationState !== "expired") {
        throw new Error("Stripe Checkout cancellation failed.");
      }
    }
    cancellationState = checkoutCancellationState(session);
  }

  if (cancellationState === "expired") {
    await expireStripeSession(session);
    return "cancelled";
  }

  throw new Error("Stripe Checkout returned an unknown cancellation state.");
}

export async function cancelPendingCheckoutFromCookie(
  reason = "customer returned from Stripe Checkout",
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

  try {
    const order = await loadOrderById(orderId);
    if (!order) return { status: "not_found" };
    if (!orderCanBeCancelled(order)) return { status: "not_cancellable" };

    const identity = await getActiveCartIdentity();
    if (!checkoutOrderBelongsToCurrentIdentity(order, identity)) {
      return { status: "not_owned" };
    }

    const status = await cancelStripeCheckoutOrder(order, reason);
    return { status };
  } finally {
    await clearPendingCheckoutCookie();
  }
}

export async function expireStripeSession(session: Stripe.Checkout.Session): Promise<void> {
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
    throw new Error(`[orders] Failed to expire Stripe checkout: ${error.message}`);
  }
}

export async function failStripeSession(
  session: Stripe.Checkout.Session,
  reason = "Stripe Checkout payment failed",
): Promise<void> {
  assertSandboxStripeObject(session);
  const order = await loadOrderBySession(session.id);
  if (!order || !orderCanTransitionToPaymentFailed(order.status)) return;

  const admin = createSupabaseAdminClient();
  const { error: failureError } = await admin.rpc(
    "fail_checkout_order_from_stripe",
    {
      p_order_id: order.id,
      p_session_id: session.id,
      p_reason: reason,
    },
  );
  if (failureError) {
    throw new Error(`[orders] Failed to record Stripe payment failure: ${failureError.message}`);
  }
  await admin
    .from("payment_attempts")
    .update({ raw_status: session.payment_status })
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");
}

async function insertLedgerBalanceAdjustment(input: {
  userId: string;
  orderId: string;
  points: number;
  entryType: string;
  sourceKey: string;
  description: string;
}): Promise<void> {
  if (input.points === 0) return;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("loyalty_ledger_entries")
    .select("id")
    .eq("source_key", input.sourceKey)
    .maybeSingle();
  if (data) return;

  const { error } = await admin.from("loyalty_ledger_entries").insert({
    user_id: input.userId,
    order_id: input.orderId,
    entry_type: input.entryType,
    status: "posted",
    points: input.points,
    description: input.description,
    source_key: input.sourceKey,
  });
  if (error) throw new Error(`[rewards] Failed to insert ledger adjustment: ${error.message}`);

  const { error: balanceError } = await admin.rpc("ensure_loyalty_account", {
    p_user_id: input.userId,
  });
  if (balanceError) throw new Error(`[rewards] Failed to ensure account: ${balanceError.message}`);

  const { data: account, error: accountError } = await admin
    .from("loyalty_accounts")
    .select("points_balance")
    .eq("user_id", input.userId)
    .single();
  if (accountError) throw new Error(`[rewards] Failed to load account: ${accountError.message}`);
  const current = Number((account as { points_balance?: number }).points_balance ?? 0);
  const { error: updateError } = await admin
    .from("loyalty_accounts")
    .update({ points_balance: current + input.points })
    .eq("user_id", input.userId);
  if (updateError) throw new Error(`[rewards] Failed to update account: ${updateError.message}`);
}

async function handleFullRefund(charge: Stripe.Charge): Promise<void> {
  assertSandboxStripeObject(charge);
  if (!charge.refunded || charge.amount_refunded < charge.amount) return;
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return;

  const order = await loadOrderByPaymentIntent(paymentIntentId);
  if (!order || order.status === "refunded") return;

  const admin = createSupabaseAdminClient();
  await admin
    .from("orders")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .neq("status", "refunded");
  await admin
    .from("payment_attempts")
    .update({ status: "refunded", raw_status: "charge.refunded" })
    .eq("order_id", order.id);

  if (order.user_id && order.reward_points_earned > 0) {
    await insertLedgerBalanceAdjustment({
      userId: order.user_id,
      orderId: order.id,
      points: -order.reward_points_earned,
      entryType: "purchase_refund",
      sourceKey: `purchase-refund:${order.id}`,
      description: `Reversed sandbox order ${order.order_number} purchase points after refund.`,
    });
  }
  if (order.user_id && order.reward_points_redeemed > 0) {
    await insertLedgerBalanceAdjustment({
      userId: order.user_id,
      orderId: order.id,
      points: order.reward_points_redeemed,
      entryType: "redemption_reversal",
      sourceKey: `reward-refund-restore:${order.id}`,
      description: `Restored redeemed points after sandbox order ${order.order_number} refund.`,
    });
  }
  const { data: attribution } = await admin
    .from("referral_attributions")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();
  const attributionId = (attribution as { id?: string } | null)?.id;
  if (attributionId) {
    await admin
      .from("referral_attributions")
      .update({ status: "void" })
      .eq("id", attributionId);
    await admin
      .from("referral_rewards")
      .update({ status: "void" })
      .eq("referral_attribution_id", attributionId)
      .eq("status", "available");
  }

  revalidatePath("/account");
  revalidatePath("/rewards");
}

type StripeWebhookEventClaim = {
  processed_at: string | null;
  processing_error: string | null;
};

async function claimStripeWebhookEvent(
  event: Stripe.Event,
): Promise<"claimed" | "duplicate"> {
  const admin = createSupabaseAdminClient();
  const marker = stripeWebhookProcessingMarker();
  const { data: existing, error: selectError } = await admin
    .from("stripe_webhook_events")
    .select("processed_at, processing_error")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[stripe] Failed to inspect webhook event: ${selectError.message}`);
  }

  const existingClaim = existing as StripeWebhookEventClaim | null;
  if (existingClaim?.processed_at || stripeWebhookClaimIsFresh(existingClaim?.processing_error)) {
    return "duplicate";
  }

  if (!existingClaim) {
    const { error: insertError } = await admin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      type: event.type,
      livemode: event.livemode,
      checkout_environment: CHECKOUT_ENVIRONMENT,
      payload: sanitizedStripeEventPayload(event),
      processing_error: marker,
    });
    if (!insertError) return "claimed";
    if ((insertError as { code?: string }).code === "23505") return "duplicate";
    throw new Error(`[stripe] Failed to record webhook event: ${insertError.message}`);
  }

  let claimQuery = admin
    .from("stripe_webhook_events")
    .update({ processing_error: marker })
    .eq("stripe_event_id", event.id)
    .is("processed_at", null);
  claimQuery = existingClaim.processing_error === null
    ? claimQuery.is("processing_error", null)
    : claimQuery.eq("processing_error", existingClaim.processing_error);
  const { data: claimed, error: claimError } = await claimQuery
    .select("stripe_event_id")
    .maybeSingle();
  if (claimError) {
    throw new Error(`[stripe] Failed to claim webhook event: ${claimError.message}`);
  }
  return claimed ? "claimed" : "duplicate";
}

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<{
  action: "processed" | "duplicate" | "ignored";
  type: string;
}> {
  assertSandboxStripeObject(event);
  const admin = createSupabaseAdminClient();
  if ((await claimStripeWebhookEvent(event)) === "duplicate") {
    return { action: "duplicate", type: event.type };
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await finalizePaidStripeSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.async_payment_failed") {
      await failStripeSession(
        event.data.object as Stripe.Checkout.Session,
        "Stripe Checkout asynchronous payment failed",
      );
    } else if (event.type === "checkout.session.expired") {
      await expireStripeSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "charge.refunded") {
      await handleFullRefund(event.data.object as Stripe.Charge);
    }

    const { error: updateError } = await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("stripe_event_id", event.id);
    if (updateError) throw new Error(`[stripe] Failed to mark webhook processed: ${updateError.message}`);
    return {
      action:
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded" ||
        event.type === "checkout.session.async_payment_failed" ||
        event.type === "checkout.session.expired" ||
        event.type === "charge.refunded"
          ? "processed"
          : "ignored",
      type: event.type,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook processing failed";
    await admin
      .from("stripe_webhook_events")
      .update({ processing_error: message })
      .eq("stripe_event_id", event.id);
    throw error;
  }
}

export async function getOrderConfirmationBySession(
  sessionId: string,
): Promise<OrderConfirmation | null> {
  if (!sessionId || !sessionId.startsWith("cs_")) return null;
  const config = readCheckoutConfig();
  const stripe = getStripeClient(config);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  assertSandboxStripeObject(session);

  const finalized = checkoutSessionIsPaid(session)
    ? await finalizePaidStripeSession(session)
    : await loadOrderBySession(sessionId);
  if (!finalized) return null;

  const items = await loadOrderItems(finalized.id);
  return {
    notice: SANDBOX_CHECKOUT_NOTICE,
    order: finalized,
    items,
    webhookPending: finalized.status !== "paid",
  };
}

export async function getOrderConfirmationByOrderId(
  orderId: string,
): Promise<OrderConfirmation | null> {
  const order = await loadOrderById(orderId);
  if (!order) return null;
  return {
    notice: SANDBOX_CHECKOUT_NOTICE,
    order,
    items: await loadOrderItems(order.id),
    webhookPending: order.status !== "paid",
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
  if (error) throw new Error(`[orders] Failed to load account orders: ${error.message}`);
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

export function checkoutErrorResponseMessage(error: unknown): { message: string; status: number } {
  if (error instanceof CartError || error instanceof CheckoutError) {
    return { message: error.message, status: 400 };
  }
  return {
    message: "Sandbox checkout is temporarily unavailable. Try again in a moment.",
    status: 503,
  };
}
