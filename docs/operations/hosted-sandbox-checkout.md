# Hosted sandbox checkout rollout

This is the bounded #408 / #413 rollout. Stripe's public HTTPS destination
settles payments; no local RPC, Stripe listener, worker or scheduler is needed.
The maintainer owns exception recovery using [the recovery runbook](./sandbox-checkout-recovery.md).
Live payments, fulfillment, customer email and promotion to `main` remain outside
this approval. `in_stock` below is a sandbox fixture, not physical inventory.

## Fixed target and preflight

| Resource | Approved identity |
| --- | --- |
| Vercel team / project | `team_uriJjJWNwpZnZHnIp5AiXuv0` / `prj_N9nyPL9SixJHOROIovS8PDQ9aKny` |
| Repository / staging branch | `brandon-y-lee/helix` / `dev` |
| Staging origin | `https://helixskin.vercel.app` |
| Supabase | `erasogmsqpgiirovubjh` (non-production) |
| Stripe sandbox | `acct_1Tm9WRFEzyaKzdmq` |
| Webhook | `we_1U6GHJFEzyaKzdmqVxkG9jRC`, staging origin + `/api/webhooks/stripe` |
| Stripe API | `2026-06-24.dahlia` |
| Product / Variant | `f6091deb-1177-45ad-b506-1f0427fa4abe` / `4f6e0f65-46e7-4b6c-9b67-e0a07ad63e49` |

Before each remote mutation re-read its resource identity and current state.
Record deployment ID, exact Git SHA/ref and alias mapping; a successful build or
historical hostname observation is insufficient. Use the authenticated official
Vercel CLI (`vercel api`) so it owns credential refresh. Never extract its cached
token or print decrypted environment values. Preserve unrelated configuration and
stop if another operator has pending changes.

Run `pnpm stripe:sandbox:verify` with the approved endpoint ID. It must report the
existing endpoint and four coupons unchanged. Keep the five subscribed events:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
Do not create or rotate an endpoint. The signing secret must be the existing
endpoint's sensitive **Preview / dev** variable, not a local CLI signing secret.
Metadata proves the secret's source; actual signed provider delivery proves it works.

## Restrict old storefronts before publication

The 2026-09-19 inventory found 95 deployments in the Helix project, with no Vercel
Authentication protection. Both the stable staging origin and the older production
alias reached checkout's empty-cart check. They therefore cannot be assumed to have
admission disabled. Other inventoried projects (`piberkeley`, `cbas`) had unrelated
repositories and no Supabase/catalog environment entries. Recheck known consumers
before applying; do not publish if another unprotected consumer is found.

Use the existing Vercel firewall to deny Session creation on every Helix hostname
except the fixed staging origin. The exact rule is
[`sandbox-checkout-host-rule.json`](../../scripts/vercel/sandbox-checkout-host-rule.json).
It covers both the request path and resolved framework route, including old
immutable deployments. It does not block webhooks, receipts, cancellations or
refund settlement. Custom rules are included on Hobby (three rules); no plan
upgrade or paid resource is authorized. See [Vercel rule configuration](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)
and [limits](https://vercel.com/docs/vercel-firewall/vercel-waf#limits).

1. Read `vercel firewall status --json` and `vercel firewall diff`, passing the
   fixed project/team. Stop for unrelated unpublished changes, an existing rule
   with different conditions, or a rule/plan limit. If the exact active rule
   already exists, verify it; do not add a duplicate.
2. Stage only this JSON with `vercel firewall rules add --json`, enable the
   firewall if necessary, and inspect the resulting diff. Preserve other rules.
3. Publish the inspected draft using `vercel firewall publish`. Re-read active
   configuration and confirm the rule and firewall are enabled.
4. An anonymous empty-cart POST to an old deployment and each current non-staging
   alias must receive the edge deny response. Check trailing-slash and encoded-path
   forms too. The stable origin must reach Helix. The webhook health route must
   remain reachable on staging. If these fail, stop before catalog publication.

Keep this rule through rollback. Changing project environment variables alone
does not disable already-built immutable deployments.

## Deploy and apply the reviewed database changes

Premerge previews may exercise controlled fixtures and negative HTTP boundaries;
they must not publish the shared canonical offer. Complete all Ticket reviews and
gates, then Combined Spec Review and `integration-gate`. Regular-merge the Spec
into `dev`. Final activation uses that exact integrated SHA.

1. Set **Preview / dev** `CHECKOUT_ENABLED=false`; keep provider credentials for
   settlement. Set `CHECKOUT_MODE=sandbox`, `CHECKOUT_ORIGIN` and
   `NEXT_PUBLIC_SITE_URL` to the fixed origin, and `STRIPE_ACCOUNT_ID` to the approved
   account. Retain the existing server secret, webhook secret, shipping rate,
   coupons and approved Supabase configuration. Rebuild `dev`, verify the exact
   deployment/alias, and confirm new checkout is disabled.
2. Compare remote migration history to the reviewed files. Apply only missing
   additive migrations in order, through Supabase's migration mechanism:
   `20260918234958_checkout_admission`,
   `20260919001919_checkout_payment_contracts`,
   `20260919002000_checkout_receipts`,
   `20260919102757_checkout_single_send`.
   Verify each recorded application before proceeding. Never apply the removed
   #411 inbox/scheduler migration, replay an applied migration, reset data, or
   rewrite migration history. Confirm private RLS and narrow service-role grants.
3. Re-read provider/account and endpoint facts. Resend an existing sandbox event
   from Stripe Dashboard to the hosted endpoint. Confirm signed acceptance and
   durable completion, then resend the same event and confirm deduplication.
   An invalid signature must be rejected. Retain sanitized delivery timing and
   status; a health GET does not prove settlement.
4. Verify the deployed Node webhook's 60-second configured limit. Measure actual
   settlement latency in the hosted rehearsal; provider/database errors must return
   non-2xx for Stripe retry. Keep admission off if successful processing approaches
   the function deadline or any required ownership/recovery check fails.

## Publish the single sandbox offer

Use `node scripts/catalog/publish-super-serum.mjs --help`. `plan` and `verify`
are read-only. Pass `--actor <existing-admin-uuid>` and
`--expected-revision <base-revision>` with `plan`, `apply` or `verify`. Keep the
same base revision for retries and verification. The default target is `available`;
`--target coming_soon` runs the same audited flow for rollback. Supply the real
current Catalog Administrator's actor ID and the fresh base revision. Recheck membership; never invent an actor or
replace another operator's open Draft. A raced existing Draft is also a stop.

Only these values may change, through the actual Catalog Draft → validation →
Ready → Publish service and optimistic concurrency:

| Field | Before | After |
| --- | --- | --- |
| Product `status` (merchandising) | `coming_soon` | `available` |
| Existing 30 mL Variant `available` | `false` | `true` |
| Variant `inventory_status` | `unavailable` | `in_stock` |

Preserve `catalog_status=active`, slug `super-serum`, SKU `8809672285263`,
`variant_key=30ml`, USD 2500 cents, all IDs, copy, media and all other products.
Record the audited new Published Revision and exact diff. A repeat apply must
verify the desired state without making another revision.

CLI publication cannot invalidate Next's hosted cache directly. Treat its
downstream-verification report as unfinished work: verify the established Supabase catalog webhook
delivery, hosted cache revalidation and Algolia reconciliation. Use existing
`catalog:webhooks:verify`, `catalog:webhooks:smoke` and `product:search:verify`
tooling with freshly verified targets. PDP, listing, search, Quick Buy and cart
must all show the same available $25 offer. Do not directly patch catalog rows.

Enable **Preview / dev** sandbox admission only after the preceding delivery,
ownership and recovery checks pass; rebuild and verify the same integrated source
SHA and origin again. Preserve visible sandbox/no-fulfillment messaging.

## Hosted acceptance and evidence

Stop all task-owned local listeners and development servers. Use `@Browser` at
desktop and mobile widths, keyboard and touch. Use only controlled sandbox
identities and Stripe test payment details. Do not send customer messages or
request shipment. Record private provider/Order references only in private evidence,
with redacted totals, outcomes and timing in the Ticket.

| Rehearsal | Required observation |
| --- | --- |
| Guest and Account checkout | One verified sandbox Order; correct merchandise, shipping, tax and discounts; different shipping/billing addresses preserved |
| Cancel, decline, authentication challenge | Truthful state; no premature paid claim, cart clearing or duplicate Session |
| No browser return | Webhook alone settles; private Order subsequently agrees |
| Duplicate delivery / failed-delivery resend | Same completed Order and reward/referral effects; failures repaired through Stripe Dashboard |
| Admission off after Session creation | Accepted payment still settles; new Session creation is refused |
| Rewards award, redemption, retry and cancellation | Existing program economics; no duplicate ledger effects or released uncertain reservation |
| Other guest / wrong Account / missing receipt | Uniform unavailable response; no private Order, address or payment facts |

Keep pending states truthful while provider verification is incomplete. Partial
refunds, spent-points debt, live fulfillment and generalized recovery remain live
rollout blockers. Append final exact-SHA hosted evidence to #408 before closing it.
If browser tooling or remote setup blocks acceptance, leave #408 open and identify
the missing proof. Passing source CI alone is not completed hosted activation.

## Rollback

Disable new admission and rebuild the same reviewed source; retain payment
credentials, webhook settlement and immutable history. Through a new audited
Catalog Publish, return only the three offer fields above to their prior values,
preserving any later unrelated edits and refusing conflicting Drafts. Reconcile
cache/search again. Keep the host restriction. Never delete financial records,
reset rewards or undo migration history to hide a failed rehearsal.
