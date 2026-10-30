# Local account redesign — candidate 1

Goal source: user request relayed in delegation, 2026-10-30. Refresh the existing signed-in dashboard using the read-only Aesop account reference and Helix FAQ accordion, with account settings, order history, address book, payment methods, rewards, reviews, auto-replenishment.

Authority: local implementation, fixture verification, task commits and independent reviews only. No push/merge/deploy, remote configuration, real customer changes, orders or enrollment. Explicit local-only boundary takes precedence over remote Spec setup. Base: local dev 830a3975154b4554bf2d7dbdba713eb2c4d96a46; primary dirty legal work preserved.

Plan: keep AccountPage server auth/data orchestration and existing action/form adapters. Replace presentational grid with editorial identity/help column and seven native details/summary disclosures styled like FAQ; account settings initially open, independent expansion and collapse. Use native keyboard/focus behavior; keep form nodes mounted across disclosures so interrupted edits persist. Scope CSS to dashboard, responsive single column. Existing server values only for orders/rewards/feedback. Null rewards means unavailable, never fabricated zero. Reviews clearly identifies private feedback rather than public reviews. Address book/payment management/auto-replenishment explicitly unavailable; no simulated working controls. Preserve profile save, reset link, sign-out and feedback submission adapters.

Verification seams: extend existing presentation tests for seven disclosure sections, truthful populated/empty/unavailable states and navigation. Browser fixture uses existing gated verification surface and real form adapters with local stub actions; cover keyboard/repeated expansion, retained draft, success/error/pending, desktop/mobile overflow/focus and signed-out redirect. Required frozen install, lint, typecheck, complete Vitest, build; run available production Chromium suite. Do not alter FAQ or backend architecture. Read-only final Spec and Standards reviews against exact local commit, prepare before review. Record exact outcomes, retries/skips and preview limitations.

Reference: observed signed-in Aesop account settings via user's Chrome tab. Two-column menu/content, fine rules, restrained type, generous whitespace and clear account information/actions. No private reference data or screenshot saved.

Planning review record (candidate 1 above, hash excludes this appended record):
- /root/spec_review: approve; no blocking Spec findings. Verify real /account signed-out redirect separately; label private feedback and fixture proof accurately.
- /root/standards_review: approve; no actionable Standards findings. Existing inert fixture sign-out and misleading signed-out fixture are not authentication proof.
- Routine local implementation approved by both independent roles. Remote actions remain forbidden.
