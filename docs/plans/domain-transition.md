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
