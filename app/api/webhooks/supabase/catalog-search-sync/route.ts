// Supabase → Algolia catalog search sync webhook.
//
// Configure a Supabase Database Webhook (Dashboard → Database → Webhooks) on
// the `products` and `product_variants` tables (INSERT/UPDATE/DELETE) pointing
// at this route, with an HTTP header `x-webhook-secret: <SUPABASE_CATALOG_WEBHOOK_SECRET>`.
// On each change we rebuild the affected product's record from Supabase (the
// source of truth) and upsert/delete it in Algolia. This is the NORMAL,
// automatic sync path — no manual script runs are required after setup.

import { NextResponse } from "next/server";
import {
  applyCatalogWebhookEvent,
  verifyWebhookSecret,
  WEBHOOK_SECRET_HEADER,
  type CatalogWebhookPayload,
} from "@/lib/algolia/sync";

// Needs Node (algoliasearch + supabase-js); never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  // 1) Auth FIRST — before touching env-gated Algolia config or parsing —
  //    so unauthorized callers get a uniform 401 and learn nothing.
  if (!verifyWebhookSecret(request.headers.get(WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Parse payload.
  let payload: CatalogWebhookPayload;
  try {
    payload = (await request.json()) as CatalogWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!payload || typeof payload.table !== "string" || typeof payload.type !== "string") {
    return NextResponse.json(
      { error: "missing required fields: type, table" },
      { status: 400 },
    );
  }

  // 3) Apply the change to Algolia.
  try {
    const outcome = await applyCatalogWebhookEvent(payload);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    // Developer-facing message without leaking secrets/keys.
    const message = err instanceof Error ? err.message : "unknown sync error";
    console.error("[catalog-search-sync] sync failed:", message);
    return NextResponse.json({ error: "sync failed", message }, { status: 502 });
  }
}

// A bare GET is handy for a liveness check; it intentionally does no work.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "catalog-search-sync" });
}
