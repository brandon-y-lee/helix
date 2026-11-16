# Independent STANDARDS review — local legal implementation

Verdict: APPROVED for the requested local implementation at `6dff8e0`, incorporating `bc94ab8`, against base `cac2e99`. No open actionable implementation findings. This is not public adoption, legal adequacy, an integration-gate attestation, or publication readiness approval.

## Scope and design

Reviewed AGENTS.md, CONTEXT-MAP.md, Trust & Policy and Brand & Platform ownership docs, domain/workflow guidance, the final code diff, source README, parity report, operational-facts report, substitutions, browser results, and retained source material. Only Privacy, Terms, Accessibility and their content/layout/test/evidence seams change; FAQ, the app shell, provider configuration and remote data remain untouched.

The routes and shared PolicyDocumentLayout stay server-rendered without new client code, requests or dynamic route declarations. The generated content is ordinary JSX with an explicit source-tag/attribute whitelist and mapped links; raw response scripts are retained as evidence only, never rendered by the policies. CSS is component-scoped, uses the existing font variables, preserves native links and visible focus, adapts naturally to narrow widths and preserves the separate Accessibility reading layout.

## Finding and resolution

P2 — `tests/customer-rewards-migration.test.ts:23–24`: the .ts→.tsx content move left static readFileSync paths pointing at deleted files. Independently reproduced: one test failed with ENOENT for content/legal/privacy.ts. Exact correction: use content/legal/privacy.tsx and content/legal/terms.tsx without weakening the existing assertions. Fixed in additive commit `6dff8e0`; bounded delta inspection confirms these are the only changes, and the focused file now passes 1/1.

## Independent verification

- Three reported focused suites independently rerun: 3 files, 18 tests passed (`legal-policy-parity`, `footer-support`, `mobile-services`).
- Corrected customer-rewards-migration file independently rerun: 1 file, 1 test passed. Combined independent coverage: 4 files / 19 tests.
- All 22 files listed in source/manifest.json match both retained byte counts and SHA-256 checksums.
- Saved raw article → saved hydrated article complete normalized text comparison passes for all three after decoding Cloudflare email placeholders.
- Complete normalized hydrated source → generated React static markup text comparison passes for all three after only recorded substitutions. Ordered h1–h4/p/ul/ol/li/strong/em/a/br tags also match, including inline emphasis. No clauses omitted or substantively rewritten.
- `git diff --check cac2e99..6dff8e0`: passed. Working tree clean during final delta review.
- Visually inspected retained implementation screenshots: Privacy mobile, Terms desktop, Accessibility mobile. Recorded six desktop/mobile Chromium results show HTTP 200, content/link parity, expected fonts, no exceptions or horizontal overflow. Additional recorded overflow widths: 320, 720, 768 and 2560px.

No new browser session was started by this reviewer. In-app browser unavailability and isolated Chromium fallback are explicitly documented by the implementation evidence; user Chrome was not used. Full suites, build, WebKit and production adapter were not run by this reviewer per the heavy-validation coordination constraint. The implementation owner's typecheck/targeted lint passes are supporting evidence, not independently repeated here.

## Disposition boundary

The explicit instruction is to retain all source clauses in the local copy, including operational conflicts. Those conflicts and remaining owner decisions are separately documented in operational-facts.md; they are not requests to remove clauses or inject draft notices into the articles. Local implementation approval leaves public activation/push/merge/deploy/provider mutation unauthorized and pending separate disposition.

No application edits, remote actions, new subagents or skills were used by this reviewer. Reviewed existing isolated worktree: /tmp/helix-legal-revetir. Local preview command: `pnpm dev --hostname 127.0.0.1 --port 3036`.
