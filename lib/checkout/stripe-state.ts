import type Stripe from "stripe";

const STRIPE_WEBHOOK_PROCESSING_PREFIX = "processing:";
const STRIPE_WEBHOOK_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export function checkoutSessionIsPaid(
  session: Pick<Stripe.Checkout.Session, "payment_status">,
): boolean {
  return session.payment_status === "paid";
}

export function checkoutCancellationState(
  session: Pick<Stripe.Checkout.Session, "payment_status" | "status">,
): "paid" | "processing" | "open" | "expired" | "unknown" {
  if (checkoutSessionIsPaid(session)) return "paid";
  if (session.status === "complete") return "processing";
  if (session.status === "open") return "open";
  if (session.status === "expired") return "expired";
  return "unknown";
}

export function orderCanTransitionToPaymentFailed(status: string): boolean {
  return status === "pending_payment" || status === "payment_failed";
}

export function stripeWebhookProcessingMarker(now = new Date()): string {
  return `${STRIPE_WEBHOOK_PROCESSING_PREFIX}${now.toISOString()}`;
}

export function stripeWebhookClaimIsFresh(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  if (!value?.startsWith(STRIPE_WEBHOOK_PROCESSING_PREFIX)) return false;
  const startedAt = Date.parse(value.slice(STRIPE_WEBHOOK_PROCESSING_PREFIX.length));
  return (
    Number.isFinite(startedAt) &&
    now.getTime() - startedAt < STRIPE_WEBHOOK_CLAIM_TIMEOUT_MS
  );
}

export function sanitizedStripeEventPayload(
  event: Pick<Stripe.Event, "api_version" | "data" | "id" | "request" | "type">,
): Record<string, unknown> {
  const object = event.data.object as { id?: unknown };
  return {
    event_id: event.id,
    type: event.type,
    object_id: typeof object.id === "string" ? object.id : null,
    api_version: event.api_version ?? null,
    request_id: event.request?.id ?? null,
  };
}
