// Protected one-time backfill / recovery reindex.
//
// This is NOT the normal update path (the webhook is). Use it only for initial
// local/dev setup or to rebuild the index after a reset. Reads every product
// from Supabase (source of truth) and atomically replaces the Algolia index.
//
//   curl -X POST http://localhost:3000/api/admin/search-reindex \
//     -H "x-webhook-secret: $SUPABASE_CATALOG_WEBHOOK_SECRET"
//
// Fails clearly (and does no work) if the secret or required Algolia/Supabase
// env vars are missing.

import { NextResponse } from "next/server";
import { verifyWebhookSecret, WEBHOOK_SECRET_HEADER } from "@/lib/algolia/sync";
import {
  runSearchBackfill,
  SearchBackfillError,
} from "@/lib/algolia/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyWebhookSecret(request.headers.get(WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await runSearchBackfill();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown reindex error";
    console.error("[search-reindex] reindex failed:", message);
    const report = err instanceof SearchBackfillError ? err.report : undefined;
    return NextResponse.json(
      { error: "reindex failed", message, report },
      { status: 502 },
    );
  }
}
