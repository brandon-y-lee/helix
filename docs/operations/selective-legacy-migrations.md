# Selective legacy cleanup migrations

Spec #358 must prepare compatible contracts before deploying current consumers and defer contractions until the deployment is verified. An indiscriminate repository migration push is unsafe. This procedure preserves the actual applied versions and the exact checked-in filenames; it does not repair or rewrite history.

The September 14, 2026 read-only audit found 75 remote migration records, with recorded statements, and 13 pre-existing timestamp differences for same-named repository migrations. These are dated observations to refresh before apply. Never replay repository history to conceal that mismatch.

## Private phase directory

The reviewed CLI version is 2.117.0. Verify the installed version and command help before execution. Its supported interfaces are a separate `--workdir`, `migration fetch`, `db push --dry-run`, and `--include-all` for deliberately deferred older files. There is no filename selector for `db push`. Use a fresh private directory for each phase, fetch every actual applied remote version, and append only the selected new source files. This is a composition of supported CLI commands, not a special provider phase mode.

Historical migration statements may contain old webhook credentials. Use a mode-0700 directory and `umask 077`; never print, commit, attach, or copy fetched SQL into this repository. Do not fetch over a nonempty migrations directory. Inject only the existing verified access token into the child environment using the private environment loader; do not copy an entire environment file or put credentials in command arguments.

Linked CLI connection setup can create a temporary login role through the official API, even for a dry run or history fetch. Treat it as operational connection setup, verify the exact approved project `erasogmsqpgiirovubjh`, and stop on repeated connection failures. The existing PAT path does not require inventing a database password. Do not reset a project, start a local stack, apply custom roles/seeds, change Vault secrets, or copy another project's link metadata.

```bash
umask 077
HELIX_SPEC_SOURCE="$(git rev-parse --show-toplevel)"
: "${HELIX_SPEC_SOURCE_SHA:?Set the frozen reviewed source commit}"
HELIX_SPEC_OPERATOR_DIR="$(mktemp -d /private/tmp/helix-spec358-preparation.XXXXXX)"
pnpm dlx supabase@2.117.0 --workdir "$HELIX_SPEC_OPERATOR_DIR" init
pnpm dlx supabase@2.117.0 --workdir "$HELIX_SPEC_OPERATOR_DIR" migration fetch \
  --linked --project-ref erasogmsqpgiirovubjh
```

Inspect the new configuration: migration handling enabled, PostgreSQL major version matches the provider, and no custom remote override. Compare fetched version/name sets to a fresh remote inventory; require every applied version exactly once, with nonempty recorded statements. Save private checksums. The fetched files represent applied history for pending-set comparison and must never be offered as new migrations.

## Compatible preparation

Append exactly these final reviewed source blobs under their unchanged names:

```bash
for HELIX_SPEC_MIGRATION in \
  20260914051153_catalog_restore_current_identity.sql \
  20260914051313_assign_current_order_numbers.sql \
  20260914062650_catalog_reviewed_guidance.sql \
  20260914062651_catalog_stable_media_boundary.sql
do
  git -C "$HELIX_SPEC_SOURCE" show \
    "$HELIX_SPEC_SOURCE_SHA:supabase/migrations/$HELIX_SPEC_MIGRATION" \
    > "$HELIX_SPEC_OPERATOR_DIR/supabase/migrations/$HELIX_SPEC_MIGRATION" || exit 1
done
pnpm dlx supabase@2.117.0 --workdir "$HELIX_SPEC_OPERATOR_DIR" db push \
  --linked --project-ref erasogmsqpgiirovubjh --skip-vault --dry-run
```

Require the pending list to contain only those four files, in that order, with the reviewed hashes. `--skip-vault` is required because this CLI otherwise updates Vault before migrations. Do not supply `--include-seed`, `--include-roles`, or use `--include-all` to hide an unexpected preparation discrepancy. In particular, the earlier-numbered Checkout and dispatcher contractions must be absent.

After the fresh target/definitions/grants checks and applicable authority are satisfied, apply the same command without `--dry-run`. Match its displayed file list before confirming. Each migration is a separate transaction: if a later file fails, record already committed versions and refresh before resuming the remaining approved files. Verify migration history and each contract's postflight; do not run `migration repair`, reset, ad hoc history writes, or repository-wide push. The media policy must still be disabled after preparation.

### Restore timestamp follow-up

The four compatible preparation migrations are already applied. Before media pointer cutover and deployed Restore verification, use a fresh private phase directory and freshly fetched history to append only the reviewed `20260914121842_catalog_restore_current_timestamps.sql` blob. Require that exact file and hash as the sole pending migration in the same `--skip-vault --dry-run` procedure, then apply without `--dry-run` after fresh target, Restore definition and grant checks. Do not replay the four preparations or change their recorded history. Postflight must confirm the exact new migration record, the timestamp-only Restore insertion and private helper, unchanged Restore ownership/grants and historical revisions, and matching-row timestamps in a normally restored draft before continuing its Save/Validate/Ready/Publish review.

## Deferred contractions

After actual compatible deployment evidence and required destructive/configuration authority exist, create another fresh private workdir, fetch the now-current history, and add only the exact reviewed deferred file. T8 dispatcher retirement and T6 Checkout retirement should each have their own phase. They sort before already-applied guidance/media files, so use `--include-all` to select the genuinely absent versions:

```bash
pnpm dlx supabase@2.117.0 --workdir "$HELIX_SPEC_CONTRACTION_DIR" db push \
  --linked --project-ref erasogmsqpgiirovubjh --skip-vault --include-all --dry-run
```

For T8, the sole pending file must be `20260914051219_retire_catalog_v3_dispatcher.sql`; its live definition/dependency guards still apply. Remove `--dry-run` only after the reviewed one-file list and authority match. T2's resolver/grant/route-hook operation remains session-local SQL outside automatic migrations.

T6 additionally needs the real deployment SHA in the migration's own connection. Do not execute the linked apply above for T6: it lacks that attestation.

## T6 startup attestation

The CLI executes `RESET ALL` before each migration. A `SET` from a previous command, a different connection, or an earlier migration will not carry the required `helix.checkout_verified_deployment_sha`. The reviewed CLI's `--db-url` parser preserves URL runtime parameters as PostgreSQL startup options; `RESET ALL` restores that startup default. Its parser does not map bare `PGOPTIONS`.

Use the existing privately loaded PAT with the official temporary CLI login-role endpoint for the verified project (`read_only:false`), keeping returned role/password in memory. Resolve the approved direct connection or primary session-mode pooler from verified project metadata; never guess a host, port, or tenant. For a pooler username, retain the `.erasogmsqpgiirovubjh` suffix. The CLI recognizes its `cli_login_*` user and sets session role `postgres` on its connections.

Construct a passwordless DSN with a URL parser: exact verified endpoint/database/tenant, appropriate TLS verification, and query parameter `helix.checkout_verified_deployment_sha=<observed full 40-character deployment SHA>`. Supply the temporary password only as child `PGPASSWORD`. Use `role@host`, without an explicitly empty password component or `password` query parameter, because an empty password suppresses the CLI fallback. Keep PAT/password out of argv and logs. Do not combine `--db-url` with `--linked` or `--project-ref`; independently verify the connection belongs to the approved project.

First run a harmless single-session assertion on that exact intended connection: execute `RESET ALL`, then verify the setting equals the real deployment SHA, with intended database/role/target and privileges. The mechanism passed against local synthetic PostgreSQL; that does not prove the remote pooler accepts it. Stop if connection/startup/session behavior differs. Never use `ALTER ROLE`, `ALTER DATABASE`, a source guard edit, fabricated SHA, or history repair as a workaround.

```bash
pnpm dlx supabase@2.117.0 --workdir "$HELIX_SPEC_CONTRACTION_DIR" db push \
  --db-url "$HELIX_SPEC_ATTESTED_DSN" --skip-vault --include-all --dry-run
```

Require only `20260914051315_retire_obsolete_checkout_failure.sql`. After actual deployment/body/grant/dependency evidence and reserved drop authority, remove `--dry-run`. Confirm the exact version recorded, obsolete overload absent, and current session-qualified function/ACLs unchanged.

MCP `apply_migration` and the Management API expose name/query but no explicit version parameter; they cannot preserve these selected checked-in timestamps. Do not substitute them for this versioned procedure.

References: [CLI push](https://supabase.com/docs/reference/cli/supabase-db-push), [history fetch](https://supabase.com/docs/reference/cli/supabase-migration-fetch), [tagged pending reconciliation](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-migration-pending.ts), [transaction/history insertion](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-migration-apply.ts), [runtime parameter parsing](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-db-config.parse.ts), [startup encoding](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-db-connection.sql-pg.layer.ts), [temporary login role](https://supabase.com/docs/reference/api/v1-create-login-role), [pooler metadata](https://supabase.com/docs/reference/api/v1-get-pooler-config), and [PostgreSQL RESET](https://www.postgresql.org/docs/17/sql-reset.html).
