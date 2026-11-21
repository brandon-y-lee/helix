import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/checkout/config";
import { reconcileLiveCheckoutSession } from "@/lib/orders/live-settlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type LiveStripeBinding, verifyLiveStripeAccount } from "./live-provider";
import { readChargeRefundHistory, RefundHistoryMismatch } from "./refund-history";

const sessionTypes = new Set<string>([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);
type Outcome = "processed" | "ignored" | "retryable" | "exception";

function objectReference(event: Stripe.Event, accountId: string) {
  if (event.object !== "event" || event.livemode !== true || event.api_version !== STRIPE_API_VERSION ||
      !/^evt_[A-Za-z0-9_]{1,200}$/.test(event.id) ||
      (event.account != null && event.account !== accountId) || (event.context != null && event.context !== accountId)) {
    throw new Error("Unsupported live Stripe event.");
  }
  const sessionEvent = sessionTypes.has(event.type);
  if (!sessionEvent && event.type !== "charge.refunded" && event.type !== "charge.dispute.created") return null;
  const object = event.data.object as { id?: string; object?: string; livemode?: boolean };
  const expected = sessionEvent ? ["checkout.session", "cs_live_"] :
    event.type === "charge.refunded" ? ["charge", "ch_"] : ["dispute", "dp_"];
  if (object.livemode !== true || object.object !== expected[0] || !object.id?.startsWith(expected[1]) ||
      !/^[A-Za-z0-9_]{1,200}$/.test(object.id.slice(expected[1].length))) {
    throw new Error("Invalid live Stripe event reference.");
  }
  return object.id;
}

async function reconcileRefund(binding: LiveStripeBinding, chargeId: string): Promise<Outcome> {
  const charge = await binding.stripe.charges.retrieve(chargeId);
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (charge.object !== "charge" || charge.id !== chargeId || charge.livemode !== true ||
      (typeof charge.payment_intent === "object" && charge.payment_intent?.livemode !== true) ||
      !intentId || !/^pi_[A-Za-z0-9_]{1,200}$/.test(intentId) || charge.currency !== "usd" ||
      charge.paid !== true || charge.captured !== true || charge.status !== "succeeded" ||
      !Number.isSafeInteger(charge.amount) || charge.amount <= 0 || charge.amount !== charge.amount_captured ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount ||
      charge.refunded !== (charge.amount === charge.amount_refunded)) return "exception";

  const db = createSupabaseAdminClient();
  const identity = { p_account_id: binding.accountId, p_payment_intent_id: intentId };
  const target = await db.rpc("read_live_checkout_refund_target", identity);
  if (target.error || !target.data) return "retryable"; // Payment settlement can arrive after its refund event.
  if (target.data.paymentIntentId !== intentId || target.data.currency !== "USD" || target.data.totalCents !== charge.amount ||
      !["paid", "refunded"].includes(target.data.status)) return "exception";

  const { succeededCents, unsettled } = await readChargeRefundHistory(binding.stripe, chargeId, intentId, true);
  if (unsettled || succeededCents !== charge.amount_refunded) return "retryable";
  if (succeededCents === 0) return "ignored";
  const recorded = await db.rpc("record_live_checkout_refund", {
    ...identity, p_charge_id: chargeId, p_refunded_cents: succeededCents, p_currency: "USD",
  });
  if (recorded.error || recorded.data === "unmatched") return "retryable";
  if (recorded.data === "conflict") return "exception";
  if (recorded.data === "already_recorded" ||
      recorded.data === (succeededCents === charge.amount ? "refunded" : "partial")) return "processed";
  throw new Error("Unexpected refund reconciliation result.");
}

export async function processLiveStripeEvent(event: Stripe.Event, binding: LiveStripeBinding) {
  const objectId = objectReference(event, binding.accountId);
  await verifyLiveStripeAccount(binding);
  if (!objectId) return { action: "ignored" };
  const db = createSupabaseAdminClient();
  const identity = { p_account_id: binding.accountId, p_event_id: event.id, p_lease_id: randomUUID() };
  const claim = await db.rpc("claim_live_stripe_event", {
    ...identity, p_event_type: event.type, p_object_id: objectId,
  });
  if (!claim.error && claim.data === "processed") return { action: "duplicate" };
  if (claim.error || claim.data !== "claimed") throw new Error("Event processing unavailable.");

  let outcome: Outcome;
  try {
    if (event.type === "charge.dispute.created") outcome = "exception";
    else if (event.type === "charge.refunded") outcome = await reconcileRefund(binding, objectId);
    else outcome = await reconcileLiveCheckoutSession(objectId, binding);
  } catch (error) {
    outcome = error instanceof RefundHistoryMismatch ? "exception" : "retryable";
  }
  const code = outcome === "retryable" ? "reconciliation_pending" : outcome === "exception" ?
    (event.type === "charge.dispute.created" ? "dispute_requires_review" : "reconciliation_requires_review") : null;
  const finish = await db.rpc("finish_live_stripe_event", { ...identity, p_outcome: outcome, p_code: code });
  if (finish.error || finish.data !== true || outcome === "retryable") throw new Error("Event processing incomplete.");
  return { action: outcome };
}
