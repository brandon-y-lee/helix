import "server-only";

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/server";
import { verifyStripeAccount } from "@/lib/stripe/payment-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PaymentLeaseLostError } from "@/lib/payments/lease";
import { isPaymentDeadlineError } from "@/lib/payments/deadline";
import { PaymentProviderReadError, sanitizedPaymentProviderError } from "@/lib/payments/provider-errors";
import type { PaymentRefundObservationInput } from "@/lib/payments/inbox";
import { readStripeChargeRefunds, reconcileVerifiedFullStripeRefund } from "@/lib/orders/refunds";
import { hasHelixPaymentMetadata, isExplicitlyUnrelatedPaymentMetadata } from "@/lib/payments/provider-identity";
import type { PaymentReconciliationOutcome } from "@/lib/payments/reconciliation";

export type MinimalRefundObservation = {
  refundId: string;
  chargeId: string;
  paymentIntentId: string;
  orderId: string | null;
  amountCents: number;
  currency: string;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "unknown";
};

function amount(value: unknown, positive = false): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= 2_147_483_647;
}
function id(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function providerRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (isPaymentDeadlineError(error)) throw error;
    throw sanitizedPaymentProviderError(error);
  }
}
function refundStatus(value: Stripe.Refund["status"]): MinimalRefundObservation["status"] {
  switch (value) {
    case "pending": case "requires_action": case "succeeded": case "failed": case "canceled": return value;
    default: return "unknown";
  }
}

/** A trusted worker supplies durable, lease-fenced observation storage. */
export async function reconcileStripeRefundObservation(input: {
  objectKind: "charge" | "refund";
  objectId: string;
  persistObservations: (input: PaymentRefundObservationInput) => Promise<boolean>;
}): Promise<PaymentReconciliationOutcome> {
  const stripe = getStripeClient();
  await verifyStripeAccount(stripe);
  const refund: Stripe.Refund | null = input.objectKind === "refund"
    ? await providerRead(() => stripe.refunds.retrieve(input.objectId)) : null;
  if (input.objectKind === "refund" && !refund) throw new PaymentProviderReadError("provider_schema_mismatch");
  if (refund && (refund.id !== input.objectId || refund.object !== "refund")) {
    return { disposition: "quarantined", code: "provider_identity_mismatch" };
  }
  const chargeId = refund ? id(refund.charge) : input.objectId;
  if (!chargeId) return { disposition: "pending", code: "binding_pending" };
  const charge = await providerRead(() => stripe.charges.retrieve(chargeId));
  if (!charge) throw new PaymentProviderReadError("provider_schema_mismatch");
  if (charge.id !== chargeId || charge.object !== "charge" || charge.livemode !== false) {
    return { disposition: "quarantined", code: "provider_identity_mismatch" };
  }
  const paymentIntentId = id(charge.payment_intent);
  if (!paymentIntentId) return { disposition: "pending", code: "binding_pending" };
  const intent = await providerRead(() => stripe.paymentIntents.retrieve(paymentIntentId));
  if (!intent) throw new PaymentProviderReadError("provider_schema_mismatch");
  if (intent.id !== paymentIntentId || intent.object !== "payment_intent" || intent.livemode !== false
    || (refund && id(refund.payment_intent) !== paymentIntentId)) {
    return { disposition: "quarantined", code: "provider_identity_mismatch" };
  }
  const { data: order, error } = await createSupabaseAdminClient().from("orders")
    .select("id,status,total_cents,checkout_environment,currency,stripe_checkout_session_id,stripe_payment_intent_id")
    .eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (error) throw new Error("Refund reconciliation is temporarily unavailable.");
  if (id(intent.latest_charge) !== chargeId) return { disposition: "quarantined", code: "provider_identity_mismatch" };
  if (!order && isExplicitlyUnrelatedPaymentMetadata(intent.metadata) && !hasHelixPaymentMetadata(charge.metadata)) {
    return { disposition: "ignored" };
  }
  if ([intent.metadata, charge.metadata].some((metadata) => metadata && (
    (metadata.environment && metadata.environment !== "sandbox") ||
    (metadata.checkout_environment && metadata.checkout_environment !== "sandbox") ||
    (order && metadata.order_id && metadata.order_id !== order.id)
  ))) return { disposition: "quarantined", code: "provider_identity_mismatch" };
  if (charge.currency !== "usd" || intent.currency !== "usd" || !amount(charge.amount, true) ||
    charge.paid !== true || charge.captured !== true || charge.status !== "succeeded" ||
    typeof charge.refunded !== "boolean" || charge.amount_captured !== charge.amount ||
    !amount(charge.amount_refunded) || charge.amount_refunded > charge.amount ||
    intent.status !== "succeeded" || intent.amount !== charge.amount || intent.amount_received !== charge.amount ||
    (order && (order.checkout_environment !== "sandbox" || order.currency !== "USD" ||
      order.total_cents !== charge.amount || order.stripe_payment_intent_id !== paymentIntentId ||
      typeof order.stripe_checkout_session_id !== "string" || !/^cs_test_[A-Za-z0-9_]+$/.test(order.stripe_checkout_session_id)))) {
    return { disposition: "quarantined", code: "verification_mismatch" };
  }
  const refunds = await readStripeChargeRefunds(stripe, chargeId, paymentIntentId);
  const listedTarget = refund ? refunds.find((current) => current.id === refund.id) : null;
  if (refund && (!listedTarget || refund.amount !== listedTarget.amount || refund.currency !== listedTarget.currency ||
    !(refund.status === null || (typeof refund.status === "string" && /^[a-z_]{1,80}$/.test(refund.status))))) {
    throw new PaymentProviderReadError("provider_schema_mismatch");
  }
  const observations: MinimalRefundObservation[] = refunds.map((current) => ({
    refundId: current.id, chargeId, paymentIntentId, orderId: order?.id ?? null,
    amountCents: current.amount, currency: current.currency, status: refundStatus(current.status),
  }));
  const unsupportedStatus = observations.some((fact) => fact.status === "unknown");
  const succeededAmount = refunds.filter((current) => current.status === "succeeded")
    .reduce((total, current) => total + current.amount, 0);
  if (!amount(succeededAmount) || succeededAmount > charge.amount || refunds.some((current) => current.amount > charge.amount)) {
    return { disposition: "quarantined", code: "verification_mismatch" };
  }
  const persist = async (updates: Omit<PaymentRefundObservationInput, "facts"> = {}) => {
    if (!await input.persistObservations({ facts: observations, ...updates })) throw new PaymentLeaseLostError();
  };
  if (order?.status === "refunded" && succeededAmount !== order.total_cents) {
    await persist({ exception: {
      orderId: order.id, sessionId: order.stripe_checkout_session_id, paymentIntentId,
      paymentStatus: "unknown", amountCents: succeededAmount,
    } });
    return unsupportedStatus ? { disposition: "quarantined", code: "provider_schema_mismatch" }
      : { disposition: "pending", code: "refund_status_reversed" };
  }
  await persist();
  if (unsupportedStatus) return { disposition: "quarantined", code: "provider_schema_mismatch" };
  // Retrieval and pagination are separate current reads. Keep the latest minimal
  // observation, but wait for a consistent snapshot before applying money effects.
  if (refund && listedTarget && refund.status !== listedTarget.status) return { disposition: "pending", code: "provider_pending" };
  if (!order || !["paid", "refunded"].includes(order.status)) return { disposition: "pending", code: "binding_pending" };
  if (charge.refunded && succeededAmount === charge.amount) {
    try {
      await reconcileVerifiedFullStripeRefund({ charge, refunds,
        onException: (exception) => persist({ exception }),
        onReconciled: (resolvedException) => persist({ resolvedException }),
      });
      return { disposition: "processed" };
    } catch (error) {
      if (isPaymentDeadlineError(error) || error instanceof PaymentLeaseLostError) throw error;
      return { disposition: "pending", code: "refund_reconciliation_failed" };
    }
  }
  const statuses = observations.map((fact) => fact.status);
  const code = statuses.includes("requires_action") ? "refund_requires_action"
    : statuses.includes("pending") || statuses.includes("unknown") ? "refund_pending"
    : succeededAmount > 0 ? "refund_partial"
    : statuses.some((status) => status === "failed" || status === "canceled") ? "refund_failed"
    : "refund_pending";
  return { disposition: "pending", code };
}
