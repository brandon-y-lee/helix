# Recipient-bound lifecycle offers (Ticket #484 / Spec #482)

## Status and activation boundary

Implemented for the existing sandbox checkout only. No coupons, entitlements, real sends, remote migrations, live configuration or deployments are created by this change. Both `HELIX_OFFERS_ENABLED` and `private.lifecycle_offer_control.enabled` default off. This is not campaign activation or a production payment integration.

Before separately authorized activation, apply and verify the reviewed migration in the intended environment, configure the exact verified sandbox account's `STRIPE_WELCOME_15_COUPON_ID` and `STRIPE_CART_10_COUPON_ID`, and qualify hosted checkout using actual multi-line/quantity baskets. Coupons must be valid sandbox percentage coupons (15/10), once-only duration, without redemption deadline, cap, amount/currency or product restrictions. The application verifies the configured account and retrieves the coupon at grant, delivery eligibility and checkout selection. Do not publish coupon IDs as public promotion codes.

**Hosted rounding qualification remains an activation blocker.** The accepted discount uses integer half-up percentage of the merchandise subtotal, like the existing referral contract. Provider parity is not claimed. Stripe line allocation may differ for a basket; exact aggregate/line verification remains strict. An open unpaid offer Session with mismatched subtotal or discount never becomes a usable returned checkout link. Paid mismatches remain exceptions and do not settle. Existing line floor/ceil allocation bounds are unchanged. Do not weaken this verifier to enable a basket.

## Campaign integration contract

- `grantLifecycleOffer({ kind: "welcome" | "cart", email, sourceKey })` is an internal server helper, not a browser endpoint. The caller must first enforce current campaign eligibility and consent. Use a durable logical source key for retries. Returns a stable entitlement UUID or null when ineligible. Duplicate logical grants do not renew expiry or create fresh discounts.
- Immediately before first email handoff call `readLifecycleOfferForDelivery(id, email)`. Null means do not promise a discount: it can be expired, held, used, rebound to a changed email, or ineligible. This rechecks DB and coupon validity; consent/suppression must independently be rechecked by the dispatcher. It does not reserve the discount for email delivery.
- `GET /api/offers` returns only the verified signed-in customer's current offers, private/no-store, without coupon IDs or recipient identity. The cart explicitly selects `offerId`; the checkout request accepts no caller-authored percentage or amount.
- Grant and pre-delivery eligibility resolve any current verified account behind the recipient email, so account history also suppresses unusable offers after an email change. Welcome entitlement is once per normalized email and once per bound verified account, excludes prior paid/refunded purchases, and cannot be recreated by email changes or refunds. Cart entitlement uniqueness is by logical source. Unbound grants require verification of the exact recipient email before first checkout reservation. All expire 14 days after issue; an already held original unsent checkout can recover without renewing that expiry.

## Payment safety and operations

One selected offer replaces referral eligibility and cannot stack with points rewards. The UI makes that choice explicit. The order snapshot and immutable payment contract freeze entitlement and coupon identity; fingerprint/idempotency includes the selected entitlement. DB locks serialize competing reservations and reject identity/amount substitution. Successful verified payment consumes atomically. Refunds never restore eligibility.

Only the original safe unpaid terminal transitions release an unconsumed reservation. A potentially sent or uncertain provider attempt remains held; never manually release based on elapsed time or browser abandonment. Use the existing verified payment reconciliation/expiry path. An unsent snapshot interruption can resume on the original cart. Disabling offers blocks new availability/grants without erasing accepted terms or reserved history. The authenticated offers read still exposes only the same account’s original held, never-sent checkout on the same cart, marked privately as recovery. The application can validate its configured sandbox coupon while new admission is paused; no fresh or other-cart grant receives that exception. Keep the accepted coupon configuration available for recovery.

Private tables and RPCs are service-only; the narrow verified-email helper is security-definer with a fixed search path. Do not grant browser access or broad auth-table access. Retain identity history needed to enforce lifetime uniqueness; a future privacy-erasure workflow must explicitly reconcile this constraint rather than silently deleting entitlements.

## Local checks

`pnpm exec vitest run tests/lifecycle-offers.test.ts tests/lifecycle-offer-checkout-ui.test.tsx tests/checkout-payment-verification.test.ts tests/checkout-payment-contracts.test.ts`

`node scripts/db/test-lifecycle-offers.mjs` uses only the labelled local `helix-spec358-pg` PostgreSQL 17 container, creates a unique synthetic database and drops only that database. It exercises actual migrations, checkout admission/payment finalization, negative ownership/expiry/substitution cases, lifetime binding, refunds and two real lock races. It never contacts a remote database.

`node scripts/db/test-lifecycle-combined.mjs` additionally installs the actual current catalog, checkout, email, product-notification and lifecycle-consent predecessors together with offers. It retains both suites’ assertions and real lock races, including the shared-helper namespace regression. Composition anchors fail closed if the maintained predecessor harness changes. It accepts only the same labelled local container and cleans its owned disposable database; no temporary repository files or remote calls are made.
