# Retire the unused Catalog V3 dispatcher

Spec #358, Ticket #367 removes exactly
`private.catalog_editor_upgrade_to_v3(jsonb)` through the additive
`20260914051219_retire_catalog_v3_dispatcher.sql` migration.

The current Restore path uses `catalog_editor_upgrade_to_v4`, its Product Family
wrapper, and the individual historical revision decoders. All of those functions,
the current Publish chain, immutable Published Revisions, and applied migration
files remain intact. No Catalog rows or historical documents are changed.

## Evidence and scope

Read-only provider checks on **2026-09-14 at 05:03:59 UTC** verified the approved
project `erasogmsqpgiirovubjh` (`helix`, healthy, PostgreSQL 17). The exact candidate
had no tracked dependent objects and no other routine body containing its name
across all schemas. Its owner and sole execution grantee were `postgres`; it was
`SECURITY DEFINER`, `VOLATILE`, with an empty search path.

- Body MD5: `25dce3ac1d7751e620f8dd8ad4ee56a7`.
- Full PostgreSQL function-definition MD5: `5d5c7b7875a91b4026f70887e78a5382`.

These are review fingerprints, not security hashes. The migration also checks
ownership, grants, search path, current required signatures, tracked dependencies,
and routine-body references. Any drift refuses removal. A missing candidate is an
idempotent no-op. The exact drop uses `RESTRICT`, never `CASCADE`.

The older dispatcher references left in applied migrations and their historical
tests are intentional history. They do not keep a current executable dispatcher.

## Local executable verification

With the local synthetic PostgreSQL 17 container `helix-spec358-pg` running:

```bash
node scripts/db/test-catalog-dispatcher-retirement.mjs
```

The runner creates only its distinct local `catalog_t8` database if absent. It
accepts no remote connection URL. Every case creates its fixture in a transaction
and rolls it back. It sources the exact dispatcher body from the applied V3
migration and applies the later volatility correction. The eleven preserved
functions are explicitly synthetic signature-only fixtures. Their definitions
and ACLs are snapshotted and compared after each removal or refusal.

The twelve passing cases cover exact removal, repeated no-op, body drift, widened
execution grants, security mode, search path, owner, volatility, a routine caller,
a tracked SQL-body dependency, a missing historical decoder, and a missing current
Restore wrapper. Refusal cases verify the pre-attempt function definitions and
ACLs survive unchanged. Development recorded failing tests before adding the
removal, definition, security, and routine-caller guards.

This narrow harness verifies the actual contraction SQL. It does **not** execute
the full Catalog schema, prove historical Restore behavior, or serve as a fresh
database provisioner. The approved current-checkpoint Restore and Publish
verification remains part of Tickets #360 and the combined Spec verification.

## Provider operation remains pending

No remote SQL mutation was performed for this Ticket. Source integration and
local success do not mean the deployed dispatcher has been removed. Before a
separately authorized apply:

1. Verify project metadata identifies `erasogmsqpgiirovubjh`, obtain the current
   migration/deployment state, and reconcile other pending migrations. Apply only
   this reviewed payload when appropriate; do not apply all pending migrations
   indiscriminately. Coordinate with other Catalog schema changes so the captured
   state does not change between preflight and apply.
2. Re-read the candidate body, owner, ACL, search path, routine-body callers, and
   tracked dependencies. Reconfirm current deployed consumers use V4. Review
   external administrative jobs or scripts if any now invoke the private
   dispatcher; absence from `pg_proc` cannot establish absence of such callers.
3. Capture definitions and ACLs for the three historical decoders, both V4
   dispatchers, Restore, and all five current Publish functions. Compare them
   after apply against the immediately preceding capture, including any approved
   sibling Ticket changes. Do not compare them to the synthetic fixture.
4. Apply the exact reviewed migration through the normal additive migration
   workflow. Record its SHA256, migration version, project, operator, and UTC
   result. If a guard fails, preserve the failed evidence and investigate the
   change; do not bypass the guard or use `CASCADE`.
5. Verify the exact candidate is absent and the captured retained definitions and
   ACLs are unchanged. Run the approved current-schema Restore and Publish
   verification before declaring the provider operation complete. Record the
   result on Ticket #367 and Spec #358 so pending operations remain visible.

Useful schema-only preflight (retain its output with the operation record):

```sql
with candidate as (
  select to_regprocedure('private.catalog_editor_upgrade_to_v3(jsonb)')::oid as oid
)
select jsonb_build_object(
  'captured_at', current_timestamp,
  'candidate', (
    select jsonb_build_object(
      'definition', pg_get_functiondef(p.oid),
      'definition_md5', md5(pg_get_functiondef(p.oid)),
      'owner', pg_get_userbyid(p.proowner),
      'acl', p.proacl::text,
      'settings', p.proconfig
    ) from pg_proc p join candidate c on p.oid = c.oid
  ),
  'routine_body_callers', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text), '[]'::jsonb)
    from pg_proc p, candidate c
    where p.oid <> c.oid and p.prosrc ilike '%catalog_editor_upgrade_to_v3%'
  ),
  'tracked_dependents', (
    select coalesce(jsonb_agg(pg_describe_object(d.classid, d.objid, d.objsubid)), '[]'::jsonb)
    from pg_depend d, candidate c
    where d.refclassid = 'pg_proc'::regclass and d.refobjid = c.oid
  )
);
```

PostgreSQL does not track calls discoverable only within string-defined function
bodies, which is why the migration checks both routine bodies and catalog
dependencies. See [PostgreSQL 17 dependency tracking](https://www.postgresql.org/docs/17/ddl-depend.html)
and [DROP FUNCTION](https://www.postgresql.org/docs/17/sql-dropfunction.html).

An older deployment that actually requires V3 is not an acceptable rollback
target after contraction. If such a rollback becomes necessary, review and
restore the exact historical dispatcher definition, volatility, and restricted
grants through an additive migration before deploying that consumer. Never
rewrite migration history or remove historical decoder functions.
