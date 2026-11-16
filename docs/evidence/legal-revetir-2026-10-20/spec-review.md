# Independent final specification and exact-diff review

Reviewed 2026-10-20 in `/tmp/helix-legal-revetir`, base `cac2e99`, implementation `bc94ab8`, plus additive test-path repair `6dff8e0`. Read-only application review; this report is the only file written by this reviewer.

## Verdict

**PASS for the latest authorized local review scope. No actionable implementation findings remain.** This is not approval to activate, push, merge, deploy, or publicly adopt the copied policies. No remote mutation or public activation was attempted.

The acceptance boundary is the latest explicit instruction: retain all three complete source articles, including conflicting factual clauses, with only authorized company/brand/address/email/website/internal-link substitutions. FAQ and other policies remain outside scope. No independent Spec/Ticket approval or integration-gate result is asserted.

## Independent evidence

- Read `AGENTS.md`, `CONTEXT-MAP.md`, Trust & Policy context, the parity report, source README, substitutions manifest, full operational-facts report, source article text, source HTML, import/browser tooling, and exact app/test diff.
- Independently parsed the complete original HTTP responses rather than trusting the generator's source slice. Selected the inner article-bearing `main.flex-1`, decoded each Cloudflare email, and compared all non-whitespace article characters to each retained hydrated article: **all three passed**. Inert scripts/comments and shared shell were excluded.
- Independently fetched the actual local HTTP-rendered `/privacy`, `/terms`, and `/accessibility` articles and compared every nonempty text node after removing inert React comment boundaries and normalizing whitespace. Expected values used a separately declared list of authorized substitutions, not the generator or parity test helpers: **all three passed**. This includes text outside the existing test's heading/paragraph/list selectors.
- Independently compared all ordered `h1–h4`, `p`, `li`, `strong`, `em`, `a`, and `br` semantic elements: **all three passed**. Privacy: 93 semantic elements / 27 emphasis elements; Terms: 148 / 3; Accessibility: 12 / 0. Article IDs were unique and every `aria-labelledby` target existed.
- Hydrated article SHA-256 values independently matched the manifest: privacy `ff085f24360c528ff3201159f26b093ab2aec942258a386f1efa3e533e0ecc48`; Terms `551d826194e7afe1c37184e1a6f4f3a9b82b261376f21625c3c62982887a1628`; Accessibility `b4077dabb7391be7e2a425cec4b8bccab9946f460503eab1c13baca8f27fc4e2`.
- Visually inspected source and implementation desktop and mobile top screenshots for all three routes. The 896px centered Privacy/Terms column and separate 768px left-aligned Accessibility layout closely preserve their respective source geometry; Marcellus headings and Manrope body text correctly adapt them to Helix. Natural line wrapping differs with the authorized typography/identity substitutions.
- Ran six fresh light isolated Chromium 1.55.1 checks against `http://127.0.0.1:3036`: `/privacy`, `/terms`, `/accessibility`, each at **1440×1000** and **390×844**. **All six HTTP 200; zero page errors; no horizontal overflow; first article link focused successfully and Tab exercised.** Desktop heading left edge/reading width: Privacy and Terms 272/896px; Accessibility 24/768px. Mobile all 24/342px. Computed display/body fonts were Marcellus/Manrope.
- Independently inspected every actual article link in both viewports: four Privacy mailto links and one Accessibility mailto target the confirmed support address; Terms shipping/returns target existing `/faq#shipping` and `/faq#returns`; Terms return/contact and Accessibility Customer Care target `/contact`. These exactly reflect the authorized mappings. No return portal implementation is implied by review acceptance.
- Exact-diff review found no provider/config/database, FAQ, Cookie Policy, Privacy Choices, or global-shell mutation. The new layout remains a server component; interactive shared shell behavior is untouched. Existing Contents/focus coverage is retained on the unaffected Cookie Policy. The delta in `6dff8e0` only updates the two renamed `.ts` paths to `.tsx` in `tests/customer-rewards-migration.test.ts`; it changes no article or layout.

## Separate adoption blockers

The factual conflicts are deliberately preserved, as instructed. The existing `operational-facts.md` separates code-proven issues from unverified company practices and proposes narrow disposition decisions. In particular, Square/live-commerce prose, Google login, optional analytics/Meta/GPC controls, self-service deletion, sourcing-network pricing, one-item limits, fashion/apparel language, shipment/returns promises, provider disclosures, retention/transfer/security practices, accessibility conformance wording, incorporated policies, and source dates require disposition before operative public adoption. Do not silently remove these clauses from this local copy to resolve the blockers.

The untouched Cookie/Privacy Choices publication-status copy also remains inconsistent with the newly confirmed operator identity; it is disclosed in the handoff and outside this requested three-page copy scope. No broader rewrite is authorized by this review.

## Limits and execution status

No app edits, tests added, commits, pushes, merges, deploys, emails, provider writes, full suite, production build, WebKit run, or integration-gate attestation were performed by this reviewer. Focused test/typecheck/ESLint results reported by the parent are separate verification, not claimed as reviewer-executed tests. Initial sandbox loopback access returned EPERM; the allowed read-only escalated checks subsequently completed. Intermediate review-harness selector/comment/viewport corrections were corrected and all final checks passed; they were not application defects. The documented unavailable in-app browser led to isolated Chromium fallback; user Chrome was never used. No skills or subagents were used by this reviewer. No remaining blocker to local-review acceptance.
