# Verify the live Stripe merchant with sales closed

Use the intended Helix merchant's live Stripe account and the Helix Vercel Production target. Match the account ID from the authorized merchant Dashboard independently of the server key. Development and the retained sandbox callback continue to use their own test configuration.

The server reads `HELIX_STRIPE_LIVE_ACCOUNT_ID`, `HELIX_STRIPE_LIVE_SECRET_KEY` and `HELIX_STRIPE_LIVE_WEBHOOK_SECRET` for `CHECKOUT_MODE=live`. Store credentials as sensitive server-side Production settings. The webhook secret belongs to the live destination. The earlier sandbox signing secret belongs to the existing sandbox receiver. Keep each in its own setting. A partly enrolled live configuration also closes new Checkout Sessions.

On the exact reviewed main build, request `GET /api/internal/release-status?checkout=1` through the existing protected release reader. Verify its deployment ID and Git SHA, live merchant match, Stripe charge and payout status, and closed admission. Before the live destination is enrolled, expect `settlementConfigured: false`. After supplying its signer, the field becomes true. The check reads the Stripe account. It creates no Order or Session. Signed delivery, settlement of funds and fulfillment each require a separate observation.

For a held build, `verifyClosedLiveCheckout` in `scripts/release/observations.mjs` first resolves the expected deployment ID and commit through Vercel using a read-only credential supplied as `vercelToken` or `HELIX_RELEASE_VERCEL_TOKEN`. It sends the release-reader token only after the authenticated Production build and its immutable hostname match. The canonical reader uses the fixed customer origin.

The live handler at `https://www.helixskin.us/api/webhooks/stripe` requires the reviewed release on the public origin and both verified settlement migrations on its database. Keep admission closed while qualifying this destination. In the intended Stripe account, use the application's pinned API version and select these six events.

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

The handler verifies the original signed request body and reads the authenticated merchant, Checkout Session, complete line items and expanded payment facts. Refund reconciliation reads the original Charge and its full refund history. Dispute handling reads the original Dispute and checks its Charge and PaymentIntent against a Helix Order. Use a restricted server key with the read permissions for those objects. A healthy GET or configured secret proves reachability or configuration. Confirm delivery and acknowledgment separately in the correct Stripe destination's event history.

Transient provider and storage failures produce a retryable response. A previously processed event is idempotent. For a disagreement about the merchant, Order, accepted price or payment facts, inspect the durable event outcome and the original payment in Stripe before taking any action. Escalate a recorded dispute through Stripe Dashboard. Reconcile the original Session when its creation response was lost. Never create a replacement Session in response to an event. Customer receipts show the stored gross and refunded amounts after the owner or guest capability is verified.

Preserve the historical sandbox receiver for its already-issued Sessions, receipts and refunds. Exercise new development checkout on its isolated child data and authorized stable testing origin. Scope any Vercel rule to that named origin. Confirm the handler actually received the event before treating an edge response as an application observation.

Real sales require verified stock and an approved live offer. Rehearse payments in Stripe sandbox. After activation, observe the first genuine sale. [Stripe testing guidance](https://docs.stripe.com/testing)
