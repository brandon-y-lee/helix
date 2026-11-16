# Stripe production readiness and Super Serum checkout

Status: approach **approved by the owner on 2026-09-18**, following independent full-stack peer approval after revisions. Shared understanding is approved; detailed Spec and Ticket approvals remain pending. This document is not live-mode or production-promotion authorization. [Independent review and resolved findings](./payment-production-peer-review-2026-09-18.md).

Date: 2026-09-18. Source baseline: `dev` at `17785d55815ca0caf12b04fb7659042a40f86cfc`. Planning worktree: `/private/tmp/helix-payment-production-plan`, branch `codex/plan-payment-production`. [Official documentation research](./stripe-production-documentation-2026-09-18.md).

## Outcome and recommended scope

Make the existing Stripe-hosted Checkout reliable for real commerce, then launch Super Serum as the first purchasable product. Prove the complete purchase flow on hosted sandbox first. Keep Supabase authoritative for offers, carts and orders; keep Stripe as payment provider. Do not replace the working hosted Checkout with Elements or introduce a second product catalog.

Recommended first live release: Super Serum 30 mL, current USD 25.00 offer, US shipping, cards and eligible card wallets only. Tax treatment, shipping charge/threshold, real stock, launch hostname and production data project are owner decisions, not inferred commercial facts. Defer delayed payment methods and customer-facing automated refund tooling until deliberately approved. Recording provider-side partial refunds, handling disputes operationally, and preserving financial/reward correctness are still launch requirements.

The approved approach starts with hosted sandbox availability at the existing $25/30 mL offer; making the offer public is an implementation-stage publication, not a side effect of this research. The user already requested Super Serum availability; do not request duplicate permission once its implementation scope is approved.

## What is already true

- The local command `stripe listen --forward-to localhost:3000/api/webhooks/stripe` forwards development webhooks. It is not a production dependency. A hosted application receives events at a registered public HTTPS endpoint. Supabase `.rpc(...)` calls invoke database functions on the configured Supabase project; they are not a laptop-hosted payment service. [Stripe webhooks](https://docs.stripe.com/webhooks)
- Fresh read-only Stripe inventory found the approved sandbox account `acct_1Tm9WRFEzyaKzdmq` and exactly one enabled test webhook `we_1U6GHJFEzyaKzdmqVxkG9jRC`, at `https://helixskin.vercel.app/api/webhooks/stripe`, pinned to `2026-06-24.dahlia`. Its five events are completed, async success, async failure, expiration, and `charge.refunded`. Current endpoint configuration does not prove a new payment completed successfully.
- Public HTTP reads returned 200 for `/products/super-serum`, `/checkout`, and webhook GET. `/checkout` contains the sandbox notice. Webhook GET only proves route reachability, not signed delivery. In-app browser startup failed twice because of its sandbox runtime; no visual browser verification is claimed.
- Fresh Supabase reads verified healthy approved **non-production** project `erasogmsqpgiirovubjh`. Super Serum Product ID is `f6091deb-1177-45ad-b506-1f0427fa4abe`; slug `super-serum`; catalog status `active`; merchandising status `coming_soon`. Existing variant `30ml`, label `30 mL`, SKU `8809672285263`, price 2500 USD cents, `available=false`, inventory `unavailable`. Latest published revision observed: 13, with no active draft. All current active products are non-purchasable. These observations must be refreshed before publication.
- Current Checkout already uses server-loaded cart prices and inline `price_data` (`lib/orders/server.ts:182-196`), immutable order lines, reservation/attempt ownership, Stripe idempotency keys, verified raw-body signatures, and database finalization functions. Preserve and strengthen these protections.
- Installed dependency declaration is Stripe `^22.3.0`; application API pin is `2026-06-24.dahlia`. Use the lockfile-resolved SDK and its types. Do not opportunistically upgrade the API or copy newer documentation payload fields without testing their version contract.

## Launch blockers found in source

| Finding | Evidence | Required outcome |
| --- | --- | --- |
| Live mode is intentionally rejected throughout the stack | `lib/checkout/config.ts`; `lib/database.types.ts:1989`; `supabase/migrations/202606250001_checkout_rewards_private_feedback.sql` sandbox enum and four sandbox-only constraints | Explicit environment contract, additive migrations, regenerated types and separate approved deployment/provider/data identities; historical sandbox rows stay sandbox |
| Checkout disablement also rejects webhooks | `lib/stripe/server.ts:30` calls config requiring `CHECKOUT_ENABLED` | Separate new-checkout admission from payment verification, webhook processing, reconciliation and refunds |
| Deployed return origin is hardcoded to staging | `lib/site-url.ts:28-29`; `lib/checkout/origin.ts` | Trusted environment-specific exact origins, no attacker-controlled Host/Origin/generated-preview fallback; align auth redirects and cookies |
| Shipping address is taken from billing details | `lib/orders/server.ts:1230-1232` | Use actual collected shipping name/address under the pinned API contract; keep billing separately; reject missing required physical-delivery data |
| Confirmation loads private order data by Session ID alone | `lib/orders/server.ts:1563-1582` | Authenticate ownership before provider lookup, finalization and private display; guest uses an opaque, signed/scoped secure token or established ownership, surviving cart clear without exposing a session-ID bearer page |
| Pending/failed confirmation can say Payment verified | `components/cart/OrderConfirmationView.tsx:55-60` | Honest pending, paid, failed, cancelled, partially refunded and refunded messaging based on authoritative state; no query-string assertion of success |
| Refund handling ignores write errors and partial refunds | `lib/orders/server.ts:1393-1450` | Durable refund records, error-checked idempotent transitions, partial/full amount reconciliation and retry-safe reward/referral effects |
| Refund after spending earned points can retry forever | rewards adjustment negative-balance guard in `20260819183701_contract_legacy_loyalty_implementation.sql:481-484`; full-refund ordering above | Reviewed debt/offset accounting or equivalent immutable accounting policy; never drop the refund or rewrite historical ledger entries |
| Claiming a webhook is treated like having completed it | `lib/orders/server.ts:1460-1558`; five-minute claim marker in `lib/checkout/stripe-state.ts` | Durable event inbox/work with explicit pending/processing/processed/failed outcomes and recovery; no irreversible ACK of unmatched Helix events |
| Stock availability is a flag, not unit inventory | `lib/cart/server.ts:249-256,400-422`; existing offer schema | Real stock authority and transactional reservation/decrement/release; no fabricated in-stock claim or overselling under simultaneous purchases |
| Checkout route lacks explicit origin and bounded body/abuse checks | `app/api/checkout/sessions/route.ts` | Same-origin enforcement, bounded input and abuse controls suitable for multiple Vercel instances, without weakening signature-based webhook entry |
| Provider totals fall back instead of fully proving the accepted quote | `lib/orders/server.ts:1200-1204` | Verify account/mode/order/session/currency/line subtotal/discount/shipping/total/tax consistency before finalization; mismatch is a durable exception requiring reconciliation |

These are code findings, not claims of exploitation or a complete security audit. Detailed audit and independent review accompany this plan. Any discovered issue that expands an approved Ticket returns for scope approval under the repository workflow.

## Target architecture and boundaries

The browser sends purchase intent to the existing Next.js checkout endpoint on Vercel. The server authorizes the cart and reserves an immutable order plus stock/rewards, creates a Stripe-hosted Checkout Session with a stable idempotency key, and redirects to Stripe. Stripe sends signed events directly to the hosted webhook; a durable event inbox and retry worker reconcile Stripe facts, atomically update payment/order state and enqueue independently idempotent downstream work. The browser return page uses the same trusted reconciliation service after owner authorization; it is optional for settlement.

Use small server modules for environment/config, provider requests, payment reconciliation, and side effects; retain the existing server-backed cart and Supabase SSR authentication. Avoid introducing a generic multi-provider framework for one provider.

Keep the approved non-production Supabase project for sandbox. Recommend a separate explicitly approved production project to isolate customers, orders, addresses, rewards/referrals, stock and payment objects. Do not point live payments at `erasogmsqpgiirovubjh` or copy test users/orders/points into production. Provisioning a production project and any costs need explicit authorization and fresh identity verification. Controlled catalog/schema promotion is separately verified; existing public reads retain cache/revalidation behavior and private data is never publicly cached.

Mode is a server-owned deployment property, not browser input. Validate expected Stripe account, mode and key permissions, endpoint identity, configured shipping/coupon economics, application origin, and Supabase project as one contract. Support least-privilege restricted keys only after verifying needed permissions and both test/live prefixes; never loosen validation to any nonempty key. Production-only live admission requires explicitly approved configuration. Preview, local and tests always reject live keys/objects. Mismatched configuration fails closed. [Stripe keys](https://docs.stripe.com/keys)

Retain the API pin while implementing behavior. Set webhook payload version deliberately as well as SDK request version. Live resources and signing secrets are provisioned independently from sandbox; do not reuse sandbox customer/coupon/shipping/session IDs or CLI signing secrets. A publishable key is needed only for browser Stripe features actually used. [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live), [webhooks](https://docs.stripe.com/webhooks)

## Proposed delivery slices and acceptance criteria

These are delivery slices for discussion, not approved implementation Tickets or published GitHub issues. After Spec approval, decompose each into small end-to-end tracer-bullet Tickets with explicit dependencies and testable customer/operator outcomes. Follow shared understanding → approved Spec → approved Ticket breakdown → Spec Branch → reviewed Ticket PRs → combined review/integration gate → dev. Production promotion is separate.

### T1 — Make sandbox settlement, privacy and confirmation reliable

Fix shipping/billing capture, success ownership (signed-in and guest, across cart clear/login transitions), truthful states, quote verification, checked writes, and independent admission/settlement configuration. Enforce checkout origin, body and abuse limits. Preserve cart-generation, session-attachment and cancellation compare-and-swap protections. Explicitly handle zero-total/no-payment-required sessions under a reviewed free-order policy or reject unsupported zero totals before session creation; do not strand them in processing.

Make the selected launch payment-method policy explicit in server-created Sessions (`payment_method_types: ["card"]` with eligible card wallets through Checkout), rather than inheriting a mutable Dashboard method set. Replace current `stripe_dynamic` attempt metadata with the actual configured policy. Gate current PDP `AfterpayMessaging` (`components/product-detail/PdpPurchaseIsland.tsx:415`) on actual supported methods; a cards-only launch must not advertise Afterpay. Test displayed payment promises against the allowed Session methods; preserve settlement for already-created sandbox Sessions with other methods.

Acceptance: forged/cross-origin requests and another customer's Session ID reveal nothing and do not finalize; differing shipping/billing addresses persist correctly; pending never says paid; mismatch cannot award points, clear cart or fulfill; disabling new checkout still allows existing paid/expired/refunded events and owned status retrieval. Signed-in and guest happy paths remain usable.

### T2a — Minimum durable payment recovery

Use a database-backed inbox with unique event/account/environment identity, lease/attempt count, recoverable failures and bounded retries. ACK only after durable receipt; a trusted scheduled worker processes pending/expired leases with monitoring and dead-letter escalation. Do not rely on an unawaited promise after the Vercel response. Supported Helix events arriving before Session attachment or payment-intent mapping stay recoverable. Unrelated verified Stripe objects can be recorded as ignored only after proving they are not Helix-owned. Missing/failed DB writes never become processed. Re-fetch current provider facts when event ordering matters.

Store only the minimal verified event envelope and provider IDs needed for recovery, not raw provider payloads. New inbox/outbox/refund/stock tables require RLS and narrow grants; workers and internal mutation functions are service-only, with safe fixed `search_path` where security-definer functions are necessary. Verify anon/authenticated denial and operator ownership/access boundaries with database tests.

Persist a Payment Attempt before requesting a Session, including immutable request identity, first-send time, idempotency key and outcome certainty. A timeout after provider creation is an unknown outcome, not a failed payment. Stripe can prune keys after 24 hours: never blindly retry Session creation beyond the proven retention window or issue a new key while the earlier outcome is unknown. Reconcile trusted provider Sessions/events using the recorded order/attempt references; if a conclusive result is unavailable, quarantine and alert for operator recovery. Only explicit proof that the previous attempt cannot still be paid permits a replacement. Test lost creation response plus failed DB attachment, missing webhook, elapsed retention window and later recovery; prove no second payable Session or charge is created. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)

Acceptance: completion without redirect, crash after inbox receipt, stale lease, duplicate concurrent events, early completion and ambiguous Session creation all recover without duplicate payment or sandbox reward effects. Token-qualify lease completion/error writes so an expired worker cannot overwrite a newer worker. Specify worker schedule, lease duration, retry bounds and escalation owner in the Ticket.

### T2b — Live refund/reward accounting and downstream work

Add idempotent partial/full refund records keyed by Stripe Refund ID with cumulative refunded amounts and failed/pending/succeeded states; preserve original accepted order amounts. Refund-before-paid, multiple refunds, duplicates and retries converge. Use immutable reward/reversal/referral entries plus a reviewed recoverable-debt offset so spent earned points cannot prevent recognizing a real refund; define restoration of redeemed points and proportional rounding for partial refunds in the Spec. Do not enable live rewards until that accounting is tested. Fulfillment and receipt work use a durable outbox with per-order uniqueness and independent retry; external effects cannot roll back settled payment truth.

Payment, refund and outbox workers must re-check current authoritative state under the applicable transaction/claim before committing effects. Test concurrent payment finalization, refund and delayed outbox delivery: stale paid work cannot re-award reversed benefits or newly dispatch a refunded/cancelled order. Already-dispatched goods enter the reviewed return/refund process; do not claim an irreversible shipment can be undone by a database transition.

Acceptance: event delivery succeeds without a browser redirect; crash after inbox receipt, stale lease, duplicate concurrent events, provider/DB failure, early completion, refund-before-paid and spent-points refund all recover with one consistent payment/order/ledger result and no duplicate fulfillment. Monitor backlog age, failed/unmatched events, paid-without-fulfillment, amount mismatch, stuck reservations and provider/local reconciliation drift using identifiers, not PII or raw payloads. Specify worker schedule, lease duration, max attempts, escalation owner and recovery runbook in the Ticket.

### T3 — Publish Super Serum for hosted sandbox and prove the journey

After T1 and minimum T2a recovery pass, freshly verify project, current draft/revision and exact product/variant. This sandbox milestone does not depend on finishing T2b's entire live refund/reward/outbox platform. Keep any not-yet-safe sandbox feature disabled and label the remaining live blockers honestly. Use the normal authorized Catalog Draft → validation → Publish service (`lib/admin/catalog/service.ts:590-638,761-784`) with a real operator actor, optimistic version checks, new revision and audit; do not directly patch canonical rows or impersonate an actor. If a current draft contains someone else's work, preserve it and reconcile deliberately.

Expected narrow offer diff in non-production: Product `status: coming_soon → available`; existing `30ml` variant `available: false → true`, `inventory_status: unavailable → in_stock`. Preserve Product/Variant IDs, SKU, USD 2500 price, media, copy and other products. In this sandbox context in-stock is a testing fixture state, not proof of physical launch inventory. Revalidate the Product Offer cache and verify the established catalog webhook/Algolia reconciliation so PDP, listing, search, Quick Buy and cart agree. Rollback is a new audited publication of unavailability, not history deletion.

Acceptance: hosted Stripe sandbox checkout can complete with all local services stopped; one verified sandbox order and correct address/totals; duplicate webhook replay is harmless; cancel/decline preserve expected cart/reward state; no real charge, shipment, customer email or other live side effect. Inspect desktop/mobile product and cart, guest/account, success and cancel. Verify this remains explicitly sandbox-facing before presenting the available offer publicly.

### T4 — Live-safe environment and data contract

Add additive enum/check/function/index changes and regenerated types for live mode, preserving every existing sandbox order. Inventory every environment literal in payment, customer mapping, webhook storage, rewards/referrals, UI, scripts, test fixtures and SQL functions. Enforce exact approved deployment/account/project combinations; scope all identifiers and idempotency keys correctly. Separate checkout admission from event settlement. Keep sandbox tools unable to mutate live resources. Replace hardcoded staging returns with trusted configured origins and ensure Auth, media allowlists, cookies and metadata are consistent.

Acceptance: tests exercise a mode/deployment/key/object/project mismatch matrix; sandbox history remains readable and unchanged; no test reward/customer/order data can affect live checkout; deployment with missing or wrong configuration cannot start a payment. New source can deploy with live admission disabled.

### T5 — Physical-product launch operations and stock

Choose and record real stock authority, available-to-sell quantity and customer quantity limits. Implement transactional stock reservations with expiry/release and paid conversion, idempotent under retry/concurrency. Address payment success after a reservation lease expires: do not silently oversell or discard captured funds; renew while pending or enter an explicit exception/refund process. Card-only launch limits but does not eliminate this race.

Confirm US/USD offer and price, shipping rate and free-shipping rule, dispatch promise, return/refund policies and tax decision with the owner. Stripe Tax is optional tooling; enabling it does not replace determining tax obligations, registrations and product/shipping tax configuration. When using automatic tax with existing Customers and shipping collection, include `customer_update.shipping: "auto"`; test new and returning customers with changed addresses. Under this post-Basil API, use `collected_information.shipping_details` for shipping and verify the installed SDK plus sandbox object contract. [Stripe Checkout tax](https://docs.stripe.com/tax/checkout/page), [shipping field change](https://docs.stripe.com/changelog/basil/2025-03-31/checkout-session-remove-shipping-details)

Define an operator-only fulfillment queue and responsible operator, minimum paid-order data, dispatch/tracking capture, support and refund/dispute runbooks. Stripe receipts are distinct from Helix shipping confirmations. Real emails/fulfillment are live-only and idempotent. Confirm business activation, charge capability, payout/bank readiness, statement descriptor, public support and policies in Stripe before opening live checkout. Never put private order/address details in logs.

Assign a bookkeeping owner and daily launch reconciliation cadence using Stripe payout reconciliation reports (or balance reports for manual payouts) to reconcile charges, refunds, fees and payouts. Record exceptions and resolution responsibility. This manual financial process is separate from automated Order-state recovery and does not require building a general accounting system. [Stripe payout reconciliation](https://docs.stripe.com/reports/payout-reconciliation)

Acceptance: simultaneous last-unit purchases cannot oversell; abandoned/expired sessions release stock; paid orders are handed off once with the real shipping address; sandbox cannot reach real fulfillment/email; refund/dispute activity has an accountable operational path. All public promises match actual capability.

### T6 — Staging rehearsal and separately approved live cutover

Finish full Ticket and combined gates, including installed scripts' actual commands, database concurrency/RLS tests, one production build and browser verification. Rehearse outages, webhook retry/replay, refunds, kill-switch and rollback on hosted staging. Keep regression evidence linked to exact commits.

Prepare a reviewable cutover manifest: exact source SHA, production hostname/Vercel target, approved production Supabase identity, Stripe account, mode, endpoint API version/events, shipping/coupon IDs and verified amounts, tax/payment methods, stock allocation and the Super Serum publication diff. Store secrets only in appropriate sensitive server-side Vercel variables and redeploy after changes. Verify endpoint TLS/reachability and signed deliveries. [Stripe webhook deployment](https://docs.stripe.com/webhooks)

Owner explicitly approves the production project/resources, live configuration apply and exact dev → main promotion before execution. With admission off, verify production config and migrations first; enable live checkout and publish the launch offer in a controlled sequence after production routes are healthy. Do not use test card numbers in live mode. Any real-money purchase/refund validation needs separate exact authorization and must follow Stripe's current testing guidance; a green sandbox run is not a claim that a live payment occurred.

Rollback stops new Sessions and republishes availability as needed, while webhook/inbox/reconciliation/refund/fulfillment recovery continues for accepted payments. Preserve current compatible code/schema needed to settle open Sessions; never reset the database or roll back financial facts. Freeze fulfillment only under an explicit operational incident decision, not accidentally through the checkout switch.

## Decisions needed before final Spec approval

1. Approved sequence: hosted sandbox first, preserving the existing $25/30 mL offer.
2. Choose real launch stock quantity/authority before live availability.
3. Production hostname and approval to provision a separate production Supabase project; the currently approved project is non-production only.
4. US shipping service/price/free-shipping threshold and dispatch/returns promises; tax treatment and responsibility.
5. Cards/card wallets initially; confirm live rewards/referrals and the proposed debt/partial-refund policy, or approve disabling their live benefits while retaining historical sandbox records.

Unknowns are explicit launch/Spec gates, not claims that production is ready. This research does not ask for secrets in chat.

## Validation and work completed for this proposal

Read-only baseline, source/data-contract audit, official Stripe research, approved sandbox account/endpoint inventory, approved Supabase catalog and enum reads, public HTTP checks. Application code, database, catalog and Stripe configuration are unchanged. No application tests were run because this is a plan-only documentation change; implementation requires the listed tests. In-app browser failure prevents visual validation at this stage. Existing untracked primary-workspace output is preserved. No commit, PR, merge, deployment, real payment or customer message has been created.

Skills used: `research` and `supabase`. Independent agents: Stripe documentation researcher, checkout source auditor, and full-stack plan reviewer. Documentation newline/whitespace checks passed. No local application server was needed for these read-only checks; no local run command changed. Shared understanding was subsequently approved by the owner. The remaining Spec and Ticket gates follow `docs/agents/engineering-workflow.md`: “The user owns three planning gates: shared understanding, the specification, and the tracer-bullet Ticket breakdown.” Independent technical approval cannot substitute for those decisions or live-mode authorization. The first research turn made no remote changes; planning integration is recorded by its later PR.
