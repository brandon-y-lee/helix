# Database Cleanup Runbook

Use this runbook for bounded non-production cleanup of duplicate or outdated migration-generated data.

## Preflight

```bash
pwd
git branch --show-current
git status --short
git diff --stat
git log --oneline --max-count=10
git worktree list
corepack pnpm dlx supabase projects list
corepack pnpm dlx supabase migration list
```

Confirm the linked project ref is exactly:

```text
erasogmsqpgiirovubjh
```

Stop if it is not.

## Audit

```bash
pnpm run db:audit
pnpm run db:cleanup:dry-run
```

The cleanup dry-run must show:

- no protected cart/order references
- no non-variant catalog references unless explicitly reviewed
- only archived/generated rows as deletion candidates

## Backup

Preferred:

```bash
mkdir -p .supabase-backups/<timestamp>
corepack pnpm dlx supabase db dump --linked --schema public --file .supabase-backups/<timestamp>/public_schema.sql
corepack pnpm dlx supabase db dump --linked --data-only --schema public --use-copy --file .supabase-backups/<timestamp>/public_data.sql
```

Fallback used on 2026-07-14 because Docker was unavailable:

```bash
corepack pnpm dlx supabase db query --linked --file scripts/db/sql/backup-public-schema-metadata.sql --output json
corepack pnpm dlx supabase db query --linked --file scripts/db/sql/backup-catalog-cleanup-targets.sql --output json
```

Save outputs under `.supabase-backups/<timestamp>/`. Do not commit raw backups.

## Apply

Prefer committed migrations:

```bash
corepack pnpm dlx supabase db push --dry-run
corepack pnpm dlx supabase db push
```

Use `pnpm run db:cleanup:apply` only for an approved one-off cleanup after dry-run and backup.

## Verify

```bash
pnpm run db:verify
pnpm run db:cleanup:apply
corepack pnpm dlx supabase db lint --linked --fail-on none
corepack pnpm dlx supabase db advisors --linked --type security --fail-on none --level info
pnpm run search:reindex
```

`pnpm run db:cleanup:apply` should be idempotent after migration cleanup and report zero candidates.

## Never Do This

- Do not reset the linked database.
- Do not truncate broad tables.
- Do not delete auth users.
- Do not delete profiles, carts, orders, order items, payments, rewards, referrals, feedback, webhook events, or provider payload history.
- Do not repair migration history merely to force a push.
- Do not reindex Algolia from stale or static fallback data.

## 2026-07-14 Cleanup Result

Applied migrations:

- `20260714063716_dedupe_catalog_seed_data`
- `20260714064610_add_app_ops_cleanup_policy`

Remote rows removed:

- `public.products`: 6 archived original seed products.
- `public.product_variants`: 10 variants cascaded.

Remote rows preserved:

- all protected customer/history/payment/rewards/referral/auth/storage data
- all current active catalog rows
- all canonical product media, product sources, relationships, and collections
