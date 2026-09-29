import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchEmailIntents } from "@/lib/email/delivery";
import { emailDeliveryStorage } from "@/lib/email/storage";
import { sendResendEmail } from "@/lib/email/provider";

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
  try {
    const result = await dispatchEmailIntents({ storage: emailDeliveryStorage, send: sendResendEmail, env: process.env });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "Email delivery needs operator attention." }, { status: 503, headers });
  }
}

export const POST = GET;
