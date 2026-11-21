# Operate the first Helix Checkout offer

The Helix cart opens Stripe Hosted Checkout for one approved variant. A customer can buy more than one unit while stock lasts. Staging the application, connecting Stripe and installing the database schema leave new payment admission closed. Opening production requires both the deployment's admission switch and an open sale policy on the production database.

## Bind the two issuers

| Setting | Production | Development rehearsal |
| --- | --- | --- |
| Database and mode | Production parent, `CHECKOUT_MODE=live` | Persistent development child, `CHECKOUT_MODE=business_sandbox` |
| Merchant and server key | `HELIX_STRIPE_LIVE_ACCOUNT_ID`, `HELIX_STRIPE_LIVE_SECRET_KEY` | `HELIX_STRIPE_DEV_ACCOUNT_ID`, `HELIX_STRIPE_DEV_SECRET_KEY` |
| Destination signing secret | `HELIX_STRIPE_LIVE_WEBHOOK_SECRET` | `HELIX_STRIPE_DEV_WEBHOOK_SECRET` |
| New Session switch | `HELIX_STRIPE_LIVE_ADMISSION_ENABLED` | `HELIX_STRIPE_DEV_ADMISSION_ENABLED` |
| Storefront and Checkout return | `https://www.helixskin.us` | `https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app` |
| Stripe destination | `https://www.helixskin.us/api/webhooks/stripe` | `https://helixskin-dev-payments.vercel.app/api/webhooks/stripe` |

Scope settings to Production or the development storefront's exact Preview branch, `codex/558-verified-dev-preview`. Keep its storefront protected. Allow the signed POST on the dedicated callback host. Preserve the frozen personal-sandbox receiver at `https://helixskin.vercel.app/api/webhooks/stripe` and its original `STRIPE_WEBHOOK_SECRET` for issued payments. Each business environment needs its own Helix merchant binding, mode-correct key and distinct signer. Keep credentials in sensitive server-side settings.

Use a restricted Stripe key that can read its own account, Checkout Sessions and line items with their expanded payment method, product, price, tax, shipping and discount details. Refund and dispute handling also reads the original Charge, PaymentIntent, Refunds and Dispute. Admission needs permission to create a Checkout Session with inline product and price data and read the selected shipping rate. Refunds and dispute responses are owner actions in Stripe Dashboard. The application collects a US shipping address and accepts card payments in USD.

## Enroll the offer while closed

1. Verify the intended Supabase target and writer. On each database, the original owner enrolls the reviewed settlement and first-Order capabilities for that target's restricted writer. Verify the protected forward run for `20261121073052`, `20261121073053`, `20261121075612` and `20261121075613` in order. The schema creates no offer or stock. [Environment bindings](environment-bindings.md) · [First-Order owner enrollment](../../supabase/operations/release-bootstrap/enroll_first_order_checkout.sql)
2. Obtain the owner's approved SKU and variant, current USD unit price, counted saleable quantity, shipper, dispatch and return terms, shipping amount and free-shipping threshold. Match the offer to the published terms customers receive. Verify the issuer's fixed USD shipping rate has exclusive tax behavior and confirm automatic tax and the product tax code. Use explicit test quantities in the child. [Published terms](../../content/legal/terms.tsx)
3. Connect directly as the verified database owner. Run the policy script with `-v operation=enroll` and `-v sale_policy="$HELIX_POLICY_JSON"`. The full JSON contains `project_ref`, `provider_environment`, `account_id`, `variant_id`, `sku`, `currency`, `unit_price_cents`, `approved_units`, `shipping_cents`, `free_shipping_threshold_cents`, `shipping_rate_id`, `shipper`, `automatic_tax_enabled`, `tax_behavior`, `tax_code`, `dispatch_terms` and `return_terms`. Initial enrollment is closed. [Policy script and validation](../../supabase/operations/business-checkout/enroll-sale-policy.sql)

For inspection, supply only the first five identity fields. This example uses the already authenticated operator connection and a JSON shell variable containing those fields.

```sh
psql -X -v ON_ERROR_STOP=1 -v operation=inspect -v sale_policy="$HELIX_POLICY_IDENTITY_JSON" \
  -f supabase/operations/business-checkout/enroll-sale-policy.sql
```

## Qualify and open

Configure the correct account's destination at API version `2026-06-24.dahlia`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded` and `charge.dispute.created`. Verify routing and signed delivery in that destination's event history. Rehearse the purchase and private receipt in the business sandbox. On an immutable held build the webhook refuses financial events. Canonical signed delivery remains pending until the reviewed build serves that destination and a genuine delivery is observed.

On the held Production build, verify the deployment ID and SHA using the protected `GET /api/internal/release-status?checkout=1` reader. Check merchant identity, charge and payout capability, `settlementConfigured` and `admissionOpen: false`. The reader verifies the immutable hostname through Vercel before sending credentials. Retain fresh hosted observations for the actual build, database, merchant, destination and offer. [Release reader](../../scripts/release/observations.mjs)

For an authorized opening, set the corresponding deployment switch to literal `true`. Inspect the policy again. Supply `operation=open` with the exact enrolled JSON plus `expected_policy_version` equal to the returned `policy_version`. Verify enabled status and available units. Production opening also requires the reviewed build to be serving the canonical domain. Confirm `admissionOpen` on that build and observe the first genuine customer purchase. Use the business sandbox for test payments. [Stripe testing guidance](https://docs.stripe.com/testing)

## Settle, fulfill and recover

Admission reserves units atomically against the cart snapshot and locked sale policy. Verified payment consumes the reservation once. A confirmed unsent attempt or verified terminal unpaid Session releases it. Returning to the cart or losing a Stripe response keeps the stock held.

The original buyer can use **Continue checkout** to return to a bound Session, including when the offer sells out. While sales remain open, Helix can recover an interrupted original send for 12 hours. It repeats the same merchant request, API version, body and idempotency key. The database compares the recorded request digest and spaces attempts by at least ten seconds. Beyond that window, leave the reservation held and inspect the original merchant's request logs and Session in Stripe Dashboard. Match the original Order, Attempt and nonce before reconciliation. A verified signed event can settle the original even after automatic recovery ends. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

Signed-in customers see owned Orders. Guests need the issuing Session's private receipt cookie. Verified cumulative refunds update the receipt; disputes and contradictory payment facts enter operator review. Fulfill paid Orders from their verified shipping details and record actual dispatch through the existing operator screen. [Manual shipments](manual-shipments.md)

To halt new orders, run `operation=pause` with the five identity fields, inspect the result, and switch off the matching deployment admission flag for future builds. Keep the original account, signer, callback and settlement-capable build available for in-flight payments, refunds and receipt access. Inspect Stripe and the recorded Helix outcome before intervening in a disputed or uncertain payment.
