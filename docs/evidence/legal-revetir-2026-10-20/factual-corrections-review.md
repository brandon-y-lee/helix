# Independent factual-corrections Spec/Standards review

Result: **PASS for the authorized local revision**. No actionable findings in `26e2911` → `4484137`. This approves the bounded local correction, not publication or operational readiness.

Reviewed in `/tmp/helix-legal-revetir` on 2026-10-20. Read AGENTS.md, CONTEXT-MAP.md, engineering workflow, Trust & Policy / People & Access / Ordering & Payment contexts, operational-facts.md, factual-corrections-report.md, full exact diff, allowlist, importer, focused tests and browser evidence. No application edits or remote actions.

## Scope and copy

- Independently applied the 18 Privacy and 4 Terms allowlist replacements to baseline file bytes (with the existing HTML escaping). Both resulting files exactly equal commit `4484137`; every replacement occurs exactly once. No other application file changes.
- Allowlist entries remain confined to accounts, payments, tracking and pricing. Manifest copies equal the authoritative allowlist exactly, with no Accessibility corrections.
- Stripe Checkout wording is conditional on entering payment details; it does not announce live activation or add customer-facing sandbox/development disclaimers. The only refund-clause change is Square → Stripe; original timing is intact.
- Inactive optional tracking replaces affirmative provider/tracking claims. Unsupported GPC/toggle claims, Google-login collection, self-service deletion, sourcing-network pricing and the one-item limit are removed. Email/password plus optional names match the correction scope. Required-storage description agrees with the existing Privacy Choices page.
- Accessibility bytes, layout component, all CSS, links and source snapshots are unchanged. Existing unaccepted Accessibility wording remains pending; the correction does not manufacture conformance evidence. Shipping, returns, refund timing, privacy-handling/two-method and retention decisions are preserved exactly outside the named account edit.
- Source-parity tests compare complete ordered headings/paragraphs/list items and links, rather than merely checking selected new phrases. Additional guards preserve unresolved clauses and reject the removed claims. Import generation fails unless each exact correction matches once.

## Independent verification

- Byte-level baseline + allowlist equality and unchanged-path checks: PASS.
- `pnpm exec vitest run tests/legal-policy-parity.test.tsx tests/customer-rewards-migration.test.ts tests/footer-support.test.tsx tests/mobile-services.test.tsx --maxWorkers=2`: **4 files / 20 tests passed**.
- `pnpm typecheck`: exit 0.
- `ESLINT_USE_FLAT_CONFIG=false pnpm exec eslint content/legal/privacy.tsx content/legal/terms.tsx tests/legal-policy-parity.test.tsx`: exit 0; existing eslintrc deprecation notice only.
- `git diff --check 26e2911 4484137`: exit 0. Worktree remains clean.
- Inspected existing capture harness and verified committed browser JSON equals local artifact JSON: **6 cases**, `/privacy`, `/terms`, `/accessibility`, each at **1440×1000** and **390×844**; HTTP 200, ordered content/link parity, no page errors or horizontal overflow. Browser was not rerun by this reviewer. Screenshots remain in `/tmp/helix-legal-artifacts/factual-corrections`.

No full suite/build, service/configuration changes, issue updates, push, merge, deployment or uploads. No subagents spawned or skills applied. No blockers to local revision approval. Accessibility resolution and previously documented operational policy decisions remain outside this approval before publication.
