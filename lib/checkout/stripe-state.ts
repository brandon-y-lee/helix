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
