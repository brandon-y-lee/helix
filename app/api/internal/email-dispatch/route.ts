import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchEmailIntents } from "@/lib/email/delivery";
import { emailDeliveryStorage } from "@/lib/email/storage";
import { sendResendEmail } from "@/lib/email/provider";
import { readEmailConfig, readEmailSender } from "@/lib/email/config";
import { materializeProductNotifications } from "@/lib/waitlist/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const secret = process.env.HELIX_EMAIL_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Email dispatcher is not configured." }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  if (process.env.HELIX_EMAIL_DISPATCH_ENABLED !== "true") {
    return NextResponse.json({ ok: true, claimed: 0, accepted: 0, deferred: 0, blocked: 0,
      productNotifications: { status: "disabled", created: 0 } }, { headers });
  }
  try {
    // Validate the shared restricted environment before any dispatch mutation.
    readEmailConfig(process.env);
    let productNotifications: { status: "complete" | "unavailable"; created: number };
    try {
      readEmailSender("product_availability", process.env);
      productNotifications = { status: "complete", created: await materializeProductNotifications() };
    } catch {
      // Product work is bounded and independent of financial, support, and
      // already prepared mail. Report the failure without exposing its payload.
      productNotifications = { status: "unavailable", created: 0 };
    }
    const result = await dispatchEmailIntents({ storage: emailDeliveryStorage, send: sendResendEmail, env: process.env });
    return NextResponse.json({ ok: true, ...result, productNotifications }, { headers });
  } catch {
    return NextResponse.json({ error: "Email delivery needs operator attention." }, { status: 503, headers });
  }
}

export const POST = GET;
