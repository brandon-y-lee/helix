# Stable Product Media identity

Spec #358 / Ticket #366 prepares current Product Media to use the owning Product UUID in its Storage path. Source integration does not perform this operation. Actual provider changes require a freshly verified target, a reviewed manifest, and recorded authority for that exact apply. Only the approved non-production project `erasogmsqpgiirovubjh` is supported.

The destination is `helix-catalog/products/<product-uuid>/<existing-suffix>`. The suffix, filename, image/video bytes, MIME type, dimensions, associations, and presentation roles stay the same. In particular, `primary/original/<sha256>.webp` remains on the original-delivery path to preserve approved colors. This procedure creates copies; it never moves, overwrites, regenerates, or deletes historical objects. Published Revisions and their source URLs remain immutable.

## Dated planning inventory

Read-only inspection of the approved non-production environment on September 14, 2026 found:

| Active Product | Current URL associations | Distinct assets |
| --- | ---: | ---: |
| Biotic Reset | 18 | 15 |
| Ceramide Cushion | 12 | 9 |
| Super Serum | 18 | 15 |
| Total | 48 | 39 |

Four Super Serum associations share its approved original-delivery primary WebP. Separately, one Archived Product owns 12 non-archived media rows; these dormant historical references are preserved and excluded from this operation. These counts describe an observation, not operation constants or future apply authority. Re-inventory all non-archived Products and active Catalog Drafts immediately before apply.

## Preparation and authority

Use Node 24, the frozen repository dependencies, and `ffprobe` on `PATH`. Use the established private environment containing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not paste credentials into commands or evidence. The operations client refuses any other Supabase project. The manifest contains complete current Catalog documents and an administrator identifier: save it in a private local location and keep it out of source control, shared terminal logs, and public issue bodies. Public evidence should contain only bounded identifiers, counts, hashes, revisions, and outcomes.

Operational RPCs require `READ COMMITTED`, the normal PostgREST transaction isolation. Do not wrap them in a different isolation level or run a custom SQL transaction that changes this precondition.

Before each write, inspect and record the approved project, the installed media migration/RPC definitions and grants, current deployment, non-archived Catalog documents, latest revisions, active drafts, and Catalog Administrator membership. Include both Active Products and Draft Products: a Draft Product is a canonical Catalog record and is distinct from an active Working or Ready Catalog Draft. Archived Products and historical media associations remain untouched. Resolve every active Working or Ready Catalog Draft through the normal workflow. Do not discard drafts merely to bypass this operation. Confirm the expected media-only diff and preserve the original manifest unchanged after review.

The media boundary migration is compatible preparation: its policy begins disabled. Apply it independently from later compatibility contraction migrations. Do not activate the media policy with an application that still stages slug-based URLs or cannot present Restore's current media readiness issues.

## Plan and review

`plan` only reads the current non-archived Catalog, administrator membership, and media response headers. It resolves exactly one active Catalog Administrator unless an explicit active administrator UUID is supplied. It creates a new operation UUID unless `--operation-id` is supplied. It refuses unsafe Catalog/media input, including active drafts on affected Products. Its standard output is the manifest itself; redirect it to an absolute private file.

```bash
umask 077
pnpm exec tsx scripts/catalog/media-identity.ts plan > /private/tmp/helix-media-manifest.json
shasum -a 256 /private/tmp/helix-media-manifest.json
```

When more than one administrator exists, add `--actor-id <administrator-uuid>` to `plan`. Review every Product, revision, association ID, old/new URL, SHA-256, byte count, MIME type, and dimensions. Confirm that the only intended URL change is the owning folder; retain shared-image associations and null-URL swatches. Planning records the immutable filename digest and declared metadata; it does not certify the bytes. The later copy/verify commands inspect the actual byte format/MIME and dimensions independently of response headers, verify complete hashes, reject redirects, and bound individual downloads to 16 MiB. A manifest is limited to 500 distinct objects and 512 MiB of unique asset content. Each full-byte proof request uses a fresh `cacheNonce` query value to bypass stale Smart CDN entries; the reviewed URLs, Catalog pointers, and replacement mappings remain bare canonical URLs. Exceeding any bound requires a separately reviewed verifier change; do not weaken a bound during an apply.

The confirmation digest below is the SHA-256 of the **exact saved file bytes**, including whitespace and its final newline. A later edit invalidates that confirmation. The command also reports a semantic `manifestSha256`, computed from sorted-key JSON; this is a distinct audit value and is not accepted as the file confirmation unless the bytes happen to match. Keep the same operation UUID and exact reviewed manifest for retries. A new Catalog state requires a fresh reviewed plan.

## Copy, verify, and cut over

Replace `OPERATION_UUID` and `MANIFEST_FILE_SHA256` in each command with the literal reviewed values. Every command after `plan` requires the absolute manifest path and all three explicit confirmations. There is no default apply mode.

```bash
pnpm exec tsx scripts/catalog/media-identity.ts copy \
  --manifest /private/tmp/helix-media-manifest.json \
  --expect-project erasogmsqpgiirovubjh \
  --expect-operation OPERATION_UUID \
  --expect-manifest-sha256 MANIFEST_FILE_SHA256
```

`copy` verifies current Catalog state and source bytes, then calls Storage's same-bucket copy operation for missing destinations. It verifies existing destinations instead of replacing them. A mismatch stops the operation. Partial copies are safe to retain and retry before cutover after resolving the failure; the command does not alter Catalog pointers or activate publication rules. After the operation is recorded, use `verify --state after`: `copy` refuses to recreate objects because that would invalidate the object identities in the recorded replacement mappings. The [Supabase Storage copy contract](https://supabase.com/docs/guides/storage/management/copy-move-objects) is the provider boundary; no move, upload/upsert, or delete operation is used.

```bash
pnpm exec tsx scripts/catalog/media-identity.ts verify \
  --state before \
  --manifest /private/tmp/helix-media-manifest.json \
  --expect-project erasogmsqpgiirovubjh \
  --expect-operation OPERATION_UUID \
  --expect-manifest-sha256 MANIFEST_FILE_SHA256
```

This read-only verification requires both source and destination objects; it never creates a missing copy. `before` is the default state and expects the original reviewed Catalog state. Do not use it as evidence that the pointer change has already occurred.

```bash
pnpm exec tsx scripts/catalog/media-identity.ts cutover \
  --manifest /private/tmp/helix-media-manifest.json \
  --expect-project erasogmsqpgiirovubjh \
  --expect-operation OPERATION_UUID \
  --expect-manifest-sha256 MANIFEST_FILE_SHA256
```

`cutover` repeats full-byte destination verification and current document/revision/draft/administrator checks before the transactional RPC. Each asset also requires a complete successful response from the bare canonical destination URL, whose bytes must match the fresh origin proof. A stale CDN response or cached 404 stops publication: wait for delivery to settle and retry verification; never store the nonce URL as a workaround. It reads each source and target Storage object's ID and version before and after byte verification, rejects any change, and binds those exact versions to the RPC. The database checks them under its Storage metadata write fence, verifies the locked Product state, changes only approved associations, records verified replacement mappings, and appends the operation's Published Revisions and audit evidence. These fresh object-version bindings are added to the RPC request, not written into the reviewed file. An unchanged retry returns the recorded operation without another publication; changed state fails closed.

Every after-state check compares the complete current V4 document with the reviewed document plus the exact manifest URL replacements. Only valid `updated_at` values on those manifest-listed media rows may differ, because the cutover updates those rows. Product, PDP, Variant, Source, relationship and Family facts remain exact, including their timestamps. Untouched media, including current UUID addresses and null-URL swatches, also retain their timestamps. Verification, recorded-cutover replay and activation repeat this comparison after full-byte verification; the revision counter alone is insufficient evidence of unchanged Catalog state.

A failed network response may leave the RPC outcome uncertain. Inspect the operation record using `verify --state after` with the same confirmations. Do not invent a replacement UUID, overwrite the manifest, or assume failure means rollback. Resolve any changed state before retrying. Earlier copied objects remain available for both current and historical references.

A failed after-state check following a successful cutover RPC means current-state proof failed after publication may have committed. It does not reverse the publication or prove rollback. Preserve the operation identity and inspect its recorded outcome before deciding the next action.

## Deploy current writers, then activate

After the pointer change, freshly verify that no Working or Ready Catalog Draft remains before deploying the UUID upload validator. Old pending-upload metadata may still contain a slug-based address and would fail the new draft hydration contract. Resolve each draft through an explicitly chosen normal Publish or Discard action; this command never discards it automatically. The earlier no-draft preflight is dated evidence, so repeat it immediately before deployment.

Deploy and inspect the application version that stages Product Media under the owning UUID and presents current Restore readiness issues. Record the exact deployed full 40-character commit SHA, environment, deployment URL/ID, and inspected behavior. Verify a new upload uses the Product UUID; verify Restore creates a Working Catalog Draft, retains current identity, remaps only a verified identical media replacement, and reports unresolved historical references for review. Verify server-side Publish rejects unresolved or foreign media references. Use authorized controlled data and record any draft created by the inspection; activation requires no active Working or Ready Catalog Draft anywhere in the Catalog, including Products outside the reviewed manifest.

The following flag is the operator's explicit attestation of that external deployment evidence. The CLI does **not** inspect Vercel or infer that a supplied commit is deployed.

```bash
pnpm exec tsx scripts/catalog/media-identity.ts activate \
  --manifest /private/tmp/helix-media-manifest.json \
  --expect-project erasogmsqpgiirovubjh \
  --expect-operation OPERATION_UUID \
  --expect-manifest-sha256 MANIFEST_FILE_SHA256 \
  --deployment-sha VERIFIED_DEPLOYED_FULL_COMMIT_SHA \
  --current-writers-verified
```

Activation requires the completed cutover, repeats current Catalog/administrator/media checks, and enables the database publication guard only when every non-archived Product's current reference meets the stable-address policy. It is a distinct write; copying or cutting over cannot activate it implicitly. Preserve the deployment attestation alongside the returned activation result in the private operation record.

## Reconciliation and completion

After activation, reconcile affected Catalog cache entries and Product Search through their current separately authorized tools. No command here changes Algolia or claims its synchronization is complete. Inspect current PDP, collection/card, Cart, System, admin preview, and media delivery consumers. Confirm the original-delivery image retains its approved color treatment. Confirm active media pointers use current UUID paths, historical sources remain accessible, and operation revisions/audits were appended once.

```bash
pnpm exec tsx scripts/catalog/media-identity.ts verify \
  --state after \
  --manifest /private/tmp/helix-media-manifest.json \
  --expect-project erasogmsqpgiirovubjh \
  --expect-operation OPERATION_UUID \
  --expect-manifest-sha256 MANIFEST_FILE_SHA256
```

Keep the parent Spec's environment checklist pending until actual copy, cutover, deployment, activation, cache/Search reconciliation, and consumer inspection evidence are all recorded. A green source test, merged PR, successful byte verification, or returned cutover result alone does not complete this environment operation.

## Recovery

Stop on mismatched file digest, inactive administrator, changed Catalog state, active drafts, different object versions, missing media, or failed verification. Refresh and review the relevant evidence rather than bypassing a guard. Copies are additive and historical objects remain in place. A completed cutover has new immutable revisions; do not edit those revisions or reverse pointers with ad hoc SQL. Use the normal reviewed Catalog workflow for a required correction, observing the current media policy. After activation, any rollback must retain compatible UUID writers and Publish/Restore behavior; deploying an older application alone is not a supported rollback.
