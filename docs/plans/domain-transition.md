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
