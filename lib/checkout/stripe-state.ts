import type Stripe from "stripe";

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
