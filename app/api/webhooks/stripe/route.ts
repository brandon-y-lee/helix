import { NextResponse } from "next/server";
import { CheckoutConfigError, assertSandboxStripeObject } from "@/lib/checkout/config";
import { processStripeWebhookEvent } from "@/lib/stripe/webhook";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

async function readBody(request: Request): Promise<Buffer> {
  const limit = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new RangeError();
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  let event;

  try {
    const rawBody = await readBody(request);
    event = constructStripeWebhookEvent({ rawBody, signature });
    assertSandboxStripeObject(event);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : error instanceof CheckoutConfigError ? 503 : 400;
    return NextResponse.json({ error: "invalid Stripe webhook" }, { status, headers });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500, headers });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "stripe" }, { headers });
}
