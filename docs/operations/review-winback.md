# Dormant review invitation / next-purchase offer

Ticket #498 extends Spec #482, without merging public reviews from Spec #486.

## Implemented, inactive

Explicit `lifecycle_reviews` opt-in and double confirmation freeze `lifecycle_v2` consent, including post-purchase follow-ups and next-purchase offers. Existing welcome-v1 and lifecycle-v1 consent is preserved, never silently upgraded. The separate `HELIX_EMAIL_LIFECYCLE_REVIEWS_CONTRACT` requires immutable native approval for all seven purposes. `HELIX_LIFECYCLE_REVIEWS_ENABLED` defaults false; the database review-purpose control also defaults false.

One invitation per original order is due 14 days after genuine complete delivery. Its first-admission window lasts 24 hours. Payment, order creation, and delivery must follow the explicit enrollment/rollout cutoff. Re-enrollment and evidence revisions never produce another invitation or entitlement for that order. Shared dispatcher, suppression, uncertainty handling and caps (one per24h, three per7days) apply. Per-recipient priority is welcome, cart, review/win-back, then browse; durable scan history retains fairness across retries.

The 10% `review_winback` entitlement belongs to the original verified account and recipient. The configured `STRIPE_REVIEW_WINBACK_10_COUPON_ID` must pass existing exact sandbox coupon validation. It expires14days after issue, applies only to eligible USD merchandise, excludes shipping/taxes and cannot stack. No review submission, rating, moderation, or publication is queried or required to grant or redeem it. The email explicitly says the offer is theirs whether or not they leave a review, and welcomes all honest feedback. Separate review and shopping links target `/account/reviews` and `/cart`.

Private offer rows persist immutable original-order/account, delivery-evidence and risk-evidence identities/revisions. New use is suppressed if current proof no longer matches or is unsafe. Original held-checkout recovery is preserved without rewriting financial history. Unsubscribing suppresses invitations, not an otherwise valid unconditional already-issued entitlement.

## Hard boundaries and remaining activation dependencies

Both `private.verified_order_delivery(order_id)` and `private.verified_order_payment_risk(order_id,user_id,mode)` ship **unconditionally returning null**. There is no evidence writer, endpoint, generic webhook, manual override, polling worker, or fallback to manual/simulated shipment data. Even all enabled controls cannot grant an offer or admit an invitation with these runtime implementations.

A separately reviewed selected-provider integration must persist authoritative complete-delivery provenance. The delivery read contract returns orderId, status=complete, genuine=true, evidenceId, revision and deliveredAt. Partial, revoked, returned or corrected evidence is ineligible. A separate exact-order/account/provider-mode risk contract must return status=safe, evidenceId, revision, observedAt and matching orderId/userId/mode. Unknown, stale (older than5minutes), future-dated, partial-refund, dispute, chargeback or cancellation evidence fails closed. Paid status alone never establishes risk safety.

Future authoritative evidence writers must acquire the original Order row lock before changing evidence. Grant, first database email preparation and new checkout use serialize against that lock and recheck proof. External changes after DB preparation and before providerHTTP remain an unavoidable boundary, as does ambiguity after an attempted email; the existing frozen retry identity must not be replaced.

`/account/reviews` and `private.product_reviews.offer_notice` exist only in Spec #486. This Ticket deliberately does not access those tables. Before activation, a separately reviewed integration must install that route and connect the persisted order/offer association to truthful public-review incentive disclosure, including reviews submitted before or after an invitation. **Email wording alone is not public disclosure. That integration is not implemented here.** No live checkout qualification, provider adapter, public-review cross-Spec merge, hosted schedule, coupon creation, remote migration, or campaign activation is included.

## Local verification

`node scripts/db/test-lifecycle-combined.mjs helix-spec358-pg` installs all retained predecessor migrations and this Ticket into an owned disposable PostgreSQL17 database. Production null boundaries are proved before test-only evidence readers replace them. Historical fixture timestamp setup restores the immutable generation trigger before eligibility assertions. Tests exercise partial/revoked/unknown/adverse/stale proof, timing, unconditional offer binding, and real grant/admission, withdrawal, refund, delivery-revocation and risk-restriction races. No provider calls or real data are used.
