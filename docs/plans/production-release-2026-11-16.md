# Production release readiness — 2026-11-16

Status: **blocked; no production promotion or remote mutation performed**.

## Goal, authority, and pinned source

Brandon's room message `Sentinel_d7c41fbd76a8819188b128a97808eb10`,
2026-11-16 03:38:09 UTC: “Let's move the current dev to production.” The
delegated scope permits necessary source integration, merges, and production
promotion at `helixskin.us` / `www.helixskin.us`, preserving
`helixskin.vercel.app` as dev. It excludes paid transactions, payment-setting
changes, campaign activation, real customer email, and security-setting changes.

Fresh GitHub `ls-remote`:

- dev: `3519c001e9594233fd992e4a0a982eb6adea90e3`.
- main: `74ce8bd95c3f1df0831969c6ce7fe788b11501e3`.
- Domain candidate reviewed: `b7857fd2e7bcac91db9055a3b783db89f2195b53`
  in `/tmp/helix-domain-transition`. That active worktree was read only.
- Email compatibility branch `ba1cb2d` remains excluded.

The required helper started `codex/plan-production-release` in isolated
`/tmp/helix-production-release`, then fast-forwarded it additively to pinned
dev. The dirty primary checkout and all unrelated work were preserved.

## Fresh hosted evidence

Vercel project `prj_N9nyPL9SixJHOROIovS8PDQ9aKny`, production branch `main`:

- Existing Production: `dpl_FJ5YpBEjrFzZo7C73Zia4S56exgj`, READY,
  source `ca88cded8c8d2ac2d069db40928a0026f0319ae6`.
- Dev alias: `dpl_aKJ3ioofSj55aH13qEwzGVyMJmVj`, READY,
  source `3519c001e9594233fd992e4a0a982eb6adea90e3`.
- Apex is verified and redirects 308 to www; the path and query were retained
  in a fresh `/account/sign-in?next=%2Faccount` request. www is verified and
  remains assigned to Production. The Vercel dev domain remains assigned to dev.
- Preview SSO remains `{ "deploymentType": "preview" }`. Password and trusted
  IP protection remain disabled. No protection/bypass/alias policy was edited.
- Active WAF config version 2, `waf_V54CTCu2lXFP`, has no draft. Active rule
  `rule_helix_sandbox_checkout_origin_mP8rZo` denies non-dev hosts for both
  path-prefix and resolved-route `/api/checkout/sessions` conditions. Fresh
  GETs returned 403 on www and 405 on dev. No checkout Session was created.

Sanitized local evidence (not source or customer-data artifacts):

- `/tmp/helix-release-evidence/vercel-audit.json` — deployment/domain mapping,
  narrow safe configuration values and environment-key scopes.
- `/tmp/helix-release-evidence/firewall-summary.json` — relevant active rule.
- `/tmp/helix-release-evidence/runtime-probes.json` — 31 read-only public GETs.

## Independent reviews

Both reviewers independently inspected exact dev and domain-candidate commits;
neither authored or implemented them. No review conclusion was shared between
the reviewers before their verdicts.

- Spec: `/root/release_spec_review`, **blocked** for promotion.
- Standards: `/root/release_standards_review`, **blocked** for promotion.

Both found the narrow domain compatibility source sound but not integrated or
fully verified. Their actionable release findings remain unresolved:

1. Dev `lib/site-url.ts:29` forces deployed public URLs to dev. Integrate the
   reviewed compatibility candidate through applicable workflow and green
   gates, then build with verified Production origins. Do not promote a
   Preview artifact carrying dev values.
2. The domain candidate's latest handoff records nine full-suite unit timeouts
   in two files plus a reporting timeout. Complete post-v6 Chromium is pending.
   The focused retry-free 40/40 swipe result is not a replacement gate. No
   failed/flaky/skipped proof is waived. A separate green dev-to-main PR and
   staging inspection remain mandatory.
3. `components/support/ContactPageContent.tsx:16`, Privacy, Accessibility,
   Cookies, Terms, and privacy-choice UI use `support@helixskin.com`; the tested
   inbox is `support@helixskin.us`. Correct and review the actual published
   destination, or independently verify the existing one.
4. `content/legal/terms.tsx:106-122` promises shipping within 5–7 business days,
   tracking messages, free returns/prepaid labels, refund issuance within two
   business days and arrival within 7–12 days. `content/support/faq.ts:146-199`
   says shipping/refunds are unavailable and timing is only a planning
   assumption. `components/support/ReplyCountdown.tsx:42` independently promises
   a response deadline. Reconcile against verified operations. The already
   decided 30-day return-request window and case-by-case opened-product rules
   are preserved and are not reopened.
5. Privacy retention/deletion/international-transfer assertions need factual
   operational evidence. Accessibility's “maintain compliance” with WCAG 2.1
   wording is not supplied conformance evidence and differs from the repo's
   WCAG 2.2 AA target. No legal conclusions or replacement promises were invented.

## Provider and schema prerequisites

Supabase MCP read-only migration and pg_proc inventory verified project
`erasogmsqpgiirovubjh`. Hosted migration inventory ends at
`20260929075433_support_retention`; November lifecycle/review migrations are
absent. Function inventory contains old `confirm_marketing_subscription` and
`support_intake_available`, but not `confirm_marketing_subscription_scoped`,
`read_lifecycle_offers`, or `has_review_winback_offer_v1`.

Disabled review/lifecycle paths mostly guard before newer RPCs. Missing optional
offer RPCs produce an unavailable state caught by CheckoutPanel. Do not apply
all migrations or activate features merely to deploy source. However,
`lib/marketing/storage.ts:42` uses the absent scoped confirmation RPC even for
legacy welcome links, and `lib/marketing/requests.ts` does not require a
marketing-enable flag for confirmation. Resolve legacy confirmation compatibility
with a narrowly reviewed source or schema remedy; do not rewrite issued links
or send test customer messages.

Last recorded Auth configuration is dev Site URL plus exact dev/local callback
and confirm entries, no www entries. The in-app browser redirected to Supabase
sign-in during this audit; this configuration was not freshly reverified here.
Before release, verify current state and prepare only exact
`https://www.helixskin.us/auth/callback` and `/auth/confirm` additions while
retaining existing entries. The [Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls) requires matching permitted
redirects and recommends exact production paths. The changelog was checked;
no CLI/SDK upgrade or hosted Auth mutation was attempted.

The active checkout-host rule requires separately authorized security changes
if .us is expected to create sandbox Sessions. Preserve the dev host and all
settlement paths. No broad protection change is an acceptable substitute.

Production lacks the Preview/dev-only support/email configuration set. Preserve
disabled production sending/marketing/review/campaign states; do not copy dev
enablement flags or activate native templates/schedules/coupons. Dev's verified
support intake is available, marketing readiness is false, and its existing
email mode is restricted sandbox. Production support intake currently returns
404 from the old source. No payment config or webhook destination was changed.

Automatic approval review rejected a full Production environment export because
it could extract unrelated credentials. It was not executed or retried. The
safer audit reads only selected origins/enablement values and configuration-key
metadata; no credentials are printed or committed. Unresolved values remain
explicit rather than guessed. No user approval was sought for an unnecessary
broad export.

The narrow API could resolve dev-only values but did not resolve shared
Production `NEXT_PUBLIC_SITE_URL`, Supabase URL, `CHECKOUT_MODE`, or
`CHECKOUT_ENABLED`. Their presence is confirmed; their actual values and the
Production payment key mode are not freshly attested. A sandbox footer is not
proof of payment configuration. Establish those exact non-secret values through
a focused provider read before building or promoting; do not infer dev parity.

## Checks and observed runtime

Passed read-only checks: exact remote branch identities, current Vercel mappings,
HTTPS apex redirect/path/query, public route availability, WAF admission boundary,
Supabase metadata inventory, independent source reviews and diff-whitespace check.
Existing production canonicals incorrectly reference dev; that is an observed
release defect, not a passing canonical check.

In-app Browser, default desktop viewport: existing Production sign-in rendered;
empty basket opened and closed; Contact explicitly reports support unavailable.
Dev `/account` redirected to its sign-in with next=/account. No credentials,
forms, real tokens, support submissions, payments or emails were submitted.
Authenticated dashboard data and end-to-end Auth/mailbox/checkout settlement
were not tested. Existing source/review evidence protects the dashboard delta;
this browser smoke does not replace its required verification.

Full unit/build/Chromium/SQL suites were not rerun by the release audit to avoid
contention with the active domain work. Latest failed/pending candidate results
above remain authoritative; earlier successful results are historical only.
No new tests were added because no application/test behavior was changed here.

## Next concrete release boundary

Resolve domain candidate verification and independent delta review; integrate
through required gates. Review the narrow public-copy/contact remedies and
legacy marketing confirmation remedy. Verify Production origins and prepare a
coherent production build/environment manifest. Obtain only the missing exact
Auth/WAF security-setting authority if required. Retain both serving hostnames,
old callbacks/cookies/receipts/webhooks and the existing deployment evidence.
After green staging and dev-to-main checks, regular-merge and create/promote a
Production-built artifact at the exact reviewed commit, then repeat runtime
checks. Follow the compatibility runbook's issued-link-aware rollback; do not
blindly roll back to this pre-compatibility deployment after issuing .us links.

Local run command after a task-local dependency/environment setup:
`pnpm dev --hostname 127.0.0.1 --port 3210`. No local server was started by this
read-only audit. Skills used: Supabase, code-review, repository code-reviewer
(universal/TypeScript rules in independent reviews), repository senior-devops.
