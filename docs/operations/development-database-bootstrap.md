# Bootstrap the Helix development database

Ticket #559 establishes a reproducible application schema for the persistent development child. The repository's historical migrations include one-time catalog imports, publication and deployment-qualified cleanup. A new database starts from the reviewed application definitions in this package. Subsequent release migrations follow the separately managed forward path in [the selective migration guide](selective-legacy-migrations.md).

## Rehearse a clean install and partial-child recovery

Use Node 24, a running local Docker daemon on a Unix socket, and Supabase CLI 3.1.0. The CLI starts a disposable local managed stack with PostgreSQL 17.12, Auth, Storage and PostgREST. The command accepts an optional absolute path to the installed CLI through `SUPABASE_CLI`. The first run can require the CLI's local service images.

```sh
node --test scripts/db/bootstrap/catalog-media.test.mjs
node scripts/db/test-development-bootstrap.mjs
```

The rehearsal creates a private CLI work directory and fresh databases. It writes a JSON receipt to stdout, tears down its own stack and requires no hosted credentials. It installs the clean schema twice, checks its parent-compatible structure and development privilege profile, exercises local Auth hooks, and reads the seeded Catalog through anonymous PostgREST. The source for the six-product historical fixture is the original first twelve repository migrations. The real Supabase migration command records those versions. The next migration fails because the original catalog lacks six canonical active products required by its cleanup guard.

The recovery trial operates on a restored copy of that partial fixture. A native PostgreSQL backup of the copy is restored into another fresh database, then schema, rows and sequence state are compared. Injected failures after the archive move and immediately before commit must leave the pre-upgrade state intact. The genuine twelve ledger entries, identities of archived tables and Auth hooks, foreign keys and original rows are checked before accepting a successful local cutover. A prior database session tests the old cached lookup and writer after the transaction commits.

## Schema sources and intentional differences

- `supabase/bootstrap/development/application.sql.in` holds final application DDL assembled from repository-owned sources. Function body references point to verified source byte ranges. The renderer checks their SHA-256 values before use. A change to the referenced bytes requires a reviewed update to the baseline. The renderer emits no connection commands.
- `privileges.sql` and `platform.sql` establish application-role grants, Storage policies, an empty operations table, seven governed System Steps and disabled operational controls. The managed stack supplies Auth, Storage and database roles. Existing platform objects and publication membership are verified separately. Scheduled jobs, outbound Catalog webhooks and secrets need environment-specific installation.
- `dev-changes.json` selects the additional, hash-pinned development source needed at the cutover. Its thirteen files are applied to the reconstructed database in the caller's transaction. No historical ledger rows are written for those definitions. Dedicated support/marketing manual installation packages remain separate release operations.
- `verify-schema.sql` reads normalized structural and effective privilege fingerprints from PostgreSQL catalogs. Run it inside a read-only transaction with `search_path=pg_catalog`. `expected-schema.json` records the observed parent structural fingerprints, narrower development privileges and expected post-cutover definitions. The verifier checks actual project-specific media constraints, managed Auth hooks and publication membership separately. PostgreSQL physical column slot numbers can differ after historical drops.
- `seed.sql` installs distinct, clearly synthetic development products with unavailable variants. The five fixtures serve anonymous list, Core and nonentry family PDP queries. Branded homepage merchandising and actual product availability need separately governed Catalog and media data. Media provenance comes from the repository test patterns and their exact digests.

## Hosted cutover and historical visibility

The partial development child has six original placeholder products and ten variants in its historical catalog. The modern schema requires governed System Step and ordering fields which are missing there. For the local recovery trial, the old relations move to a restricted archive with original keys, references and row values. The new public catalog uses separate fixture identities. An old product ID no longer resolves to that product through the current public Catalog. The trial verifies revoked access to original objects, including in a previously connected session. Approval of this experiment grants no disposition of hosted data.

Before any hosted change, the operator needs the owner's selection for the original six records and any remaining public-visibility requirements. Refresh the actual parent and child fingerprints, role/ledger inventories, managed dependencies, publication membership and current deployment targets. Establish a writer fence and verify a restorable backup with an independent rehearsal under the relevant hosted service version. Record recovery ownership and an expected before/after report. The archive script is restricted to the local, named, Unix-socket rehearsal, and the parent never receives this bootstrap.

After separately authorized provisioning, verify the development binding from the release environment contract, then upload and verify child-owned media. The `--development` seed-render mode checks public object bytes and MIME type before emitting SQL. That SQL verifies the child marker, bucket and object metadata before writing. The local seed mode verifies fixture bytes offline. Keep the real Git integration disconnected until release migration discovery reports only the intended new files. An application promotion requires independent deployment, credential and live-feature qualification.
