# Hosted sandbox checkout: exception recovery

The maintainer operating the sandbox is responsible for checking Stripe Workbench failed deliveries during each rehearsal and after an outage. There is no custom scheduler or automatic recovery console. Normal payments settle automatically through the public HTTPS webhook; no local listener is required.

## Check a failed delivery

1. Confirm the approved Stripe sandbox account and the existing Helix webhook destination. Check the event's delivery status and the hosted deployment's logs. Use the sanitized failure category; do not paste addresses, emails, raw event payloads or credentials into tickets.
2. Repair the actual configuration/provider/database problem. Confirm the hosted endpoint signing secret matches that destination, not a local Stripe CLI listener. Keep existing-payment settlement enabled even when new checkout admission is off.
3. Use **Resend** on the original event in Stripe Dashboard. Verify a successful delivery and the corresponding private Helix Order. Success means required local settlement finished, not just that Helix received the request. Concurrent resends are safe because Order and reward operations are idempotent.
4. If delivery still fails, retain the Order and its reservations and investigate the recorded payment exception. Never manually mark an Order paid, clear its cart, or release reserved benefits to silence an error.

Stripe automatically retries sandbox delivery three times over a few hours. Dashboard resend is available for 15 days; CLI resend for 30 days. This milestone deliberately requires manual attention after those automatic retries. [Stripe delivery behavior](https://docs.stripe.com/webhooks#event-delivery-behaviors).

## Checkout creation returned no usable result

The application records its Attempt before provider creation and permits one Session creation call, including bounded SDK retries with the same key. If the response or local attachment is lost, the Attempt stays unresolved. A browser retry does not create another Session or release its reservations.

Inspect the original request and Session in the approved Stripe account using the Order/Attempt metadata and request key. A positive match must agree with the immutable local Order, sandbox environment and payment amounts; a manually copied identifier alone is not proof. The original signed completion or expiration event can bind and reconcile that Session even if browser attachment failed. Resend that event when necessary.

For a known open unpaid Session that must be abandoned, expire that exact Session through Stripe's supported controls, then deliver its expiration event and verify that Helix accepts the terminal state. A subsequent normal checkout can begin only after the original is positively nonpayable. Do not create a replacement while a payment is processing or its outcome is unknown.

If no conclusive Session or event can be found, leave the purchase blocked and escalate the request to Stripe support or a reviewed maintenance repair. An empty listing, old idempotency key, or elapsed clock does not prove that nothing happened. No blanket database reset or automatic historical repair is provided.

## Refunds and release limits

The existing full-refund path verifies successful returned amounts and completes supported local reward/referral effects. A failed local effect stays an exception and requires repair/resend. Partial, pending and failed refunds are reviewed in Stripe Dashboard. Complete live refund accounting, spent-points debt, fulfillment and production payment activation remain outside this sandbox milestone.

Rollback stops new checkout admission and republishes the offer as unavailable through the catalog's audited Publish flow. Preserve webhook settlement, private confirmation, existing Orders, rewards and provider references.
