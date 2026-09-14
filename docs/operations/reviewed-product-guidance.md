# Reviewed Product guidance preparation

Spec #358 / Ticket #364 removes paragraph parsing and sample Customer Reviews from current rendering. This procedure prepares the two affected Catalog facts before the application depends on reviewed structured guidance. Source merge and local SQL tests do not apply these content changes or withdraw reviews from an existing deployment.

## Exact approved changes

| Product | Required current state | Published change |
| --- | --- | --- |
| Mineral Guard | Active `mineral-guard`, PROTECT / beyond_core, waitlist, no PDP content row, and the exact withholding paragraph below | Create its PDP content row with explicitly authored `how_to_use_steps = []`. Other optional PDP fields remain null and the existing paragraph stays unchanged. |
| Biotic Reset | Active `biotic-reset`, CLEANSE / core, existing structured instructions, and the exact predecessor paragraph below | Replace only `Peptide Bounce` with `Super Serum` in `editorial_how_to_use`. The structured instructions and all other facts remain unchanged. |

Mineral Guard's existing policy is: “Usage directions will be published only after the exact U.S. OTC formula and Drug Facts label are verified.” The empty list records the reviewed decision to show no instructions section. It does not infer or invent OTC directions, imply formula or label approval, or change waitlist status.

Biotic Reset's exact predecessor paragraph is:

> Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Peptide Bounce, then Ceramide Cushion when available.

Its approved paragraph is:

> Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Super Serum, then Ceramide Cushion when available.

Read-only evidence dated 2026-09-14 found 10 active Products: nine already had structured instructions, Mineral Guard alone had no PDP content row, and there were no open Catalog Drafts. Mineral Guard's latest Published Revision was 2; Biotic Reset's was 1. These are dated observations. Every application requires fresh documents, revisions and target verification. No bulk paragraph-to-steps conversion or edits to the other nine structured instruction lists are authorized by this procedure.

## Fresh manifest and review

1. Verify the actual provider connection is the approved non-production project `erasogmsqpgiirovubjh`. Check the installed schema, current application deployment, relevant publication/Restore definitions and outstanding operational work. The additive migration `20260914062650_catalog_reviewed_guidance.sql` must be installed before this operation, which uses its current guidance validator. Do not infer the project from the database name: different Supabase projects commonly use `postgres`.
2. Run `supabase/operations/reviewed_product_guidance_preflight.sql` read-only and save its complete result privately. `requiredProjectRef` states the required target; it does not authenticate the connection. Record the separately verified target, deployment and verification time alongside the manifest.
3. Resolve exactly one candidate per target using its current slug or Product Display Name. Review the complete V4 `expectedDocument`, `expectedRevision`, classification, wording, active drafts, media-reference hash and existing revision/audit hashes. Resolve an active Catalog Administrator from the approved project. A missing or ambiguous administrator/candidate requires investigation, not an arbitrary first match.
4. Review the complete active Product and open Draft guidance inventory. Unexpected missing guidance, new drafts, changed wording, or an already-present Mineral Guard row with null instructions requires separate editorial review. This operation will not fix those states by guesswork. An already-reviewed empty Mineral Guard list or already-current Biotic Reset paragraph is eligible for a verified no-op.
5. Prepare the exact after-document difference above and postflight assertions. Preserve every Product/Variant ID, issued SKU, offer, Product Source, media reference, family membership, relationship and immutable historical record. Mineral Guard's new PDP row gains its ordinary timestamps; Biotic Reset's Product timestamp advances. No other content change is part of the operation.

## Authorized apply

An approved source Ticket provides the operation artifacts. Actual provider application remains a separately recorded action with fresh target and exact manifest authority.

Open a privileged SQL session to the verified target and start one bounded explicit transaction. Set local `lock_timeout = '5s'`, `statement_timeout = '30s'`, and `idle_in_transaction_session_timeout = '60s'`. Load `supabase/operations/prepare_reviewed_product_guidance.sql`, then call:

```sql
select pg_temp.prepare_reviewed_product_guidance(
  reviewed_expected_document,
  reviewed_expected_revision,
  verified_administrator_id,
  'erasogmsqpgiirovubjh'
);
```

The first three arguments are values from the privately reviewed manifest, not literal SQL identifiers or reusable live Product UUID constants. Bind or safely quote the JSON and UUID values; do not interpolate untrusted text into SQL. The final argument attests the external connection verification and must match the required project. It does not replace that verification.

The operation is a session-local `SECURITY INVOKER` function with an empty search path and no application-role execution grants. It neither creates a persistent compatibility RPC nor changes grants on application tables. It takes the established family/Product locks, then briefly fences current Catalog, draft, history and administrator writers. `NOWAIT` refuses an already-running independent write; public reads continue. Do not wait for human review while the transaction is open. Run the already-reviewed postflight checks and commit promptly, or roll back on any mismatch.

The full current document, latest revision, active administrator, exact Product identity/editorial state and absence of open drafts must still match under these locks. Biotic Reset's retained instructions must pass the same guidance validator as normal publication; null or blank steps reject. A successful change appends one Published Revision and one `draft.published` Catalog Audit Entry with `source = spec-358-reviewed-product-guidance`, `method = controlled-content-operation`, the prior document hash and exact changed field. It has no `draft_id` or `source_draft_id`: this is a bounded governed content operation, not a fabricated Ready Catalog Draft.

Every attempt requires a fresh exact manifest, including retries. The current desired state returns `no-op` without appending history. Reusing an earlier revision or changed document rejects rather than overwriting newer facts. Never discard a draft, bypass a guard, or replace a whole historical document to force completion.

## Postflight and deployment evidence

- Rerun the read-only preflight. Compare complete before/after documents and every prior revision/audit ID and hash. Only the declared content field, allowed timestamps and one appended revision/audit may differ for each successful change; a no-op changes nothing.
- Verify all 10 observed active Products, or the freshly verified active set if it has changed, now have reviewed structured guidance. Confirm the two exact paragraphs, preserved existing step lists, unchanged media and relationships, and no newly fabricated instruction text.
- Record actual operation outcomes and revision numbers on the parent Spec's environment checklist. Keep pending status for any action not performed; local synthetic proof is not a provider publication receipt.
- Prepare the current guidance validation migration and editor behavior before deploying the application that removes paragraph parsing. Verify Restore still creates a reviewable Working Catalog Draft, keeps current identity, and blocks publishing missing/null guidance. Explicit `[]` remains a reviewed no-section decision.
- Reconcile affected Catalog caches and Product Search, then inspect current Product pages and admin preview. Verify honest empty Customer Reviews after deployment. Private Feedback and its rewards/eligibility contracts are unchanged.

## Isolated SQL validation

The guidance runner loads the captured current-schema checkpoint, the current Restore/guidance migrations, session-local preparation operation and synthetic Catalog fixtures into a disposable PostgreSQL 17 database. `supabase/tests/catalog_guidance_preparation.integration.sql` executes both real operations and asserts exact diffs, preserved history/child facts, active-draft/actor/project/ambiguity/stale-state rejection and repeat no-op behavior. The tests use synthetic IDs and roll back all rows. They have no provider connection or outbound delivery.

The checkpoint represents an existing supported schema. This procedure does not claim empty-database replay of the complete historical migration chain.
