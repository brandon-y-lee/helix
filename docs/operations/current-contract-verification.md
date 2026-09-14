# Current contract verification

Spec #358 removes active compatibility while retaining immutable facts and the private controls that protect them. Ticket #368 verifies the composed source and supplies current evidence tooling. A source merge, a phase label, or a green test is not a provider-operation receipt.

## Bounded contract inventory

The inventory follows readers, writers, stored state and external consumers. A search for former names or `legacy` is an audit lead, not completion evidence.

| Contract | Current behavior and verification seam | Deliberately retained evidence |
| --- | --- | --- |
| Product identity | Homepage uses only Super Serum; page/metadata/Search consume current governed identity; missing current data is not substituted. `homepage-system-presets`, `product-slug-route-resolution`, and the strict discovery browser journey verify this. | Guarded predecessor operations and explicit unavailable-identity tests; issued Product/Variant IDs and SKUs. |
| URLs and private history | Retired Product/navigation URLs return direct HTTP 404 without Location. Current readers never resolve an alias. Actual SQL denies public ledger/RPC access, preserves reservation/replacement guards and supports future canonical publication. | Applied migrations, append-only private slug ledger and historical rename/replacement facts. `/products` and `/collections` remain useful Shop entry redirects; authentication redirects remain current. |
| Search | Complete current records, IDs, settings, rules, synonyms and restricted keys are independently verified by `product:search:verify`. No alias relation or injected former-name matching remains. | Exact former-index/name detection used to reject stale configuration; useful peptide, bounce, PDRN and other ingredient/component terms. |
| System | ProductCard and IngredientIndex projections retain selected active family-entry Products, Core-then-Beyond ingredient ordering, media presentation parity and current hashes. Existing System/browser tests plus `catalog-card-freshness` cover selection and overlapping invalidation. | Ordinary editorial `method`, HTTP request methods, truthful visual/error fallbacks. No retired method/step anchors. |
| Guidance and Restore | All supported revision formats retain five current identity/discovery fields. Reviewed structured guidance is required; explicit `[]` means no How to Use section. Independent media/guidance errors survive until corrected. | V1–V4 decoders, immutable Published Revisions/Audit Entries, independent editorial paragraphs and Application steps. |
| Reviews and Private Feedback | Public/admin defaults have no sample reviews, ratings or fabricated meters. Renderer examples are explicit test fixtures. Existing private-feedback/rewards authorization and ledger tests remain. | Test-only nonempty review examples; private submissions never become public samples. |
| Checkout | New Sandbox Orders use HX; historical MP replay and accepted Order Lines remain unchanged. Actual Checkout SQL retains session-qualified failure protection and concurrency. Retired cancellation URL requires the fresh complete session inventory. | Historical Order Numbers and immutable payment/Order facts; current cancellation cleanup. |
| Runtime | Four server/operations constructors use Node 24 native WebSocket; direct transport dependencies are removed. Constructor tests preserve bounded fetch/auth/project checks. | Provider-owned transitive dependencies. Only the verified unused dispatcher is retired; actual historical decoders remain executable. |
| Media | Current writers use actual Product UUID paths; verified same-content mapping is the only automatic historical remap. Active/Ready/reentry guards prevent retired references returning. Actual SQL and byte/delivery tools are separate proofs. | Required historical Storage objects, archived associations and reviewable unresolved historical draft references. |
| Verification artifacts | Complete current Catalog evidence replaces the completed one-time staging checkpoint. Ordinary positive test URLs use current or neutral identities. | Schema-only current checkpoints and assertions about applied historical migrations remain historical evidence, not live baselines. |

Two unused local homepage files were retired after source/history audit and a September 14, 2026 count-only provider query found zero references to either current or former local pathname in all media rows, drafts, revisions, Orders and Order Items. The TREAT file was a disconnected prototype; the SEAL file was an unused local duplicate whose bytes still serve current Ceramide Cushion through independent governed Storage URLs. Those current Storage assets, historical copies and the still-used CLEANSE homepage asset remain intact. The two current-dev local Admin verification fixture callers of the TREAT pathname require replacement when the sole Spec Closer incorporates dev; this is an explicit integration handoff, not a claim those newer files were part of the Ticket Snapshot.

Historical research observations are retained with an explicit superseding-policy note. The deferred main-only CI protection bridge remains outside this Spec.

## Executable source proof

Use the labeled local PostgreSQL 17 container documented in [current Product identity](./current-product-identity.md). It contains no provider or customer rows.

```bash
node scripts/db/test-catalog-current-contract.mjs --container=helix-spec358-pg
node scripts/db/test-checkout-contract.mjs helix-spec358-pg
pnpm exec tsx scripts/db/test-catalog-evidence.ts --container=helix-spec358-pg
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm exec vitest run --maxWorkers=1
```

The composed Catalog runner loads the actual current checkpoint, exact retained contracts and guarded contractions, plus explicitly synthetic Storage metadata. It exercises V1–V4 Restore, separate guidance/media correction, Ready/Publish refusal and successful correction, five-field retention, later canonical rename, private reservation/replacement integrity and untouched historical facts. Its exact Orders/Carts/Order Items schema slice comes from the existing Checkout checkpoint and contains synthetic accepted-order sentinels only. It reports artifact hashes and removes only its unique temporary database. T6's separate runner supplies the full Checkout reservation/replay/failure/concurrency proof.

This is actual PostgreSQL execution, distinct from supplemental source-shape assertions. Whole-history empty-database provisioning remains a pre-existing limitation: historical migrations depend on earlier operational imports/publications absent from that chain. Never rewrite applied migrations or add a runtime fallback to make that unrelated chain pass.

`catalog-canonical-cache-lifecycle` runs actual cached readers, page/metadata logic and the webhook handler against stateful external boundaries. It proves eviction of warmed old data and a previously cached new-slug miss, including Search outage behavior. It does not emulate Next's full route cache or replace actual SQL publication.

The sole Spec Closer runs the retained production build and full Chromium integration gate after incorporating current dev. Before reconciliation or browser workers, global setup chooses a real published non-entry Family Product absent from the retained build's prerender manifest and requests it from that exact local server. It requires HTTP 200, no redirect, HTML content, current heading/canonical/structured data, then writes `storefront-cold-canonical.json` with build/manifest/response hashes. Missing prerequisites fail clearly. This proves an unbuilt current canonical path works on that artifact; it does not claim a new remote publication occurred or a previously used artifact has an empty runtime cache. No synthetic runtime Catalog is added.

Existing browser suites directly cover all ten known retired Product slugs and additional navigation/cancellation paths, current System hashes, keyboard/touch controls, responsive boundaries, reduced motion, current media and honest review defaults. Refresh actual historical ledger inventory before operational postflight so additional retired URLs are tested too. Mocked browser Search journeys are interaction evidence; actual index reconciliation belongs to the separate provider verifier.

## Complete Catalog evidence

The anonymous browser Storefront snapshot remains useful for rendering/cache reconciliation but is not a full Catalog fingerprint. The current evidence command captures all current-format Product documents, active/draft/archived membership, complete source/PDP/offer/media/relationship/family sections, System metadata, private reservations, archived governed rows, draft/current-revision state, immutable history fingerprints and media-policy/evidence presence. Capture and comparison include exact source/extractor/project provenance.

```bash
pnpm exec tsx scripts/catalog/capture-catalog-evidence.ts capture \
  --phase=before --output=/absolute/private/catalog-before.json
pnpm exec tsx scripts/catalog/capture-catalog-evidence.ts compare \
  --before=/absolute/private/catalog-before.json \
  --after=/absolute/private/catalog-after.json \
  --plan=/absolute/private/reviewed-changes.json
```

Use the established private `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL` environment. Capture verifies the approved project, executes a consistent read-only SQL snapshot and writes raw private Catalog evidence exclusively outside the repository with restrictive permissions. Standard output reports bounded counts/hashes/paths. Compare is offline and accepts no implicit allowlist: the reviewed plan binds the exact before-capture digest and exact before/after values for every permitted difference. Existing immutable history and archived facts cannot be changed even if listed in the plan. Missing/extra Products, incomplete sections, unrelated current changes, or unexplained history append fail verification.

The plan has this shape; use actual capture values, not these explanatory placeholders:

```json
{
  "version": 1,
  "beforeCaptureSha256": "<exact before capture digest>",
  "changes": [
    {
      "path": "/documents/<actual Product UUID>/product/search_keywords/0",
      "before": { "exists": true, "value": "<actual previous value>" },
      "after": { "exists": true, "value": "<actual reviewed value>" }
    }
  ]
}
```

Paths are exact JSON Pointers into `state`; an absent member is `{ "exists": false }`, which differs from a present `null`. An unchanged comparison uses `changes: []`. Review every observed leaf difference against the approved operation and its receipts, including actual appended revision/audit IDs and complete-row hashes. Do not fabricate future UUIDs, timestamps or hashes, or generate an unreviewed blanket plan from the after capture. This comparison verifies observed differences; it does not authorize the operations that produced them.

Use phases `before`, `prepared`, and `postflight` to identify when a snapshot was observed. A label cannot certify an operation. Capture final fingerprints after the actual reviewed operations and verify exact allowed differences; never rename a Product beside stale hashes or manufacture a future baseline. JSON media hashes establish references, not matching image bytes: retain T7's full byte/MIME/dimension and fresh-origin plus bare-canonical HTTP evidence separately.

## Ordered environment checklist

Keep each entry independently pending until its actual receipt and postflight are recorded. Source approval does not reopen the approved Spec/Ticket decisions; explicit reserved destructive/configuration authority still applies where the engineering workflow requires it.

1. Freeze reviewed source and operation-file hashes. Verify approved Supabase project, intended Search application/index, actual deployment mapping, external automation, complete migration history, current definitions/grants and full Catalog before-state. Use [selective migration delivery](./selective-legacy-migrations.md), including the existing timestamp drift, private fetched history, exact pending lists and `--skip-vault`.
2. Prepare only the four named compatible contracts: identity Restore, HX new numbers, reviewed guidance, and disabled media boundary. Verify each exact version/postflight. New Restore consumers require `retainedFields`; never deploy them before preparation. Do not batch later contractions.
3. Verify/no-op already-current Super Serum or apply only the guarded predecessor diff. Prepare reviewed Mineral Guard guidance and the exact Biotic Reset paragraph change where needed. Publish only reviewed obsolete Search-keyword removals while preserving meaningful terms and unrelated content. Finish all content publications before the final media manifest because those documents/revisions are bound by it.
4. Resolve drafts through normal workflow and establish a bounded Catalog publication pause. Review the final media manifest. Copy additively, verify complete source/destination bytes and canonical HTTP delivery, then cut over exact pointers with the same file digest/operation UUID and fresh Storage object bindings. Preserve historical objects and independent current imagery.
5. Immediately before deployment, recheck incompatible active drafts and the complete Sandbox cancellation inventory; prevent old writers from creating new retired cancellation URLs. Drain retired route-only deliveries while preserving six current Catalog hooks and customer/payment activity. Coordinate compatible staging deployment with the final dev merge.
6. Observe the actual deployment ID/full source SHA and Node 24 runtime; source engines/CI alone do not prove remote runtime. Verify canonical pages/metadata, true retired 404 responses, current Search projection, UUID upload and Restore readiness. Use only the explicitly scoped controlled Catalog inspection plan; resolve any inspection draft before activation, and do not invalidate the reviewed media manifest by publishing unrelated content.
7. Immediately before activation, freshly verify zero Working or Ready Catalog Drafts across the entire Catalog, including Products outside the media manifest. Verify compliant owning-UUID media references for Active Products and canonical Draft Products; preserve the explicit exemption for Archived Products and their dormant historical media. Under applicable reserved authority, activate the media policy with verified current writers. Apply only exact reviewed Search configuration differences, rebuild current records, run complete `product:search:verify`, query meaningful terms with the public key, and reconcile old/current cache paths. Record actual bytes/consumer observations separately from SQL metadata.
8. Refresh and contract public URL dependencies last using [current URL/Search operations](./current-product-urls-search.md): exact resolver and route hook, public ledger read access, preserved private history and integrity controls. Apply independently reviewed Checkout/unused-dispatcher contractions with exact guards; T6 requires the startup-attested connection described in selective migration delivery.
9. Verify actual public/authenticated denial, service-only history, current functions/grants, retired hook absence, current consumers and refresh behavior. Resume ordinary Catalog publication, capture complete final fingerprints, compare declared changes and preserve receipts. Record any skipped observation explicitly. Production promotion to main and unrelated protection changes remain excluded.

Source Ticket Review and `ticket-gate` precede Ticket merge. The sole Spec Closer then incorporates current dev additively, resolves the explicit fixture/media handoff, performs Combined Standards/Spec review and requires `integration-gate`. Parent completion additionally requires every authorized provider outcome; unapplied operations and unobserved deployment facts must never be reported as finished.
