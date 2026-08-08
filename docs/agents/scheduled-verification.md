# Scheduled verification operations

Scheduled browser and Windows lifecycle evidence are proportional lanes. They
do not become required pull-request checks for ordinary Storefront work and do
not change code or Catalog state when they fail.

## Complete WebKit lane

`.github/workflows/scheduled-browser-verification.yml` checks out current
`dev` and runs every day at `07:17 UTC`. `workflow_dispatch` uses the same
command and Browser Verification Plan:

```bash
pnpm verify:scheduled -- --lane webkit
```

The command builds through Production Artifact Verification, runs every
versioned journey in WebKit, and binds the result to the exact runtime commit,
non-secret runtime configuration, Node version, Browser Verification Plan
source fingerprint, pinned Playwright WebKit version, and a hash of normalized
current Catalog facts. The issue state contains only these identities and a
workflow-run link; it contains no raw Catalog data, Customer data, provider
payload, or secret.

One open issue titled `Scheduled WebKit verification failure` owns the active
failure state. A later failure updates that issue. A clean run closes it only
when runtime, plan, browser, and Catalog identity all match. Nonmatching clean
evidence leaves the issue open and Production promotion blocked for operator
reconciliation. The lane never reverts or removes code from `dev`.

Catalog-read failures state that WebKit did not run. A dependency-free,
always-run adapter records full-checkout, dependency-install, browser-install,
environment-validation, and command-start failures before complete WebKit
evidence can run. A sparse first checkout makes the dependency-free recorder
available before the full checkout. Failures before any repository code can be
acquired remain visible as failed workflow infrastructure but cannot safely
mutate issue state. Because setup evidence has no current Catalog snapshot,
later clean evidence does not silently close it; the Operator must reconcile
the nonmatching identity.

The workflow has `contents: read` and the narrow `issues: write` permission.
Its cancellation-disabled concurrency group prevents overlapping scheduled
runs from racing to create duplicate issues. Successful browser reports remain
30 days; failed reports, screenshots, and traces remain 90 days.

## Windows lifecycle lane

`.github/workflows/verification-lifecycle-windows.yml` runs on Monday at
`07:41 UTC`, on manual dispatch, and for pull requests that change:

- Production Artifact Verification or its process-control tests;
- verification orchestration, browser-plan, affected-verification, or workflow
  adapters and tests; or
- dependency and toolchain inputs that can change lifecycle behavior.

It runs `pnpm verification:lifecycle:windows` on `windows-latest` with a
read-only token. Normal Storefront application and documentation paths do not
select this workflow. The universal `ci` check no longer contains a Windows
job, so Windows evidence is not an ordinary required pull-request gate.

## Verification-system pull requests

`.github/workflows/verification-system-browser.yml` is a read-only,
path-filtered pull-request workflow. Changes to verification workflows,
orchestration, process control, browser plans, their tests, or toolchain inputs
run the supported affected-verification command with both Chromium and WebKit.
Ordinary Storefront changes do not select this workflow, and the daily WebKit
lane remains outside universal required pull-request CI.

## Catalog and Product Media boundary

Catalog Publish retains its pre- and post-Publish Catalog/cache reconciliation,
canonical Storefront smoke coverage, Purchasable Product Offer checks, Search
projection checks, and bounded Real Product Media Verification. It does not
start the complete browser plan. Daily and manual Real Product Media
Verification remains separately owned by
`.github/workflows/active-product-media-verification.yml`.

## Rollout boundary

GitHub evaluates `schedule` and `workflow_dispatch` definitions from the
repository default branch. Mei Pelle's default branch is Production `main`.
Merging this implementation into `dev` provides pull-request Windows evidence
and stages the scheduled definitions, but it does not activate or promote them
to Production. Activation requires the separately inspected and explicitly
authorized `dev` to `main` promotion defined by the engineering workflow.
