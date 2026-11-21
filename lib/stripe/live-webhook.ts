import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/checkout/config";
import { matchesBusinessCheckoutSessionId } from "@/lib/checkout/payment-verification";
import { reconcileBusinessCheckoutSession, type BusinessSettlementOutcome as Outcome } from "@/lib/orders/live-settlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type BusinessStripeBinding, verifyBusinessStripeAccount } from "./live-provider";
import { readChargeRefundHistory, RefundHistoryMismatch } from "./refund-history";

const sessionTypes = new Set<string>([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectReference(event: Stripe.Event, { accountId, environment }: BusinessStripeBinding) {
  const live = environment === "live";
  const supportedVersion = event.api_version === STRIPE_API_VERSION || (live && event.api_version === "2026-08-26.dahlia");
  if (event.object !== "event" || event.livemode !== live || !supportedVersion ||
      !/^evt_[A-Za-z0-9_]{1,200}$/.test(event.id) ||
      (event.account != null && event.account !== accountId) || (event.context != null && event.context !== accountId)) {
    throw new Error("Unsupported Stripe event.");
  }
  const sessionEvent = sessionTypes.has(event.type);
  if (!sessionEvent && event.type !== "charge.refunded" && event.type !== "charge.dispute.created") return null;
  const object = event.data.object as { id?: string; object?: string; livemode?: boolean };
  if (object.livemode !== live || typeof object.id !== "string") throw new Error("Invalid Stripe event reference.");
  const valid = sessionEvent ? object.object === "checkout.session" && matchesBusinessCheckoutSessionId(object.id, environment) :
    event.type === "charge.refunded" ? object.object === "charge" && /^ch_[A-Za-z0-9_]{1,200}$/.test(object.id) :
    object.object === "dispute" && /^dp_[A-Za-z0-9_]{1,200}$/.test(object.id);
  if (!valid) throw new Error("Invalid Stripe event reference.");
  return object.id;
}

function hasHelixMetadata(metadata: Stripe.Metadata | null | undefined) {
  return metadata?.application === "helix" || metadata?.binding_nonce !== undefined || metadata?.schema === "checkout_v2";
}

function providerReference(value: string | { id: string; object: string; livemode: boolean } | null, kind: string, live: boolean) {
  if (typeof value === "string") return value;
  return value?.object === kind && value.livemode === live ? value.id : null;
}

/** Disputes and refunds are account-wide notifications, including payments made outside Helix. */
async function resolveCharge(binding: BusinessStripeBinding, chargeId: string, disputedIntent?: string):
  Promise<{ charge: Stripe.Charge; intentId: string } | Outcome> {
  const charge = await binding.stripe.charges.retrieve(chargeId, { expand: ["payment_intent"] });
  const live = binding.environment === "live";
  if (charge.object !== "charge" || charge.id !== chargeId || charge.livemode !== live) return "exception";
  const intent = charge.payment_intent;
  if (intent === null) return hasHelixMetadata(charge.metadata) || disputedIntent ? "exception" : "ignored";
  if (typeof intent === "string") return "retryable"; // Stripe did not return the requested expanded object.
  if (intent.object !== "payment_intent" || intent.livemode !== live || !/^pi_[A-Za-z0-9_]{1,200}$/.test(intent.id) ||
      (disputedIntent !== undefined && intent.id !== disputedIntent)) return "exception";
  const db = createSupabaseAdminClient();
  const identity = { p_environment: binding.environment, p_account_id: binding.accountId, p_payment_intent_id: intent.id };
  const target = await db.rpc("read_business_checkout_refund_target", identity);
  if (target.error) return "retryable";
  const metadata = intent.metadata;
  if (!target.data && !hasHelixMetadata(metadata) && !hasHelixMetadata(charge.metadata)) return "ignored";
  if (!metadata || metadata.schema !== "checkout_v2" || metadata.environment !== binding.environment ||
      !uuid.test(metadata.order_id) || !uuid.test(metadata.attempt_id) || !uuid.test(metadata.binding_nonce)) return "exception";
  if (target.data && (target.data.orderId !== metadata.order_id || target.data.attemptId !== metadata.attempt_id ||
      target.data.paymentIntentId !== intent.id)) return "exception";
  const attempt = await db.rpc("classify_business_checkout_attempt", { ...identity, p_order_id: metadata.order_id,
    p_attempt_id: metadata.attempt_id, p_binding_nonce: metadata.binding_nonce });
  if (attempt.error) return "retryable";
  if (attempt.data === "unmatched") return target.data ? "exception" : "ignored";
  if (attempt.data === "conflict") return "exception";
  if (attempt.data !== "pending" && attempt.data !== "matched") return "retryable";
  if (["order_id", "attempt_id", "binding_nonce", "schema", "environment"].some((field) =>
      charge.metadata?.[field] !== undefined && charge.metadata[field] !== metadata[field])) return "exception";
  if (providerReference(intent.latest_charge, "charge", live) !== chargeId || intent.status !== "succeeded" ||
      intent.currency !== "usd" || intent.amount !== charge.amount || intent.amount_received !== charge.amount ||
      charge.currency !== "usd" || charge.paid !== true || charge.captured !== true || charge.status !== "succeeded" ||
      !Number.isSafeInteger(charge.amount) || charge.amount <= 0 || charge.amount !== charge.amount_captured) return "exception";
  if (attempt.data === "pending") return target.data ? "exception" : "retryable";
  if (!target.data) return "retryable"; // Settlement committed between the two reads.
  if (target.data.currency !== "USD" || target.data.totalCents !== charge.amount ||
      !["paid", "refunded"].includes(target.data.status)) return "exception";
  return { charge, intentId: intent.id };
}

async function reconcileDispute(binding: BusinessStripeBinding, disputeId: string): Promise<Outcome | "disputed"> {
  const dispute = await binding.stripe.disputes.retrieve(disputeId);
  const live = binding.environment === "live";
  const chargeId = providerReference(dispute.charge, "charge", live);
  const intentId = providerReference(dispute.payment_intent, "payment_intent", live);
  if (dispute.object !== "dispute" || dispute.id !== disputeId || dispute.livemode !== live ||
      !chargeId || !/^ch_[A-Za-z0-9_]{1,200}$/.test(chargeId) ||
      (dispute.payment_intent != null && (!intentId || !/^pi_[A-Za-z0-9_]{1,200}$/.test(intentId)))) return "exception";
  const payment = await resolveCharge(binding, chargeId, intentId ?? undefined);
  return typeof payment === "string" ? payment : "disputed";
}

async function reconcileRefund(binding: BusinessStripeBinding, chargeId: string): Promise<Outcome> {
  const payment = await resolveCharge(binding, chargeId);
  if (typeof payment === "string") return payment;
  const { charge, intentId } = payment;
  if (!Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount ||
      charge.refunded !== (charge.amount === charge.amount_refunded)) return "exception";

  const { succeededCents, unsettled } = await readChargeRefundHistory(binding.stripe, chargeId, intentId, binding.environment === "live");
  if (unsettled || succeededCents !== charge.amount_refunded) return "retryable";
  if (succeededCents === 0) return "ignored";
  const recorded = await createSupabaseAdminClient().rpc("record_business_checkout_refund", {
    p_environment: binding.environment, p_account_id: binding.accountId, p_payment_intent_id: intentId,
    p_charge_id: chargeId, p_refunded_cents: succeededCents, p_currency: "USD",
  });
  if (recorded.error || recorded.data === "unmatched") return "retryable";
  if (recorded.data === "conflict") return "exception";
  if (recorded.data === "already_recorded" ||
      recorded.data === (succeededCents === charge.amount ? "refunded" : "partial")) return "processed";
  throw new Error("Unexpected refund reconciliation result.");
}

export async function processBusinessStripeEvent(event: Stripe.Event, binding: BusinessStripeBinding) {
  const objectId = objectReference(event, binding);
  await verifyBusinessStripeAccount(binding);
  if (!objectId) return { action: "ignored" };
  const db = createSupabaseAdminClient();
  const identity = { p_environment: binding.environment, p_account_id: binding.accountId, p_event_id: event.id, p_lease_id: randomUUID() };
  const claim = await db.rpc("claim_business_stripe_event", {
    ...identity, p_event_type: event.type, p_object_id: objectId,
  });
  if (!claim.error && claim.data === "processed") return { action: "duplicate" };
  if (claim.error || claim.data !== "claimed") throw new Error("Event processing unavailable.");

  let outcome: Outcome | "disputed";
  try {
    if (event.type === "charge.dispute.created") outcome = await reconcileDispute(binding, objectId);
    else if (event.type === "charge.refunded") outcome = await reconcileRefund(binding, objectId);
    else outcome = await reconcileBusinessCheckoutSession(objectId, binding);
  } catch (error) {
    outcome = error instanceof RefundHistoryMismatch ? "exception" : "retryable";
  }
  const code = outcome === "retryable" ? "reconciliation_pending" : outcome === "disputed" ?
    "dispute_requires_review" : outcome === "exception" ? "reconciliation_requires_review" : null;
  if (outcome === "disputed") outcome = "exception";
  const finish = await db.rpc("finish_business_stripe_event", { ...identity, p_outcome: outcome, p_code: code });
  if (finish.error || finish.data !== true || outcome === "retryable") throw new Error("Event processing incomplete.");
  return { action: outcome };
}
