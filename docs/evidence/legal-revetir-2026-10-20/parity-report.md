# Complete legal copy: parity and local-review handoff

> Historical checkpoint: this report records the complete-copy review at `26e2911`. The subsequent owner-approved payment, tracking, account and pricing corrections are documented in [factual-corrections-report.md](./factual-corrections-report.md); its allowlist is now applied by the parity tests and importer. The original Library screenshots remain historical snapshots.

This is a local-only implementation requested by Brandon. Every source clause remains present, including the operational conflicts listed separately in `operational-facts.md`. There are **zero omitted clauses and zero substantive rewrites**. Copying establishes neither legal adequacy nor actual operational compliance. No policy was publicly activated.

## Exact content boundary

The comparison unit is each complete legal article, excluding Revetir shared navigation/footer. The Helix application shell supplies navigation and typography. Privacy and Terms retain the centered 896px reading column; Accessibility retains the separate left-aligned 768px reading layout. Display headings use Marcellus; functional text uses Manrope. Source heading order, section numbering, emphasis, paragraphs and list items remain intact.

| Route | Headings | Paragraphs | List items | Exact ordered text/link parity |
| --- | ---: | ---: | ---: | --- |
| /privacy | 12 | 23 | 23 | PASS |
| /terms | 59 | 68 | 11 | PASS |
| /accessibility | 3 | 4 | 3 | PASS |

`tests/legal-policy-parity.test.tsx` independently compares every h1–h4, paragraph and list item in order, plus every anchor text/href, against the saved hydrated source. Whitespace is normalized; wording and punctuation are exact after the following substitutions. `scripts/legal/capture-review.mjs` repeats the comparison against the actual hydrated Helix browser pages at both viewport sizes.

## Exact substitutions

Counts apply sequentially, so operator occurrences are excluded from subsequent brand counts. Full hashes, source/expected text lengths and per-link mappings are in `substitutions.json`. Dates remain verbatim source dates, pending adoption disposition.

### /privacy

- `REVETIR LLC` → `Helix Labs LLC`: 1 text occurrences.
- `REVETIR` → `Helix`: 10 text occurrences.
- `care@revetir.com` → `support@helixskin.com`: 4 text occurrences.
- `2 Park Avenue, 20th Floor, New York, NY 10016` → `2747 Haste Street, Berkeley CA 94704`: 1 text occurrences.
- Link `mailto:care@revetir.com` → `mailto:support@helixskin.com` (care@revetir.com).
- Link `mailto:care@revetir.com` → `mailto:support@helixskin.com` (care@revetir.com).
- Link `mailto:care@revetir.com` → `mailto:support@helixskin.com` (care@revetir.com).
- Link `mailto:care@revetir.com` → `mailto:support@helixskin.com` (care@revetir.com).

### /terms

- `REVETIR LLC` → `Helix Labs LLC`: 2 text occurrences.
- `REVETIR` → `Helix`: 84 text occurrences.
- `care@revetir.com` → `support@helixskin.com`: 4 text occurrences.
- `2 Park Avenue, 20th Floor, New York, NY 10016` → `2747 Haste Street, Berkeley CA 94704`: 1 text occurrences.
- `https://www.revetir.com` → `https://helixskin.vercel.app`: 1 text occurrences.
- Link `/us/customer-care/shipping-policy` → `/faq#shipping` (Shipping Policy).
- Link `/us/customer-care/shipping-policy#duties-taxes` → `/faq#shipping` (Shipping Policy).
- Link `/us/customer-care/return-policy` → `/faq#returns` (Return Policy).
- Link `/us/guest/self-serve` → `/contact` (request a return online).
- Link `/us/customer-care/contact-us` → `/contact` (Customer Care).

### /accessibility

- `REVETIR` → `Helix`: 1 text occurrences.
- `care@revetir.com` → `support@helixskin.com`: 1 text occurrences.
- Link `mailto:care@revetir.com` → `mailto:support@helixskin.com` (care@revetir.com).
- Link `/us/customer-care` → `/contact` (← Customer Care).

The website identity uses the repository canonical origin, `https://helixskin.vercel.app`; an email domain alone does not establish a different website origin. Shipping and return links map to existing `/faq#shipping` and `/faq#returns` sections. The source self-service-return link maps to `/contact`, because Helix has no corresponding return portal; this is a documented operational mismatch, not a claim that a portal was implemented. Terms email references are plain text in the hydrated source and remain plain text. The source’s unlinked Privacy/Cookies “here” prose remains unlinked to preserve the article structure.

## Verification

- Frozen dependency install: `pnpm install --frozen-lockfile --ignore-scripts` — passed. Initial shared dependency reuse and offline install lacked packages; the isolated install resolved that environment issue. Lockfile unchanged.
- `pnpm exec vitest run tests/customer-rewards-migration.test.ts tests/legal-policy-parity.test.tsx tests/footer-support.test.tsx tests/mobile-services.test.tsx --maxWorkers=2` — 4 files, 19 tests passed. New parity coverage replaces obsolete prelaunch-copy assertions. Existing Contents/focus tests now use the unaffected Cookie Policy, retaining that shared behavior coverage. Independent review found static filename references in the rewards migration test; commit `6dff8e0` fixes those references without weakening assertions.
- `pnpm typecheck` — passed after isolated dependencies were installed.
- Targeted ESLint with `ESLINT_USE_FLAT_CONFIG=false` and the repository `.eslintrc.json` — passed; only the existing configuration deprecation notice. The default flat-config invocation was unsuitable for this repository.
- `git diff --check` — passed.
- Browser: isolated Playwright 1.55.1 Chromium; source and Helix baseline captured at 1440×1000 and 390×844. Implementation captured at the same sizes; additional overflow checks at 320, 720, 768 and 2560px. All six implementation page/viewport cases returned HTTP 200, exact content/link parity, no page exceptions, no horizontal overflow. First article links accepted keyboard focus; Tab operation was exercised. Screenshots omit only the Next.js development-tools badge.
- Full Vitest, production build, canonical production-browser adapter and WebKit were intentionally held while the contact task performs heavy validation. This is not an integration-gate attestation.
- In-app browser was unavailable; isolated Chromium fallback was used. User Chrome was never used.

## Scope and disposition

Implemented only `/privacy`, `/terms`, `/accessibility` and their content/layout/test/evidence seams. FAQ, Cookie Policy, Privacy Choices, global navigation, providers/settings, Supabase and remote branches were not changed. FAQ dissatisfaction remains open with no new exact copy instruction. The untouched Cookie/Privacy Choices pages still contain their existing prelaunch/legal-operator status; reconciling them would require additional scope.

Proven conflicts: Square versus Stripe sandbox; Google login; optional analytics/Meta sharing and privacy toggles/GPC; account deletion UI; one-item restriction; lowest-ask sourcing pricing; fashion category. Unverified owner practices: physical fulfillment/returns/refund promises; privacy/accessibility/security/dispute mailbox handling and manual rights fulfillment; record retention/transfer safeguards/review cadence; actual optional provider processing; accessibility conformance wording; incorporated policies and adoption dates. Exact clauses and smallest suggested factual substitutions are in `operational-facts.md`. All remain in the local copy as explicitly instructed; adoption requires disposition.

## Local state

Worktree `/tmp/helix-legal-revetir`; branch `codex/plan-legal-revetir`; start `cac2e99b5c587b6f151072d7a80648bd43a04d5c`. Shared dev had an unrelated untracked output directory, preserved. Earlier `codex/plan-trust-support-pages` survives at `d6a19d5`, but `/tmp/helix-trust-preview` is missing and has no newer legal-page changes than this base; nothing was reset or overwritten. The explicit local-only review request uses an isolated planning checkpoint; no Ticket/Spec issue, push, PR, merge or deploy is being represented as completed.

Preview: `http://127.0.0.1:3036/privacy`, `/terms`, `/accessibility`. Run `pnpm dev --hostname 127.0.0.1 --port 3036` from the worktree. Contact worktree, shared dev and port 3018 were untouched.

Screenshots: `/tmp/helix-legal-artifacts/{source,baseline,implementation}`. Source capture details/checksums are in `source/README.md` and `source/manifest.json`; final actual-browser results are in `browser-results.json`. All twelve final screenshots were successfully saved to Library; exact IDs, versions and local paths are in `screenshots-library.json`. Standards review approved `6dff8e0` after the bounded filename fix, with no open implementation findings. Spec review independently approved the same source commit, including six fresh browser checks. See `standards-review.md` and `spec-review.md` for independent evidence. The initial upload-helper connection failed before any write; the available ordered batch-create route succeeded for every screenshot and local identity metadata was persisted.

Subagents: `source_layout`, `content_facts`, then independent `spec_review` and `standards_review`, all explicitly requested gpt-6.1-sol/high. Library skill used only for requested screenshot deliverables. Content reviewer used Supabase skill for local provider/data facts; no Supabase changes.
