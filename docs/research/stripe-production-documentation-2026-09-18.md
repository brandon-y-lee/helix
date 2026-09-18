# Stripe production documentation research

Researched 2026-09-18 against official Stripe documentation. This is provider research for Helix's production-readiness plan, not certification that its current implementation or provider accounts are ready. No Stripe, catalog, database, deployment, or customer state was changed. Repository language follows Ordering & Payment, Catalog & Discovery, and Service & Fulfillment contexts.

## What replaces the local listener

`stripe listen` forwards events to a local development handler. Deployed Checkout uses a registered, publicly reachable HTTPS endpoint; Stripe sends events directly to that server. A local computer does not need to remain running. The deployment must accept Stripe POST requests without login protection or redirects. Stripe's hosted endpoint must use TLS 1.2 or higher. [Stripe webhook setup and delivery troubleshooting](https://docs.stripe.com/webhooks)

CLI-forwarded events and Dashboard-managed endpoint events use different `whsec_` secrets. Verify the unchanged raw request body, `Stripe-Signature`, and the correct endpoint secret through Stripe's SDK. Stripe's signature guide links a Next.js App Router example. Do not follow the guide's troubleshooting suggestion to print secrets or raw payloads: Helix's secret/PII rules take precedence. [Stripe signature verification](https://docs.stripe.com/webhooks/signature)

**Helix inference:** first prove a hosted sandbox path on a stable staging URL with the local listener stopped. Register live delivery only as a separate approved cutover. A Supabase RPC used internally by the application is a different mechanism from Stripe CLI forwarding; identify which dependency the existing code actually uses before changing it.

## Required production gates

### Account, environment, and API compatibility

1. **Activate the business.** Stripe requires business verification and each service's activation requirements before live use. Complete account onboarding and confirm that public business/support details and the statement descriptor truthfully identify Helix. [Set up a Stripe account](https://docs.stripe.com/get-started/account/set-up)
2. **Complete operational account setup.** Verify payout bank details and schedule, team permissions, two-factor authentication, charge/dispute notifications, and a responsible operator for fraud and disputes. These are account readiness tasks, not code flags. [Stripe account checklist](https://docs.stripe.com/get-started/account/checklist)
3. **Separate environments.** Sandbox and live use distinct API keys and objects; a test Product cannot be used for a live Payment. Current Stripe guidance recommends restricted keys with only required permissions. Account for both `rk_test_`/`rk_live_` and `sk_test_`/`sk_live_` if supported by the selected integration. Secrets belong in server-side hosting secret storage. Webhook signing secrets are separate from API keys. [API keys and mode isolation](https://docs.stripe.com/keys)
4. **Record an explicit version contract.** Align the installed Stripe SDK, API request version, and webhook payload version. The endpoint's version can differ from request configuration. Upgrade deliberately and test the resulting object shapes. Current documentation contains newer API examples; do not copy newer Checkout or Accounts v2 syntax into an older pinned SDK. [Go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)

**Helix inference:** production mode should require an explicit approved environment, expected Stripe account, expected database, stable origin, and matching key/object/event mode. A generic deployment flag alone is insufficient because staging can also run a production build. Keep live disabled by default; never silently retry a failed live operation with test credentials or vice versa. The repository currently authorizes only a non-production database, so its production data boundary must be resolved before charging real customers.

### Durable payment processing

5. **Finalize only from verified server facts.** Stripe requires fulfillment safe against repeated and concurrent calls for one Checkout Session. Retrieve the Session and line items, examine `payment_status`, and record the result. The redirect is insufficient because the customer may never return. Delayed methods require `checkout.session.async_payment_succeeded`; handle `checkout.session.async_payment_failed` when enabling them. [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted)
6. **Expect delivery faults.** Events can arrive out of order or more than once. Track event IDs; separate events may also describe the same object/type. Live delivery retries for up to three days. Subscribe only to required event types, and acknowledge promptly. Stripe recommends an asynchronous queue for processing at scale. [Webhook delivery behavior and best practices](https://docs.stripe.com/webhooks)
7. **Make outbound operations retry-safe.** Stripe POST idempotency keys reuse the original result, including some errors; changing parameters under the same key is invalid. Keys may be pruned after 24 hours. API idempotency therefore does not replace permanent application state or database uniqueness. Generate one stable server-side key for each logical Payment Attempt, and reuse it when retrying that operation. [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)

**Helix inference:** use transactional state transitions for Payment Verification, inventory, Cart updates, and rewards; add durable work records for external follow-up. Return success only after durable acceptance or completed processing. A serverless background promise is not a durable queue. Preserve the original Order monetary facts while storing final provider amounts and explaining any allowed adjustment. A late failure must not downgrade an already verified Paid Order. Duplicate delivery must never grant rewards, clear a newly edited Cart, or dispatch goods twice.

### Truthful launch surfaces

8. **Publish real commercial terms.** Stripe's website checklist covers accurate Product descriptions, explicit currency, direct support contact methods, shipping destinations/rates/timing, Refund and Return terms, privacy, promotions, and secure payment handling. Existing prelaunch statements must be reconciled with actual operating capability before accepting money. [Stripe website checklist](https://docs.stripe.com/get-started/checklist/website)

**Helix inference:** making Treat Super Serum Purchasable requires governed canonical Product Offer and Inventory Status changes, plus a valid fulfillment/support commitment. Stripe Product availability is not a substitute for Helix catalog authority. Inspect the existing variant, Unit Price, stock rule, merchandising state, and catalog publish process; preserve all other Products. Do not fabricate stock quantities or launch promises to bypass a button guard.

## Business and integration choices to resolve explicitly

| Choice | Stripe fact | Recommended planning consequence |
| --- | --- | --- |
| Payment methods | Dynamic payment methods can be enabled through the Dashboard; eligibility varies with currency, amount, country, and integration. Removing an explicit method list changes the set of methods that may appear. [Dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods) | Start with an explicitly tested method set. A card-only first launch limits asynchronous-payment scope; enabling more methods requires their full state handling. |
| Tax | `automatic_tax.enabled` applies to the Session. Stripe Tax collects only where active registrations exist; classifications, tax behavior, and customer location affect results. Shipping address collection normally determines the taxable location. [Tax with Checkout](https://docs.stripe.com/tax/checkout/page) | The owner must resolve tax registrations and treatment; no invented nationwide rate or assumption that zero tax means no obligation. Test final totals and persist their breakdown. |
| Shipping | Checkout supports allowed shipping countries and shipping options. Rates are fixed amounts for the order; delivery estimates are configurable. [Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create?api-version=2025-07-30.basil), [Shipping rates](https://docs.stripe.com/payments/during-payment/charge-shipping?dashboard-or-api=api&lang=java) | Confirm launch destinations, Shipping Charges, stock policy, delivery commitments, and address source before fixing Order Total. Use the pinned API's supported shape. |
| Customer email | `customer_email` can prefill Checkout. An existing Customer with a valid email has that address prefilled and not editable. [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create?__=) | Decide which verified account/contact address is authoritative. Keep Checkout contact information separate from authorization and Cart Ownership. |
| Receipts | Stripe can email successful-payment and Refund receipts through Customer emails settings. Test receipts require manual sending. One-time paid invoice creation is optional and separately priced. [Receipts](https://docs.stripe.com/receipts) | Choose Stripe receipts or a durable Helix receipt sender; verify branding and genuine support details. A receipt does not mean shipment occurred. |
| Refunds | Refunds can be pending, fail, or require action. Stripe recommends at least `refund.created`; `refund.updated` and `refund.failed` carry later outcomes. [Refund handling](https://docs.stripe.com/refunds) | A Dashboard-operated Refund workflow can be an initial choice, but Helix still needs correct local state, immutable history, operator responsibility, and customer communication. |
| Disputes | Stripe provides Dashboard, email, and optional event notifications. Responses have deadlines. [Respond to disputes](https://docs.stripe.com/disputes/responding) | Assign an owner and ensure evidence can connect the Order, Payment, accepted terms, and Shipment. Full automated dispute tooling is not a prerequisite. |

## Operational proof and recovery

### Address contract requiring special verification

Stripe moved the top-level Session `shipping_details` to `collected_information.shipping_details` in API `2025-03-31.basil`. Use the collected Shipping Address, not an assumed Billing Address fallback, when fixing fulfillment facts. [Shipping field change](https://docs.stripe.com/changelog/basil/2025-03-31/checkout-session-remove-shipping-details)

The `2026-06-24.dahlia` object reference lists `collected_information`, but its illustrative JSON still contains legacy `shipping_details`; the nested documentation fetch failed during this research. Resolve the exact shape using the installed SDK types and a sanitized hosted sandbox fixture at the pinned version. Test deliberately different shipping and billing addresses. [Dahlia Checkout Session reference](https://docs.stripe.com/api/checkout/sessions/object?api-version=2026-06-24.dahlia)

Local source verification confirmed installed Stripe SDK `22.3.0`: `esm/resources/Checkout/Sessions.d.ts:101,394` declares `Session.collected_information` and its nested `shipping_details`. This resolves the type-shape question; a hosted sandbox fixture is still required to verify actual values and address handling.

For automatic tax with an existing Customer and shipping collection, Stripe explicitly requires `customer_update.shipping: "auto"`. Test both a new and returning Customer, including replacement of a previously saved address. [Tax for existing Customers](https://docs.stripe.com/tax/checkout/page)

### Required evidence

- **Reconciliation:** identify pending Orders and mismatches between Helix and Stripe using bounded server-side retrieval. Record stable Order/Payment Attempt identifiers on relevant provider objects. Stripe payout reconciliation reports connect automatic payouts to transactions and can include PaymentIntent metadata; manual payout users use the balance report instead. This financial settlement reconciliation is distinct from repairing Helix Order state. [Payout reconciliation](https://docs.stripe.com/reports/payout-reconciliation)
- **Webhook recovery:** Stripe's undelivered-events procedure returns events from the last 30 days and requires tracking processing/processed state so manual recovery and automatic delivery can coexist safely. [Process undelivered events](https://docs.stripe.com/webhooks/process-undelivered-events)
- **Capacity:** avoid unnecessary provider polling. Handle `429` with bounded exponential backoff and jitter; distinguish rate limits from object lock timeouts. Stripe discourages load-testing its sandbox API because limits and latency differ from live. [Rate limits](https://docs.stripe.com/rate-limits)
- **Evidence before cutover:** run real hosted sandbox Checkout using Stripe's test values, including decline and authentication cases. These simulate transactions without moving funds. [Stripe testing](https://docs.stripe.com/testing)

Recommended Helix acceptance evidence: successful hosted sandbox checkout with the local listener stopped; abandoned redirect; invalid signature; wrong environment; duplicate and concurrent events; out-of-order transitions; provider timeout after Session creation; replay during reconciliation; inventory competition; edited Cart after Checkout begins; unauthorized Order access; unavailable provider/database; full and partial Refund state; receipt and fulfillment retries without duplicates. Record what is simulated, integration-tested, and actually exercised against the hosted sandbox.

## Boundary of this research

These sources establish Stripe's behavior and recommended practices. They do not verify Helix's account activation, webhook destinations, Vercel environment settings, production database, inventory, shipping capability, tax registrations, support inbox, or legal terms. Those require repository/account evidence and owner decisions. Implementation approval and explicit live-mode/production-promotion approval remain separate under the repository workflow.
