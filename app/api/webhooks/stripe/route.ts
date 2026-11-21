import { NextResponse } from "next/server";
import { CheckoutConfigError, assertSandboxStripeObject } from "@/lib/checkout/config";
import { processStripeWebhookEvent } from "@/lib/stripe/webhook";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { BUSINESS_SANDBOX_WEBHOOK_ORIGIN, LIVE_CHECKOUT_ORIGIN, isBusinessSandboxDeployment } from "@/lib/checkout/business-origin";
import {
  hasBusinessSandboxPaymentConfiguration, hasLivePaymentConfiguration, readBusinessStripeBinding, type BusinessStripeBinding,
} from "@/lib/stripe/live-provider";
import { processBusinessStripeEvent } from "@/lib/stripe/live-webhook";

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
  let binding: BusinessStripeBinding | undefined;
  let event;

  try {
    const origin = new URL(request.url).origin;
    const live = hasLivePaymentConfiguration(process.env);
    if (origin === BUSINESS_SANDBOX_WEBHOOK_ORIGIN || hasBusinessSandboxPaymentConfiguration(process.env)) {
      if (origin !== BUSINESS_SANDBOX_WEBHOOK_ORIGIN || live || !isBusinessSandboxDeployment(process.env)) {
        return NextResponse.json({ error: "invalid Stripe webhook" }, { status: 403, headers });
      }
      binding = readBusinessStripeBinding("business_sandbox");
    } else if (live) {
      if (origin !== LIVE_CHECKOUT_ORIGIN || !await productionDeploymentAuthorized(process.env)) {
        return NextResponse.json({ error: "invalid Stripe webhook" }, { status: 403, headers });
      }
      binding = readBusinessStripeBinding("live");
    } else if (process.env.VERCEL === "1" && origin !== "https://helixskin.vercel.app") {
      return NextResponse.json({ error: "invalid Stripe webhook" }, { status: 403, headers });
    }
    if (binding && !binding.webhookSecret) throw new CheckoutConfigError("checkout_misconfigured", "Stripe destination is unavailable.");
    const rawBody = await readBody(request);
    if (binding) {
      if (!signature || signature.length > 4096) throw new Error("Invalid Stripe signature.");
      event = binding.stripe.webhooks.constructEvent(rawBody, signature, binding.webhookSecret);
    } else {
      event = constructStripeWebhookEvent({ rawBody, signature });
      assertSandboxStripeObject(event);
    }
  } catch (error) {
    const status = error instanceof RangeError ? 413 : error instanceof CheckoutConfigError ? 503 : 400;
    return NextResponse.json({ error: "invalid Stripe webhook" }, { status, headers });
  }

  try {
    const result = binding ? await processBusinessStripeEvent(event, binding) : await processStripeWebhookEvent(event);
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500, headers });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (new URL(request.url).origin === BUSINESS_SANDBOX_WEBHOOK_ORIGIN) {
    return NextResponse.json({ error: "method not allowed" }, { status: 405, headers: { ...headers, Allow: "POST" } });
  }
  return NextResponse.json({ ok: true, endpoint: "stripe" }, { headers });
}
