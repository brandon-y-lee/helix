# helixskin.us local preparation

## Authority and boundary

Goal source: delegated domain-transition task, 2026-11-16. Prepare a safe local
change and rollout plan from verified remote dev `022bd8e4a4aa30f5513ad3ee92eb6ec3aa439fa4`.
No publication, push, merge, deploy, hosted configuration, real email, payments,
campaign activation, or DNS changes are authorized in this task. The explicit
local-only preparation boundary takes precedence over remote Spec setup; this
branch is a reviewable local candidate, not an integration-ready Ticket.
Primary checkout remains on its existing dev commit with unrelated dirty files.
The helper started this isolated planning branch from local dev `2e2f3ac`, then
fast-forwarded it to verified origin/dev. `.agents/skills` is absent in both.

## Candidate v1

1. Keep `https://helixskin.vercel.app` as the unchanged default. Let the existing
   `NEXT_PUBLIC_SITE_URL` select only exact HTTPS origins on that hostname,
   `helixskin.us`, or `www.helixskin.us`. Ignore invalid public configuration as
   before; never infer a deployed origin from request headers or Vercel URLs.
   Preserve existing development loopback behavior.
2. Validate explicit `CHECKOUT_ORIGIN` and `HELIX_EMAIL_SITE_ORIGIN` against the
   same exact deployed-origin set, failing closed on invalid explicit settings.
   Use public-site configuration when those overrides are unset. Preserve local
   checkout defaults/overrides and local account redirect behavior.
3. Account callback/confirmation redirects stay on the request origin only when
   it is the configured account origin or the legacy Vercel origin. In deployed
   mode the legacy host is retained for older emailed links and PKCE cookies;
   other incoming origins cannot control redirects. Confirmation POST must
   still require exact same-origin CSRF proof before consuming a token.
4. Checkout accepts only matching URL/Origin pairs at its configured origin or
   the legacy Vercel origin. Pass that validated request origin into the server
   checkout boundary, validate it again when constructing Stripe return URLs,
   and keep new sessions returning to the initiating trusted host. Existing
   Stripe sessions and idempotency, receipt cookies, verification, and cart
   ownership rules remain intact.
5. Inventory metadata/sitemap/robots/PDP, transactional and marketing origins,
   hardcoded Auth templates, support origin checks, provider webhooks, and
   product-media origin validation. Do not rewrite persisted email contracts,
   sender identities, support copy, payment or tracking flags. Document any
   separately configured paths and limitations rather than broadening scope.
6. Add focused regression proof at the public resolver, Auth action/callback/
   confirmation, checkout request, and Stripe session boundaries. Verify
   defaults, configured .us operation, legacy continuations, hostile origins,
   CSRF rejection, and unchanged local behavior. Run lint/typecheck and Vitest;
   report integration/browser/provider proof separately when unavailable.
7. Document prerequisites, exact deployment order, cookie-domain limitations,
   rollback, no automatic redirects from the legacy host, and all remaining
   integration/activation gates. Do not assume the currently attached Production
   deployment is safe to expose. Support address remains unchanged until its
   mailbox/routing and separate copy approval are verified.

Independent reviewers must approve this exact v1 before implementation; record
their identities, verdicts and any delta review here. Local checkpoint commits
do not satisfy Ticket Review, ticket-gate, or Combined Spec Review.

### Planning review record

Exact Candidate v1 above approved before implementation by independent tasks
`/root/domain_spec_review` (Spec) and `/root/domain_standards_review` (Standards),
2026-11-16. Both verdicts: approve; no blocking findings. Standards clarified
item 2 applies at Auth/Checkout redirect boundaries; transactional/marketing
snapshots remain separately inventoried under item 5. Both reviewers will check
internal request-origin inputs, URL/Origin mismatch rejection, and unchanged
idempotent recovery. Hosted delivery authority remains absent.

## Committed candidate review

Source/document candidate: `c2c305bec5aead1538bd476f49458834a94258f4`.
Both reviewers independently compared it against verified remote dev
`022bd8e4a4aa30f5513ad3ee92eb6ec3aa439fa4`, rather than stale primary local dev.

- Spec: `/root/domain_spec_review`, approve, no blocking findings. Independently
  ran 8 focused test files: 108 passed.
- Standards: `/root/domain_standards_review`, approve, no actionable findings.
  Independently ran 7 focused test files: 102 passed.
- Reviewers used `.claude/skills/code-reviewer/SKILL.md` and its universal and
  TypeScript rules. Both confirmed these are local candidate reviews only;
  required delivery gates and provider proof remain outstanding.

`scripts/git/codex-task.sh prepare /tmp/helix-domain-transition` passed on the
clean checkpoint. Its printed base is primary local dev `2e2f3ac`; the exact
review comparison above excludes the already-integrated remote-dev changes.
No review-base ref, primary branch, dirty file or remote branch was rewritten.

## Verification evidence

- Passed: frozen lockfile install (Node 24.19.0 / pnpm 9.15.4), `pnpm lint`,
  `pnpm typecheck`, `git diff --check`, 149 focused Auth/checkout/origin tests,
  2 configured-origin robots/sitemap tests, and 8 commerce journey tests.
- Browser smoke: in-app Browser, default desktop viewport,
  `http://127.0.0.1:3208/auth/confirm?token_hash=synthetic-local-token&type=email`.
  Observed HTTP 200 and the confirmation page/button without submitting. No
  provider token was consumed or message sent. Local server stopped afterward.
- Initial complete `pnpm test`: four journey assertions failed because the
  internal server call now includes the validated request origin; updated those
  assertions without dropping any reward/payment behavior proof. Also observed
  a Vitest worker `onTaskUpdate` timeout.
- Complete rerun: 293 files / 2,871 tests passed; 1 file / 8 tests skipped by the
  existing disposable SQL fixture guard; process still exited 1 due to the
  worker `onTaskUpdate` timeout. This is **not** a passing full gate. Logs:
  `/tmp/helix-domain-vitest.log` and `/tmp/helix-domain-vitest-final.log`.
- Lower-concurrency complete run: `pnpm exec vitest run --maxWorkers=2`, exit 0,
  293 files / 2,871 tests passed, the same 1 file / 8 SQL-fixture tests skipped,
  no unhandled errors (134.71 seconds). Full log:
  `/tmp/helix-domain-vitest-bounded.log`. No test/configuration code was changed
  to achieve this. Default-worker `pnpm test` remains observed failing locally
  on reporting timeout; hosted required gates still need their own green run.
- Not run: retained production build, full Chromium verification, dedicated
  disposable-database suite, hosted DNS/TLS/auth-cookie/checkout/SMTP/mailbox
  acceptance. No provider credentials were loaded. These remain prerequisites
  for delivery as applicable; no check is waived.

Only task-scoped local Git refs/commits, isolated dependencies and local files
changed. No push, issue/PR publication, merge, deployment, hosted settings,
DNS, payment mode, tracking flag, sender identity, support copy, scheduler,
campaign, send or remote database change occurred in this task.

Local run command: `pnpm dev --hostname 127.0.0.1 --port 3208` from
`/tmp/helix-domain-transition`. Apply no `.us` environment values locally to
claim hosted verification. Operational ordering and limitations are in
`docs/operations/helixskin-us-transition.md`.

## Candidate v2 — local verification continuation

Goal source: delegated follow-up, 2026-11-16: complete applicable build,
Chromium, database and origin-verifier checks, diagnose the worker timeout, and
provide a concrete dev/preview rollout path. No deploy or hosted setting change;
the `.us` Production mapping remains unsafe to expose.

1. Update only the cold-canonical verifier's expected origin to use the existing
   validated public-site resolver. Keep its loopback-only fetch, bounded body,
   retained artifact, exact canonical/OpenGraph/structured-data identity checks
   and all existing product-selection rules. Add proof that configured `.us`
   metadata passes and legacy metadata in that `.us` build fails.
2. Run the dedicated artifact-verification runner against the isolated candidate
   with only approved non-production public Supabase catalog credentials. Use
   safe browser fixture configuration, no privileged/provider-send keys, and
   local `.us` URL configuration; no real domain traffic, deployment or DNS
   change. Run complete Chromium coverage on its owned loopback server. Record
   build ID, exact outcome, any external prerequisite failures, and cleanup.
3. Run maintained affected checkout/payment/idempotency/receipt and catalog
   disposable-PostgreSQL checks using the existing verified, labeled local
   PostgreSQL 17 container, each runner's unique synthetic database and cleanup.
   Preserve all unrelated databases/containers. Do not run hosted migrations.
4. Diagnose the default-worker Vitest timeout with local process/reporting
   evidence and controlled runs. Do not raise timeouts, suppress errors, change
   isolation, delete assertions or change the default gate merely to get green.
   Propose any durable test-runner change separately for delta review if needed.
5. Update the runbook with exact safe Preview/dev prerequisites and ordering,
   preserving old-origin routes, cookies, checkout and settlement. Record all
   actual checks and remaining blockers without claiming production readiness.

Independent Spec/Standards delta approval is required before the verifier edit.

Candidate v2 approved before implementation by `/root/domain_spec_review` and
`/root/domain_standards_review`, independently, 2026-11-16; both verdicts approve,
no blocking findings. Retain all identity/runner guards, use unique synthetic
databases, and review any separate runner change before implementing it.

## Candidate v3 — reporting starvation repair

Temporary local timer observation measured a 101,697 ms event-loop stall in the
same worker interval as the all-synchronous `github-workflow-tools.test.ts`
file (101,693 ms). Vitest 3.2.6 schedules worker reporting RPCs without awaiting
each update and its installed RPC transport times out at 60,000 ms. Prior
default-worker runs took 67,998/69,100 ms and timed out; the two-worker run took
46,488 ms and passed. The instrumented run additionally ran alongside Chromium
and lint/typecheck, so its three test timing failures are load-confounded; they
are not product regression evidence and must be rerun without that load.

Proposed repair: add a root `afterEach` hook to that real-Git test file which
awaits Node's promise-based `setImmediate` once between test cases. Preserve
every fixture operation, assertion, timeout, worker count and isolation policy.
This lets reporting acknowledgements run instead of postponing I/O for the
whole synchronous file. It does not make any application change or silence a
test failure. No new test of the hook itself; verify via the actual affected
file and complete normal `pnpm test`, without concurrent expensive work.
Repeat bounded timer observation only if needed to distinguish residual
starvation; no diagnostic code is added to the product or repository config.

Both independent reviewers must approve exact Candidate v3 before editing.

Candidate v3 approved before implementation by `/root/domain_spec_review` and
`/root/domain_standards_review`, independently, 2026-11-16; both verdicts approve,
no blocking findings. Actual file/default-suite reruns must resolve the prior
timing failures; no test/configuration weakening is approved.

## Continuation verification completed

Candidate v2 source `619209c` approved independently by Spec and Standards
reviewers against `45483a8`, no actionable findings. Spec independently ran 38
tests across cold-canonical/global-setup/metadata; Standards independently ran
46 cold-canonical/site-origin tests. The two new canonical regressions failed
before implementation (2 failed / 31 passed) and passed after the narrow resolver
change (38 passed across the affected 3 files).

### Local production artifact and Chromium

The dedicated owned runner built `.us` configuration and verified artifact
`J-5XzNHBU4ty5CPqH1M5L` at `http://127.0.0.1:58707`. Build passed in 32.304s;
server identity passed; complete Chromium passed (206 passed, 3 skipped,
0 unexpected, 0 flaky; 5.7 minutes); cleanup passed and its server was stopped.
Log: `/tmp/helix-domain-production.log`.

The temporary wrapper `/tmp/helix-domain-verify.mts` selected only the approved
non-production Supabase URL and verified anonymous/publishable key in memory,
plus explicit public origin and disabled checkout. No `.env` file was copied,
no key value printed, and no privileged/payment/email credentials were selected.
Browser interactions used the maintained fixtures; public catalog reads were
the only live provider data access. No website request or setting was changed
on the real `.us` domain. The build ran from the isolated candidate bytes later
committed as `619209c`; the later reporting-hook change affects tests only.

Global setup validated 10 active public Products. Cold product proof records
HTTP 200 `/products/beaming-prep`, canonical and structured URL
`https://www.helixskin.us/products/beaming-prep`, and that exact build ID.
Artifacts remain under ignored `test-results/` and `playwright-report/`.
The configured-origin verifier blocker is resolved locally.

The 3 existing catalog-dependent Chromium skips remain explicit: rich-PDP
available-variant and sticky-purchase proofs had no live Offer; cross-Product
Quick Buy viewport proof lacked two collection Products with Offers. No skip
was added or bypassed. Fixture-based cart/checkout coverage still ran. This
local CLI result does not establish real-domain/provider acceptance or a remote
Integration Gate result.

### Disposable SQL proof

Verified local container `helix-spec358-pg`: PostgreSQL 17, label
`helix.task=spec358-synthetic-sql`, port 55438 bound to `127.0.0.1`. All of these
maintained runners passed with unique databases and their own teardown:

- `node scripts/db/test-checkout-payment-contracts.mjs helix-spec358-pg`
- `node scripts/db/test-checkout-receipts.mjs helix-spec358-pg`
- `node scripts/db/test-checkout-single-send.mjs helix-spec358-pg`
- `node scripts/db/test-checkout-admission.mjs helix-spec358-pg`
- `node scripts/db/test-catalog-current-contract.mjs --container=helix-spec358-pg`

Logs: `/tmp/helix-domain-db-{payments,receipts,single-send,admission,catalog}.log`.
This includes private grants/RLS, payment contracts, receipts, concurrency,
single invocation, admission/recovery and 32 composed Catalog checks. The
Catalog runner executed all 8 normally skipped SQL-backed Restore service
tests, then confirmed removal of `helix_catalog_current_27cf5a28f0cc6606`.
No provider mutation occurred; no unrelated database/container was reset.
Schema and migration source files are unchanged.

### Reporting timeout diagnosis

The temporary `/tmp/helix-vitest-loop-diagnostic.mjs` only observed timers; it
did not alter timeouts, assertions, isolation or IPC. Its log
`/tmp/helix-domain-vitest-eventloop.jsonl` measured a 101,697ms blocked timer in
the worker matching the synchronous Git suite's 101,693ms. The installed
Vitest RPC code has a 60,000ms deadline, while runner task updates queue their
reporting promises until completion. The all-synchronous test file starved its
worker's I/O. Prior 4-worker failures (67.998s/69.100s) and a passing 2-worker
file (46.488s) support that diagnosis.

The diagnostic full run was load-confounded by simultaneous browser/lint work:
Git phase-activation and 2 CatalogEditor timing checks failed, in addition to
the reporting timeout. Log: `/tmp/helix-domain-vitest-diagnostic.log`. Do not
interpret those timing failures as resolved until the unloaded rerun passes.
After the reviewed `setImmediate` scheduling hook, the actual Git suite passed
52/52 under normal load in 37.95s (`/tmp/helix-domain-git-yield.log`). Normal
complete `pnpm test` verification is recorded below when finished.

Final normal-load `pnpm test` (default 4 workers, no diagnostic preload), exit 0:
293 files passed, 2,873 tests passed, the existing 1 file / 8 SQL-fixture tests
skipped, no failed assertions or unhandled errors; 78.05 seconds. The Git suite
passed 52/52 in 58.816s; CatalogEditor sections passed 11/11. Thus all three
load-confounded timing failures passed on the final normal run. Log:
`/tmp/helix-domain-vitest-normal-final.log`. The separate SQL runner above also
executed all eight fixture tests. No timeout increase, default-worker change,
assertion removal, or isolation/suppression was used.

Final `pnpm lint`, `pnpm typecheck`, and `git diff --check` also passed after the
reporting hook. Logs: `/tmp/helix-domain-lint-final.log` and
`/tmp/helix-domain-typecheck-final.log`. The retained `.us` application build
remains applicable: there is no later diff to `app/`, `lib/`, `.env.example`, or
`next.config.ts`; the subsequent executable change is only the Vitest Git-file
yield hook. Existing CSS/libvips build/browser warnings were non-fatal.

No hosted acceptance is claimed: actual `.us` DNS/TLS/alias mapping, Supabase
allowlist/Site URL/SMTP/templates, real browser Auth-cookie continuity across
serving domains, provider Checkout returns/webhooks and real mailbox exchange
remain rollout acceptance work. The user subsequently selected Resend's inbox
instead of Gmail; this task only corrected that prerequisite description and
did not modify support copy or send mail.

Final committed Candidate v3 `97831246af0da0233d4b3a865e49367fb8f8c473` was
independently approved against `619209c` by `/root/domain_spec_review` and
`/root/domain_standards_review`, 2026-11-16. Both verdicts: approve, no actionable
findings. Reviewers verified the normal complete-suite log, unchanged
assertions/timeouts/workers/isolation, configured-domain artifact and explicit
hosted acceptance limits. Worktree was clean and `prepare` passed before review.
This final documentation record adds no further executable change.

## Candidate v4 — protected hosted Preview only

Goal source: delegated instruction to prepare and deploy reviewed candidate to a
protected Preview/dev environment, preserve existing work/deployments, and keep
Production, `.us` assignment/DNS, campaigns, tracking, and payment modes untouched.
Deployment authority is now granted for this protected Preview only; no branch
push, merge, Production promotion, public `.us` cutover or customer sends.

Read-only Vercel preflight using authenticated official CLI 65.16.0 found project
`prj_N9nyPL9SixJHOROIovS8PDQ9aKny`, team `team_uriJjJWNwpZnZHnIp5AiXuv0`,
framework Next.js/Node24. Its SSO/password/IP protection is disabled; an existing
automation-bypass record is present (value withheld). Production remains
`dpl_FJ5YpBEjrFzZo7C73Zia4S56exgj`; legacy staging alias points to
`dpl_F1Mkgm5192hL4QcqQDCE7MX76sqA`. `.us` apex still redirects308 to `www`,
and `www` has no gitBranch (Production). No mutation or upload has happened.

Proposed exact bounded rollout:

1. Record and re-read current project, domain and legacy alias state; stop on
   drift. Use only existing project, no new project or paid upgrade. Confirm
   anonymous legacy callback/scanner/webhook-health reachability without using
   a token or invoking provider side effects.
2. Because Vercel protection is project-scoped, preserve the already-public
   `helixskin.vercel.app` alias by adding only its documented protection
   exception: PATCH `/aliases/<existing-legacy-alias-id>/protection-bypass`,
   `{ "override": { "scope": "alias-protection-override", "action": "create" } }`.
   Then enable **Preview only** Vercel Authentication with PATCH project
   `{ "ssoProtection": { "deploymentType": "preview" } }`. The published
   OpenAPI explicitly supports both bodies; exceptions are free on all plans.
   Do not use Standard/All scopes that affect Production deployment URLs.
   No new public hostname/access is created: the exception preserves the exact
   existing public staging alias and its callback/webhook path behavior. Other
   generated Preview URLs become authenticated; artifacts/aliases are preserved.
3. Re-read settings, prove legacy anonymous health/callback/scanner behavior
   unchanged, and compare Production target and all custom-domain assignments
   to baseline. Stop before upload if these conditions fail. Do not rotate or
   create a bypass secret. Before any candidate upload, a failed protection
   setup may restore only this task's exact touched fields after drift checks.
4. Export only tracked reviewed commit `929fd47220733a940e8b68eeb1af4ee8e3440f82`
   to a task-owned temporary source directory. Use CLI `deploy --dry --json`
   to audit inputs; no `.env`, `.next`, dependency folder, private preflight,
   tokens, screenshots or unrelated dirty work may upload.
5. Deploy explicitly to existing project's **preview** target on isolated
   `codex/plan-domain-transition` metadata, never `dev` branch metadata (which
   could move the public staging alias). Retain legacy URL configuration for
   the first Preview. Use deployment-scoped safe disabled feature overrides
   where required to prevent email/checkout/campaign side effects; change no
   existing project environment variable or payment mode. Preserve source SHA
   and a source-manifest fingerprint in deployment metadata. No --prod,
   --temporary, --verify (which could create a bypass), alias, promote or DNS
   operation. Review exact options and resulting input manifest before upload.
6. Verify anonymous Preview access requires authentication, then use official
   authenticated CLI requests with the **existing** automation bypass to inspect
   metadata, robots/sitemap, missing-code callback and synthetic confirmation
   GET/HEAD, and invalid-origin POST rejection. No signup/recovery send, real
   token exchange, payment/session creation, customer-data query or mutation.
   Verify actual deployment target/source SHA/environment and unchanged legacy
   aliases/Production/.us state again. Report limits on real-host cookie proof.
7. Keep the Preview protected after creation; never roll SSO back to public
   while that deployment exists. Leave `.us` domain assignment as a separate
   consequential public-exposure step for the parent. Record exact remote
   changes, preview URL/ID and check outcomes locally.

Independent Spec and Standards approval of this exact v4 is required before
protection mutation or upload. All raw provider state remains in a mode700
temporary directory with mode600 files; no sensitive values are logged/committed.

V4 exact upload candidate: `/tmp/helix-domain-preview-deploy.mjs` exports the
reviewed SHA above to `/tmp/helix-domain-preview-source` and targets only existing
project/team with `--environment preview`. Metadata is custom informational
`helixReviewedSha`, `helixSourceManifest`, and
`helixSourceBranch=codex/plan-domain-transition`; no provider Git branch override
is supplied, so no `dev` branch association/domain is moved. The Preview uses
general Preview variables, with explicit deployment-only overrides: public
Supabase URL is the approved non-production project; all three site origins
remain legacy. Every checkout/send/support/marketing/lifecycle/offer/review/
shipment/measurement enablement flag is `false` at build and runtime. Management,
service-role, payment, search-write and email credentials are overridden empty
for this anonymous-catalog inspection deployment. No project environment value
or payment mode is changed. Existing dev's enabled restricted services remain
unchanged; this Preview cannot certify those provider actions.

Dry inspection passed: Next.js, 1,694 upload files, 62,779,297 bytes; archive has
1,695 tracked files. Exact tracked-source manifest fingerprint:
`7acf1f16a51ee31a7ea6229b132fdf039bdf490889c19a86c65f708cce4284e2`.
Private dry and argument manifests reside under the protected preflight directory.
For authenticated verification, use the existing automation-bypass value only
in an HTTPS request header to the exact returned owned Preview hostname; do not
ask CLI to create a bypass, print it, put it in a URL, or extract CLI auth cache.
These exact input/options details also require independent review before upload.

Exact-options review found and resolved three gaps before any remote mutation:
explicit GA4 and guest-review disabled flags were added, and the upload script
now rejects any source fingerprint differing from the approved value above
before invoking Vercel. Both reviewers independently found the source guard/GA4
issues; Spec also requested the explicit guest-review flag. Spec independently
compared all 1,695 files against tracked `929fd47`, with no missing, extra or
mismatched source. Regenerated dry manifests require reapproval of these fixes.

### V4 approval and hosted outcome

Both `/root/domain_spec_review` and `/root/domain_standards_review` approved v4
before mutation. Both approved the revised exact upload inputs after the source
guard and disabled flags were fixed. Spec additionally found that provider
object assertion diffs could expose secret values on drift; before mutation the
protection script was changed to boolean comparisons with generic errors and a
sanitized top-level catch. Before/after comparisons also cover password/IP and
the existing automation-bypass configuration. Both reviewers approved this
revision. There were no rejected or uncertain hosted writes.

Remote actions completed through official CLI 65.16.0:

- Added `alias-protection-override` only to already-public
  `helixskin.vercel.app`, preserving its prior public access and its exact
  deployment target. No public access was added to the candidate hostname.
- Enabled Vercel Authentication with `deploymentType=preview` on Helix.
  Existing/future generated Preview URLs now require authentication; Production
  protection is excluded. No new bypass token was generated or rotated.
- Deployed tracked reviewed source `929fd47220733a940e8b68eeb1af4ee8e3440f82`
  to Preview `dpl_BmiGN28iDj2X6hS6WbCFbQHGXvK6`, now `READY`:
  `https://helix-qjolaotzx-brandons-projects-5060bad5.vercel.app`.
  Custom metadata records the reviewed SHA, source manifest fingerprint and
  source branch; there is no `dev` Git association and no assigned custom alias.

Actual uploaded provider source tree independently matched all **1,694** dry
upload paths and content hashes. The sole archive file ignored by CLI was
`.gitignore`. No private preflight, local environment/dependency/build output or
dirty primary file uploaded. Deployment-scoped overrides were exactly reviewed;
project environment variables and payment modes were not edited.

Hosted verification passed **14 checks**. Anonymous access returns302 to Vercel
authentication. Using only the existing private header bypass: root/PDP,
robots and all26 sitemap entries retain the legacy canonical origin; no GA4/
Meta script is enabled; missing-code callback returns307 to legacy sign-in;
callback/confirmation remain private/no-store; synthetic confirmation GET
renders the human form, HEAD returns no body, cross-origin confirmation and
checkout POSTs return403. No real token exchange, customer query, send or
payment Session was attempted. The checkout403 may be the existing edge rule;
it does not establish provider checkout acceptance on this hostname.

Final project/alias/domain comparison confirmed: Preview-only SSO active;
Production target remains `dpl_FJ5YpBEjrFzZo7C73Zia4S56exgj`; legacy alias still
targets `dpl_F1Mkgm5192hL4QcqQDCE7MX76sqA`; all `.us` domain assignments and
redirects, project environment values, password/IP protection and the existing
automation bypass are unchanged. Legacy anonymous callback307, confirmation200
and Stripe webhook health200 were verified after enabling protection. No DNS,
alias target, environment value, production build, Git push, merge, scheduler,
campaign or tracking activation changed in this task.

Sanitized supporting results are in the private task directory:
`source-verification.json`, `preview-verification.json`, and
`final-preservation-summary.json`; raw provider responses remain mode600 under
`/tmp/helix-domain-vercel-preflight` (directory mode700), never committed.

The parent has a separate account-dashboard worker integrating into dev.
This Preview intentionally freezes the reviewed domain candidate and does not
claim to include that later integration. No local/remote dev branch was updated
here. Re-fetch dev after the account merge before any later domain integration.

The next domain assignment is still a separate exposure-sensitive step. Current
`.us`/`www` assignment points at the older Production destination; fixing website
DNS as-is can expose that old site. Later bind `.us` only to the exact reviewed
Preview/dev destination and verify authentication on the actual custom hostname
before DNS/public access. Do not assume a protection setting for a generated
Preview URL proves a differently classified custom domain stays private.
Removing protection/making `.us` public remains a separate launch decision.

Sources checked for these operations:
[Vercel Auth scope](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication),
[exact domain exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions),
and the published `https://vercel.com/openapi.json` schemas. No paid feature or
subscription was enabled. Keep the candidate protected; do not restore SSO to
null while the hosted Preview exists.

## Hosted-action freeze and local Candidate v5

The parent clarified that v4's project-wide Preview protection effect required
Brandon's confirmation first. Independent review did not substitute for that
confirmation. Subsequent read-only audit reported the original/current settings
and affected URLs. No further security or hosted change is authorized while
Brandon decides; preserve the existing hosted state and all work. Historical v4
records describe actions taken, not ongoing authority to change protection.

Goal source: delegated local-only follow-up, reconcile the domain candidate
against dev `3519c001e9594233fd992e4a0a982eb6adea90e3`, preserve its dashboard and
`/account/reviews` link, retest and independently review. No hosted settings,
deployment, security, Production, DNS, remote Git write or dev update.

Candidate v5:

1. Fetch/read current remote dev and verify the requested commit. Merge exact
   `3519c00` additively into this isolated `codex/plan-domain-transition` branch;
   do not rebase, rewrite the recorded base, update primary dev, push or deploy.
   There is no path overlap between the dashboard integration's nine changed
   files and the domain candidate's executable changes. Resolve only necessary
   merge conflicts; any behavioral conflict returns to independent review.
2. Prove the dashboard component, account styles, customer fixture and existing
   presentation/browser test files are byte-identical to requested dev after
   composition. Verify the dashboard's `/account/reviews` link remains present.
   Preserve origin allowlisting, localhost defaults, legacy callbacks/checkout,
   CSRF and private-data/payment/idempotency proof.
3. Run affected domain/Auth/checkout and customer presentation tests, lint,
   typecheck and the complete ordinary default-worker Vitest suite under normal
   load. Use the owned local production-artifact runner with the existing safe
   public-only catalog configuration and `.us` origin to rebuild the combined
   source and run full Chromium, including dashboard desktop/mobile/keyboard and
   the reviews link. No real login, token exchange, customer send or purchase.
   Preserve the eight SQL tests' prior dedicated-fixture evidence; migrations
   and database code are unchanged, so repeat DB suites only if composition
   creates a new concern.
4. Commit the local candidate, run `prepare`, then obtain independent Spec and
   Standards diff reviews against exact dev `3519c00`. Record exact source,
   passed/failed/skipped checks and remaining hosted blockers. The existing
   hosted Preview stays frozen at reviewed source `929fd47`; no redeployment.

Both independent reviewers must approve v5 before the local merge.

V5 plan independently approved before merge by `/root/domain_spec_review` and
`/root/domain_standards_review`, 2026-11-16. Both verdicts approve, no actionable
findings. Exact final comparison remains `3519c00`; hosted-action freeze remains
unchanged and no reviewer can replace the required user confirmation.

## Candidate v5 composition and local verification outcome

Local merge candidate `37d43918649337c6e9248e7b8e618c2802d2799c`
incorporates exact dev `3519c001e9594233fd992e4a0a982eb6adea90e3`
additively, without conflicts. All nine paths introduced by dashboard PR #510
are byte-identical to that dev commit, including all three dashboard evidence
files; composition proof is `/tmp/helix-domain-v5-composition.json`.
The Reviews panel retains its `/account/reviews` link. No domain executable or
database changes were introduced by the composition. The unrelated dirty primary
checkout remains on local dev `2e2f3ac`; it was not edited or updated here.

Independent Spec (`/root/domain_spec_review`) and Standards
(`/root/domain_standards_review`) source verdicts: **approve**, no actionable
source findings, comparison exact `3519c00..37d4391`. These approvals do not waive
verification failures or authorize any remote action.

Passed checks on the reconciled source:

- Focused Auth/origin/checkout/cold-canonical/customer presentation coverage:
  202 tests, 13 files; `/tmp/helix-domain-v5-focused.log`.
- Lint and typecheck: exit 0; `/tmp/helix-domain-v5-lint.log` and
  `/tmp/helix-domain-v5-typecheck.log`.
- Complete ordinary default-four-worker Vitest: 2873 passed, 293 files;
  eight existing dedicated-SQL-fixture skips in one file, no worker error.
  `/tmp/helix-domain-v5-vitest.log`. The prior workflow-tools reporting timeout
  did not recur; its reviewed event-loop yield remains in the candidate.
- Fresh local configured-`.us` build `Dv5rGr5bFKqr-K-RUfaZ0`, owned loopback
  server identity verified at `http://127.0.0.1:63481`, cleanup passed.
  Cold `/products/beaming-prep` returned 200 with canonical and JSON-LD URL
  `https://www.helixskin.us/products/beaming-prep`.
- Dashboard Chromium coverage passed at 1440x1000, 390x844 and 320x640, including
  keyboard toggles, draft preservation and synthetic local exit. Screenshots
  are preserved with the full report below. In-app browser inspection of
  `/helix-verification/customer/account?state=empty` opened Reviews and confirmed
  the visible “Your public product reviews” link to `/account/reviews`.
- `git diff --check` and task-helper `prepare` passed. The helper's immutable
  recorded local base remains `2e2f3ac`; review uses explicitly requested dev
  `3519c00`, without rewriting the recorded task metadata.

Browser verification is **not clean**, despite the full runner's exit 0:

- Full Chromium: **206 passed, three existing catalog skips, one flaky** out of
  210 tests. The HTML report records `ok:false`; do not treat retry success as a
  clean integration gate. `/tmp/helix-domain-v5-production.log`.
- Flaky test: `e2e/pdp-effects.spec.ts:431`, mobile native Hydration swipe.
  Initial and first retry failed the line395 monotonic scroll assertion
  (`expected >=83`, `received 80`); second retry passed.
- A second fresh owned build `iStC4ZfTjFqS25xD1Vf90` repeated that exact test
  five times with retries disabled and unchanged assertions: **four passed,
  one failed**, same assertion. Runner exited 1 and cleaned up its loopback
  server. `/tmp/helix-domain-v5-swipe.log`; isolated results
  `/tmp/helix-domain-v5-swipe-results`. Local command:
  `pnpm exec tsx /tmp/helix-domain-swipe-verify.mts`.
- The preserved first-retry trace records rail x positions
  `85,85,85,84,80,74,65,55,43,31,20,11,5,1,0`, then 0, around touch release.
  Page y remains 2054, rail height156 and top494.1875. This is evidence of a
  native rail snap-back, not a diagnosed cause. Neither unchanged PDP source
  nor account-scoped styles proves it unrelated to this composition. No test
  tolerance, retries, production gesture behavior or assertions were changed.
  Trace and extracted frame data:
  `/tmp/helix-domain-v5-full-verification/test-results/pdp-effects-mobile-serum-e-c666d-les-without-moving-the-page-chromium-retry1/trace.zip`
  and `/tmp/helix-domain-v5-swipe-trace-summary.json`.
- Full report, screenshots, cold-origin evidence and original build ID preserved
  under `/tmp/helix-domain-v5-full-verification` before focused diagnostics.
  Full local run command: `pnpm exec tsx /tmp/helix-domain-verify.mts`.
- Three catalog skips remain the rich PDP available variant, two-Product
  Quick Buy viewport and rich PDP sticky purchase; the anonymous catalog lacks
  their required Offers. They are explicit limitations, not waived proof.

Not rerun in v5: the five previously passing maintained local Postgres suites
and their eight SQL-backed tests. Database and migration paths are unchanged;
prior dedicated synthetic-fixture evidence remains applicable as approved in
v5's plan. Hosted Auth, real login/token exchange, customer mail, live purchase,
CI integration gate, redeployment and custom-domain exposure were not run.

The local reconciliation is ready for an honest handoff; **integration or
deployment readiness is blocked** by the reproducible native swipe check and
requires the appropriate scoped repair/review and verification. Both independent
reviewers explicitly agree that a local checkpoint is permissible while this
blocker is recorded, and that retry success cannot waive the gate.

No hosted settings, deployments, security controls, Production, DNS, remote Git
writes, campaigns, tracking or payment flags changed during v5. The existing
hosted Preview remains frozen at source `929fd47`, without the account merge.
Keep it distinct from this local candidate. Brandon's project-wide protection
decision remains with the parent; do not alter or restore settings automatically.


## Existing-Production destination decision and read-only exposure inspection

The latest parent delegation relays Brandon's explicit destination choice:
`helixskin.us` connects to the existing Vercel Production deployment while
`helixskin.vercel.app` remains dev; a separate worker owns DNS. This supersedes
earlier proposals to move `.us` to Preview. No dev promotion, security/protection
change, deployment or DNS mutation is authorized in this worker. Both independent
reviewers approved this documentation-only delta, including correction of the
runbook's blanket historical no-remote-changes claim. V4 actions remain recorded.

Read-only Vercel inventory at 2026-11-16T03:06:14.500Z confirms Production
`dpl_FJ5YpBEjrFzZo7C73Zia4S56exgj`, READY, source `ca88cde` (August31), created
2026-09-01T22:42:36.913Z. Historical source ref `dev` does not make this a current
dev deployment. Stable legacy alias serves `dpl_aKJ3ioofSj55aH13qEwzGVyMJmVj`,
source `3519c00`; current remote dev/main read-only refs are `3519c00`/`74ce8bd`.
Project protection remains Preview SSO and the existing legacy alias exception;
no security settings were changed. Sanitized inventory:
`/tmp/helix-domain-vercel-preflight/production-read-sanitized.json`.

Production's old source is 229 commits behind requested/current dev; the source
comparison changes 1187 paths, including 32 migration paths. This says nothing
about current hosted schema and authorizes no migrations. Current dashboard,
public reviews and newer service code are absent from this source. A local
execution of its original `lib/site-url.ts` proves all three controlled
production environment/request origins resolve to `https://helixskin.vercel.app`.
Old signup/recovery and checkout return construction use that resolver.

Anonymous GET snapshot at 2026-11-16T03:09:29.802Z: generated Production and
stable dev return200, both canonical legacy; both `.us` names from this machine
still return parked 114-byte non-Next HTML. Snapshot:
`/tmp/helix-domain-vercel-preflight/production-probe-sanitized.json`.
DNS is owned elsewhere and may change later. No Auth token, session, send,
checkout creation or payment was exercised. Runtime compatibility is unproven;
source predicts legacy destinations and possible cross-host PKCE/cookie failure.
The updated operations runbook states the chosen split and safe service sequence.

Local candidate79cb69b/source37d4391 remains undeployed, source-approved and
browser-blocked as above. This inspection made only GET requests and local
source reads/checks; it did not change provider environment, deployments,
protection, aliases, domains, DNS, data, campaigns, payment modes or remote Git.


## Candidate v6 — native swipe timing repair (local only)

The parent authorized investigating the reproduced Chromium failure and a narrow
fix if justified, without weakening assertions or changing hosted state, dev or
Production. Independent Spec and Standards reviewers first approved diagnosis,
then approved the exact test-only implementation delta described below.

The failed v5 trace's last synthetic move preceded release by about 125 ms;
the intended 100 px fast flick is below half the 322 px card stride. The test waits
for serial CDP acknowledgements and several assertions before releasing.
A plain native CSS scroll-snap control and the application were compared in a
matched touch-enabled 390x844 Chromium context through the owned local runner.
The final 18-trial diagnostic has nonnegative browser event timestamps:

- Native and application with an added 125 ms dwell: each 3/3 snap back to x 0;
  last-move-to-release event gaps 146–173 ms.
- Native and application with explicit nominal 5 ms event cadence despite the
  same host round trips: each 3/3 advance to x 322, event gaps 4.9–5 ms.
- Untimestamped native immediate release also snapped back once when its
  unintended event gap reached 108.6 ms. A scheduled host-side 5 ms wait does not
  establish a 5 ms browser input cadence.

Evidence: `/tmp/helix-domain-v6-swipe-diagnosis.json` and
`/tmp/helix-domain-v6-diagnose-final.log`, owned build
`0yM0UFCdMGZDxd904tzJr`; server identity and cleanup passed. An initial diagnostic
stopped because its browser context lacked touch support; another exploratory
variant used timestamps before the new document's time origin, which clamped
them to 0. Those runs do not support the final timestamp conclusion; their logs
remain preserved. The final run corrected both conditions.

These controls support a synthetic-input timing cause; no application gesture
repair is justified. The approved delta only supplies monotonic epoch-second
CDP timestamps to the existing fast forward and reverse flicks: start at current
UTC epoch time, moves 5 ms apart, release 5 ms after the last move. Slow gestures keep
their real-time input, including 250 ms paused-finger checks. Distances, wall waits,
all assertions/tolerances, fixtures, browser settings and production UI stay
unchanged. The existing reproduced test is the regression seam; no mirrored
unit test is added. The [official ChromeDevTools input schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl)
defines the optional touch timestamp in epoch seconds.

Before clearing the v5 blocker: run all four native-swipe cases 10 times each with
retries disabled, the complete PDP browser file, full Chromium on a fresh owned
configured-`.us` build, affected unit tests, normal full Vitest, lint and typecheck.
Preserve old failure artifacts and report remaining skips separately. SQL paths
remain unchanged, so prior dedicated database proof remains applicable. Obtain
both independent final diff reviews against source checkpoint d689688 and exact
combined dev 3519c00. This delta authorizes no deployment or hosted action.

V6 verification refinement, approved independently by both reviewers:

The first 40-case run overlapped full four-worker Vitest on this local host.
All 20 fast flicks passed; five of 20 unchanged slow drags exceeded the existing
three-frame arrow-visibility budget by one frame (35 passed, five failed).
Concurrent Vitest recorded seven timeouts in two files plus one `onTaskUpdate`
reporting timeout, taking 321 seconds. Preserve those failed logs:
`/tmp/helix-domain-v6-repeat.log` and `/tmp/helix-domain-v6-vitest.log`.
This is evidence of sensitivity under the overlapping workload; CPU contention
is a hypothesis, not a conclusively proven cause or permission to waive failures.

The reviewers approved adding a bounded JSON attachment of the already-recorded
synthetic frame samples after recording completes and before assertions. It
changes no input, sampled interval, assertion or application behavior, and keeps
future failure evidence. An isolated traced repeat of the two slow cases passed
10/10 with the unchanged three-frame limit; all attached samples show arrows
visible on the third frame. Evidence:
`/tmp/helix-domain-v6-slow-trace.log`,
`/tmp/helix-domain-v6-swipe-trace-results`, and
`/tmp/helix-domain-v6-slow-frame-proof.json`.

The required normal-load topology will now run complete unchanged four-worker
Vitest, all four gestures ten times without retries, then full Chromium
sequentially. Repository CI quality and browser jobs use separate runners.
Both reviewers require zero failures/flakes in the normal browser runs and
passing unchanged unit/static/build checks before local repair completion.
Retain the concurrent stress limitation even if these checks pass. No runtime
arrow change is justified by the current evidence. Any normal-load recurrence
remains a blocker requiring further diagnosis.


## V6 release-owner handoff checkpoint

Parent delegation reports Brandon now authorized current dev to Production;
release task `6afa7b47-533c-8191-bc49-e3bfa19120d8` owns merges/deployments and must
resolve its exact release SHA. This worker remains forbidden to promote, deploy,
change hosted/security settings or DNS. Keep dev `helixskin.vercel.app` and
Production `.us`/`www`. The runbook now states the exact integration and
Production-only origin/Auth/firewall/email dependencies. The local candidate is
not in dev and is not selected for integration merely by authorizing dev's
promotion.

Reviewed source `b0b7a827177ef0763ec04c1b63460317a6607570` retains all nine dashboard
paths and all 234 original PDP assertion calls. Proof:
`/tmp/helix-domain-v6-composition.json` and
`/tmp/helix-domain-v6-assertion-proof.json`. Both independent reviewers approve
source deltas `d689688..4d7bbc5` and `4d7bbc5..b0b7a82`; no actionable findings.

Passed: all four native-swipe cases ten times, retries disabled, **40/40**, on
fresh configured-`.us` owned build `mKrtxUU8sKXkAGaonax3d`, loopback port 50394,
identity/cleanup passed. Log `/tmp/helix-domain-v6-repeat-sequential.log`;
traces/frames `/tmp/helix-domain-v6-repeat-sequential-results`. Final named lint
and typecheck both exit 0 (`/tmp/helix-domain-v6-final-{lint,typecheck}.log`).

Failed: even without concurrent browser work the complete ordinary four-worker
Vitest has nine timeouts in two files, plus one `onTaskUpdate` reporting timeout;
291 files/2864 tests passed, eight existing SQL-fixture skips, duration 316.94s.
Affected files: `tests/catalog-editor-sections.test.tsx` and
`tests/storefront-reconciliation.test.ts`. Log
`/tmp/helix-domain-v6-vitest-sequential.log`. This withdraws any concurrent-only
explanation. A read-only host snapshot showed unrelated heavy CPU use and about
7.8 GB swap used; pressure is plausible, not proven causal. No process, timeout,
worker count, assertion or application behavior was changed. Both reviewers
require a materially changed condition before repeating this same unit run.
Earlier 2873-pass v5 evidence does not substitute for the failed current gate.

Full Chromium after v6 is pending at this checkpoint; prior v5 evidence remains
206 passed/three prerequisite skips/one flaky, not a clean replacement. Prior
unchanged dedicated DB evidence is retained; no migration or database source
changed. **Local verification and integration readiness remain BLOCKED.**
The release owner must receive the exact failed and passed results, not a
completion claim. The latest full-browser outcome will be appended separately.


## V6 final browser result and blocked release handoff

Complete owned configured-`.us` verification on source-delivery checkpoint
`b7857fd` built `e675hhIlDN4fWDBbIk8eU`, verified loopback port 50931 and finished
cleanup successfully. Cold `/products/beaming-prep` returned 200 with the selected
`https://www.helixskin.us` canonical and structured-data URL. The browser suite
ran 210 tests: **206 passed, three existing catalog prerequisites skipped, one
flaky**. All 12 PDP effects tests, including all four native swipes, passed their
first attempt; combined with 40/40 retries-disabled repetitions, the original
synthetic fast-swipe regression is verified without weakening assertions.

The new remaining browser blocker is
`e2e/customer-surfaces.spec.ts:253`, “account disclosures retain drafts, support
keyboard toggling and local exit”. The first attempt exceeded the 30000 ms test
budget during Reset password navigation: expected `/account/forgot-password`,
but the URL remained the synthetic account fixture. Retry 1 passed. The dashboard
source/test files remain byte-identical to incorporated dev `3519c00`. Neither that
fact nor retry success establishes a harmless or resolved cause. The HTML report
has `ok:false` despite runner exit 0. No dashboard behavior, test timeout, retry,
assertion or tolerance was changed to hide it. Hand this exact failure to the
release owner/account owner; it is outside the reviewed swipe timing repair.

Final logs/artifacts:

- `/tmp/helix-domain-v6-production.log`
- `/tmp/helix-domain-v6-full-verification` (report, screenshots, traces, original
  build ID and cold-origin evidence preserved)
- `/tmp/helix-domain-v6-browser-summary.json`
- `test-results/domain-release-handoff.json` (local ignored delivery metadata,
  written after the final checkpoint to include its exact Git SHA)

The three catalog skips retain their prior reasons: rich PDP has no Offer for
available-variant/sticky-purchase checks, and the catalog lacks two collection
Products with Offers for cross-Product Quick Buy. No catalog mutation was made.
Prior dedicated SQL-fixture suites were not repeated because all database and
migration source remains unchanged. Actual hosted Auth/cookie/email/checkout
proof, remote integration gates and production release are not performed here.
Local full run command: `pnpm exec tsx /tmp/helix-domain-verify.mts`.

**Final readiness: BLOCKED**, with nine current unit timeouts/reporting error
and the dashboard browser flake unresolved. The narrowly reviewed test repair
and domain candidate are local only. Both prior failed unit runs and the first
35-pass/five-fail concurrent swipe run remain part of the evidence; the later
40-pass run does not erase them or prove host-pressure causality. Further unit
retry requires a materially changed condition or new diagnostic evidence.

Both independent reviewers approved the exact source changes and release-owner
handoff structure. Final evidence review must preserve this blocked conclusion,
not grant a failure waiver. Task `6afa7b47-533c-8191-bc49-e3bfa19120d8` owns all
integration/deployment decisions and must select/verify the exact combined SHA.
The reviewed local runtime source remains `37d4391`; v6 only repairs synthetic input
timing and retains completed frame evidence. No remote Git writes, hosted
configuration, deployments, security controls, Production/dev aliases, DNS,
provider data, campaigns, tracking, support copy or payment modes changed here.
