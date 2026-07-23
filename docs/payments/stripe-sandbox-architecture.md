# Stripe Sandbox Checkout Architecture

Date: 2026-07-23

Mei Pelle Checkout is sandbox-only. Live Stripe keys, live Stripe events, live
Checkout Sessions, real fulfillment, shipping labels, live customer
communications, and real Trustpilot invitations are out of scope until a future
approval explicitly enables them.

## Official Sources Inspected

- Stripe Sandboxes: https://docs.stripe.com/sandboxes
- Stripe Checkout overview: https://docs.stripe.com/payments/checkout
- Checkout Session create API: https://docs.stripe.com/api/checkout/sessions/create
- Checkout fulfillment: https://docs.stripe.com/checkout/fulfillment
- Webhook signature verification: https://docs.stripe.com/webhooks/signature
- Idempotent requests: https://docs.stripe.com/api/idempotent_requests
- Checkout discounts: https://docs.stripe.com/payments/checkout/discounts
- Stripe Tax with Checkout: https://docs.stripe.com/tax/checkout
- Refunds: https://docs.stripe.com/refunds
- Test cards: https://docs.stripe.com/testing
- Stripe CLI webhook forwarding: https://docs.stripe.com/stripe-cli
- Dynamic payment methods: https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- Afterpay/Clearpay: https://docs.stripe.com/payments/afterpay-clearpay
- Payment Method Messaging Element: https://docs.stripe.com/elements/payment-method-messaging

## Runtime Contract

- `CHECKOUT_MODE=sandbox`
- `CHECKOUT_ENABLED=true` is required to initiate Checkout.
- `STRIPE_SECRET_KEY` must be `sk_test_*`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, when present, must be `pk_test_*`.
- `STRIPE_WEBHOOK_SECRET` must be configured for signature verification.
- `STRIPE_STANDARD_SHIPPING_RATE_ID` is required only when the cart does not
  qualify for free standard shipping.
- `STRIPE_AUTOMATIC_TAX_ENABLED=true` enables Stripe Tax in sandbox.

The app lazily validates Stripe configuration at server boundaries. Builds and
non-checkout routes still run without Stripe credentials. `stripe@22.3.0` is
pinned through the lockfile and uses explicit API version `2026-06-24.dahlia`.

## Checkout Initiation

The browser posts to `/api/checkout/sessions`. The server:

1. Resolves auth and the current server-backed cart.
2. Reloads products, variants, canonical prices, availability, and quantities
   from Supabase.
3. Rejects empty, unavailable, inactive, or malformed cart lines.
4. Resolves one internal discount at most: points reward or referral offer.
5. Calculates free-shipping eligibility after discounts using the shared `$50+`
   helper.
6. Creates an immutable pending order and order-item snapshot.
7. Reserves points when a points reward applies.
8. Creates a Stripe-hosted Checkout Session with canonical `price_data`.
9. Stores the Stripe Session ID and payment attempt.

Stripe is not the catalog source of truth. Stripe metadata contains internal IDs
and environment markers only, never addresses or payment-card data.

## Afterpay/Clearpay

Checkout Sessions omit `payment_method_types`, so Stripe's test-mode dynamic
payment-method configuration determines which eligible methods appear. This
preserves card and wallet support while allowing `afterpay_clearpay` only when
the Stripe account, customer, USD amount, and US checkout context are eligible.
The application does not calculate installment terms.

Active product PDPs can render Stripe's Payment Method Messaging Element beneath
the primary purchase action. The element receives the selected catalog variant's
integer-cent price and `USD` currency from the server-rendered product model and
is restricted to `afterpay_clearpay`. It is not mounted when sandbox Checkout is
incompletely configured, the publishable key is missing or not `pk_test_*`, the
product is unavailable, or the amount is invalid.

Test-mode account onboarding and the test-mode Payment methods configuration
must both permit Afterpay/Clearpay before either Checkout or product messaging
can display it. Do not alter live-mode payment-method settings.

## Webhook And Finalization

`/api/webhooks/stripe` reads the unmodified raw body, verifies the
`Stripe-Signature` header, rejects `livemode: true`, records the event ID, and
processes events idempotently.

Handled events include:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

The success page may retrieve a paid sandbox Session as a bounded fallback, but
the redirect alone is not fulfillment. Finalization verifies sandbox mode,
currency, totals, and order state before marking an order paid, awarding purchase
points once, creating private-feedback eligibility, qualifying referrals, and
removing only purchased cart quantities.

Completed Sessions with an unpaid status remain processing and do not clear the
cart. A customer cancellation expires an open Stripe Session before releasing
the pending order, reward reservation, or referral attribution. New webhook
audit rows retain event and object identifiers rather than full provider
payloads.

## Operational Notes

Run `pnpm stripe:sync:sandbox` with sandbox credentials to create or verify the
four required coupons:

- 200 points -> $5 off
- 400 points -> $10 off
- 600 points -> $15 off
- referral -> 15% off

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Do not store Stripe secrets in Supabase tables. Do not use live keys in this
repository.
