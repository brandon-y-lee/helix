# Search Operations

Supabase is the canonical catalog. Algolia contains one storefront-safe search
record per product UUID and is used only for interactive search.

## Environment

Set these in local development and in each Vercel environment that serves the
storefront:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ALGOLIA_APP_ID`
- `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY` (search-only ACL)
- `NEXT_PUBLIC_ALGOLIA_INDEX_NAME`
- `ALGOLIA_APP_ID`
- `ALGOLIA_WRITE_API_KEY` or `ALGOLIA_ADMIN_API_KEY` (server-only)
- `ALGOLIA_INDEX_NAME`
- `SUPABASE_CATALOG_WEBHOOK_SECRET` (server-only)

The public/server Algolia app IDs and index names must match. Vercel supplies
`VERCEL_ENV`; local backfills must set `SEARCH_BACKFILL_ENVIRONMENT` explicitly.
Production backfills additionally require `ALLOW_PRODUCTION_SEARCH_REINDEX=true`.

## Initial Backfill

Run only against the intended development/preview project:

```bash
SEARCH_BACKFILL_ENVIRONMENT=development pnpm run search:backfill -- --dry-run
SEARCH_BACKFILL_ENVIRONMENT=development pnpm run search:backfill
```

The dry run reads and transforms every canonical record but does not replace
the Algolia index. Apply refuses an empty Supabase catalog, waits for Algolia
operations, and verifies that the final Algolia record count matches the
submitted count.
The protected `POST /api/admin/search-reindex` route provides the same behavior
for deployed recovery and expects `x-webhook-secret`.

## Supabase Webhooks

In **Supabase Dashboard > Database > Webhooks**, create three HTTP webhooks:

1. Table `products`, events `INSERT`, `UPDATE`, `DELETE`.
2. Table `product_variants`, events `INSERT`, `UPDATE`, `DELETE`.
3. Table `product_media`, events `INSERT`, `UPDATE`, `DELETE`.

Use this endpoint:

```text
https://<deployment-host>/api/webhooks/supabase/catalog-search-sync
```

Add the header:

```text
x-webhook-secret: <SUPABASE_CATALOG_WEBHOOK_SECRET>
```

Use the stable production Vercel domain for production data. A preview webhook
must point to a specific protected preview deployment and use preview-only
Supabase/Algolia resources; do not point a production database at ephemeral
preview URLs. Supabase cannot call localhost, so local webhook testing requires
an approved HTTPS tunnel.

Product changes rebuild or delete that product record. Variant and media
changes rebuild the parent product, so a media-row delete never deletes the
product search object by itself. The same request invalidates Next catalog,
product, and collection cache tags and affected routes. Retries are idempotent
because the Supabase product UUID is the Algolia `objectID`.

The webhook receiver is POST-only, rejects non-`public` schemas and unrelated
tables, and expects `record` for inserts, `record` plus `old_record` for
updates, and `old_record` for deletes. Supabase webhook credentials must be
stored outside source control; use the server environment for the receiver
secret and Vault or Dashboard-managed webhook headers for the sender copy.

## Caching

Collection and PDP reads use Next Data Cache with a one-hour fallback revalidate
and on-demand webhook invalidation. Redis/Upstash is intentionally deferred:
the shared Vercel cache already prevents repeat Supabase reads for this catalog,
and there is no PII or mutable session data in the cached documents.

No Supabase schema change is required. Collections remain the existing
`products.collection` field; no collection/category relationship tables exist
in the current development schema.
