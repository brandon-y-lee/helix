# Verify the live Stripe merchant with sales closed

Use the intended Helix merchant's live Stripe account and the Helix Vercel Production target. Match the account ID from the authorized merchant Dashboard independently of the server key. Development and the retained sandbox callback continue to use their own test configuration.

The server reads `HELIX_STRIPE_LIVE_ACCOUNT_ID`, `HELIX_STRIPE_LIVE_SECRET_KEY` and `HELIX_STRIPE_LIVE_WEBHOOK_SECRET` for `CHECKOUT_MODE=live`. Store credentials as sensitive server-side Production settings. The webhook secret belongs to the live destination. The earlier sandbox signing secret belongs to the existing sandbox receiver. Keep each in its own setting. A partly enrolled live configuration also closes new Checkout Sessions.

On the exact reviewed main build, request `GET /api/internal/release-status?checkout=1` through the existing protected release reader. Verify its deployment ID and Git SHA, live merchant match, Stripe charge and payout status, and closed admission. Before the live destination is enrolled, expect `settlementConfigured: false`. After supplying its signer, the field becomes true. The check reads the Stripe account. It creates no Order or Session. Signed delivery, settlement of funds and fulfillment each require a separate observation.

Keep the new production destination at `https://www.helixskin.us/api/webhooks/stripe` unregistered until its live handler is ready on the public route. Preserve the legacy test destination for its outstanding Sessions, refunds and retries. Exercise the development checkout on its isolated child data and authorized stable testing origin. Keep Vercel rules scoped to that named origin. A firewall or authentication denial is distinct from an application assertion.

Real sales require verified stock and an approved live offer. Rehearse payments in Stripe sandbox. After activation, observe the first genuine sale. [Stripe testing guidance](https://docs.stripe.com/testing)
