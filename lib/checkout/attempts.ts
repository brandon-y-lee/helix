import "server-only";
import type { AcceptedCheckoutContract } from "@/lib/checkout/payment-verification";
import { isStoredCheckoutPaymentContract, type CheckoutContractTerms } from "@/lib/orders/payment-contracts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type LeanCheckoutAttempt = {
  attemptId: string;
  orderId: string;
  stripeIdempotencyKey: string;
  contract: Omit<AcceptedCheckoutContract, "sessionId"> & { sessionId: string | null };
  sendStarted: boolean;
  legacy: boolean;
};
export class CheckoutAttemptStorageError extends Error {
  constructor() { super("Checkout verification is temporarily unavailable."); this.name = "CheckoutAttemptStorageError"; }
}
function unavailable(): never { throw new CheckoutAttemptStorageError(); }
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function key(value: unknown): value is string { return typeof value === "string" && /^[\x21-\x7e]{1,255}$/.test(value); }
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    if (error) unavailable();
    return data;
  } catch { return unavailable(); }
}
function attempt(value: unknown, orderId: string, attemptId?: string): LeanCheckoutAttempt {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
  const row = value as Record<string, unknown>;
  if (!uuid(row.attemptId) || row.orderId !== orderId || (attemptId !== undefined && row.attemptId !== attemptId)
    || !key(row.stripeIdempotencyKey) || typeof row.sendStarted !== "boolean" || typeof row.legacy !== "boolean"
    || !isStoredCheckoutPaymentContract(row.contract, true) || row.contract.version !== "checkout_v2"
    || row.contract.orderId !== orderId || row.contract.attemptId !== row.attemptId) unavailable();
  return { attemptId: row.attemptId, orderId, stripeIdempotencyKey: row.stripeIdempotencyKey,
    contract: row.contract, sendStarted: row.sendStarted, legacy: row.legacy };
}
export async function prepareCheckoutAttemptOnce(input: {
  orderId: string; attemptToken: string; stripeIdempotencyKey: string; terms: CheckoutContractTerms;
}): Promise<LeanCheckoutAttempt> {
  if (!uuid(input.orderId) || !uuid(input.attemptToken) || !key(input.stripeIdempotencyKey)) unavailable();
  return attempt(await rpc("prepare_checkout_attempt_once", { p_order_id: input.orderId, p_attempt_token: input.attemptToken,
    p_stripe_idempotency_key: input.stripeIdempotencyKey, p_terms: input.terms }), input.orderId);
}
export async function startCheckoutAttemptSend(input: {
  orderId: string; attemptId: string; attemptToken: string; stripeIdempotencyKey: string;
}): Promise<boolean> {
  if (!uuid(input.orderId) || !uuid(input.attemptId) || !uuid(input.attemptToken) || !key(input.stripeIdempotencyKey)) unavailable();
  const value = await rpc("start_checkout_attempt_send", { p_order_id: input.orderId, p_attempt_id: input.attemptId,
    p_attempt_token: input.attemptToken, p_stripe_idempotency_key: input.stripeIdempotencyKey });
  if (typeof value !== "boolean") unavailable();
  return value;
}
/** Trusted provider reconciliation only; this does not authorize a customer receipt. */
export async function readPendingCheckoutAttempt(input: { orderId: string; attemptId?: string }): Promise<LeanCheckoutAttempt | null> {
  if (!uuid(input.orderId) || (input.attemptId !== undefined && !uuid(input.attemptId))) unavailable();
  const value = await rpc("read_pending_checkout_attempt", { p_order_id: input.orderId, p_attempt_id: input.attemptId ?? null });
  return value === null ? null : attempt(value, input.orderId, input.attemptId);
}
export async function bindCheckoutAttemptSession(input: {
  orderId: string; attemptId: string; stripeIdempotencyKey: string; sessionId: string; customerId: string | null;
}): Promise<boolean> {
  if (!uuid(input.orderId) || !uuid(input.attemptId) || !key(input.stripeIdempotencyKey)
    || !/^cs_test_[A-Za-z0-9_]{1,200}$/.test(input.sessionId)
    || (input.customerId !== null && !/^cus_[A-Za-z0-9_]{1,200}$/.test(input.customerId))) unavailable();
  const value = await rpc("bind_checkout_attempt_session", { p_order_id: input.orderId, p_attempt_id: input.attemptId,
    p_stripe_idempotency_key: input.stripeIdempotencyKey, p_session_id: input.sessionId, p_customer_id: input.customerId });
  if (typeof value !== "boolean") unavailable();
  return value;
}
/** The caller supplies a server-authorized cart; only a private Order ID is returned. */
export async function findUnresolvedCheckoutOrder(input: { cartId: string }): Promise<string | null> {
  if (!uuid(input.cartId)) unavailable();
  const value = await rpc("find_unresolved_checkout_order", { p_cart_id: input.cartId });
  if (value !== null && !uuid(value)) unavailable();
  return value;
}
