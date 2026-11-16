# S1 — Hosted sandbox checkout and Super Serum availability

Status: APPROVED by the owner on 2026-09-18, with the lean checkout/manual exception recovery reduction explicitly approved on 2026-09-19. The five Ticket identities and bounded sandbox publication remain; #412 removes the superseded #411 worker architecture. Production payments remain out of scope for S1. Independent review approved the exact specification and Ticket package before owner approval. Approach integrated through PR #407.

Planning source: [approved approach PR #407](https://github.com/brandon-y-lee/helix/pull/407), including Stripe documentation research and independent full-stack review. Source baseline reviewed: `17785d55815ca0caf12b04fb7659042a40f86cfc`. The implementation snapshot will be taken from current remote dev after the planning PR is integrated and this Spec/Ticket set is approved.

## 1. Customer outcome and completion boundary

A visitor or signed-in customer can add Super Serum 30 mL at its existing $25 price, pay through clearly identified Stripe-hosted Sandbox Checkout, and see accurate private Order status. Stripe delivery and normal payment settlement run on hosted infrastructure with no laptop listener or local RPC service. A Sandbox Order never causes a real charge, shipment, customer email, review invitation, or transferable live rewards.

S1 closes only after its code is integrated into dev and a separately recorded, freshly verified non-production operational activation proves the complete hosted journey. Each child Ticket closes on its reviewed source/tooling acceptance and Ticket merge. S1-05 supplies the guarded operational commands and runbook; the sole Spec Closer executes the approved bounded non-production activation against the final merged dev SHA, then records its evidence and closes the Spec issue. No source edits occur after merge outside a new reviewed Ticket. The Spec remains open with a precise operational blocker if activation cannot complete; a source merge alone is not evidence that Super Serum is available or hosted checkout works.

The production follow-on is S2. It has its own Spec boundary so outstanding live work cannot hold S1 off dev. No S1 code accepts live keys/objects or changes the sandbox-only database environment enum.

## 2. Fixed scope and authority

| Item | S1 contract |
| --- | --- |
| Supabase | Only approved non-production project `erasogmsqpgiirovubjh`; schema migrations are additive and preserve existing orders, customer state, catalog history and rewards history |
| Stripe | Verified test account `acct_1Tm9WRFEzyaKzdmq`; installed SDK 22.3.0 / pinned API `2026-06-24.dahlia`; existing endpoint `we_1U6GHJFEzyaKzdmqVxkG9jRC` |
| Hosted target | Proposed existing stable staging origin `https://helixskin.vercel.app`; verify current Vercel project, branch/domain assignment and code SHA before apply |
| Product | Existing `super-serum`, Product ID `f6091deb-1177-45ad-b506-1f0427fa4abe`, variant `30ml`, SKU `8809672285263`, USD 2500 cents |
| Availability diff | Product merchandising status to `available`; existing variant `available=true`, `inventory_status=in_stock`; all other catalog facts preserved |
| Payment methods | Explicit server list `card`, including eligible card wallets; unsupported financing messaging hidden. Older already-created Sessions retain their safe settlement path |
| Shipping/tax | Existing verified sandbox shipping/coupon economics and existing $50 net-merchandise free-standard-shipping rule; no invented shipping amount. Preserve current tax setting. Test both configured tax modes using fixtures; enabling Stripe Tax remotely is outside S1 |
| Production authority | None: no live keys, real charges, paid infrastructure upgrades, new production project or dev-to-main promotion |

The in-stock state is a sandbox fixture, not evidence of physical inventory. A persistent visible sandbox notice must reach the product purchase controls, cart and checkout entry before this offer becomes public; each notice explains no real charge or fulfillment. Existing catalog read caching remains public; payment/config secrets and private data remain server-only and uncached.

## 3. Checkout admission and existing-payment settlement

Split the current configuration seam into validated sandbox provider configuration and a separate admission decision. `CHECKOUT_ENABLED=false` prevents creation/replacement of Sessions but does not block signature verification, processing previously accepted Sessions, owned status views, expiration or refund recording. Missing/invalid provider credentials still fail closed. Do not silently substitute a different key, environment, account or origin.

Checkout POST and cancellation POST require same-origin requests against the exact configured staging/local-loopback origin. Reject missing, null, malformed or unapproved Origin for browser mutation endpoints. The Stripe webhook uses signature authentication, not browser-origin enforcement. Validate strict JSON objects, supported reward input and actual streamed body length before parsing; cap checkout/cancel JSON at 4 KiB and webhook raw body at 1 MiB. Return bounded 400/403/413/429/503 errors without provider details or PII.

Use a shared database-backed admission limiter keyed by authenticated user or hashed guest ownership, with at most five new provider attempts per minute per identity and at most one active attempt per cart generation. Legitimate replay of the existing same logical attempt returns the existing result and consumes no additional provider-create quota. Add a shared aggregate budget of 10 new provider attempts per minute per Helix Stripe account/environment for S1, so rotating guest cookies cannot reset all limits. Coalesce concurrent owned status/replay provider lookups with a five-second per-Session/attempt cooldown and a separate shared 30-refreshes-per-minute account/environment budget; return already-authorized stored state with truthful pending/retry information when refresh is deferred. Existing same-attempt replay avoids create quota but does not bypass these provider-read controls. Worker/webhook settlement has separate capacity and cannot be starved by browser create/refresh quotas. Test rotating guest cookies and concurrent status/replay requests. These are conservative sandbox budgets; S2 must set measured live capacity. Keep trusted-edge/IP limits optional defense in depth; never rely on attacker-provided forwarded headers or an in-memory counter as the primary limiter. When shared limit/authorization storage is unavailable, creation fails closed and existing settlement remains available.

Set `payment_method_types: ["card"]` on new Sessions and save truthful method-policy metadata. Preserve server-authoritative prices, integer cents, immutable line snapshots, quantity bounds and established cart-generation/attempt/session compare-and-swap rules. Never derive price, discounts, ownership or rewards eligibility from browser input. Reject a zero-total quote with a clear unsupported-checkout message before creating a Session in S1; handle any legacy `no_payment_required` Session as a durable operator exception, not paid or permanently spinning.

## 4. Private and truthful order status

Authorize access before provider retrieval, reconciliation or rendering. A signed-in Order requires the current server-authenticated owning user. A Session ID alone is never receipt authorization.

For guest Orders, issue a 32-byte random checkout-receipt capability in a Secure (hosted), HttpOnly, SameSite=Lax host-only cookie with Path=`/` (no Domain attribute), so both `/api/checkout/sessions` and `/checkout/success` receive it; store only its hash bound to that guest Order and environment. Capability lifetime is 24 hours from creation and cannot be extended by presenting a Session ID. Issue and bind the capability before returning any payable Session URL; a later creation request can reuse the same browser capability without changing access to an earlier Order. Test two guest checkouts in separate tabs and later refresh of each, including actual browser cookie-path behavior. The capability is independent of cart and cancellation cookies so clearing, editing or merging a cart does not erase the receipt immediately. Use one browser capability with explicit per-Order grants in the database and indexed lookup, rotated when expired; do not store an unbounded list in cookies. The shared admission limits bound grant creation; expired grants can be retired without deleting financial history. Do not use this capability to read signed-in Orders. Ownership changes invalidate superseded guest grants; login does not let one account claim another guest Order without its established ownership proof.

Use a private, non-cacheable response for success/status, with no sensitive metadata and a restrictive referrer policy so Session IDs are not sent to third-party destinations. Unknown, expired or unauthorized requests receive the same neutral unavailable response. Logged-in customers retain Order access through their existing account pages; guest receipt expiry does not authorize building an email-based recovery system in S1.

Headings, document title and accessible labels agree with state: awaiting payment/processing, verified sandbox payment, failed, cancelled, refunded, or unable to verify. Missing browser return never prevents settlement. A bounded status refresh polls only after authorization, backs off and stops on terminal status, tab invisibility or a time limit; manual refresh remains safe. No side effects originate from UI optimism.

## 5. Payment verification and addresses

Read canonical accepted Order lines and the authenticated provider Session, expanded or retrieved with authoritative line items and PaymentIntent where needed. Before paid finalization verify environment, expected account context, stored Session-to-Order relationship, order/attempt metadata, USD currency, whole-number nonnegative monetary fields, exact line identities/quantities/unit amounts and merchandise subtotal, selected coupon economics/discount and shipping amount, and total arithmetic including provider-computed tax. Persist the original quoted facts separately from the verified tax/final-total result; never infer missing monetary fields from old totals to mark paid.

Tax changes are permitted only under the Session's recorded automatic-tax contract. When automatic tax is enabled, require completed calculation and preserve its validated breakdown; add `customer_update.shipping: "auto"` for returning Customers when collecting shipping. Use `session.collected_information.shipping_details` for shipping recipient/address and `customer_details.address` for billing. Require usable US physical-delivery data before a paid Order becomes eligible for downstream work. A provider-confirmed payment with invalid address or quote enters a durable exception; do not deny that money may have been paid or manufacture a valid address.

Verification mismatches do not clear carts, award benefits or claim completed checkout. Record a sanitized exception code and IDs for the operator, retain the provider payment reference, and allow explicit repaired reconciliation. A delayed failure cannot downgrade a verified paid/refunded state. Existing atomic finalization and idempotent cart/reward operations remain the source of truth; add tests at these boundaries rather than duplicating business rules.

### Compatibility for previously accepted Sessions

New accepted attempts record a new verification schema version; persist the version on the local Order/Attempt before provider creation. Select validation from this trusted local version, never from incoming event metadata alone. Preserve a bounded `checkout_v1` path only for genuinely pre-cutover local Orders/Attempts: prove existing recorded Session ownership (or recover the original binding from trusted order/session references), immutable local line/subtotal/discount/shipping facts, sandbox account/mode, provider Session tax configuration and current payment state. Missing a new attempt ID or tax snapshot on a legacy row is not itself a reason to strand it. Do not reconstruct legacy accepted terms from today's cart/catalog/coupon configuration. If historical facts cannot establish the relationship or economics, retain an explicit operator exception with the actual provider payment reference; never weaken new-version checks or manufacture a missing snapshot.

Test pre-cutover paid, unpaid, expired and delayed-method Sessions with no new fields through webhook and owner status retrieval. Legacy guest status requires provable existing guest/cart ownership; issue a new receipt grant only after that proof. Missing guest proof makes the private view unavailable without preventing trusted background settlement. Migration preserves processed-event deduplication and treats legacy unfinished markers as recoverable work rather than erasing history.

## 6. Webhook settlement and manual exceptions

Use the existing minimal event audit and completed-event deduplication. Verify the raw signature, sandbox mode and expected API version, retrieve current provider facts, complete required local order/reward/referral effects, and record completion before returning 2xx. Return retryable non-2xx for pending, uncertain or failed processing. An in-progress claim or unique insert conflict is not successful completion. Local transactions and ledger source keys protect concurrent deliveries and private confirmation refresh. No unawaited work remains after the response.

Stripe owns webhook retry scheduling and Dashboard/CLI resend. S1 deliberately accepts manual recovery after the provider retry window. A concise runbook identifies the existing maintainer, failed-delivery inspection, trusted Session reconciliation and privacy-safe evidence. Do not install a custom worker, Cron/Vault/pg_net wakeup, leases/backoff dispatcher, dead-letter console or payment replay UI. A queue may be reconsidered only when measured latency, load or downstream work justifies it. Measure the hosted synchronous path, keep provider requests bounded, and never send customer emails or shipments inside it.

Preserve current verified full-refund reconciliation, checked writes and durable exceptions when local reward/referral effects fail. Keep the existing five-event subscription. Partial, pending and failed refund handling remains manual in Stripe Dashboard; full live refund/rewards accounting remains an explicit S2 blocker. Do not describe historical payment as complete refund reconciliation when an exception exists.

## 7. Safe outbound attempts without automatic recovery machinery

Retain the stable local Attempt, immutable accepted Order terms, and Stripe idempotency key. Before calling Session.create, persist a permanent first-send marker under the current Order claim. Each logical Attempt can enter provider creation only once. Configure bounded native Stripe SDK retries within that call, using the same key and parameters. There is no cross-request create replay, so no canonical request envelope/digest or 23-hour replay-permit framework is required.

An ambiguous result or lost database attachment remains unknown and retains its reservations. Refuse a new payable attempt for that purchase. Recover the original Session from its verified response or signed event, checking the immutable local Attempt/Order relationship before atomic binding. Unknown legacy attempts remain manual exceptions. Do not discover Sessions through account-wide scans, persist discovery cursors, cycle operator candidates, or create automatic replacement lineages.

Reopen a known payable Session when ownership permits. Positively verified expired/nonpayable Sessions may terminate through existing local effects; a subsequent normal checkout can start a new Order. Unknown or processing outcomes never release reservations because of a local timeout, missing URL or empty search. The runbook explains manually investigating unresolved payments and resending the original event; operator actions cannot invent payment or erase financial facts.

Cover lost response, lost attachment, early webhook, concurrent creation/delivery, unknown cancellation and later trusted recovery at the existing service/database seams. No custom recovery polling is promised.

## 8. Super Serum publication and hosted acceptance

Publication uses the established authorized Catalog Draft → validation → Publish service with a real operator actor and optimistic draft/base revision checks. Freshly verify Product/Variant IDs, issued SKU, USD 2500 price, active catalog state, current revision, active draft, media readiness and target Supabase. Preserve any unrelated active draft. Capture an exact three-field offer diff; creating a new Product, variant or Stripe catalog is out of scope.

Before publication prove the stable hosted target serves the reviewed S1 commit on dev/staging and that every known deployment reading this shared non-production catalog either has the S1 safeguards and sandbox notice or has new checkout admission disabled. Historical domain documentation is not this proof. Do not promote main to satisfy it. If an existing public consumer cannot be made safe within approved scope, stop the publication with evidence while preserving completed source work.

A narrow operational manifest identifies repository SHA, Vercel project/domain/branch, Supabase project, Stripe test account/endpoint/API/events, shipping/coupon identities/economics, operator actor, Product/revision/variant and exact publication diff. Default command is read-only plan; apply compares every approved expected identity and version, fails on drift and is repeat-safe. New changes outside this manifest require scope review. Remote schema/config changes and canonical publication occur only under the approved activation Ticket's authority, not by interpreting Spec approval as blanket provider authority.

After publication, verify the canonical Product Offer plus cache invalidation and established catalog-to-Algolia reconciliation. PDP, listings, search, Quick Buy and cart must agree. No static runtime fixture/fallback is allowed. The same sandbox warning reaches all paths that can add this offer.

Hosted proof uses Stripe official test values and synthetic customer/contact/address data, with all local application/listener services stopped. Record exact deployed commit, sandbox Session/Order IDs in private operator evidence, aggregate outcomes in tracker, and sanitized screenshots only. Include guest and signed-in success, distinct shipping/billing, decline, authentication challenge, cancelled/expired Session, closed/no-return tab, duplicate provider event replay, manual failed-delivery recovery, checkout-disabled settlement and wrong-owner denial. A signed webhook delivery is required; GET health alone does not qualify. Record normal webhook latency and verify no-return settlement. Prolonged outages require manual resend after repair.

Inspect `/products/super-serum`, collection/search purchase entry, cart, `/checkout`, success and cancellation at 390×844 and 1440×900 in the in-app browser. Preserve keyboard/focus, touch, status announcements and no horizontal overflow. No automatic customer emails, real fulfillment, Trustpilot invitations or externally transferable benefits may occur.

Rollback prevents new Sessions and republishes the three availability fields to their captured predecessor values through a new audited revision. It preserves webhook receipt, owned status/refunds, history and open payment resolution. Do not drop tables, revert migrations destructively, disable the settlement credential or delete Orders as rollback.

## 9. Test and delivery requirements

| Proof | Required coverage |
| --- | --- |
| Unit/service | Config admission/settlement split; method/UI contract; amount/address mapping; body/origin/limiter; error redaction; honest states |
| Route/integration | Guest/account receipt ownership and expiry/login/cart-clear transitions; signature/body limits; incomplete processing and completion-write failure; no-store responses |
| Database | Real concurrent cart/attempt claims and idempotent finalization, first-send protection, reward/cart replay, limiter atomicity, RLS/direct Data API denial, additive history preservation |
| Recovery | Lost provider response/attachment, unknown-result blocking, early/out-of-order events, full-refund exception and manual event resend |
| Browser | Desktop/mobile sandbox purchase entry, guest/account status, cancel/decline, accessibility, unsupported financing hidden |
| Hosted operator | Fresh preflight, exact manifest, hosted endpoint secret/reachability proof, genuine Stripe test checkout/event, cache/search alignment and rollback rehearsal |

Use existing checkout/config/Stripe/cart/commerce tests and database checkpoint runners, adding meaningful orchestration and concurrency tests where the current suite only mocks helpers. Ticket gate runs frozen install, lint, typecheck and complete Vitest. Combined Spec integration-gate adds retained production build and complete Chromium verification. Database integration evidence is additionally required for schema/concurrency work; CI green without those checks is not equivalent. Each source commit receives applicable review; no production source promotion is included.

## 10. Follow-on S2 and owner decisions

S2 prepares live-safe configuration/data isolation, full refund/reward accounting or an explicitly disabled live-benefits policy, real stock reservation and fulfillment, tax/shipping/policy settings, operational alerting/bookkeeping, and the exact launch manifest. It must explicitly approve a production Supabase project; `erasogmsqpgiirovubjh` remains non-production. Recommended first live policy is cards/card wallets and rewards/referrals disabled until refund/debt rules are approved; this recommendation is pending the owner's response and does not constrain sandbox rewards testing.

The existing $25/30 mL sandbox offer is preserved by S1. Real stock allocation, production hostname/project, shipping charge and dispatch/return promises, tax treatment/registrations and live benefits remain S2 decisions. Preparing software under disabled live admission does not authorize creating paid resources or charging anyone. Live configuration, real-money validation, exact dev-to-main promotion and live catalog publication each remain explicit cutover authority.

## Approved implementation Tickets

- #409 — S1-01
- #410 — S1-02
- #411 — S1-03 (historical implementation; worker infrastructure superseded by the approved #412 reduction)
- #412 — S1-04: lean webhook settlement and safe single-send attempts
- #413 — S1-05
