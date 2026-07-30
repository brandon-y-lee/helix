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

Webhook provisioning additionally requires these operator-only values in
`.env.local`:

- `SUPABASE_PROJECT_REF=erasogmsqpgiirovubjh`
- `CATALOG_WEBHOOK_TARGET_ENVIRONMENT=development` or `preview`
- `SUPABASE_ACCESS_TOKEN` with database read/write and Database Webhooks
  configuration access
- `SUPABASE_CATALOG_WEBHOOK_URL`, set to the exact stable HTTPS route
- `CATALOG_WEBHOOK_SMOKE_PRODUCT_ID`, an existing non-production product UUID
  required only by the smoke command

`SUPABASE_ACCESS_TOKEN` is for the local provisioning command. Do not add it to
Vercel. Vercel needs `SUPABASE_CATALOG_WEBHOOK_SECRET` so the route can
authenticate deliveries; the operator command needs the same value to create
and verify the sender header without printing it.

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

The desired non-production configuration contains exactly four HTTP triggers:

| Table | Events | Why |
| --- | --- | --- |
| `products` | `INSERT`, `UPDATE`, `DELETE` | Product projection, membership, metadata, and deletion |
| `product_variants` | `INSERT`, `UPDATE`, `DELETE` | Price, availability, inventory, and variant projection |
| `product_media` | `INSERT`, `UPDATE`, `DELETE` | Search/listing media and PDP media projection |
| `product_pdp_content` | `INSERT`, `UPDATE`, `DELETE` | PDP and Core routine cache projection |

Each trigger sends `POST` to
`/api/webhooks/supabase/catalog-search-sync` with JSON and the
`x-webhook-secret` header. Child rows always contain a non-null `product_id`,
including the delete `old_record`, so the shared handler can resolve the
affected product.

`product_relationships` is intentionally not a fifth source. The current
storefront uses discovery and Core routine projections rather than the legacy
relationship readers, Algolia does not select the relationship table, and the
shared handler does not accept relationship payloads. Add it only with a
separate handler/cache ownership change if those runtime dependencies return.

Use the source-controlled commands instead of Dashboard clicks:

```bash
pnpm catalog:webhooks:plan
pnpm catalog:webhooks:apply
pnpm catalog:webhooks:verify
```

`plan` reads current state and prints a deterministic, secret-free diff.
`apply` is reserved for the final integration session. It first verifies the
fixed project ref and rejects `production`; if needed it enables Supabase
Database Webhooks through the official Management API, then creates or replaces
only the four deterministically named managed triggers in one SQL transaction.
It refuses unknown or duplicate HTTP triggers rather than deleting them.
Matching triggers are left unchanged, and a final read verifies the full
configuration. Any enable, transaction, or final-verification failure exits
nonzero; an enable followed by a later failure is reported as partial.

The tool uses Supabase's supported Database Webhooks enable endpoint and SQL
interface. No application migration represents provider-owned webhook
configuration. The secret is present only in the authenticated request and
database trigger arguments; reports contain header names and match results,
never header values or provider response bodies that could echo SQL.

The approved project was inspected read-only on 2026-07-29. It had no Database
Webhook triggers, `pg_net` was not enabled, and
`supabase_functions.http_request` was unavailable. Only the ordinary
`updated_at` triggers existed on the four catalog tables. No remote apply was
performed as part of the provisioning implementation.

Use a stable, non-production Vercel deployment URL. Do not use an ephemeral
preview URL that will disappear, and do not point a production database at a
preview environment. Supabase cannot reach localhost; local endpoint behavior
is verified by the route tests.

Product changes rebuild or delete that product record. Variant and media
changes rebuild the parent product, so a media-row delete never deletes the
product search object by itself. The same request invalidates Next catalog,
product, and collection cache tags and affected routes. Retries are idempotent
because the Supabase product UUID is the Algolia `objectID`.

The webhook receiver is POST-only, rejects non-`public` schemas and unrelated
tables, and expects `record` for inserts, `record` plus `old_record` for
updates, and `old_record` for deletes. Supabase webhook credentials must be
stored outside source control; use the server environment for the receiver
secret. The provisioning command injects the sender header from the operator
environment without writing its value to source-controlled SQL or output.

### Controlled delivery verification

After apply and verify succeed in the final integration session, run:

```bash
pnpm catalog:webhooks:smoke
```

The smoke command first confirms an invalid secret receives `401`, then sends
the same synthetic `product_variants` update twice for
`CATALOG_WEBHOOK_SMOKE_PRODUCT_ID`. It changes no Supabase row. A successful
response proves the child `product_id` resolved to the expected Algolia
`objectID`, the Algolia upsert completed, cache invalidation targets were
attempted, and the duplicate delivery produced the same idempotent outcome.
Because it deliberately exercises the live derived paths, run it only against
the approved non-production deployment and Algolia index.

Command errors distinguish invalid signature, unknown table, missing product
identity, Algolia failure, cache invalidation failure, and partial success.
They do not print full product documents, secrets, or provider response bodies.

## Caching

Collection and PDP reads use Next Data Cache with a one-hour fallback revalidate
and on-demand webhook invalidation. Redis/Upstash is intentionally deferred:
the shared Vercel cache already prevents repeat Supabase reads for this catalog,
and there is no PII or mutable session data in the cached documents.

No Supabase schema change is required. Collections remain the existing
`products.collection` field; no collection/category relationship tables exist
in the current development schema.
