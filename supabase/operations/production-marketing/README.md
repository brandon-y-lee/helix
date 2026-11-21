# Production marketing database release

`20261121090054_install_direct_production_marketing` installs consent, direct delivery and signed restrictions in one Supabase CLI ledger transaction. The development child retains its original consent records and existing confirmation and withdrawal links. The production parent starts with an empty marketing store. New enrollment, event intake and sending start paused, and both message budgets start at zero. [Production marketing readiness](../../../docs/operations/production-marketing-readiness.md)

## Enroll the fixed operation

1. Check out the reviewed release commit. Run `node scripts/db/render-production-marketing-release.mjs --check` to verify that the migration and sidecar match the four checked package sources.
2. Run `node scripts/db/render-production-marketing-release.mjs --owner development` or `--owner production` for the independently verified database. Review the generated transaction and submit it as the original authenticated database owner. The target retains its existing restricted forward writer.
3. The transaction takes the ordinary migration lock and checks the environment marker, each recorded Catalog and Checkout version, and the original owner, exact bodies and grants of both previously enrolled functions. It replaces them only on the unused cold parent or original paused child. A repeat before expansion verifies the already-enrolled direct operation. If the former native version `20261121081630` appears in history, or a partial or previously installed marketing package is present, stop and reconcile that target through a new forward release.
4. The protected forward job verifies the six genuine Catalog and Checkout versions before applying the seventh. Supabase records the seventh version in the same transaction as the database changes. A retry after a ledger-write failure starts from the original state. A successful release is checked again on subsequent pushes.

The owner transaction installs fixed code only. Activation requires the separately qualified sender, signed event intake, completed preference baseline, effective Topic default, credentials, quotas and operator controls in the readiness guide. Each later storefront release reuses these controls.

## Pause and recovery

Pause new enrollment and dispatch before rolling back the storefront. Preserve first-party withdrawal, signed event intake and private cleanup. Retain existing message IDs, frozen bytes, idempotency keys and receipt evidence. A missed or uncertain provider response follows the original bounded same-key retry and reconciliation rules. When signed intake coverage is uncertain, qualify the missing interval before resuming direct handoffs. The release ledger and stored consent remain in place during application rollback.

## Local rehearsal

Run `node scripts/db/test-production-marketing-forward.mjs` from a checkout with the reviewed predecessor commit available locally. Set `SUPABASE_CLI` to the local stack CLI 3.1.0 and `HELIX_SUPABASE_CLI` to the migration CLI 2.117.0. The test uses independent disposable managed PostgreSQL 17.12 targets, the original unused owner functions and a synthetic existing child consent. It verifies rejection of stale or already-run native state, atomic enrollment and migration failures, retry and an unchanged repeat. It takes no hosted credentials. Run `node scripts/db/test-direct-welcome.mjs` for the signed storefront and worker journey with synthetic recipients.
