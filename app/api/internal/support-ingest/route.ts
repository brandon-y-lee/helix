import { timingSafeEqual } from "node:crypto";
import { dispatchSupportIngestion } from "@/lib/support/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const secret = process.env.HELIX_SUPPORT_INGEST_SECRET;
  if (!secret || secret.trim() !== secret || secret.length < 32) return Response.json({ error: "Support processing is not configured." }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    return Response.json({ ok: true, ...await dispatchSupportIngestion() }, { headers });
  } catch {
    return Response.json({ error: "Support processing needs operator attention." }, { status: 503, headers });
  }
}

export const GET = POST;
