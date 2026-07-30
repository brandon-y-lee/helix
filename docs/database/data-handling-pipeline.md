# Mei Pelle Data Handling Pipeline

This project treats Supabase as the canonical catalog and application data source. Runtime catalog pages must keep reading Supabase; script manifests are for controlled tooling, tests, audits, and migrations only.

## Command Map

```bash
pnpm run db:audit
pnpm run db:cleanup:dry-run
pnpm run db:cleanup:apply
pnpm run db:verify
pnpm run catalog:verify
pnpm run catalog:import:leaders
pnpm run catalog:refresh:presentation
pnpm run search:reindex
```

The database scripts require:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The scripts refuse to run unless the Supabase URL resolves to `erasogmsqpgiirovubjh`, unless `ALLOW_NON_CANONICAL_SUPABASE_REF=true` is intentionally set for a local/non-production override.

## Migrations vs Data Sync

Use schema migrations for:

- tables, columns, constraints, RLS, grants, indexes, triggers, and functions
- one-time bounded cleanup that needs migration history
- private operational audit tables

Use catalog sync/import scripts for:

- supplier-derived product facts
- catalog media/source refreshes
- idempotent upserts by slug, SKU, and other natural keys
- archiving products no longer canonical

The Leaders import and presentation refresh are dry-run by default. Their
field-level ownership and explicit editorial overwrite procedure are documented
in [`docs/catalog/field-ownership.md`](../catalog/field-ownership.md).

Use audit/verify scripts for:

- duplicate checks
- active catalog invariant checks
- protected table reference checks
- preflight before cleanup, import, or search reindex

Do not use migrations or scripts to reset, truncate, or rewrite protected history.

## Canonical Catalog Flow

1. Update the controlled catalog source or migration.
2. Run `pnpm run db:audit`.
3. Run the relevant import or migration dry-run.
4. Run `pnpm run db:verify`.
5. Run `pnpm run search:reindex`.
6. Run tests/build/browser smoke checks.
7. Document row-count and search-index results.

## Cleanup Flow

1. Confirm project ref with `corepack pnpm dlx supabase projects list`.
2. Confirm migration state with `corepack pnpm dlx supabase migration list`.
3. Run `pnpm run db:cleanup:dry-run`.
4. Back up schema metadata and affected table rows.
5. Apply only reviewed migrations or run `pnpm run db:cleanup:apply` for an approved one-off cleanup.
6. Run `pnpm run db:verify`.
7. Run `pnpm run search:reindex`.

Cleanup must fail closed if protected references exist.

## Protected Data

Never delete or rewrite these as part of catalog cleanup:

- `auth.users`
- `public.profiles`
- `public.carts`
- `public.cart_items`
- `public.orders`
- `public.order_items`
- `public.payment_attempts`
- `public.stripe_customers`
- `public.stripe_webhook_events`
- `public.loyalty_accounts`
- `public.loyalty_ledger_entries`
- `public.loyalty_redemptions`
- `public.referral_codes`
- `public.referral_attributions`
- `public.referral_rewards`
- `public.private_feedback`
- `public.trustpilot_invitation_attempts`

If a stale catalog row is referenced by any protected table, preserve it or archive it. Do not hard-delete it.

## Backups

Preferred backup:

```bash
corepack pnpm dlx supabase db dump --linked --schema public --file .supabase-backups/<timestamp>/public_schema.sql
corepack pnpm dlx supabase db dump --linked --data-only --schema public --use-copy --file .supabase-backups/<timestamp>/public_data.sql
```

If Docker or credentials block `db dump`, use targeted `supabase db query` backups for schema metadata and affected table rows. Do not commit raw dumps. `.supabase-backups/` is gitignored.

## Recovery

For catalog-only cleanup, recovery is normally:

1. Stop additional catalog writes.
2. Inspect `.supabase-backups/<timestamp>/catalog_cleanup_targets_pre.json`.
3. Restore affected catalog rows through a reviewed migration or one-off SQL.
4. Run `pnpm run db:verify`.
5. Run `pnpm run search:reindex`.

Do not restore protected data from local files unless a separate incident process has approved the exact scope.
