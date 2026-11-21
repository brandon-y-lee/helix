import "server-only";
import { verifyCheckoutPayment, verifyLiveCheckoutBinding } from "@/lib/checkout/payment-verification";
import { isStoredCheckoutPaymentContract } from "@/lib/orders/payment-contracts";
import { retrieveCheckoutPaymentProviderBundle } from "@/lib/stripe/payment-verification";
import type { LiveStripeBinding } from "@/lib/stripe/live-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type LiveSettlementOutcome = "processed" | "ignored" | "retryable" | "exception";

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw new Error("Live Order storage is unavailable.");
  return data;
}

/** A signed event prompts retrieval. Only stored, merchant-scoped Helix terms can settle a payment. */
export async function reconcileLiveCheckoutSession(
  sessionId: string, binding: LiveStripeBinding,
): Promise<LiveSettlementOutcome> {
  const provider = await retrieveCheckoutPaymentProviderBundle({ sessionId, binding });
  const session = provider.session;
  const account = { p_account_id: binding.accountId };
  const existing = await rpc("read_live_checkout_order_id", { ...account, p_session_id: sessionId });
  if (existing !== null && (typeof existing !== "string" || !uuid.test(existing))) {
    throw new Error("Invalid stored live Order binding.");
  }
  const orderId = session.client_reference_id;
  const metadata = session.metadata;
  if (!existing && !orderId && !metadata?.order_id && !metadata?.attempt_id && !metadata?.binding_nonce &&
      metadata?.application !== "helix") return "ignored";

  const attemptId = metadata?.attempt_id;
  const nonce = metadata?.binding_nonce;
  if (!orderId || !uuid.test(orderId) || (existing !== null && existing !== orderId) || metadata?.order_id !== orderId ||
      !attemptId || !uuid.test(attemptId) || !nonce || !uuid.test(nonce)) return "exception";
  const attempt = { ...account, p_order_id: orderId, p_attempt_id: attemptId };
  const target = { ...attempt, p_session_id: sessionId };
  const terms = existing
    ? await rpc("read_live_checkout_payment_contract", { ...account, p_order_id: orderId, p_session_id: sessionId })
    : await rpc("read_pending_live_checkout_contract", attempt);

  // A lost provider response may leave an already-sent attempt with no Session ID.
  // It never authorizes creating an Order, adopting an unknown attempt or replacing a bound Session.
  if (!isStoredCheckoutPaymentContract(terms, !existing, binding) || terms.version !== "checkout_v2" ||
      terms.orderId !== orderId || terms.attemptId !== attemptId || terms.bindingNonce !== nonce ||
      (existing ? terms.sessionId !== sessionId : terms.sessionId !== null)) return "exception";

  const accepted = { ...terms, sessionId };
  if (!existing) {
    if (!verifyLiveCheckoutBinding(accepted, provider)) return "exception";
    const bound = await rpc("bind_recovered_live_checkout_session", { ...target, p_binding_nonce: nonce });
    if (bound !== true) return "exception";
  }
  const verified = verifyCheckoutPayment({ accepted, provider });
  if (verified.status === "exception") return "exception";
  if (verified.status === "pending") return "retryable";
  if (verified.status === "paid") {
    const stored = await rpc("finalize_live_checkout_payment", { ...target, p_facts: verified.facts });
    if (stored === "paid" || stored === "already_paid" || stored === "refunded") return "processed";
    if (stored === "conflict" || stored === "unmatched") return "exception";
  } else {
    const stored = await rpc("record_live_checkout_unpaid", { ...target, p_outcome: verified.status });
    if (stored === "recorded" || stored === "already_recorded" || stored === "already_paid") return "processed";
    if (stored === "conflict" || stored === "unmatched") return "exception";
  }
  throw new Error("Live Order settlement has an unconfirmed outcome.");
}
