import "server-only";
import type Stripe from "stripe";
import type { AcceptedCheckoutContract, PaymentVerificationExceptionCode, VerifiedCheckoutPaymentFacts } from "@/lib/checkout/payment-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OrderRow } from "@/lib/orders/server";

export type CheckoutContractTerms = Omit<AcceptedCheckoutContract, "version" | "legacyEligible" | "attemptId" | "sessionId">;
export type CheckoutPaymentExceptionCode = PaymentVerificationExceptionCode | "missing_contract" | "side_effects_failed" | "finalization_failed" | "settlement_effects_failed" | "full_refund_reconciliation_failed";
export type CheckoutPaymentException = {
  code: CheckoutPaymentExceptionCode;
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | "refunded" | "unknown";
  paymentIntentId: string | null;
  amountCents: number | null;
};
export class CheckoutPaymentStorageError extends Error {
  constructor() {
    super("Payment verification is temporarily unavailable. Please try again.");
    this.name = "CheckoutPaymentStorageError";
  }
}
function unavailable(): never { throw new CheckoutPaymentStorageError(); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
}
function nullableString(value: unknown): value is string | null { return value === null || typeof value === "string"; }
function contract(value: unknown, sessionOptional = false): value is AcceptedCheckoutContract {
  return record(value) && ["checkout_v1", "checkout_v2"].includes(String(value.version))
    && typeof value.legacyEligible === "boolean" && (value.version !== "checkout_v1" || value.legacyEligible)
    && (value.version !== "checkout_v2" || (value.legacyEligible === false && typeof value.attemptId === "string" && value.attemptId.length > 0))
    && typeof value.orderId === "string" && nullableString(value.attemptId)
    && (typeof value.sessionId === "string" || (sessionOptional && value.sessionId === null))
    && value.accountId === "acct_1Tm9WRFEzyaKzdmq" && value.apiVersion === "2026-06-24.dahlia"
    && value.environment === "sandbox" && value.currency === "USD" && nullableString(value.customerId)
    && [value.merchandiseSubtotalCents, value.discountCents, value.shippingCents, value.preTaxTotalCents].every(amount)
    && nullableString(value.couponId) && nullableString(value.shippingRateId) && typeof value.freeShipping === "boolean"
    && (typeof value.automaticTaxEnabled === "boolean" || (value.version === "checkout_v1" && value.automaticTaxEnabled === null))
    && (["exclusive", "inclusive", "unspecified"].includes(String(value.taxBehavior)) || (value.version === "checkout_v1" && value.taxBehavior === null))
    && Array.isArray(value.lines) && value.lines.length > 0 && value.lines.every((line) => record(line)
      && typeof line.productId === "string" && typeof line.productSlug === "string" && typeof line.variantKey === "string"
      && amount(line.quantity) && line.quantity > 0 && amount(line.unitAmountCents));
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    if (error) unavailable();
    return data;
  } catch { return unavailable(); }
}
export async function prepareCheckoutPaymentContract(input: {
  orderId: string; attemptToken: string; stripeIdempotencyKey: string; terms: CheckoutContractTerms;
}): Promise<{ attemptId: string; contract: Omit<AcceptedCheckoutContract, "sessionId"> & { sessionId: string | null } }> {
  const value = await rpc("prepare_checkout_payment_contract", {
    p_order_id: input.orderId, p_attempt_token: input.attemptToken,
    p_stripe_idempotency_key: input.stripeIdempotencyKey, p_terms: input.terms,
  });
  if (!contract(value, true) || value.version !== "checkout_v2" || !value.attemptId || value.orderId !== input.orderId) unavailable();
  return { attemptId: value.attemptId, contract: value };
}
export async function bindCheckoutPaymentSession(input: {
  orderId: string; attemptId: string; sessionId: string; stripeIdempotencyKey: string;
}): Promise<void> {
  if (await rpc("bind_checkout_payment_session", { p_order_id: input.orderId, p_attempt_id: input.attemptId,
    p_session_id: input.sessionId, p_stripe_idempotency_key: input.stripeIdempotencyKey }) !== true) unavailable();
}
/** For trusted recovery investigation only; this never authorizes a receipt or binds a Session. */
export async function isLegacyCheckoutOrder(orderId: string): Promise<boolean> {
  const value = await rpc("is_legacy_checkout_order", { p_order_id: orderId });
  if (typeof value !== "boolean") unavailable();
  return value;
}
export async function loadCheckoutPaymentContract(input: { orderId: string; sessionId: string }): Promise<AcceptedCheckoutContract | null> {
  const value = await rpc("read_checkout_payment_contract", { p_order_id: input.orderId, p_session_id: input.sessionId });
  if (value === null) return null;
  if (!contract(value) || value.orderId !== input.orderId || value.sessionId !== input.sessionId) unavailable();
  return value;
}
export type VerifiedCheckoutDelivery = {
  shippingName: string;
  shippingAddress: Stripe.Address;
  billingAddress: Stripe.Address | null;
};
function deliveryAddress(value: unknown, physical: boolean): Stripe.Address | null {
  if (!record(value)) return null;
  const fields = ["line1", "line2", "city", "state", "postal_code", "country"] as const;
  if (!fields.every((field) => nullableString(value[field]))) return null;
  if (physical && (value.country !== "US" || !["line1", "city", "state", "postal_code"].every(
    (field) => typeof value[field] === "string" && (value[field] as string).trim().length > 0))) return null;
  const address = value as Record<(typeof fields)[number], string | null>;
  return { line1: address.line1, line2: address.line2, city: address.city, state: address.state,
    postal_code: address.postal_code, country: address.country };
}
/** Call only after receipt authorization. A Session reference itself grants no delivery access. */
export async function readVerifiedCheckoutDelivery(input: { orderId: string; sessionId: string }): Promise<VerifiedCheckoutDelivery | null> {
  const value = await rpc("read_verified_checkout_delivery", { p_order_id: input.orderId, p_session_id: input.sessionId });
  if (value === null) return null;
  if (!record(value) || typeof value.shippingName !== "string" || !value.shippingName.trim()) unavailable();
  const shippingAddress = deliveryAddress(value.shippingAddress, true);
  const billingAddress = value.billingAddress === null ? null : deliveryAddress(value.billingAddress, false);
  if (!shippingAddress || (value.billingAddress !== null && !billingAddress)) unavailable();
  return { shippingName: value.shippingName, shippingAddress, billingAddress };
}
export async function finalizeVerifiedCheckoutPayment(input: {
  accepted: AcceptedCheckoutContract; facts: VerifiedCheckoutPaymentFacts; rewardPointsEarned: number;
}): Promise<OrderRow | null> {
  if (input.accepted.orderId !== input.facts.orderId || input.accepted.sessionId !== input.facts.sessionId
    || input.accepted.attemptId !== input.facts.attemptId || input.accepted.version !== input.facts.contractVersion) unavailable();
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("finalize_verified_checkout_payment", {
      p_order_id: input.accepted.orderId, p_attempt_id: input.accepted.attemptId,
      p_session_id: input.accepted.sessionId, p_contract_version: input.accepted.version,
      p_facts: input.facts, p_reward_points_earned: input.rewardPointsEarned,
    }).maybeSingle();
    if (error) unavailable();
    if (data === null) return null;
    if (!record(data) || data.id !== input.accepted.orderId || data.stripe_checkout_session_id !== input.accepted.sessionId
      || !["paid", "refunded"].includes(String(data.status))) unavailable();
    return data as OrderRow;
  } catch { return unavailable(); }
}
export async function recordCheckoutPaymentException(input: {
  orderId: string; attemptId: string | null; sessionId: string;
} & CheckoutPaymentException): Promise<void> {
  const value = await rpc("record_checkout_payment_exception", {
    p_order_id: input.orderId, p_attempt_id: input.attemptId, p_session_id: input.sessionId,
    p_code: input.code, p_payment_intent_id: input.paymentIntentId,
    p_payment_status: input.paymentStatus, p_amount_cents: input.amountCents,
  });
  if (value !== true) unavailable();
}
export async function getCheckoutPaymentException(input: { orderId: string; sessionId: string }): Promise<CheckoutPaymentException | null> {
  const value = await rpc("read_checkout_payment_exception", { p_order_id: input.orderId, p_session_id: input.sessionId });
  if (value === null) return null;
  if (!record(value) || typeof value.code !== "string" || !/^[a-z_]{1,80}$/.test(value.code)
    || !["paid", "unpaid", "no_payment_required", "refunded", "unknown"].includes(String(value.paymentStatus))
    || !nullableString(value.paymentIntentId) || (value.amountCents !== null && !amount(value.amountCents))) unavailable();
  return value as CheckoutPaymentException;
}
export async function resolveCheckoutPaymentExceptions(input: { orderId: string; sessionId: string; code?: CheckoutPaymentExceptionCode }): Promise<void> {
  if (await rpc("resolve_checkout_payment_exceptions", { p_order_id: input.orderId, p_session_id: input.sessionId,
    p_code: input.code ?? null }) !== true) unavailable();
}
