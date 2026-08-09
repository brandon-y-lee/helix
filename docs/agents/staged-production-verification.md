# Staged Production verification

Mei Pelle has one repository-owned path for creating an inspection-ready
Production candidate: the `Staged Production Verification` GitHub Actions
workflow. It accepts the exact current `dev` commit, creates one Vercel
Production deployment with domain assignment disabled, and verifies that same
immutable deployment in the complete Chromium and WebKit plans.

## Deployment responsibilities

- Preview deployments are disposable collaboration environments. Create them
  deliberately when needed; they are not release evidence.
- `dev` is the source authority for staging. The staged Production workflow
  rejects any requested source that is not the current remote `dev` commit.
- A staged Production deployment uses Production configuration but receives no
  Production domains. The workflow explicitly supplies the reviewed
  `NEXT_PUBLIC_*` values as both build and runtime overrides so the non-secret
  configuration fingerprint describes the deployed artifact rather than the
  runner alone. Its generated Vercel URL is the inspection target.
- Production promotion is a later, user-authorized operation. This workflow
  never calls `vercel promote`, assigns an alias, merges `dev` to `main`, or
  rebuilds the verified deployment.

`vercel.json` disables Git-triggered deployments for this project so an
automatic push deployment cannot become a competing release artifact. The
repository workflow invokes the pinned Vercel CLI directly and uses Vercel's
documented `--prod --skip-domain` contract.

## Required configuration

The GitHub Actions environment requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID`, plus the existing public Catalog and Storefront build
configuration. Keep provider tokens in GitHub Secrets. The receipt records only
hashes, versions, immutable identifiers, and the generated inspection URL; it
does not record secret values, Customer information, raw Catalog facts, or raw
provider payloads.

## Run and inspect

1. Confirm CI and the scheduled WebKit state are clean for current `dev`.
2. Dispatch `Staged Production Verification` with the full 40-character
   current `dev` SHA.
3. Inspect the workflow summary. It links the immutable generated deployment
   URL and the signed Production Receipt and states that no Production domains
   were assigned.
4. Inspect the generated deployment without changing its aliases or domains.
   Successful browser evidence is retained for 30 days; failed evidence is
   retained for 90 days. The signed receipt remains in GitHub's attestation
   store.

The downloadable receipt artifact is retained for 30 days so the later release
plan can independently reconstruct and verify it. The signed attestation remains
the authority. The receipt is valid only when the deployment, source, Runtime Fingerprint,
non-secret configuration, build identity, browser versions and plan, and
Catalog Fingerprints remain unchanged and both browsers pass without retry.
Failure, partial execution, timeout, cancellation, retry-pass, or any changed
input leaves diagnostics but no signed reusable Production Receipt.

The staged build exposes a no-store verification manifest at
`/api/verification/artifact`. It contains only the build marker, source SHA,
and runtime and non-secret configuration fingerprints; ordinary builds return
404. Verification reads that manifest from the generated deployment URL and
also requires matching Vercel source metadata. Before signing, a separate job
checks out the same source and independently reconstructs the deployment,
artifact, Catalog, browser, plan, and tool identities. After signing, `gh`
cryptographically verifies the expected workflow identity and exact predicate,
rejecting a substituted or modified receipt. The command owns a shorter
timeout than the Actions job so timeout evidence can be written before the
outer job limit; failure and cancellation cleanup uploads available diagnostics.

## Release boundary

Inspection does not authorize promotion. Run the preauthorization plan and separate
explicit authorization workflow in
[`production-release.md`](./production-release.md). It regular-merges the exact
inspected `dev` state into `main`, proves its Runtime Fingerprint matches this
receipt, records the current known-good deployment, and promotes this exact
deployment without rebuilding. Until that separately authorized operation runs,
Production domains remain on the current known-good deployment.
