import { NextResponse } from "next/server";
import { CheckoutConfigError } from "@/lib/checkout/config";
import { extractPaymentEventEnvelope, PaymentEventError } from "@/lib/payments/events";
import { receivePaymentEvent } from "@/lib/payments/inbox";
import { paymentResponseHeaders, PaymentRequestError, readPaymentRequestBytes } from "@/lib/payments/request";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  let envelope;

  try {
    const rawBody = await readPaymentRequestBytes(request, 1024 * 1024);
    envelope = extractPaymentEventEnvelope(constructStripeWebhookEvent({ rawBody, signature }));
  } catch (error) {
    const status = error instanceof PaymentRequestError || error instanceof PaymentEventError
      ? error.status : error instanceof CheckoutConfigError ? 503 : 400;
    return NextResponse.json({ error: "Payment event could not be accepted." }, { status, headers: paymentResponseHeaders() });
  }

  try {
    const receipt = await receivePaymentEvent(envelope);
    if (receipt.status === "conflict") {
      return NextResponse.json({ error: "Payment event could not be accepted." }, { status: 409, headers: paymentResponseHeaders() });
    }
    return NextResponse.json({ ok: true }, { headers: paymentResponseHeaders() });
  } catch {
    return NextResponse.json({ error: "Payment event could not be accepted." }, { status: 503, headers: paymentResponseHeaders() });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "stripe" }, { headers: paymentResponseHeaders() });
}
