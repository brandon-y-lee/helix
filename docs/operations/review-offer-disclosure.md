# Historical review-offer disclosure contract

`public.has_review_winback_offer_v1(p_user_id uuid, p_product_id uuid, p_environment text)` returns only a boolean to `service_role`. Anonymous and authenticated clients cannot call it or read its private source ledger. It has no review-table dependency.

True means an unconditional review/win-back entitlement was issued for that account and product, backed by immutable original order/account linkage, original purchased Product, matching verified payment/session and exact source Order **and entitlement** environment. Invalid arguments, unsupported modes, other accounts/products, welcome/cart offers and missing evidence return false. Current email, expiry, redemption, campaign/consent state, refunds and current risk do not erase this historical association. The result does not claim an email was delivered or opened.

Consumer copy: “Next-purchase offer provided; no review required.” Spec486's separately implemented adapter uses this exact optional contract, fails closed on partial/broken installation and derives notice on every authoritative read. Deployment requires both pieces; neither branch is merged into the other. Current sandbox-only commerce and deliberately null delivery/risk readers remain unchanged.

## Verification

Standalone producer: `node scripts/db/test-lifecycle-combined.mjs helix-spec358-pg` retains all predecessor tests and real races, plus producer boundaries.

Combined actual sources, after both commits are clean:

```
node scripts/db/test-review-disclosure-combined.mjs <producer-full-sha> <consumer-checkout-root> <consumer-full-sha> helix-spec358-pg
```

The retained harness verifies both exact clean checkout heads, reads allowlisted consumer migrations/tests from the pinned Git object, and checks clean identities again after each run. Both installation orders run against uniquely owned disposable PostgreSQL17 databases in the existing labelled synthetic container. It accepts no remote database URL and performs no network/Git mutation. No feature code is copied into the opposite Spec.

Combined fixtures explicitly establish fresh synthetic live Orders, verified payment receipts and newly granted matching-mode entitlements. Test-only schema qualification enables those fresh fixtures; no sandbox row is promoted. Runtime migration constraints, adapters, checkout mode and activation flags are unchanged. Fixtures are never deployed. A reader snapshot begun before committed issuance may legitimately see prior state; the consumer must not add stale application caching after issuance.
