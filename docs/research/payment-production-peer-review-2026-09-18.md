# Independent full-stack review: Stripe production plan

Date: 2026-09-18. Reviewer: independent senior full-stack engineering agent, with a separate read-only checkout reviewer. Source baseline: `17785d55815ca0caf12b04fb7659042a40f86cfc`. Scope: the proposed plan and official Stripe research, checked against the current checkout, confirmation, catalog, database, and payment-method code. No provider state or application source changed.

## Final verdict: APPROVE the revised proposed implementation plan

Re-review completed on 2026-09-18 after reading the revised plan in full. I approve its engineering direction, staged scope, and proposed implementation plan for progression through the owner's Spec and Ticket approvals. There are no remaining blocking architecture findings in this review. This is **not** approval to enable live payments, claim production readiness, publish fabricated physical stock, provision paid resources, or promote to `main`.

The initial review requested changes. The author addressed the findings as follows:

| Finding | Resolution verified in the revised plan |
| --- | --- |
| R1: Cards-only intent without an explicit implementation contract | T1 now requires server-created Sessions with `payment_method_types: ["card"]`, eligible card wallets through Checkout, supported-method gating of Afterpay messaging, and consistency tests. This removes dependence on an uncontrolled Dashboard method set. The detailed Ticket should also replace misleading `stripe_dynamic` attempt metadata. |
| R2: Sandbox availability blocked by the entire live accounting platform | T2 is now split into minimum durable recovery (T2a) and live refund/reward/downstream work (T2b). T3 requires T1/T2a and disables unsafe features, while retaining T2b as a live-launch gate. The sections are explicitly delivery slices requiring later tracer-bullet decomposition. |
| R3: Unknown creation outcome beyond the idempotency retention window | T2a now records the attempt before requesting a Session, immutable request identity, first-send time, key and certainty; it requires reconciliation or quarantine instead of blind recreation and tests lost response/attachment, missing events and elapsed retention. Lease completion is also token-qualified. |

Carry the conditions below into the detailed Spec and launch acceptance. They are unresolved business/configuration choices and implementation verification, not a claim that the plan's fixes already exist.

## Initial verdict and findings: REQUEST CHANGES

The architecture is sound. Keep hosted Checkout, canonical Supabase offers, immutable financial history, explicit mode boundaries, and hosted signed webhooks. A local Stripe listener is not a live dependency. The documented shipping-address, confirmation-ownership, false-success, webhook-claim, refund-write, and checkout-switch problems are supported by source. This is materially more work than changing a key or enabling a product.

One implementation-contract gap needs a concrete plan edit before approval. Two scope/recovery refinements should accompany it. None requires a generic payment framework or a custom accounting product.

### R1 — P2: Enforce the approved payment methods in code and customer messaging

The first release says cards/card wallets only, but no delivery slice explicitly changes the current dynamic method behavior. `lib/orders/server.ts:923-955` omits a payment-method restriction, and `:223` records `stripe_dynamic`. The PDP mounts Afterpay messaging in `components/product-detail/PdpPurchaseIsland.tsx:414`; `AfterpayMessaging.tsx:53-59` currently limits it to test keys. The present code does **not** already advertise Afterpay in live mode, but indiscriminately converting test-key guards would create that mismatch.

Required edit: T4 must enforce the approved provider method allowlist, store truthful attempt configuration, and condition payment-method advertising on the same contract. Acceptance must prove that a Dashboard method change cannot silently expand a cards-only launch and that the live PDP does not advertise unsupported methods. Previously accepted sandbox Sessions must retain their settlement path. Dynamic methods are controlled by provider configuration when the explicit method list is omitted. [Stripe dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods)

### R2 — P2 scope refinement: Do not make a sandbox offer wait for every live operation

T3 currently waits for all T1/T2 work, including partial-refund reward debt policy, receipt delivery, and fulfillment outbox. That delays the user's concrete Super Serum request behind operations that a Sandbox Order cannot exercise in production. The six sections are useful delivery slices, but several are too large to call approved tracer-bullet Tickets.

Recommended edit: split T2 core durable payment recovery from live refund/reward/downstream operations. Permit T3 after T1 plus the core settlement/replay/ownership safeguards and verified prevention of live effects. Scope the bounded sandbox journey explicitly; refunds and unsettled accounting limitations must remain documented until their own work passes. Keep all financial, inventory, and operational requirements as live-launch gates. A prominently identified sandbox offer is a test fixture, not an assertion of physical stock on a live storefront.

### R3 — P2 recovery refinement: Bound unknown Session-creation replay

`lib/checkout/idempotency.ts:93-105` reuses a stored key without an age contract; `lib/orders/server.ts:923-977` can create a provider Session before attachment fails. The plan covers timeouts but should explicitly cover recovery after the provider idempotency record can expire. Stripe can treat a reused pruned key as a new operation after its retention window. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

Required acceptance refinement: retain operation/attempt identity and creation time; test unknown-result creation or failed attachment followed by recovery beyond the provider retention window. Reconcile the existing operation or quarantine an unresolved attempt before issuing a replacement; prove one consistent Order result without duplicate payable purchase intent or silent reservation leakage. This is a recovery requirement, **not** a demonstrated double-charge vulnerability: the current code returns the URL only after attachment, and known Sessions are inspected before replacement.

## Conditions for specification development and launch

The following are explicit Spec or launch decisions, not reasons to block read-only research or provision anything now:

- **Financial state and races:** preserve original quote and line-item facts separately from verified provider tax/final totals. Explain permitted adjustments. Test simultaneous payment finalization, refund processing, reward earning/reversal, and fulfillment claiming; a stale paid-work item must not re-award refunded benefits or dispatch an already refunded order. Pending/failed refunds must not be treated as returned money. A refund must remain recognized if the customer already spent points. The plan's reviewed debt/offset or disabled-live-benefits alternatives are appropriate.
- **Stock:** identify real available-to-sell stock and its authority before live publication. A boolean catalog flag is insufficient. Test last-unit competition, abandoned Sessions, cancelled Sessions, and late successful payment after a reservation expires. Explicit exception/refund handling is necessary; changing a stock flag cannot undo captured money.
- **Durable worker and privacy:** before approving the implementing Ticket, specify the actual scheduler/worker, authenticated entry, interval, bounded retries, lease ownership, dead-letter escalation, and operator. Keep inbox/outbox/refund/stock records server-controlled with narrow grants and RLS on exposed tables; customers may only read their authorized records. Preserve the existing minimal event envelope rather than storing raw provider payloads by default. Test both application and direct Data API access boundaries. Supabase grants and RLS are separate protections. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- **Bookkeeping:** assign a person and cadence to compare orders, payments, refunds, fees/disputes, payouts, and bank settlement using Stripe's reports. This can be a manual process for the initial release. It is distinct from the worker repairing a pending Helix Order; a green webhook dashboard does not demonstrate financial reconciliation.
- **Fulfillment and support:** an authenticated manual operator queue is a reasonable first release. Define one responsible operator, a verified support channel, dispatch/returns promises, and receipt ownership. Stripe explicitly supports manual fulfillment for low-volume businesses; no warehouse platform or custom email engine is required merely to launch. [Stripe fulfillment options](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted)
- **Environment and cutover:** separately approved production database, account/key/endpoint/mode/origin contract, explicit live admission, additive schema changes, approved stock allocation, and a reviewable exact deployment manifest. No existing sandbox records or balances become live facts. Rollback stops new purchases but preserves settlement/refund/reconciliation paths for accepted payments.
- **Owner gates:** shared understanding, Spec and Ticket breakdown remain user approvals. Product price/size, sandbox timing, production project/hostname, shipping/tax/returns, stock and rewards policy require resolution as identified by the plan. An engineering reviewer cannot approve these commercial facts or authorize live keys, real charges, infrastructure cost, or `dev → main` promotion.

## Verification scope and limits

I read the repository rules and canonical engineering workflow, relevant domain contracts, the proposal and research, checkout creation/finalization/refunds, webhook claim/route, checkout configuration, confirmation UI, payment messaging, catalog publishing entry points, and the current rewards/finalization migrations. The Supabase skill informed the access-control review; no database command or schema change was run. A second independent reviewer checked checkout privacy, quote verification, idempotency and payment methods and found no additional unaddressed blocker in those areas.

I independently consulted the linked official Stripe and Supabase documentation. No application tests or browser flow were run for this document review. The parent's read-only remote inventory is reported evidence, not an independent successful Checkout reproduction. Existing runtime production readiness remains unproven. The re-review above verified the plan edits; source implementation, database policies and migrations, automated tests, hosted checkout evidence, and the final cutover manifest still require their own reviews.
