# Supabase Table Sanity Report - 2026-07-14

> Historical record: the one-off cleanup and fallback-backup scripts named in
> this report were removed after the completed cleanup. The commands below
> document what ran on 2026-07-14; they are not current operational commands.

## Executive Summary

Verified project: `erasogmsqpgiirovubjh` (`mei-pelle`, `ACTIVE_HEALTHY`, linked).

Latest committed canonical catalog anchor before this task was `supabase/migrations/202607130001_commerce_routine_core_beyond.sql`. The audit found no active duplicate catalog rows: the active storefront catalog already had exactly the six canonical commerce products, active `the-core` and `beyond-the-core` collections, and 30 `complete_the_routine` relationships. The accumulated stale data was six archived original development seed products from `20260617094856_seed_catalog.sql`, with ten variant rows and no protected cart/order/history references.

Cleanup applied through migrations:

- `supabase/migrations/20260714063716_dedupe_catalog_seed_data.sql`
- `supabase/migrations/20260714064610_add_app_ops_cleanup_policy.sql`

Rows removed from linked non-production Supabase:

- `public.products`: 6 archived original seed rows hard-deleted.
- `public.product_variants`: 10 rows deleted by existing `on delete cascade`.
- Protected/customer/history tables: 0 rows deleted.

Post-cleanup verification:

- `public.products`: 6 rows.
- `public.product_variants`: 6 rows.
- `public.product_relationships`: 30 rows.
- PROTECT active commerce products: 0.
- Duplicate product slugs, collection slugs, relationship keys: 0.

## Backup Record

The requested `supabase db dump` command was attempted first, but Docker was unavailable:

```bash
corepack pnpm dlx supabase db dump --linked --schema public --file .supabase-backups/20260714T064217Z/public_schema.sql
```

The CLI failed with `Cannot connect to the Docker daemon`. Per the task fallback, repository-safe SQL metadata and targeted catalog snapshots were created through `supabase db query` before mutation.

Gitignored backup location:

```text
.supabase-backups/20260714T064217Z/
```

Successful backup artifacts:

- `public_schema_metadata.json`
- `catalog_cleanup_targets_pre.json`
- `public_schema_metadata_post.json`
- `catalog_cleanup_targets_post.json`

The targeted data backup contains only catalog cleanup candidates (`products` and `product_variants`) and reference counts. It does not include raw customer rows, payment payloads, auth rows, or provider payloads.

## Migration History

Before cleanup, local and remote migrations matched through:

```text
202607130001_commerce_routine_core_beyond
```

After cleanup, remote history includes:

```text
20260714063716_dedupe_catalog_seed_data
20260714064610_add_app_ops_cleanup_policy
```

## Cleanup Decision

Hard-delete was allowed only for these six rows because all checks passed:

| slug | status before | protected refs | other catalog refs | variant refs |
| --- | --- | ---: | ---: | ---: |
| `clearview-eye-concentrate` | archived | 0 | 0 | 1 |
| `groundwork-gel-cleanser` | archived | 0 | 0 | 2 |
| `lowtide-recovery-cream` | archived | 0 | 0 | 2 |
| `meridian-daily-moisturizer` | archived | 0 | 0 | 2 |
| `northpoint-renewal-serum` | archived | 0 | 0 | 2 |
| `summit-mineral-spf` | archived | 0 | 0 | 1 |

The private audit table records:

```text
run_key: 20260714_dedupe_legacy_seed_catalog_products
product_rows_deleted: 6
variant_rows_deleted: 10
protected_reference_count: 0
other_reference_count: 0
```

## Canonical Catalog State

| product | slug | active count | routine label |
| --- | --- | ---: | --- |
| CLEANSE | `cleanse-01-calming-gel-cleanser` | 1 | `01 - The Core` |
| TREAT | `treat-03-pdrn-5-ampoule` | 1 | `02 - The Core` |
| SEAL | `seal-05-green-collagen-cream` | 1 | `03 - The Core` |
| REFINE | `refine-02-pore-treatment-pads` | 1 | `Beyond The Core` |
| FRAME | `frame-04-pdrn-eye-cream` | 1 | `Beyond The Core` |
| LIFT | `lift-06-pdrn-mask-system` | 1 | `Beyond The Core` |

Active collections:

- `the-core`
- `beyond-the-core`

Inactive legacy collections retained for compatibility/history:

- `the-system`
- `intensive`

PROTECT remains editorial-only. No active commerce product row includes PROTECT.

## Table Inventory

Full machine-readable count summary: `docs/database/20260714_table_counts.csv`.

| table | classification | before | after | action |
| --- | --- | ---: | ---: | --- |
| `app_ops.data_cleanup_runs` | private ops audit | 0 | 1 | created service-role-only audit table |
| `auth.users` | protected auth metadata | 3 | 3 | aggregate count only |
| `storage.buckets` | storage metadata | 1 | 1 | aggregate count only |
| `storage.objects` | storage metadata | 30 | 30 | aggregate count only |
| `public.products` | catalog current state | 12 | 6 | deleted archived legacy seed products |
| `public.product_variants` | catalog current variants | 16 | 6 | cascade deleted old seed variants |
| `public.product_media` | catalog media | 42 | 42 | preserved |
| `public.product_relationships` | catalog joins | 30 | 30 | verified |
| `public.product_sources` | private provenance | 6 | 6 | preserved |
| `public.collections` | catalog collections | 4 | 4 | preserved |
| `public.profiles` | protected customer profile | 3 | 3 | preserved |
| `public.carts` | protected cart state | 207 | 207 | preserved |
| `public.cart_items` | protected cart state | 171 | 171 | preserved |
| `public.orders` | protected order history | 6 | 6 | preserved |
| `public.order_items` | protected order history | 7 | 7 | preserved |
| `public.payment_attempts` | protected payment history | 6 | 6 | preserved |
| `public.stripe_customers` | protected payment/customer state | 1 | 1 | preserved |
| `public.stripe_webhook_events` | protected webhook history | 3 | 3 | preserved |
| `public.loyalty_accounts` | protected rewards state | 3 | 3 | preserved |
| `public.loyalty_ledger_entries` | protected rewards ledger | 1 | 1 | preserved |
| `public.loyalty_redemptions` | protected rewards state | 0 | 0 | preserved |
| `public.referral_codes` | protected referral state | 3 | 3 | preserved |
| `public.referral_attributions` | protected referral state | 0 | 0 | preserved |
| `public.referral_rewards` | protected referral state | 0 | 0 | preserved |
| `public.private_feedback` | protected feedback state | 0 | 0 | preserved |
| `public.trustpilot_invitation_attempts` | protected Trustpilot state | 0 | 0 | preserved |

## Duplicate Findings

Full machine-readable summary: `docs/database/20260714_duplicate_candidates.csv`.

- Duplicate product slugs: 0 before, 0 after.
- Duplicate collection slugs: 0 before, 0 after.
- Duplicate product relationship natural keys: 0 before, 0 after.
- Active unexpected products: 0 before, 0 after.
- Active PROTECT product rows: 0 before, 0 after.
- Stale `complete_the_routine` relationships: 0 before, 0 after.
- Cleanup candidates: 6 before, 0 after.

## Guards Added

Data cleanup and audit:

- Private schema `app_ops`.
- Table `app_ops.data_cleanup_runs`.
- RLS enabled with policy `data_cleanup_runs_service_role_all`.
- Browser roles revoked from `app_ops`.

Catalog/idempotency guards:

- Partial unique index `product_variants_sku_unique_idx` on non-null SKUs.
- Existing product slug, collection slug, product variant key, product media key, and product relationship key constraints retained.

FK/performance indexes added:

- `product_media_variant_id_idx`
- `referral_attributions_referral_code_id_idx`
- `referral_rewards_consumed_order_id_idx`
- `referral_rewards_referral_attribution_id_idx`
- `trustpilot_invitation_attempts_order_id_idx`
- `trustpilot_invitation_attempts_user_id_idx`

Security-definer grants narrowed:

- `award_loyalty_points`, `ensure_loyalty_account`, `handle_new_user_loyalty`, `handle_new_user_profile`, and `redeem_loyalty_points`: service-role only.
- `merge_guest_cart`: authenticated and service_role only. Authenticated access is intentional because the existing server-session cart merge flow calls this RPC after `auth.getUser()`.

## RLS and Advisors

Full policy summary: `docs/database/20260714_rls_policy_audit.csv`.

`pnpm dlx supabase db lint --linked --fail-on none` returned no schema errors.

Security advisors still report:

- `public.product_sources` and `public.stripe_webhook_events` have RLS enabled with no client policies. This is intentional: they are service-only provenance/webhook-history tables.
- Public bucket `mei-pelle-catalog` has a broad public read policy. This is existing catalog asset behavior and should be reviewed separately before launch.
- `merge_guest_cart` is executable by `authenticated` as a SECURITY DEFINER RPC. This is intentional for the existing server-backed cart merge flow.
- Supabase Auth leaked password protection is disabled. This requires dashboard configuration, not a repository migration.

Performance advisors still report:

- Auth RLS init-plan warnings where policies use direct `auth.uid()` calls. These should be handled in a separate focused policy-performance migration.
- Unused-index info findings. New FK indexes are expected to read as unused immediately after creation; older unused-index findings need production-like traffic observation before removal.

## Search and Cache

Algolia was reconciled after cleanup:

```text
pnpm run search:reindex
read: 6
transformed: 6
upserted: 6
verified: 6
failed: 0
```

No explicit repository cache purge script exists. The catalog source now returns only the six active products, and the search index was rewritten from Supabase.

## Commands Run

Key successful commands:

```bash
corepack pnpm dlx supabase projects list
corepack pnpm dlx supabase migration list
pnpm run db:cleanup:dry-run
pnpm run db:audit
corepack pnpm dlx supabase db query --linked --file scripts/db/sql/backup-public-schema-metadata.sql --output json
corepack pnpm dlx supabase db query --linked --file scripts/db/sql/backup-catalog-cleanup-targets.sql --output json
corepack pnpm dlx supabase db push --dry-run
corepack pnpm dlx supabase db push
pnpm run db:verify
pnpm run db:cleanup:apply
corepack pnpm dlx supabase db lint --linked --fail-on none
corepack pnpm dlx supabase db advisors --linked --type security --fail-on none --level info
pnpm run search:reindex
```

Known failed command:

```bash
corepack pnpm dlx supabase db dump --linked --schema public --file .supabase-backups/20260714T064217Z/public_schema.sql
```

Reason: Docker daemon unavailable. Fallback backups were created with `supabase db query`.

## Remaining Risks

- Dashboard-level Auth leaked-password protection remains disabled.
- Public storage bucket listing should be reviewed separately.
- RLS `auth.uid()` performance warnings should be resolved in a separate migration.
- Search was reindexed successfully. If production launch uses different Algolia credentials/indexes, run the same reindex flow against that approved environment.
