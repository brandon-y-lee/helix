# Forward database releases

Each new SQL file in `supabase/migrations` dated on or after 20261120000000 needs a matching reviewed JSON file in this directory. For example, the sidecar for `20300101000000_catalog_order.sql` is `20300101000000_catalog_order.json`.

```json
{
  "sourceSha256": "<SHA-256 of the exact SQL file bytes>",
  "verify": "SELECT ... AS applied"
}
```

Use a single ordinary `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, or one PostgreSQL `DO $migration$ ... $migration$;` block. Use another tag for strings inside the block. These forms keep the reviewed operation and its genuine Supabase CLI history entry in the same transaction. The verifier runs a single read-only SELECT returning one boolean column named `applied`. Verify the effective definition or capability, including the target-specific behavior when it matters. Verify previously applied contracts on each retry. A later migration that intentionally supersedes a contract must update its verification as part of the same reviewed release. Existing applied migration SQL is immutable. Jobs stage migrations individually and stop at the first failed contract.

The legacy source inventory is frozen at the parent tree of Spec #558. A credentialed session verifies the target's independently enrolled historical ledger count and digest, including its actual timestamps, SQL content and target-only changes. The release workdir contains refusal statements for these already-recorded versions. Any attempt to run one aborts. The pinned CLI `2.117.0` receives only reviewed forward SQL and uses `--skip-vault`. No historical SQL is fetched. A session advisory lock serializes planning, application, and postflight on each database. An interrupted run preserves genuinely committed earlier versions and verifies the ledger again on retry. Only SQL files with explicit sidecars participate. Standalone operations packages continue to require a separate approved adoption migration.

## Environment enrollment

Complete the separately reviewed bootstrap and role/storage/API checks on the actual target first. Keep Supabase Git sync disconnected. A database owner installs and verifies the environment marker, including its grants. The application and its service credentials cannot administer the release writer. Enroll a separate writer credential and CA on each restricted GitHub Environment. Use the explicit project host for direct access, or the approved primary session pooler on port 5432 with a target-qualified username. The release runner verifies the server certificate, logical environment, actual role, marker and ledger before selecting files. The deployment credential is supplied only to the migration step. Enable the corresponding repository variable after those checks.

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
