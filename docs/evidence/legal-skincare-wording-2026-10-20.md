# Local legal skincare terminology revision

Base: current dev `830a3975154b4554bf2d7dbdba713eb2c4d96a46`. Worktree `/tmp/helix-legal-skincare`, branch `codex/plan-legal-skincare-wording`. The owner requested fashion references be adapted to skincare with policy commitments unchanged. Authority is local edits, checks, review and preview only. No issue publication, push, merge, deployment, provider change or Library write is authorized by this revision.

The shared checkout already contains uncommitted related Accessibility and historical source-evidence edits. They were preserved untouched and were not imported into this clean worktree. The retained Revetir source snapshots in this branch remain immutable. The exact terminology allowlist is `scripts/legal/approved-terminology-corrections.json`, separate from the unchanged 22 factual corrections.

## Applied before / after

| Location | Before | After |
| --- | --- | --- |
| Accessibility opening | Fashion should be accessible to everyone. | Skincare should be accessible to everyone. |
| Terms §15, nonexclusive packaging examples | the shoe box, dust bag, brand tags and authenticity card | the product box, container and product label |

All other Accessibility wording, including conformance and support statements, is unchanged. The packaging substitution preserves the requirement that all original packaging be intact and cannot be altered, damaged or removed. It adds no unopened-product, seal, refund or eligibility rule. The illustrative list still follows “which may include”. Layout components, CSS, route shells and document structure are unchanged. No ingredient, efficacy, medical, certification, safety or operational claim was added.

Privacy, Cookie Policy and Privacy Choices were scanned and need no product-category edit. “Trade dress” is a trademark term; “bag” is a shopping-interface noun. Those and generic item/merchandise terms remain unchanged. FAQ and unrelated policies were not revised.

## Exact substantive clauses retained for owner disposition

These are not simple category examples. They remain verbatim in Terms §15 pending the owner's decision; no replacement below is implemented.

1. **Original condition:** “The item must be in its original condition and cannot be used, altered, washed, marked or damaged.”

   Proposed smallest edit: “The item must be in its original condition and cannot be used, altered, marked or damaged.” This removes the laundering reference only. Separately confirm treatment of opened skincare; do not infer that opening, missing seals, sensitivity or product trials create a new eligibility rule.

2. **Face masks:** “Face masks: In the interest of hygiene, face masks and face coverings are considered Final Sale.”

   Proposed alternative: remove this apparel face-covering paragraph as inapplicable. The owner must explicitly decide whether any skincare masks are final sale before substituting a skincare-mask rule; the existing phrase is ambiguous for a skincare catalog.

3. **Intimate apparel and swimwear:** “Intimate apparel and swimwear: Lingerie, hosiery, underwear, swimsuits and bikini bottoms cannot be worn and must be returned with the original hygienic protection sticker intact to be eligible for a refund.”

   Proposed alternative: remove the inapplicable apparel-only paragraph. Do not replace “unworn” with “unopened”, or its sticker requirement with skincare seal/refund conditions, without owner disposition.

## Plan, proof and local handoff

Exact plan SHA256 `f48e90d2b4d42a563734731f151bc28b4af8a3e2e943db192bf1d530d4552313` independently approved before implementation by Spec `/root/delivery_spec_review` and Standards `/root/delivery_standards_review`. Both explicitly judged the nonexclusive packaging example substitution within the approved category-only scope.

Existing parity expectations and offline importer/capture tooling now apply the separate two-entry terminology allowlist after the unchanged factual allowlist. No new test cases were added for copy; existing full-source parity proves all unaffected text, links and structure stay intact. Focused tests, lint/typecheck, importer reproducibility, responsive capture and exact-commit reviews are recorded in `/tmp/helix-legal-skincare-evidence/`.

Local preview: `http://127.0.0.1:3039/accessibility`, `/terms`, `/privacy`, `/cookie-policy`, `/privacy-choices`. Run `pnpm dev --hostname 127.0.0.1 --port 3039` from the worktree. The requested Browser surface is unavailable in this execution environment; repository-owned focused browser capture supplies isolated Chromium verification, without user Chrome access. Full suite, production build and remote CI/delivery gates were intentionally not run for this local-only copy revision and remain required before any later integration.
