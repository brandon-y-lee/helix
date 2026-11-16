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
