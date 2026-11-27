import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchEmailIntents } from "@/lib/email/delivery";
import { emailDeliveryStorage } from "@/lib/email/storage";
import { sendResendEmail } from "@/lib/email/provider";
import { readEmailConfig } from "@/lib/email/config";

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
    return NextResponse.json({ ok: true, claimed: 0, accepted: 0, deferred: 0, blocked: 0 }, { headers });
  }
  try {
    // Validate the shared restricted environment before any dispatch mutation.
    readEmailConfig(process.env);
    const result = await dispatchEmailIntents({ storage: emailDeliveryStorage, send: sendResendEmail, env: process.env });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "Email delivery needs operator attention." }, { status: 503, headers });
  }
}

export const POST = GET;
