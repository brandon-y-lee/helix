# Lifecycle production preparation

## Boundary

This candidate adds only unpublished confirmation source constants and synthetic renderer proof. It does not wire those sources into runtime, create consent, upgrade subscribers, publish native templates, change email/checkout eligibility, install migrations, send messages or activate campaigns. The existing four editorial campaign sources remain unchanged. Production data placement and production recipient/queue isolation are deliberately not decided here.

The confirmed production goal is Helix's four lifecycle campaigns at helixskin.us. Welcome/cart/browse preparation need not wait for a 3PL. Customer-facing discount promises still require separately approved, qualified real checkout. Review/win-back additionally requires authoritative complete-delivery and fresh exact-order/account/mode payment-risk evidence; the existing null readers remain intact. Manual shipments never qualify as verified delivery. Existing subscribers must not be silently enrolled.

## Candidate v2

Add `lib/marketing/lifecycle-confirmation-template-sources.ts` with separate lifecycle-v1 and lifecycle-v2 subjects, HTML and plaintext. Disclosure follows the existing EmailPreferences confirmation UI: signed-in product/cart activity, welcome offers, reminders and education; v2 additionally includes post-purchase follow-ups, reviews and next-purchase offers. Opening/following the email link cannot itself confirm. Ignoring it grants no additional permission and does not change an existing subscription. Existing opt-outs remain authoritative. The same visually inspected dark Helix PNG sits on the requested white background. No discount code, order fact or offer is invented.

These are native publication INPUTS, not native approval fingerprints. The normal renderer will still require an actual published immutable native version and its matching fingerprint inside a newly approved contract. It substitutes the actual receipt's lifecycle or lifecycle_reviews confirmation scope. Old welcome-only confirmation resources and frozen generations remain unchanged.

Independent planning verdicts before implementation: `/root/campaigns/campaign_plan_spec` approved Candidate v2; `/root/campaigns/campaign_plan_standards` independently approved Candidate v2, with no required revisions. The mark is dark, not white; no contrasting backing is introduced. Source preparation and local tests are authorized; push, merge, publication and activation are not performed by this candidate.

## Existing provider preparation

Four new unpublished drafts were created and re-fetched on November 16, 2026. Subject, HTML and plaintext exactly matched the previously reviewed four editorial sources. No old template was modified.

- Welcome: `74b084b3-604d-4a29-a95c-20dd5c59fe02`
- Cart: `e38b0b5a-35b9-4471-976a-1ebbcb604bad`
- Browse: `8e9f8d00-c42d-408b-a6e6-de233beb97fc`
- Review/win-back: `9ca5d391-fdb6-43ee-b12c-595cf628be2d`

Native drafts are not an activation manifest. Their unpublished status intentionally prevents use by current immutable runtime contracts. Sender, Reply-To, postal identity, Topic, live checkout and audience approval remain release requirements. The two confirmation source constants above are not provider resources yet.

## Reviewed staged rollout

Candidate v1 rollout was independently approved by the same Spec and Standards reviewers. Before any customer activation, isolate production state from dev; preserve owner-only sandbox behavior; qualify identity, lifecycle confirmation, opt-in Topic, immutable published versions, enrollment cutoffs, exact purposes/triggers and recipient scope; qualify provider/webhook/worker ownership and quotas; rehearse only with separately authorized recipients. Preserve suppression, native preference freshness, caps, uncertainty recovery and rollback reconciliation. Do not repoint existing dev workers or silently relabel the approved non-production database.

Browse worker admission already has purpose-specific database controls. Popup readiness and enrollment template approval have additional welcome/offer dependencies; do not assume either that browse needs a 3PL or that a new decoupling framework is necessary before inspecting the actual rollout path.

## Verification

Expected red proof: the new focused test could not resolve the new source module before it existed. Focused proof uses the actual renderer with synthetic native templates and contracts, not provider calls or real customer records. It covers both actual scope URLs, escaped business address, white/brand structure, distinct v1/v2 permissions, no unresolved variables, confirmation-only handoff headers, immutable-content drift rejection and a matching fingerprint missing its required confirmation link. It does not establish actual inbox rendering or production readiness. Final results and exact reviewed commit are recorded below after verification.

### Local verification result

- Focused confirmation/marketing/lifecycle renderer/readiness proof: 19 tests passed.
- Complete unit suite: 294 files passed, 1 existing file skipped; 2,877 tests passed and 8 existing tests skipped. No tests were removed or newly skipped.
- Typecheck, lint and `git diff --check` passed.
- The four existing campaign sources and all runtime, database, checkout and worker files are unchanged.
- Not run: production build/browser integration gate, actual Gmail/Outlook/Apple Mail rendering or real sends. Dependencies were reused from the existing matching isolated lifecycle worktree; a fresh frozen install and required integration gate remain remote-delivery prerequisites.
