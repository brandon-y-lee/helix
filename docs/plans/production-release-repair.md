# Production compatibility repair — Ticket #511

## Authority and plan v2.1

Goal: Brandon's 2026-11-16 request to move current dev to Production at
helixskin.us/www, retaining helixskin.vercel.app as dev. Source integration,
issue/PR setup and eventual gated promotion are authorized. This preparation
does not apply migrations, deploy, change WAF/Auth/security or payment settings,
send email, activate campaigns/reviews/lifecycle, or export the Production
environment. Earlier audit: `eb80e60`; reviewed domain handoff: `8a62122`;
incorporated remote dev: `3519c001e9594233fd992e4a0a982eb6adea90e3`.

Before repair implementation, independent Spec `/root/release_spec_review` and
Standards `/root/release_standards_review` approved exact plan v2.1. Their separate
verdicts are approve for source preparation/disposable verification only, recorded
on #511. No author reviewed their own work. Plan:

1. Carry the reviewed domain source additively, diagnose retained unit/browser
   failures without weakening assertions/timeouts, and obtain new exact-source
   verification. Require zero unexpected and zero flaky Chromium outcomes,
   independently of runner exit status. Disposition each prerequisite skip with
   applicable executable proof; no waiver.
2. Prepare welcome-only scoped confirmation on legacy schema, service-only and
   invoker with empty search_path. Leave an existing scoped function completely
   unchanged. Support later lifecycle replacement without activation and prove
   both orders, idempotence, rejection/no-side-effects, permissions and races.
3. Correct only published contact references to verified support@helixskin.us,
   including their source generator and retained expected-link assertions.
   Receiving routes/senders/webhooks/persisted contracts/issued messages stay as
   they were. The incomplete email branch remains excluded.
4. Prepare the concrete policy decisions below; invent no commitments and retain
   the decided 30-day request window/case-by-case opened-product rule.

The helper refused to repurpose the prior planning worktree. Its additive domain
merge is preserved there. A new helper-initialized Ticket worktree is
`/tmp/helix-release-511`, branch `codex/511-urgent-production-compatibility`.
Its recorded helper base is stale primary local dev `2e2f3ac`; it then incorporated
the independently verified remote dev above. Review against that exact remote
dev, not unrelated previously integrated changes. No primary work was modified.

## Missing confirmation compatibility

Prepared source migration:
`20261116035659_legacy_marketing_confirmation_compatibility.sql`.
It installs the absent scoped signature only for welcome_v1, rejecting all
other scopes/contracts before delegating to the existing confirmation boundary.
It does not configure delivery, change consent, enqueue work merely by applying,
or create lifecycle/review tables. An actual accepted legacy confirmation keeps
its existing restricted welcome outbox behavior; no provider client is added.

Only the still-unapplied lifecycle migration's scoped CREATE declaration becomes
CREATE OR REPLACE, allowing later explicit catch-up to replace the shim. Hosted
inventory showed that migration absent. Reverify exact history immediately
before any future delivery; never modify an already applied migration. The new
migration is a no-op on a full schema, including definition, owner, ACL, security
mode and proconfig. Grants/revocations execute only inside the creation branch.

No remote application is authorized by this document. Do not run bulk db push:
other pending November migrations are separate feature activation dependencies.
Any later selective operation needs current schema/history preflight, exact file
hashes, provider-reviewed authority, disabled-control snapshot and postflight.

Regression command:
`node scripts/db/test-legacy-marketing-confirmation-compatibility.mjs`.
The runner accepts no URL, checks the maintained container label/PostgreSQL17,
and creates/removes only unique synthetic databases. It retains predecessor
marketing/payment/email/support assertions and full lifecycle/review race suites.
Red: the legacy schema lacks the scoped RPC. Green: accepted welcome/replay,
concurrent once-only confirmation, non-welcome rejection with state snapshot
unchanged, service-only privileges/invoker/search_path, repeat install and
shim→lifecycle→reviews→shim with exact enhanced-function metadata preservation.
Controls are unchanged; provider mutations zero. Logs retained privately in
`/tmp/helix-release-evidence/sql-{red,green}.log`.

## Concrete decisions still needed before public promotion

The current payment boundary remains sandbox-only. These decisions concern
truthful public copy; they do not authorize live commerce.

| Decision | Conflicting current copy | Exact input needed |
| --- | --- | --- |
| Shipping promises | Terms: free US shipping on all orders, dispatch 5–7 business days, tracking within 48h. FAQ: unavailable; planned free shipping at $50+, processing 2–5 days/transit 3–10 days. | Confirm the intended future launch threshold and service estimates, or remove operative timing/free-shipping promises until fulfillment is established. |
| Return costs/refund timing | Terms: free/prepaid returns, possible rejected-return reship fee, refund issued within two business days and appears in 7–12. FAQ: no real refund service, 1–2 week planning estimate. | Confirm who pays return postage and any reship fee, and the supported refund-processing commitment; otherwise omit those unconfirmed promises. The 30-day request window and opened-product rule stay settled. |
| Support response deadline | Contact countdown promises a reply by the next weekday noon Pacific. | Confirm staffing supports that deadline, or approve neutral contact copy without a guaranteed countdown. Verified destination is support@helixskin.us. |
| Privacy operations | Policy asserts up-to-seven-year order retention, prompt deletion/de-identification, periodic security review and international-transfer safeguards. | Supply actual retention/deletion process and applicable provider agreement facts; otherwise approve evidence-based wording that avoids unsupported operational assertions. Do not send credentials/customer records. |

Accessibility conformance cannot be established by a copy decision. The repo's
target is WCAG2.2AA; proposed factual correction for separate review is an
aspirational target, without claiming demonstrated compliance. Existing public
copy was not rewritten beyond the verified contact address in this repair.

The exact Auth callback additions and narrow WAF checkout-host allowance require
separate action-time security approval after current-state verification. The
denied full Production environment export is not retried; only non-secret
origin/mode values and scoped metadata may inform a coherent production build.

## Reviewed v3 / v3.1 continuation

Both independent reviewers approved v3 before editing: register the existing
account keyboard/draft/exit workflow separately for 1440,390,320px. Retained
report timing proves the failing first attempt exhausted its shared30s budget
with about130ms left at the third Reset password click; retry took27.9s.
All original actions/assertions remain, each viewport owns its page/interceptors/
write collector, and default timeout/retries remain unchanged. No app change.
Evidence: `/tmp/helix-release-evidence/account-timeout-diagnosis.json`.

Both also approved v3.1's three literal identity corrections: Terms Website
URL and matching generator/test substitution now name the selected serving
Production host https://www.helixskin.us. No legal obligations or unconfirmed
promises change; the dev alias remains separate.

Before those deltas, source7f66491 received separate Spec and Standards source
approval, full ordinary unit2873pass/8existing SQL skips, lint/types and guarded
SQL proof. Fresh configured-us build rNsdwcrOfMe1RpvSmHiCz completed full
Chromium207pass/3catalog skips/0unexpected/0flaky, HTML ok:true, identity and
cleanup passed. Report `/tmp/helix-release-evidence/chromium-7f66491.json`.
These are exact prior-candidate results; the new delta requires fresh review
and affected/full browser checks. No gate waiver.

The three browser prerequisite skips remain explicit conditional activation
proof gaps. Unit coordination/touch-close proof is not equivalent to desktop
two-card handoff viewport behavior. Unit available purchase/sticky state and
real browser visibility do not prove rich available sticky purchase→cart→focus
return. The present catalog lacks those prerequisites, and this source repair
changes no catalog/offer availability. Do not activate those paths without the
missing native browser proof.

## Reviewed v4 — resolve available rich-PDP selection prerequisite

The actual immutable snapshot has ten Products and one Offer. Its first rich-PDP
journey selects coming-soon Biotic Reset, but published Super Serum has both an
Offer and the exact existing rich-media prerequisites. Thus two earlier skips
were a selection gap, not absent capability. Both independent reviewers approved
v4 before editing: export the unchanged hasRichPdpMedia predicate; choose a real
snapshot Product satisfying Offer plus that predicate only for the two available
PDP/sticky tests. Preserve their actions/assertions and global journey selection.
No application, catalog or availability changes. Those tests must now execute;
only the two-Offer Quick Buy prerequisite remains absent. Earlier skip disposition
is superseded by this more precise evidence, not waived.

Before v4, exact da10aac full configured-us build pp4OCfUZezMaOcKMOXoGA passed
Chromium209/3catalog skips/0unexpected/0flaky, HTML ok:true and cleanup passed.
Eight protected candidate Preview GETs also verified exact deployment
`dpl_FXr7oAhhFCgeNGAfXvrfJzvWrEDc`, correct new contact/Terms identity, private
account redirects and unchanged firewall denial. Only an existing authorized
read credential was used in request memory; no security setting changed.
Fresh v4 source review and full gates remain required.

## Reviewed v5 — wait for the local privacy SDK fixture to execute

Exact24937b9 full Chromium executed both available rich-PDP tests successfully:
210passed, one unchanged two-Offer skip, one privacy flake, HTML ok:false. The
runner exited0, so this result remains blocked. Preserved full report and privacy
artifacts: `/tmp/helix-release-evidence/24937b9-failed`; summary
`/tmp/helix-release-evidence/chromium-24937b9.json`.

The failed assertion expected a speed event after the first synthetic metric.
Its request counter observes script requests before script execution, whereas
the mock registers the metric listener during execution. A readiness race is an
inference supported by that ordering/failure point; the first attempt did not
retain script-execution timing, so it is not asserted as conclusively traced.
Both independent reviewers approved v5 before editing: the local-only speed
stub sets a DOM readiness attribute after listener registration; the existing
privacy test awaits it before the first metric and after reload before revoking
loaded SDKs. All existing assertions, timeout/retry settings and application
measurement runtime remain unchanged. Fresh exact-source review/verification
must show zero unexpected/flaky outcomes; no green-exit waiver.
