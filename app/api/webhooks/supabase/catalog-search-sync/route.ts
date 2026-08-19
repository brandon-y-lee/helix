// Supabase → Algolia catalog search sync webhook.
//
// Configure a Supabase Database Webhook (Dashboard → Database → Webhooks) on
// the `products`, `product_variants`, `product_media`, and
// `product_pdp_content`, `product_slug_routes`, `product_families`, and
// `product_family_memberships` tables
// (INSERT/UPDATE/DELETE) pointing at this route, with an HTTP header
// `x-webhook-secret: <SUPABASE_CATALOG_WEBHOOK_SECRET>`.
// On each change we rebuild the affected product's record from Supabase (the
// source of truth) and upsert/delete it in Algolia. This is the NORMAL,
// automatic sync path — no manual script runs are required after setup.

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  applyCatalogWebhookEvent,
  CatalogWebhookValidationError,
  validateCatalogWebhookPayload,
  verifyWebhookSecret,
  WEBHOOK_SECRET_HEADER,
  type CatalogWebhookPayload,
} from "@/lib/algolia/sync";
import { getCatalogInvalidationTargets } from "@/lib/catalog-invalidation";
import { getIndexName } from "@/lib/algolia/server";

// Needs Node (algoliasearch + supabase-js); never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function invalidateCatalog(
  payload: CatalogWebhookPayload,
  outcome?: Awaited<ReturnType<typeof applyCatalogWebhookEvent>>,
): ReturnType<typeof getCatalogInvalidationTargets> {
  const targets = getCatalogInvalidationTargets(payload, outcome);
  for (const tag of targets.tags) revalidateTag(tag);
  for (const path of targets.paths) revalidatePath(path);
  return targets;
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1) Auth FIRST — before touching env-gated Algolia config or parsing —
  //    so unauthorized callers get a uniform 401 and learn nothing.
  if (!verifyWebhookSecret(request.headers.get(WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 64_000) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  // 2) Parse payload.
  let payload: CatalogWebhookPayload;
  try {
    payload = (await request.json()) as CatalogWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    validateCatalogWebhookPayload(payload);
  } catch (err) {
    const message =
      err instanceof CatalogWebhookValidationError
        ? err.message
        : "invalid webhook payload";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }

  // 3) Apply the change to Algolia.
  let outcome: Awaited<ReturnType<typeof applyCatalogWebhookEvent>>;
  try {
    outcome = await applyCatalogWebhookEvent(payload);
  } catch (err) {
    // Canonical Supabase data changed even if Algolia is temporarily down.
    // Invalidate page data so PDP/collection reads do not stay stale.
    try {
      invalidateCatalog(payload);
    } catch (cacheError) {
      const cacheMessage =
        cacheError instanceof Error ? cacheError.message : "unknown cache error";
      console.error("[catalog-search-sync] cache invalidation failed after sync error:", cacheMessage);
    }
    // Developer-facing message without leaking secrets/keys.
    const message = err instanceof Error ? err.message : "unknown sync error";
    console.error("[catalog-search-sync] sync failed:", message);
    return NextResponse.json({ error: "sync failed", message }, { status: 502 });
  }

  try {
    const cache = invalidateCatalog(payload, outcome);
    return NextResponse.json({
      ok: true,
      ...outcome,
      indexName: getIndexName(),
      publicIndexName: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
      cache,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown cache error";
    console.error("[catalog-search-sync] cache invalidation failed:", message);
    return NextResponse.json(
      { error: "cache invalidation failed", message, ...outcome },
      { status: 502 },
    );
  }
}
