import { NextResponse } from "next/server";
import { CheckoutConfigError, assertSandboxStripeObject } from "@/lib/checkout/config";
import { processStripeWebhookEvent } from "@/lib/orders/server";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  let event;

  try {
    const rawBody = await request.text();
    event = constructStripeWebhookEvent({ rawBody, signature });
    assertSandboxStripeObject(event);
  } catch (error) {
    const status = error instanceof CheckoutConfigError ? 403 : 400;
    return NextResponse.json({ error: "invalid Stripe webhook" }, { status });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook failed";
    console.error("[stripe-webhook] processing failed:", message);
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "stripe" });
}
