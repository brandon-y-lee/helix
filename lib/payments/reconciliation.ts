import "server-only";
import type { PaymentIncidentCode, PaymentRefundObservationInput } from "@/lib/payments/inbox";
import type { PaymentEventEnvelope } from "@/lib/payments/events";
import { reconcileCheckoutSession } from "@/lib/orders/server";
import { reconcileStripeRefundObservation } from "@/lib/payments/refunds";
import { STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";

export type PaymentReconciliationOutcome = {
  disposition: "processed" | "ignored" | "pending" | "quarantined";
  code?: PaymentIncidentCode;
  retryAfterSeconds?: number;
};

export async function reconcilePaymentEvent(envelope: PaymentEventEnvelope, storage: {
  persistRefundObservations: (input: PaymentRefundObservationInput) => Promise<boolean>;
}): Promise<PaymentReconciliationOutcome> {
  if (envelope.accountId !== STRIPE_SANDBOX_ACCOUNT_ID || envelope.environment !== "sandbox") {
    return { disposition: "quarantined", code: "provider_identity_mismatch" };
  }
  if (envelope.apiVersion !== STRIPE_API_VERSION) {
    return { disposition: "quarantined", code: "provider_schema_mismatch" };
  }
  if (envelope.objectKind === "checkout.session") {
    const { disposition, code } = await reconcileCheckoutSession(envelope.objectId);
    return { disposition, ...(code ? { code } : {}) };
  }
  return reconcileStripeRefundObservation({ objectKind: envelope.objectKind, objectId: envelope.objectId,
    persistObservations: storage.persistRefundObservations });
}
