import "server-only";
import type Stripe from "stripe";
import { CHECKOUT_ENVIRONMENT, STRIPE_API_VERSION, assertSandboxStripeObject } from "@/lib/checkout/config";
import { sanitizedStripeEventPayload } from "@/lib/checkout/stripe-state";
import { reconcileCheckoutSessionOutcome } from "@/lib/orders/server";
import { reconcileFullStripeRefund } from "@/lib/orders/refunds";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const checkoutEvents = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);

/** Stripe owns delivery retries. Local Order/ledger transactions own duplicate
 * protection; an unfinished event record never counts as completed delivery. */
export async function processStripeWebhookEvent(event: Stripe.Event): Promise<{
  action: "processed" | "duplicate" | "ignored"; type: string;
}> {
  assertSandboxStripeObject(event);
  if (!checkoutEvents.has(event.type) && event.type !== "charge.refunded") {
    return { action: "ignored", type: event.type };
  }
  if (event.api_version !== STRIPE_API_VERSION) throw new Error("Unsupported Stripe event version.");
  const objectId = (event.data.object as { id?: unknown }).id;
  if (typeof objectId !== "string" || !/^(cs_test|ch)_[A-Za-z0-9_]{1,200}$/.test(objectId)) {
    throw new Error("Invalid Stripe event reference.");
  }
  const admin = createSupabaseAdminClient();
  const { data: existing, error: readError } = await admin.from("stripe_webhook_events")
    .select("processed_at").eq("stripe_event_id", event.id).maybeSingle();
  if (readError) throw new Error("Failed to inspect webhook event.");
  if (existing?.processed_at) return { action: "duplicate", type: event.type };
  if (!existing) {
    const { error } = await admin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id, type: event.type, livemode: false,
      checkout_environment: CHECKOUT_ENVIRONMENT, payload: sanitizedStripeEventPayload(event),
    });
    // Concurrent deliveries may both reconcile. Only the order/ledger's
    // transactional idempotency can establish exactly-once local effects.
    if (error && error.code !== "23505") throw new Error("Failed to record webhook event.");
  }
  try {
    let action: "processed" | "ignored" = "processed";
    if (checkoutEvents.has(event.type)) {
      const outcome = await reconcileCheckoutSessionOutcome(objectId);
      if (outcome.status === "pending" || outcome.status === "exception") {
        throw new Error("Payment reconciliation is not complete.");
      }
      if (outcome.status === "ignored") action = "ignored";
    } else {
      await reconcileFullStripeRefund(objectId);
    }
    const { error } = await admin.from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("stripe_event_id", event.id);
    if (error) throw new Error("Failed to mark webhook processed.");
    return { action, type: event.type };
  } catch (error) {
    const { error: auditError } = await admin.from("stripe_webhook_events")
      .update({ processing_error: "payment_reconciliation_failed" })
      .eq("stripe_event_id", event.id).is("processed_at", null);
    if (auditError) throw new Error("Failed to retain retryable webhook state.");
    throw error;
  }
}
