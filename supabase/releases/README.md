# Forward database releases

Each new SQL file in `supabase/migrations` dated on or after 20261120000000 needs a matching reviewed JSON file in this directory. For example, the sidecar for `20300101000000_catalog_order.sql` is `20300101000000_catalog_order.json`.

```json
{
  "sourceSha256": "<SHA-256 of the exact SQL file bytes>",
  "verify": "SELECT ... AS applied"
}
```

Use UTF-8 without a byte-order mark and one ordinary `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, or PostgreSQL `DO $migration$ ... $migration$;` block. Use another tag for strings inside the block. These forms keep the reviewed operation and its genuine Supabase CLI history entry in the same transaction. The verifier runs a single read-only SELECT returning one boolean column named `applied`. Verify the effective definition or capability, including the target-specific behavior when it matters.

Keep each installed SQL file and its sidecar immutable. When a later migration replaces an earlier contract, add `"supersedes": ["20300101000000_catalog_order.sql"]` to the later sidecar. Each entry names a distinct, earlier SQL file with a still-active verifier. Its replacement must verify all retained invariants as well as the change. The runner checks the predecessor before installing its successor and the replacement immediately afterward. Unrelated contracts stay active. Every retry checks the contracts for the installed prefix.

The CLI receives the reviewed SQL bytes under a private filename with the original timestamp and a SHA-256 suffix derived from the SQL hash, verifier and ordered supersession references. The provider records this filename's stem and its actual parsed SQL in its normal migration history. The runner checks both on every release. A changed verifier or even a whitespace-only source edit to an installed migration fails the check.

The legacy source inventory is frozen at the parent tree of Spec #558. A credentialed session verifies the target's independently enrolled historical ledger count and digest, including its actual timestamps, SQL content and target-only changes. The release workdir contains refusal statements for these already-recorded versions. Any attempt to run one aborts. The pinned CLI `2.117.0` receives only reviewed forward SQL and uses `--skip-vault`. No historical SQL is fetched. A session advisory lock serializes planning, application, and postflight on each database. An interrupted run preserves genuinely committed earlier versions and verifies the ledger again on retry. Only SQL files with explicit sidecars participate. Standalone operations packages continue to require a separate approved adoption migration.

## Environment enrollment

Complete the separately reviewed bootstrap and role/storage/API checks on the actual target first. Keep Supabase Git sync disconnected. A database owner installs and verifies the environment marker, including its grants. The application and its service credentials cannot administer the release writer. Enroll a separate writer credential and CA on each restricted GitHub Environment. Use the explicit project host for direct access, or the approved primary session pooler on port 5432 with a target-qualified username. The release runner verifies the server certificate, logical environment, actual role, marker and ledger before selecting files. The deployment credential is supplied only to the migration step. Enable the corresponding repository variable after those checks.

Provision and test a dedicated login on each target. It needs database CONNECT, USAGE on `supabase_migrations`, SELECT and INSERT on the existing `supabase_migrations.schema_migrations` table, USAGE on `public` and `private`, and EXECUTE on both `public.read_helix_environment()` and `private.read_helix_environment()`. The CLI can record a new transaction with those ledger rights. Keep history and identity objects and their schemas under independent owners. The runner rejects administrative roles, application membership in the writer, authority to create schemas, authority to change earlier ledger rows, and authority to alter the marker.

Qualify application-object privileges against the actual SQL on each target. For example, creating a table or function requires CREATE on its schema, creating an index or replacing a function requires ownership of the existing table or function through a scoped owner role, and data verifiers need SELECT on their inputs. Check the actual inherited owner capabilities for the media change and each adopted package before activation. If objects are owned by a broad platform administrator, resolve the required narrow ownership separately under operator review. The release job never grants itself privileges or changes an object's owner to pass a preflight.

The protected `HELIX_MIGRATION_TARGET` JSON has the following shape. Obtain the digest/count from the read-only `historyQuery` exported by `scripts/db/forward-migrations.mjs` during a reviewed cutover inventory. Reconcile the result, grants and schema with the bootstrap report before enrolling it. The program never learns a new baseline from the database during a release. For an installed bootstrap operation above the cutoff, include its genuine `version`, `name`, and `statementsDigest` from that query's `forward` array in `bootstrap`. Only list operations explicitly reviewed and installed on this target outside the forward stream. Never copy the parent's ledger into development.

```json
{
  "environment": "development",
  "projectRef": "<approved project reference>",
  "host": "<verified direct or session-pooler hostname>",
  "role": "<dedicated migration role>",
  "legacyCount": 0,
  "legacyDigest": "<verified legacy ledger digest>",
  "bootstrap": [],
  "cutoverQualified": false
}
```

Both `HELIX_MIGRATION_PASSWORD` and `HELIX_MIGRATION_CA` are environment-scoped secrets. `helix-db-development` permits only the protected `dev` branch. `helix-db-production` permits only protected `main`. The development writer runs on subsequent pushes after `HELIX_DEV_MIGRATIONS_ENABLED` is enabled. The production writer is called by the staged release coordinator with its exact `expected_main_sha` after `HELIX_PRODUCTION_MIGRATIONS_ENABLED` is enabled. A successful job returns the checked-out SHA. Retain the existing public deployment until its staged successor passes its other checks.

To run the disposable integration test locally, cache `postgres:17-alpine` and run `node scripts/db/test-forward-migrations.mjs /path/to/supabase` using CLI 2.117.0. The test creates and removes its own local database container. It takes no operator credentials.
