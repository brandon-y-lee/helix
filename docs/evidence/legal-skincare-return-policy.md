# Approved local skincare return-policy revision

Continues local checkpoint `8beb4274850da0a411df73fe4410e811f2062f2f` in `/tmp/helix-legal-skincare`, branch `codex/plan-legal-skincare-wording`. The owner explicitly approved removing “washed”, the face-covering final-sale paragraph and intimate-apparel/swimwear eligibility, and restoring return requests within 30 days of receipt with opened products considered case by case, without guaranteed acceptance. Surrounding condition and packaging restrictions may be reconciled only as necessary for that policy. Authority remains local edits, checks, review and preview; no issue publication, push, merge, deployment or provider changes.

## Exact customer-facing changes

- Both Terms §15 request-window references now say: **“Return requests must be submitted within 30 days of receipt.”**
- Terms intro and product condition say: **“Opened products are considered case by case; acceptance is not guaranteed.”**
- Product condition continues: **“Products must not otherwise be altered, marked or damaged.”** “Washed” and the categorical used-product prohibition are removed. This does not guarantee that an opened or used product will be accepted.
- Packaging now says: **“Return the product with its original packaging where available, including the product box, container and product label. Opening the product or its packaging does not automatically make a return request ineligible.”** This removes the blanket intact/unaltered/removed-packaging disqualification that would defeat opened-product review. No unopened-product or seal requirement is added.
- The complete apparel face-mask/face-covering final-sale paragraph and intimate-apparel/swimwear paragraph are deleted. Skincare masks are not classified as final sale.
- The FAQ return-policy answer uses the same 30-day-from-receipt sentence and case-by-case/non-guarantee condition. Its question/section summary now describe the policy rather than denying that one exists. The existing support policy constant remains 30; only its contradictory unopened/unused condition text changes.

Free-return language, shipping fees/timing, refund amounts/timing, claims/exchange status and other service availability, payment/provider configuration, Accessibility conformance wording, layouts and unrelated content remain unchanged. Existing altered/marked/damaged restrictions remain qualified so opening itself is not an automatic disqualification. The two earlier category substitutions remain intact.

## Bounded source parity and history

`scripts/legal/approved-return-policy-corrections.json` records four exact Terms text replacements and two whole-paragraph removals, separate from the unchanged 22 factual corrections and two terminology corrections. The offline importer requires one exact match for each replacement and one complete matching paragraph for each deletion. It removes the paragraph node, without leaving blank layout elements. Source comments split the two removal clauses across text nodes, so complete paragraph text is intentionally matched; the initial text-node-only attempt failed closed and was corrected before generating the new Terms.

Existing unit and browser parity checks remove only those exact two approved source paragraphs from the expected DOM, then apply recorded text substitutions. All remaining blocks and links must still match; Terms now has 136 blocks instead of 138. Original source snapshots remain immutable. Historical wording proposals are retained with an explicit superseding note.

## Scope and remaining status

The approved 30-day, opened-product and apparel-removal choices are resolved. No new eligibility, seal, mask-final-sale or acceptance guarantee is inferred. There is no unresolved choice blocking this local revision.

The existing FAQ's unrelated refund-timing and service-availability statements still differ from copied operative Terms in places. Those pre-existing topics were intentionally left unchanged under the explicit instruction not to alter shipping/refund timing or activate providers/services. They remain outside this return-window/condition revision; source copying or this wording update does not establish operational compliance.

## Review and verification record

Exact plan SHA256 `26b458fdd012a579cf6b8e87d12f758cf707022b23b9c2fda8555da142980f1e` was separately approved before edits by Spec `/root/delivery_spec_review` and Standards `/root/delivery_standards_review`. Fresh exact-commit code review is required after task prepare.

Focused tests cover full-source parity, legal pages, FAQ rendering and the Terms/FAQ window-condition agreement; existing assertions were extended rather than adding duplicate copy tests. Checks and responsive captures are retained under `/tmp/helix-legal-skincare-evidence/returns/`. Local preview uses port 3039. Full suite, production build and remote CI/delivery gates are not run for this local-only revision; any later integration requires new authority and the applicable gates.
