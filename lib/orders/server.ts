import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
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
  status: OrderStatus;
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
    | "shipping_unavailable"
    | "reward_unavailable";

  constructor(code: CheckoutError["code"], message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

function customerSafeOrderNumber(): string {
  return `MP-${randomBytes(6).toString("hex").toUpperCase()}`;
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

  const { error: insertError } = await admin.from("stripe_customers").insert({
    user_id: input.userId,
    stripe_customer_id: customer.id,
    checkout_environment: CHECKOUT_ENVIRONMENT,
    email: input.email,
  });
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

async function insertOrderSnapshot(input: {
  cartId: string;
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
  const { data, error } = await admin
    .from("orders")
    .insert({
      order_number: customerSafeOrderNumber(),
      user_id: input.userId,
      cart_id: input.cartId,
      status: "pending_payment",
      checkout_environment: CHECKOUT_ENVIRONMENT,
      currency: "USD",
      customer_email: input.email,
      merchandise_subtotal_cents: input.merchandiseSubtotalCents,
      discount_cents: input.discountCents,
      shipping_cents: input.shippingCents,
      tax_cents: 0,
      total_cents: totalCents,
      referral_code: input.referralOffer?.code ?? null,
      reward_points_redeemed: input.rewardTier?.points ?? 0,
      reward_discount_cents: input.rewardTier ? input.discountCents : 0,
      metadata: {
        schema: CHECKOUT_SCHEMA_VERSION,
        sandbox_notice: SANDBOX_CHECKOUT_NOTICE,
        reward_tier_id: input.rewardTier?.id ?? null,
        referral_code: input.referralOffer?.code ?? null,
      },
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .single();

  if (error) throw new Error(`[orders] Failed to create order: ${error.message}`);
  const order = data as OrderRow;

  const itemRows = input.lines.map((line) => ({
    order_id: order.id,
    product_id: line.productId,
    product_slug: line.slug,
    product_name: line.name,
    variant_key: line.variantId,
    variant_label: line.variantLabel,
    unit_price_cents: line.price,
    quantity: line.quantity,
    line_subtotal_cents: line.lineSubtotal,
    product_snapshot: line.productSnapshot,
  }));

  const { error: itemError } = await admin.from("order_items").insert(itemRows);
  if (itemError) throw new Error(`[orders] Failed to create order items: ${itemError.message}`);

  return order;
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

  await admin.from("referral_attributions").insert({
    referral_code_id: referralCodeId,
    referrer_user_id: referralOffer.referrerUserId,
    referee_user_id: order.user_id,
    order_id: order.id,
    status: "pending",
    source_key: `referral:${order.id}`,
  });
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
  const { error } = await admin.rpc("redeem_loyalty_points", {
    p_user_id: input.userId,
    p_points: input.rewardTier.points,
    p_amount_cents: input.rewardTier.discountCents,
    p_source_key: `reward-reserve:${input.order.id}`,
    p_description: `${input.rewardTier.label} sandbox checkout reward reserved.`,
    p_order_id: input.order.id,
  });
  if (error) {
    throw new CheckoutError("reward_unavailable", "Selected points reward is no longer available.");
  }
}

async function releaseRewardReservation(order: OrderRow, reason: string): Promise<void> {
  if (!order.user_id || order.reward_points_redeemed <= 0) return;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("loyalty_redemptions")
    .select("status")
    .eq("source_key", `reward-reserve:${order.id}`)
    .maybeSingle();
  const status = (data as { status?: string } | null)?.status;
  if (status === "reversed" || status === "void") return;

  await admin.from("loyalty_redemptions")
    .update({ status: "reversed" })
    .eq("source_key", `reward-reserve:${order.id}`);

  await insertLedgerBalanceAdjustment({
    userId: order.user_id,
    orderId: order.id,
    points: order.reward_points_redeemed,
    entryType: "redemption_released",
    sourceKey: `reward-release:${order.id}`,
    description: `Released reserved checkout points after ${reason}.`,
  });
}

async function voidPendingReferralAttribution(order: OrderRow): Promise<void> {
  if (!order.referral_code) return;

  const admin = createSupabaseAdminClient();
  await admin
    .from("referral_attributions")
    .update({ status: "void" })
    .eq("order_id", order.id)
    .eq("status", "pending");
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

async function cancelLoadedPendingOrder(order: OrderRow, reason: string): Promise<void> {
  if (!orderCanBeCancelled(order)) return;

  const admin = createSupabaseAdminClient();
  if (order.status !== "cancelled") {
    await admin
      .from("orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["pending_payment", "payment_failed"]);
  }
  await admin
    .from("payment_attempts")
    .update({ status: "cancelled", last_error: reason })
    .eq("order_id", order.id)
    .neq("status", "paid");
  await releaseRewardReservation(order, reason);
  await voidPendingReferralAttribution(order);
  revalidatePath("/account");
  revalidatePath("/rewards");
}

async function markAttemptFailed(order: OrderRow, reason: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({ status: "payment_failed", cancelled_at: new Date().toISOString() })
    .eq("id", order.id)
    .in("status", ["pending_payment", "payment_failed"])
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`[orders] Failed to mark payment attempt failed: ${error.message}`);
  }
  if (!data) return false;

  await admin
    .from("payment_attempts")
    .update({ status: "failed", last_error: reason })
    .eq("order_id", order.id)
    .neq("status", "paid");
  await releaseRewardReservation(order, reason);
  await voidPendingReferralAttribution(order);
  return true;
}

export async function createStripeCheckoutSession(
  input: CreateCheckoutInput = {},
): Promise<CreateCheckoutResult> {
  const config = readCheckoutConfig();
  const stripe = getStripeClient(config);
  const cart = await getCheckoutCartSnapshot();
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
  const orderIdempotencyKey = `checkout:${cart.cartId}:${randomUUID()}`;
  const order = await insertOrderSnapshot({
    cartId: cart.cartId,
    userId: cart.userId,
    email: cart.userEmail,
    lines: availableLines,
    merchandiseSubtotalCents: cart.subtotal,
    discountCents,
    shippingCents,
    rewardTier,
    referralOffer,
    idempotencyKey: orderIdempotencyKey,
  });

  try {
    await reserveReward({ order, userId: cart.userId, rewardTier });
    await createReferralAttribution(order, referralOffer);
    const couponId = couponIdForReward(config, rewardTier) ?? (referralOffer ? config.rewardCouponIds.referral15 : null);
    if ((rewardTier || referralOffer) && !couponId) {
      throw new CheckoutError(
        "reward_unavailable",
        "Sandbox reward or referral coupons are not configured yet.",
      );
    }

    const origin = await originFromRequest();
    const cancelUrl = buildCheckoutCancelUrl(origin);
    const customerId = await getOrCreateStripeCustomer({
      config,
      userId: cart.userId,
      email: cart.userEmail,
    });
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: availableLines.map(stripeLineItem),
        customer: customerId,
        customer_email: customerId ? undefined : cart.userEmail ?? undefined,
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
      { idempotencyKey: `stripe-session:${order.id}` },
    );
    assertSandboxStripeObject(session);

    if (!session.url) {
      throw new CheckoutError("checkout_unavailable", "Stripe did not return a Checkout URL.");
    }

    const admin = createSupabaseAdminClient();
    await admin
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      })
      .eq("id", order.id);
    await admin.from("payment_attempts").insert({
      order_id: order.id,
      provider: "stripe",
      checkout_environment: CHECKOUT_ENVIRONMENT,
      status: "requires_payment",
      amount_cents: order.total_cents,
      currency: "USD",
      stripe_checkout_session_id: session.id,
      idempotency_key: `payment-attempt:${order.id}`,
      metadata: {
        schema: CHECKOUT_SCHEMA_VERSION,
        payment_method_configuration: "stripe_dynamic",
        reward_tier_id: rewardTier?.id ?? null,
        referral_code: referralOffer?.code ?? null,
      },
    });
    await setPendingCheckoutCookie(order.id);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe Checkout creation failed.";
    await markAttemptFailed(order, message);
    throw error;
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
  const items = await loadOrderItems(order.id);
  for (const item of items) {
    const { data } = await admin
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", order.cart_id)
      .eq("product_id", (item.product_snapshot as { productId?: string }).productId ?? null)
      .eq("variant_key", item.variant_key)
      .maybeSingle();
    const current = data as { id: string; quantity: number } | null;
    if (!current) continue;
    if (current.quantity <= item.quantity) {
      await admin.from("cart_items").delete().eq("id", current.id);
    } else {
      await admin
        .from("cart_items")
        .update({ quantity: current.quantity - item.quantity })
        .eq("id", current.id);
    }
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
  if (order.status === "paid") return order;
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
    .from("orders")
    .update({
      status: "paid",
      customer_email: session.customer_details?.email ?? order.customer_email,
      discount_cents: discountCents,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      total_cents: stripeTotal,
      stripe_payment_intent_id: paymentIntent,
      stripe_customer_id: customerId,
      reward_points_earned: earnedPoints,
      shipping_name: session.customer_details?.name ?? order.shipping_name,
      shipping_address: publicAddressSnapshot(session.customer_details?.address),
      billing_address: publicAddressSnapshot(session.customer_details?.address),
      metadata: {
        ...order.metadata,
        payment_method_type: paymentMethodType,
      },
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .in("status", ["pending_payment", "payment_failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[orders] Failed to finalize order: ${error.message}`);
  const paidOrder = data as OrderRow | null;
  if (!paidOrder) return loadOrderBySession(session.id);

  const attemptMetadata = await paymentAttemptMetadata(session.id);
  await admin
    .from("payment_attempts")
    .update({
      status: "paid",
      amount_cents: stripeTotal,
      stripe_payment_intent_id: paymentIntent,
      raw_status: session.payment_status,
      metadata: {
        ...attemptMetadata,
        payment_method_type: paymentMethodType,
      },
    })
    .eq("stripe_checkout_session_id", session.id);

  if (paidOrder.user_id && earnedPoints > 0) {
    await admin.rpc("award_loyalty_points", {
      p_user_id: paidOrder.user_id,
      p_points: earnedPoints,
      p_entry_type: "purchase_earn",
      p_source_key: `purchase:${paidOrder.id}`,
      p_description: `Sandbox order ${paidOrder.order_number} purchase points.`,
      p_order_id: paidOrder.id,
      p_metadata: { eligible_net_merchandise_cents: Math.max(0, paidOrder.merchandise_subtotal_cents - paidOrder.discount_cents) },
    });
    await admin.from("private_feedback").insert({
      user_id: paidOrder.user_id,
      order_id: paidOrder.id,
      status: "available",
    }).select("id").maybeSingle();
  }

  await qualifyReferralForPaidOrder(paidOrder);
  await clearPurchasedCartLines(paidOrder);
  revalidatePath("/account");
  revalidatePath("/rewards");
  return paidOrder;
}

export async function cancelPendingOrder(orderId: string | null, reason = "checkout cancellation"): Promise<void> {
  if (!orderId) return;
  const order = await loadOrderById(orderId);
  if (!order) return;
  await cancelLoadedPendingOrder(order, reason);
}

async function cancelStripeCheckoutOrder(
  order: OrderRow,
  reason: string,
): Promise<"cancelled" | "paid" | "processing"> {
  if (!order.stripe_checkout_session_id) {
    await cancelLoadedPendingOrder(order, reason);
    return "cancelled";
  }

  const stripe = getStripeClient();
  let session = await stripe.checkout.sessions.retrieve(
    order.stripe_checkout_session_id,
  );
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
  if (order.status !== "cancelled") {
    await admin
      .from("orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["pending_payment", "payment_failed"]);
  }
  await admin
    .from("payment_attempts")
    .update({ status: "cancelled", raw_status: session.status ?? "expired" })
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");
  await releaseRewardReservation(order, "Stripe Checkout expiration");
  await voidPendingReferralAttribution(order);
}

export async function failStripeSession(
  session: Stripe.Checkout.Session,
  reason = "Stripe Checkout payment failed",
): Promise<void> {
  assertSandboxStripeObject(session);
  const order = await loadOrderBySession(session.id);
  if (!order || !orderCanTransitionToPaymentFailed(order.status)) return;

  await markAttemptFailed(order, reason);
  const admin = createSupabaseAdminClient();
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
