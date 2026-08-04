# Mei Pelle Data Operations

Supabase is the canonical catalog and application data source. Catalog changes
go through the protected admin editor and its reviewed draft/publish workflow;
the repository no longer carries broad catalog import, presentation overwrite,
media migration, or legacy-row cleanup scripts.

## Current commands

```bash
pnpm run db:verify
pnpm run db:carts:cleanup:dry-run
pnpm run db:carts:cleanup:apply
pnpm run db:types
pnpm run search:reindex -- --dry-run
pnpm run search:reindex
```

The database commands require `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. They refuse every project except the approved
non-production project `erasogmsqpgiirovubjh`; there is no environment-variable
override.

`db:verify` is read-only. It checks the six active commerce products, canonical
routine metadata, variant and relationship uniqueness, the 30-row
`complete_the_routine` contract, and the rule that PROTECT is editorial-only.

The cart cleanup defaults to dry-run, processes at most 100 expired guest carts,
and delegates eligibility and deletion to the service-role-only
`cleanup_expired_guest_carts` database function. Apply it only as an approved
retention operation after reviewing the dry-run.

`search:reindex` writes only the derived Algolia index from active canonical
Supabase rows. Use its dry-run before a recovery apply.

## Schema and data changes

Use reviewed Supabase migrations for schema changes and bounded one-time data
changes. Before any remote mutation, verify the linked project and migration
state, inspect a dry run, back up affected data, and confirm the target is
`erasogmsqpgiirovubjh`.

Do not reintroduce reusable hard-delete or broad overwrite scripts for completed
cleanup/import work. If a future one-time correction is unavoidable, keep the
scope explicit, fail closed on customer/history references, apply it through a
reviewed migration, verify the result, and remove temporary tooling once the
operation is complete.

Never reset or truncate the linked database, rewrite protected customer or
payment history, or use static repository data as a runtime catalog fallback.
