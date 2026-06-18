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
import { fetchAllSearchRecords } from "@/lib/algolia/source";
import { reindexAllSearchRecords, getIndexName } from "@/lib/algolia/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyWebhookSecret(request.headers.get(WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const records = await fetchAllSearchRecords();
    const count = await reindexAllSearchRecords(records);
    return NextResponse.json({ ok: true, indexName: getIndexName(), indexed: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown reindex error";
    console.error("[search-reindex] reindex failed:", message);
    return NextResponse.json({ error: "reindex failed", message }, { status: 502 });
  }
}
