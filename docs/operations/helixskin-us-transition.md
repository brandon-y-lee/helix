# helixskin.us storefront transition — local candidate

Prepared 2026-11-16, originally from remote dev `022bd8e`; local Candidate v5
incorporates exact dev `3519c00`. This is a local plan and inspection record,
not proof of functioning hosted services. Historical v4 changed Preview
protection and created a Preview; see the chronological
[plan/evidence](../plans/domain-transition.md). The latest local reconciliation
and read-only exposure inspection made no hosted changes.

## Latest release coordination and current blocker

The parent now reports Brandon authorized moving **current dev to Production**.
Release execution task `6afa7b47-533c-8191-bc49-e3bfa19120d8` owns every merge and
deployment, and must resolve and record its exact current dev SHA. This later
release instruction supersedes the earlier intent to retain the old Production
build. The hostname split remains Production `helixskin.us`/`www.helixskin.us`
and dev `helixskin.vercel.app`. This worker must not independently promote,
deploy, change hosted settings/security, or change DNS.

The unintegrated local domain candidate is on `codex/plan-domain-transition`,
reviewed source `b0b7a827177ef0763ec04c1b63460317a6607570`. Both independent
reviewers approve the narrow timing repair and completed-frame attachment;
application/domain executable code is unchanged from reconciled source `37d4391`.
All nine dashboard paths remain identical to dev `3519c00`; all 234 PDP assertion
calls remain byte-identical to the pre-repair source.

Readiness is **BLOCKED**. Forty native swipes passed without retries on fresh
configured-`.us` build `mKrtxUU8sKXkAGaonax3d`, and lint/typecheck pass. However,
the complete normal four-worker Vitest failed twice: the isolated run has nine
timeouts in `catalog-editor-sections.test.tsx` and `storefront-reconciliation.test.ts`
plus an `onTaskUpdate` reporting timeout (291 files/2864 tests passed, eight
existing SQL-fixture skips). Heavy unrelated host load and swap pressure were
observed, but causality is unproven. Timeouts, workers and assertions stay intact.
The complete post-repair Chromium run finished with 206 passed, three existing
catalog skips, and one dashboard flake: reset-password navigation exceeded the
30-second test budget on its first attempt, then passed retry. All 12 PDP effects
tests passed without retries. The HTML report records `ok:false`; runner exit 0
is not a clean browser gate. See the final [evidence record](../plans/domain-transition.md).
No release readiness or gate waiver is implied by source review or the 40-pass run.
The final delivery SHA and summary are also left in the local ignored artifact
`test-results/domain-release-handoff.json`; resolve `git rev-parse HEAD` here.

Required integration and configuration dependencies for the release owner:

1. Explicitly select this compatibility delta for reviewed integration if `.us`
   service origins are required. Promoting existing dev alone excludes these
   local changes and retains its hardcoded legacy origin. Use the applicable
   repository workflow and green quality/browser gates on the exact combined
   release SHA; no cherry-pick or failed-check bypass is implied here.
2. Preserve the stable dev alias and its environment values. Scope the three
   coherent origin settings to the intended Production build only:
   `NEXT_PUBLIC_SITE_URL`, `CHECKOUT_ORIGIN` when present, and
   `HELIX_EMAIL_SITE_ORIGIN`. For the current apex 308-to-www arrangement the
   serving origin is `https://www.helixskin.us`; verify actual DNS/TLS and mapping
   with the DNS owner first. Keep dev at `https://helixskin.vercel.app`.
   Public metadata/static routes require a rebuild of compatible code.
3. In the verified existing Supabase project, add only the chosen serving
   origin's exact `/auth/callback` and `/auth/confirm` paths, retaining both
   legacy and localhost entries. Keep the current Site URL until `.us` Auth
   continuity is proven on the compatible build. No wildcard or SMTP/template
   activation is implicit; follow the existing Auth-email manifest procedure.
4. Verify active checkout host firewall/admission rules. The documented sandbox
   host rule allows only legacy, so `.us` checkout may remain blocked. Any rule
   change is a separate reviewed security action, not covered by this worker.
   Keep legacy callbacks, Stripe success/cancel/receipt routes and webhooks
   reachable for old links and Sessions; cookies do not transfer across hosts.
5. Prove Auth and sandbox checkout on actual hosts under the required controlled
   recipient/provider authority. Keep all flags, payment modes, campaigns,
   tracking, provider endpoints/secrets and existing `support@helixskin.com`
   copy unchanged. Lifecycle/marketing template contracts and persisted email
   links have separate origin/activation dependencies; do not rewrite outboxes.

## Current destination decision — supersedes the Preview proposal

Brandon selected **`helixskin.us` on the existing Vercel Production deployment**,
with **`helixskin.vercel.app` remaining dev**. A separate worker owns the
explicitly authorized DNS work. Do not reassign `.us` to Preview or change project protection/security.
This earlier destination choice did not itself authorize promotion; the latest
separate release-owner authority is recorded above. Earlier instructions below proposing `.us` on Preview
and withholding all DNS work are historical and superseded by this decision.
They do not authorize further actions.

The read-only 2026-11-16 03:06 UTC inventory found Production target
`dpl_FJ5YpBEjrFzZo7C73Zia4S56exgj`, READY, generated URL
`helix-qu3j7xrlu-brandons-projects-5060bad5.vercel.app`, deployed
2026-09-01T22:42:36.913Z from source
`ca88cded8c8d2ac2d069db40928a0026f0319ae6` (August 31). Its historical Git ref is
`dev`; its provider target is Production. These are different concepts. The
project's configured production branch is `main`, currently remote `74ce8bd`.
The stable dev alias targets `dpl_aKJ3ioofSj55aH13qEwzGVyMJmVj`, exact remote dev
`3519c001e9594233fd992e4a0a982eb6adea90e3`.

The existing apex assignment redirects 308 to `www.helixskin.us`, which targets
Production. This plan does not change that serving-host arrangement. At 03:09
UTC, anonymous probes from this machine still reached parked, non-Next content
on both `.us` names; the Production generated URL and dev alias returned 200.
DNS/TLS observations are time- and resolver-specific while the other worker
proceeds. Read actual routing again before any service configuration change.

Connecting DNS to this existing target exposes the old Production application,
not the local candidate or latest dev. Compared with dev, its source is 229
commits behind, with 1187 changed paths including 32 migration paths. These are
source-tree differences, not evidence of live database schema or instructions
to run migrations. It lacks the current dashboard and `/account/reviews` route.
Its deployed homepage canonical is still `https://helixskin.vercel.app`.
The old source resolver always returns that legacy origin in production, even
when passed either `.us` environment/request origin; account signup/recovery
and Stripe return construction consume it. DNS alone therefore cannot establish
`.us` Auth, checkout, email-link or SEO compatibility. A cross-host PKCE return
can lack its initiating browser's verifier cookie; sessions and carts are
host-scoped. No real login, token exchange, email or checkout was attempted.

Current safe sequence:

1. Let the DNS owner finish the authorized existing-Production assignment;
   re-read apex redirect, `www` TLS and exact deployed identity. Preserve dev's
   alias and its callbacks, webhooks and checkout settlement URLs.
2. Keep existing Auth Site URL, redirects, provider endpoints and service-origin
   values until their actual destination code is compatible. Merely changing
   Supabase Site URL or environment variables cannot repair the old hardcoded
   resolver. Do not claim full service migration from DNS success.
3. Treat any compatibility release as separate, reviewed deployment work. The
   local dev-based candidate is not a small patch of old Production and is not
   deployed. It preserves legacy defaults until explicit configuration, but its
   full browser gate is blocked by the reproducible native-swipe failure noted
   in the plan. Do not silently promote dev or replace Production with it.
4. After a separately authorized compatible build is verified on the intended
   environment, use the contract and service checks below with exact `.us` and
   retained legacy/local Auth paths. Coordinate SMTP/templates and controlled
   recipient/sandbox proof separately; keep campaigns, tracking, payment modes,
   support copy and provider settlement endpoints unchanged. This document
   grants no send or hosted-configuration authority.

## Original baseline and prerequisites (historical inventory)

The parent's fresh dashboard inventory reported:

- `helixskin.vercel.app` is valid and mapped to Preview branch `dev`.
- `helixskin.us` redirects 308 to `www.helixskin.us`; `www` is attached to
  Production. Both custom hostnames have invalid DNS. **Do not fix website DNS
  against this assignment before separately approving the exact destination
  deployment and audience.** This plan does not certify Production or `main`.
- Supabase project `erasogmsqpgiirovubjh` has Site URL
  `https://helixskin.vercel.app`, exact `/auth/callback` and `/auth/confirm`
  redirects there and at `http://localhost:3000`, and no custom SMTP.

Re-read these facts immediately before any separately authorized hosted action.
Record the selected Git SHA, deployment ID, branch, environment scope, domain
mapping, prior non-secret values, and recoverable private settings. Stop on drift.
Keep the old alias and all settlement endpoints serving their approved build.

This candidate supports either exact `.us` origin. To match the reported apex
redirect, the proposed selection is `https://www.helixskin.us`; it remains
unselected until configured. Choose one canonical host and use it consistently.
DNS/TLS, deployment protection, and a reviewed environment assignment must work
before account or checkout links use it. Merely owning the domain is insufficient.

## Configuration contract and dependent paths

| Path | Configuration / migration constraint |
| --- | --- |
| Public metadata base, robots, sitemap, PDP structured data | `NEXT_PUBLIC_SITE_URL`; only exact `https://helixskin.vercel.app`, `https://helixskin.us`, or `https://www.helixskin.us`. Unset/invalid retains legacy default. No generated deployment/Host fallback. Rebuild required for metadata and generated routes. |
| Account signup/recovery, PKCE `/auth/callback`, token `/auth/confirm` | `HELIX_EMAIL_SITE_ORIGIN` override or public origin. Explicit override must be one of the same three origins. Incoming configured/legacy origins retain their own cookie host. Development continues to use existing loopback behavior. |
| Checkout admission and Stripe return URLs | `CHECKOUT_ORIGIN` override or public origin. Explicit override accepts the controlled HTTPS origins, or HTTP loopback only in development. URL and Origin must match exactly at configured/legacy host. New Sessions return to their initiating trusted host. Existing Sessions retain immutable provider-stored URLs and may be resumed only after fresh provider proof that both destinations match the initiating host and expected routes; a mismatch offers explicit verified cancellation recovery (see sandbox checkout recovery). |
| Transactional email/assets, support intake/photos | `HELIX_EMAIL_SITE_ORIGIN` remains separately required by `lib/email/config.ts` and support gates. They do not automatically inherit public configuration. Their existing restricted delivery policy is unchanged. |
| Auth email templates | `lib/email/auth-templates.ts` renders absolute links from its supplied origin. Existing hosted templates are not changed by deploying code or setting environment variables. Their SMTP/template activation requires the manifest, private backup, controlled recipient proof and rollback in `resend-auth-email.md`. |
| Marketing, lifecycle, guest review emails | `HELIX_EMAIL_MARKETING_CONTRACT`, `HELIX_EMAIL_LIFECYCLE_CONTRACT`, `HELIX_EMAIL_LIFECYCLE_REVIEWS_CONTRACT` contain separate approved `siteOrigin` and template hashes. Persisted receipts/rendered outbox content preserve their recorded origin. Reapprove templates/contracts separately before any future activation; do not rewrite queued/sent messages. |
| Catalog product media | `lib/admin/catalog/validation.ts` allows the Supabase origin and `NEXT_PUBLIC_SITE_URL`; changing the latter can affect admission of old same-site media URLs. Inventory any such URLs; do not broaden validation or migrate data here. |
| Referral redirect and other request-local routes | `app/r/[code]/route.ts` keeps its relative destination on the incoming host; private endpoints retain existing same-origin/ownership checks. No cross-domain cookie transport is added. |
| Provider webhook destinations | Stripe, Supabase catalog, Resend webhooks and internal workers remain on their existing host. Keep them reachable; a storefront canonical change does not require rotating secrets, creating endpoints, rescheduling workers or moving callbacks. |
| Support/legal copy | `support@helixskin.com` and the historical Website URL in Terms remain unchanged. The user selected Resend's inbox rather than Gmail/forwarding. Verify that selected inbox end to end and separately approve factual public copy before launch; this task does not send a test message or establish mailbox readiness. |
| Operator tooling | `scripts/resend-operations/operations.ts`, `scripts/stripe/sandbox-webhook.ts`, `scripts/vercel/helix-project-audit.ts`, and the checkout firewall JSON intentionally target the old staging host. They are not generic .us activation tools. Do not run apply commands expecting this code change to migrate them. |

The retained-build cold-canonical browser verifier in
`test-support/storefront-cold-canonical.ts` uses the same validated configured
origin as the application. Regression proof requires correct `.us` canonical,
OpenGraph and Product structured-data identity, rejects stale legacy metadata
in a `.us` build, and retains its loopback-only request and artifact guards.
Local configured-domain browser proof still does not prove hosted DNS/TLS,
provider settings, Auth cookies across real hosts, or customer mailbox delivery.

The sandbox rollout runbook and
[`sandbox-checkout-host-rule.json`](../../scripts/vercel/sandbox-checkout-host-rule.json)
deny new Session creation on every hostname except `helixskin.vercel.app`.
Re-read the active firewall and any unpublished draft. If active as documented,
checkout on `.us` stays blocked until a separately reviewed narrow rule permits
the selected `.us` host **and** legacy host while continuing to deny immutable
unreviewed deployments. Keep path and resolved-route coverage and all unrelated
rules. Do not disable the firewall. This is a mandatory checkout prerequisite.

## Historical Preview rollout proposal — destination superseded

The original proposal below is retained for history; its Preview destination
and custom-domain reassignment instructions are superseded by the current
existing-Production decision above. Remaining service-contract details inform
future separately authorized compatibility work, not current execution.

The originally proposed first destination was a protected **Preview / dev** deployment of the
reviewed candidate, not the existing `.us` Production attachment. First deploy
to an unadvertised Vercel Preview URL under separately granted deployment
authority, keeping the legacy URL configuration. Verify its exact Git SHA,
environment, deployment protection and catalog provider selection without
changing either custom domain or website DNS. Generated deployment URLs remain
inspection addresses, never canonical/Auth/checkout fallback origins. Preview
testing must preserve the non-production Supabase project, sandbox Stripe mode,
and current disabled/restricted flags.

Once that candidate is verified, stage the chosen `.us` URL values only in the
approved Preview/dev scope and build a second protected Preview. Before any
website DNS cutover, separately review changing the existing `.us`/`www`
assignment from the old Production destination to that exact approved Preview
branch/deployment. Verify the Vercel alias mapping again before requesting DNS
validation; do not use successful DNS validation as evidence that the attached
deployment is correct. If the available Vercel plan cannot provide the required
protection or branch mapping, stop and resolve that limitation without exposing
the old Production deployment or buying an upgrade. Leave `main` and Production
environment values untouched. Public launch remains a separate decision.

1. Integrate the reviewed local candidate through the applicable planning/Ticket
   workflow and all required gates. Inspect the exact deployment in staging;
   retain its SHA and build evidence. This planning branch is not an approved
   published Ticket and cannot bypass Ticket Review → ticket-gate → Combined
   Spec Review → integration-gate or the separate production promotion boundary.
2. Back up and verify hosted state privately. Establish a reviewed `.us`
   destination at that exact build/environment with the intended audience and
   deployment protection. Verify scope of environment settings; do not change
   Production variables when the approved target is Preview/dev. Deploy this
   compatibility code with current URL values first, proving legacy flows still
   work. Do not globally redirect `helixskin.vercel.app`.
3. Coordinate website DNS/TLS only after that destination is approved; validate
   both apex redirect and `www` directly against it. Preserve path and query on
   the apex redirect. Neither apex auth entry nor apex-issued Sessions should
   be used when apex redirects to `www`.
4. In the verified Supabase project, ADD exact redirects for the selected origin:
   `https://www.helixskin.us/auth/callback` and
   `https://www.helixskin.us/auth/confirm` (substitute apex only if that is the
   chosen serving host). Retain both legacy entries and both localhost entries.
   No wildcard, generated deployment origin or unrelated Auth change. Keep the
   existing Site URL and SMTP/templates until `.us` passes readiness checks.
5. Stage a coherent branch/environment change: `NEXT_PUBLIC_SITE_URL`,
   `CHECKOUT_ORIGIN` (when set), and `HELIX_EMAIL_SITE_ORIGIN` all to the chosen
   exact origin, without a slash. Check their current values first and change
   no sender identity or enablement/mode/recipient flag. Rebuild that environment
   so static metadata and runtime configuration agree. Verify aliases reference
   this exact build. Review/authorize the firewall delta described above before
   claiming `.us` checkout works. Legacy checkout Sessions must still settle.
6. Use a controlled test plan under separately granted provider/send authority:
   test metadata, robots, sitemap and current PDP URLs; signup, password sign-in,
   password recovery and reset, scanner GET/HEAD, token POST and expired/replayed
   links; guest and account carts; sandbox checkout success, cancel, receipt and
   retry/reconciliation at both selected and legacy hosts. Check cookies remain
   host-only and private/no-store responses remain private. Prove hostile and
   cross-Helix Origin rejection. Confirm signed webhook settlement/idempotency
   without changing payment mode or endpoint secrets. No real charge or broad
   customer send is part of this transition.
7. Only after `.us` works, change Supabase Site URL to the selected origin under
   reviewed authority; retain old/local redirects. Hosted SMTP/templates and
   marketing contracts are separate activation work, with their existing
   restricted-recipient proof. Do not activate campaigns or schedules. Verify
   mailbox receipt separately from provider acceptance. If templates still use
   the legacy host, preserve it; do not claim all email links migrated.

## Compatibility and limits

Host-only session, guest cart, checkout receipt, pending-checkout and PKCE
verifier cookies cannot move between `vercel.app` and `.us`, or between apex and
`www`. Existing visitors may need to sign in again and anonymous carts do not
automatically transfer. Keep old login/recovery callbacks, existing checkout
success/cancel/receipt routes and webhooks on their original host. Do not
redirect those routes to `.us` or forward tokens through another domain. This
candidate also permits legacy same-origin checkout creation to avoid stranding
old-host visitors; any future retirement needs its own reviewed expiration and
recovery plan. It does not add shared-domain cookies or account migration.

If custom token-hash templates are already installed, their hardcoded origin
must stay reachable for their full issued-link lifetime. Future PKCE requests
must return to their initiating host. This code preserves such return URLs but
cannot prove provider template, DNS, SMTP, cookie or real mailbox behavior.
Local mock coverage is not that proof. Keep the legacy alias for the longest of
Auth-link lifetime, active Checkout Session/recovery lifetime, queued mail links,
and required receipt/support access; do not invent a fixed retirement date.

## Rollback

Stop the cutover on alias, auth, checkout, receipt, webhook or privacy failure.
Compare current hosted state against the applied manifest before restoring
anything; stop on concurrent drift. After any `.us` links/Sessions have been
issued, use the last verified **compatibility** build, restore only
`NEXT_PUBLIC_SITE_URL=https://helixskin.vercel.app` and the Supabase Site URL,
and retain explicit `CHECKOUT_ORIGIN=https://www.helixskin.us` and
`HELIX_EMAIL_SITE_ORIGIN=https://www.helixskin.us` (substitute the chosen host).
Those overrides keep both issued-link populations working while canonical
metadata reverts; restoring all three values immediately would reject new-host
confirmation POSTs and lose callback cookie continuity. New legacy-origin
account requests/checkout returns still stay legacy. Before any `.us` traffic
has been issued, the exact prior values may instead be restored together.
Keep both redirect allowlists, both serving hostnames and their paths reachable.
Never roll back to pre-compatibility code after issuing `.us` links or redirect
in-flight callbacks/returns across hosts. SMTP/support gates share the retained
email origin, so this partial rollback is not a full service-origin reversal;
report that limitation and complete retirement only after issued links expire.

Retain new-host checkout admission only as needed for already-approved users
while investigating; use a separately authorized narrowly scoped admission stop
if necessary. Do not break settlement, success/cancel/receipt routes or remove
the legacy edge protection. Restore any firewall delta only after accounting for
new-host in-flight traffic. Do not rotate secrets, delete provider resources,
revoke sessions, reset data, rewrite orders or replay sends. SMTP/template
rollback uses its dedicated private backup procedure, not guessed masked values.
Verify both issued-link populations, sandbox settlement and private receipts
before declaring rollback complete.

## Documentation checked

Supabase [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls)
recommends exact production paths. Its
[SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
explains PKCE/browser storage and session handling. The
[changelog](https://supabase.com/changelog.md) was checked on 2026-11-16; this
candidate does not upgrade the SDK/CLI or change hosted Auth/SMTP APIs. Follow
the existing [Auth email runbook](resend-auth-email.md),
[hostname inventory](helix-public-hostname.md), and
[sandbox checkout rollout](hosted-sandbox-checkout.md) for their own boundaries.
