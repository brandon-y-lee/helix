# Proposed browser verification architecture

**Status: Proposed.** This document defines the approved target architecture; the current executable workflow remains in [`engineering-workflow.md`](./engineering-workflow.md) and [`../git-workflow.md`](../git-workflow.md) until implementation changes tooling and operational instructions together.

## Verification language

- **Affected Browser Verification** runs the Chromium journeys selected for one change by the versioned capability map. Browser-sensitive changes add the related WebKit journeys. Unknown or verification-system changes fail closed to the complete plan.
- **Routine Browser Verification** runs the complete Chromium plan against one receipted production build and one reconciled Catalog fingerprint before a behavior change enters `dev`.
- **Production Browser Verification** runs the complete Chromium and WebKit plans against one staged Production deployment before that exact deployment is promoted.
- **Browser Verification Plan** is the versioned set of browser projects, journeys, configuration, capability tags, and selection rules used by a verification run.
- **Verification Receipt** is the signed custom GitHub attestation that binds a clean result to its verification inputs.
- **Runtime Fingerprint** identifies every versioned file and non-secret setting that can change the Mei Pelle Platform build or runtime behavior. The classifier excludes only reviewed non-runtime paths.
- **Catalog Fingerprint** identifies the canonical, normalized Catalog facts reconciled for the run without storing raw Catalog data in the receipt.
- **Integration Line** is the ordered set of ready PRs waiting to change `dev`; its one **Integration Slot** covers candidate freeze, verification, comparison with current `dev`, and merge.

These are engineering terms, not Mei Pelle platform-domain language, and do not belong in a domain `CONTEXT.md`.

## Work classes and gates

| Work | PR target | PR preflight | Integration-slot verification |
| --- | --- | --- | --- |
| Spec ticket | Parent spec branch | Lint, types, unit tests, code review, and Affected Browser Verification | None; the completed spec owns the complete gate |
| Completed spec | `dev` | Fast checks while draft | Routine Browser Verification |
| Standalone ticket | `dev` | Lint, types, unit tests, code review, and Affected Browser Verification | Routine Browser Verification |
| Urgent ticket | `dev` | Normal ticket gates plus risk-proportional security, payment, data, or provider checks | Routine Browser Verification; next waiting position |
| Planning or documentation | `dev` | Documentation and repository-policy checks | No Storefront build or browser run |
| Trivial non-behavioral change | `dev` | Checks selected for the changed files | No complete browser run; uncertainty becomes a standalone ticket |
| Verification-system change | Applicable integration branch | Complete Chromium, WebKit, and Windows lifecycle verification | Cannot use affected-only evidence |

All PRs into `dev` use the Integration Line, including fast work, so `dev` cannot change during an active verification-and-merge operation. Documentation, planning, and trivial PRs leave the slot quickly.

A standalone ticket is one bounded behavior change or bug with clear acceptance criteria and no unresolved architectural or domain decisions. The user's explicit implementation request authorizes its creation and claim. An urgent ticket is narrower: delay causes active production or security harm, such as Storefront or Checkout unavailability, Customer-data exposure, a serious authorization defect, or a materially incorrect live Product Offer. The tool or agent performing the work never determines urgency.

## Spec integration

A multi-ticket spec receives `codex/spec-<spec-number>-<slug>` from current `dev`. Branch rules reject direct pushes to every spec branch. Each child keeps its own `codex/<ticket-number>-<slug>` branch, targets the spec branch, and enters only through its required review and fast checks. Agents never share a live work branch.

Independent tickets may start concurrently from the current spec branch. A structurally blocked ticket remains unclaimed until every blocker has entered the spec branch. When a blocker PR merges, automation applies `workflow:spec-integrated`, closes the blocker ticket, and native issue dependencies expose the next frontier. The newly eligible ticket starts from the updated spec branch, so it already contains its blockers.

Branch depth stays flat:

```text
dev
└── spec branch
    ├── ticket A branch → spec branch
    ├── ticket B branch → updated spec branch
    └── ticket C branch → updated spec branch
```

Do not stack ticket branches on other ticket branches. A long sequential blocker chain returns to ticket-breakdown review unless every intermediate ticket is a necessary testable checkpoint. Prefer one contract or foundation ticket that unlocks parallel vertical slices.

The spec branch does not absorb every `dev` push during implementation. It updates early only for a declared dependency or an urgent change that invalidates the spec's current assumptions. The integration agent otherwise merges current `dev` after receiving the Integration Slot, resolves conflicts, runs affected checks until stable, and starts the complete gate once.

After the first ticket enters the spec branch, automation opens one draft spec PR into `dev` and lists every required child and blocker. The PR remains draft while any required child lacks `workflow:spec-integrated`; after the last child closes and code review passes, the integration agent marks it ready and queues it.

If combined verification exposes a ticket-specific defect, automation or the integration agent reopens that ticket, removes `workflow:spec-integrated`, returns it to `workflow:review`, and assigns the fix to its ticket owner. Dependent work that has not yet started becomes blocked again. Cross-ticket failures remain owned by the integration agent until the responsible seam is identified.

A cancelled spec never enters `dev`. Record the reason and replacement links on its spec PR and issue, retain the ticket PR history, apply `wontfix` and close superseded work, then delete the spec branch. Independently valuable work returns as an explicitly approved standalone ticket implemented from current `dev`, not by merging the cancelled branch.

## Integration line

A ready final PR receives `workflow:integration-queued`. The coordinator selects approved urgent PRs first in ready order, then every other candidate in ready order. An urgent candidate never cancels the active run; only the user may explicitly reorder waiting work.

Because this user-owned repository cannot rely on GitHub's hosted merge queue, one repository-owned Integration Coordinator workflow is the operational lock authority. Its GitHub Actions concurrency group is `dev-integration`, with cancellation disabled. GitHub does not accept the global Actions App as an exclusive bypass actor for this personal repository, so branch policy cannot make that identity the only green-PR merge actor. An Operator may merge manually only as an explicitly approved exception. Action-run ordering is not queue ordering: each coordinator run reads the labels and ready timestamps again, atomically claims at most one eligible PR, and triggers another coordinator run after releasing the slot when work remains. Branch protection requires the independent CI, browser, and lifecycle checks.

The coordinator changes the selected PR to `workflow:integration-active` and then:

1. records the current `dev` commit and freezes the candidate;
2. combines the candidate with that exact `dev` state;
3. selects the work class's applicable gate from the table above;
4. for a browser-gated candidate, builds or validates one receipted production artifact and records the initial Catalog fingerprint;
5. runs the applicable gate;
6. for a browser-gated candidate, repeats the Catalog fingerprint and creates a receipt only after a clean pass with unchanged inputs;
7. for planning, documentation, or trivial work, skips the Storefront build, Catalog access, browser run, and receipt;
8. confirms both candidate and `dev` remain unchanged;
9. merges and performs issue, label, branch, and worktree completion; and
10. releases the slot.

The complete operation has a 20-minute timeout. Failure, timeout, a retry-pass, a changed Catalog fingerprint, or a new candidate commit prevents the merge, releases the slot, and returns the PR to review. The next ready candidate may proceed while fixes are prepared.

Spec ticket PRs squash into the spec branch, leaving one commit per ticket. The final spec PR uses a regular merge into `dev` to retain those commits and add a visible spec boundary. Standalone and urgent PRs continue to squash into `dev`.

## Affected verification

The supported runner compares a ticket branch with its PR base and maps changed files to capabilities such as Platform shell and navigation, Product Discovery, Product Search, PDP purchase, Cart, Catalog Preview, accessibility interaction, and media. Tests declare the capabilities they protect. The command prints every selected journey and its reason.

Run the implemented agent interface with the intended pull-request base:

```bash
pnpm verify:affected -- --base dev
```

Callers may add evidence with repeated `--add-capability <name>` or
`--add-journey <id>` options. The command has no exclusion option: an unknown
option fails before the production build starts. The versioned plan lives in
`scripts/browser-verification-plan.ts`; unmapped files and changes to the plan,
browser tests, shared runtime, dependencies, toolchain, Production Artifact
Verification, or integration automation select its complete Chromium and
WebKit plan.

An agent may add evidence but cannot subtract a selected journey. An unmapped path, shared runtime contract, dependency or toolchain change, test-plan change, selector-map change, production-verification change, or integration-automation change selects the complete applicable plan.

Browser tests remain for behavior that needs browser layout or APIs: routing, focus, keyboard, pointer, touch, responsive layout, scrolling, media, and complete Customer journeys. Exact copy, data conversion, route inventories, simple rendering, and isolated component rules use unit, component, or contract tests. New browser coverage extends an existing Customer journey when practical and requires an explicit testing-seam reason.

Local verification defaults to affected Chromium. Focus, touch, scroll, media, sticky layout, and responsive-overlay capabilities add affected WebKit. One receipted build is reusable within an unchanged worktree; relevant source, dependency, environment, or test-configuration changes invalidate it.

The supported command stores that local receipt beneath `.next` and validates
the current worktree, artifact build ID, runtime source, dependency and
lockfile inputs, non-secret build environment, framework and browser
configuration, Browser Verification Plan, and browser tests before reuse. A
missing, malformed, stale, substituted, partially written, or cross-worktree
receipt causes a new build. Output reports `new` or `reused` with the reason,
then emits one `[affected-verification-result]` JSON record containing build
and browser time, selected capabilities, browser-case count, projects, observed
retries, outcome, and reuse status. The owned lock, server identity check,
interruption handling, failure classification, and cleanup remain the
Production Artifact Verification lifecycle rather than a Playwright-owned
server path.

## Receipts and result reuse

The integration workflow writes a canonical JSON predicate, signs it with GitHub's custom artifact-attestation mechanism, and attaches it to the Runtime Fingerprint. The predicate records at least:

- tested runtime and candidate identity;
- production build identity and non-secret configuration fingerprint;
- Node, package-manager, framework, Playwright, and browser versions;
- Browser Verification Plan fingerprint;
- Catalog fingerprint before and after the run;
- result, completion time, workflow run, and PR; and
- the exact `dev` base for an integration candidate or staged deployment identity for Production.

The required check and Actions summary link to the attestation. Successful browser reports and structured timing data use 30-day artifacts; failed reports, screenshots, and traces use 90-day artifacts. Receipts never contain secrets, Customer information, raw provider payloads, or raw Catalog data.

A protected-branch push does not repeat a valid pre-merge browser result. Documentation-only changes may carry forward the same Runtime Fingerprint. A source tree, dependency, environment, Catalog, browser, plan, or artifact mismatch requires new evidence.

## Scheduled and remote verification

The complete WebKit plan runs daily against current `dev` and its current Catalog facts. Browser-sensitive ticket work still runs affected WebKit before integration. A scheduled WebKit failure creates or updates one tracked issue and blocks Production promotion; it does not remove code from `dev` automatically. A clean matching run clears the active failure state.

The executable lane, operational issue contract, Windows classification, and
default-branch rollout boundary are documented in
[`scheduled-verification.md`](./scheduled-verification.md). Daily and manual
WebKit executions delegate to `pnpm verify:scheduled -- --lane webkit`; they are
not required pull-request gates.

Catalog Publish does not start the complete browser plan. It retains pre- and post-Publish Catalog and cache reconciliation, canonical `/shop` and PDP smoke coverage, checks that expected Product Offers are Purchasable, Algolia projection checks, and bounded Real Product Media Verification. A later failure alerts the Operator and follows the existing fallback boundaries.

The Windows verification-lifecycle job runs when production-verification or process-control code, their tests, or relevant dependencies change, and also on schedule or manual request. Normal Storefront and documentation changes skip it.

## Production promotion

Release automation creates a Production-configured Vercel deployment without assigning Production domains. It runs complete Chromium and WebKit plans against that staged deployment, requires unchanged Catalog facts, creates a signed Production receipt, and exposes the deployment for staging inspection.

The executable staging path and operator evidence contract are documented in
[`staged-production-verification.md`](./staged-production-verification.md).
Creating and inspecting that deployment does not authorize domain assignment,
promotion, or a `dev` to `main` merge.

After explicit user authorization, the release merges `dev` into `main`, confirms the `main` Runtime Fingerprint matches the receipt, and promotes the tested deployment without rebuilding it. A post-promotion incident restores the previous known-good deployment first, then uses an urgent ticket to reconcile the served deployment, `main`, and `dev` without rewriting Git history.

The executable plan, exact authorization challenge, promotion audit, and
rollback-first procedure are documented in
[`production-release.md`](./production-release.md).

## Efficiency audit

The executable record sources, outcome taxonomy, 30-day clock, and evaluation
procedure are defined in [`efficiency-audit.md`](./efficiency-audit.md).

For the first 30 days, record median and worst-case time from implementation completion to trustworthy integration, PR preflight time, Integration Line wait time, per-test duration, retries, browser-case executions per integrated PR, selected capabilities, build reuse, and full-suite executions. The expected steady state is:

- no browser run for documentation-only work;
- no complete browser run for trivial work;
- one clean complete Chromium run for each successful spec, standalone ticket, or urgent ticket entering `dev`;
- no repeated browser run after that `dev` merge;
- one Chromium and one WebKit run for each staged Production deployment; and
- one local production build for each unchanged agent worktree.

Failed, changed, timed-out, and unstable candidates remain visible but are not classified as avoidable duplicate successes. Use timing and Catalog-reconciliation evidence before increasing workers inside one build. Do not introduce shards that repeat browser installation, builds, or Catalog setup without evidence that their total cost is lower.

## Required implementation alignment

The architecture becomes active only after implementation delivers and verifies every affected contract together:

- extend the task helper for spec integration branches, spec-based ticket starts, standalone tickets, and flat dependency handling;
- add `workflow:spec-integrated`, `workflow:integration-queued`, and `workflow:integration-active` to the delivery-label audit and issue operations;
- split PR preflight, serialized integration, scheduled verification, protected-push, and release workflows;
- add the capability map, supported affected-test command, reusable local receipt, result telemetry, and fail-closed verification-system classification;
- add the signed custom-attestation predicate, lookup, verification, retention, and candidate comparison;
- replace automatic per-push Vercel deployment with on-demand preview, `dev` staging, and staged Production promotion;
- update `AGENTS.md`, the engineering workflow, Git workflow, issue tracker, triage-label documentation, pull-request template, and operational runbooks in the same tickets that make their instructions executable; and
- mark ADR-0003 and ADR-0004 accepted and remove this proposal warning only after the complete workflow passes its own integration, failure, timeout, concurrency, dependency, urgent-priority, and release tests.
