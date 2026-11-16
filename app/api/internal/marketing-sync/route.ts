import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileMarketingImports, synchronizeMarketingContacts } from "@/lib/marketing/service";
import { marketingServiceStorage } from "@/lib/marketing/storage";
import { resendMarketingContacts } from "@/lib/marketing/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const secret = process.env.HELIX_EMAIL_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Email preference worker is not configured." }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  if (process.env.HELIX_MARKETING_SYNC_ENABLED !== "true") return NextResponse.json({ ok: true, enabled: false }, { headers });
  try {
    const dependencies = { storage: marketingServiceStorage, provider: resendMarketingContacts, env: process.env };
    const imports = await reconcileMarketingImports(dependencies);
    const preferences = await synchronizeMarketingContacts(dependencies);
    return NextResponse.json({ ok: true, imports, preferences }, { headers });
  } catch {
    return NextResponse.json({ error: "Email preference synchronization needs operator attention." }, { status: 503, headers });
  }
}
export const POST = GET;
