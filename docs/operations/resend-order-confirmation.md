# Restricted demo Order confirmations

Ticket #431 / Spec #430 provides source and local verification only. The database migration installs disabled admission controls. No Resend account configuration, hosted scheduler, SMTP change, remote migration, or email send is performed by this Ticket. R1-10 must review an exact activation manifest and verify the actual hosting plan and cadence before enabling hosted delivery. There is no paid-plan upgrade or production promotion authorization.

## Data and delivery contract

The existing shared `finalize_verified_checkout_payment` transaction creates the email intent with the first eligible paid transition. Stripe webhook settlement and receipt-authorized status recovery already use this transaction. A redirect does not create intent. Fixed Order Lines, amounts, Order Number, the verified delivery address, and the verified recipient are copied into the private intent. Missing or malformed recipients produce an `unsendable` intent while legitimate payment still commits. There is no Account-email fallback, recipient replacement, or historical backfill. A refunded Order cannot generate another confirmation.

Admission requires the separate database control to be enabled and the Order to have been created on or after its activation boundary. Enabling admission cannot select an earlier boundary. Replaying an older paid Order or settling an Order created before activation creates no email. Re-enabling admission starts a new boundary; it does not sweep old work.

Dispatch is independent of financial settlement. `GET` or `POST /api/internal/email-dispatch`, authenticated with `Authorization: Bearer <HELIX_EMAIL_DISPATCH_SECRET>`, claims at most five private intents per invocation. Each claim has a five-minute lease. Before the first provider call, a database transaction freezes the entire rendered request (including sender, recipient, Reply-To, website links, subject, bodies and correlation tags), stable idempotency key, and first-attempt timestamp. Later deployments or domain changes cannot alter that request.

The provider request has an eight-second deadline. Lost responses, timeouts, 409s, and server errors retain uncertainty; HTTP 429 is retryable, 401/403 needs operator attention, and other rejected requests are failed. Only bounded retries of the same request/key are possible: five attempts in total, exponential delay from one minute, and a conservative 23-hour cutoff from the first possible send. The provider's documented idempotency lifetime is 24 hours. Neither an operator retry nor a stale lease resets that clock or counter. Expired uncertainty requires reconciliation, never a new key and blind resend.

`POST /api/webhooks/resend` verifies the original bounded request body using the Resend SDK/Svix signing contract and persists minimal receipts before acknowledgement. It needs the signing secret and restricted environment, independently of the API key or dispatch switch. The opaque message tag, environment, prepared sender/recipient, and unique provider ID correlate callbacks, including callbacks that arrive before the send response. Delivered, bounced, complained, and suppressed facts cannot regress because a delayed or sent callback arrives later. Conflicting provider IDs are preserved as inspectable evidence. After future content cleanup, the retained logical identity and already-bound provider ID still prevent replay and permit delivery reconciliation.

## Private configuration

Use the server-only variables documented in `.env.example`. The web origin, sending identity, and Reply-To are independent. `helixskin.vercel.app` supplies website links; it is not an owned email sending domain. Configure an exact verified Resend account-owner recipient privately. Optional simulators are exactly `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`, and `suppressed@resend.dev`; labeled aliases are intentionally not enabled in this initial contract. An unapproved recipient remains blocked, with no private receipt redirected to another address.

The template is explicitly a demo purchase: no real charge, no goods shipped. It includes receipt facts and a configured `/contact` link. It contains no Stripe Session ID, receipt-cookie capability, authenticated Order URL, or invented carrier link. A fresh browser receives no additional private Order access from the email.

Domain changes require the new sender/receiving DNS and exact configuration to be verified in the later operational manifest. Existing prepared requests retain their original identities and links. Keep the old domain and incoming-reply routing available for those in-flight messages; do not rewrite an attempted message to use a new sender.

## Inspection and recovery

The narrow operator command uses only the approved non-production Supabase project `erasogmsqpgiirovubjh` and a privileged server credential. It has no public browser route and does not print recipient addresses, bodies, tokens, photo URLs, or raw provider errors. Supply private environment values through an approved secret source; for a local environment file, set `DOTENV_CONFIG_PATH` to its path without printing its contents.

```sh
pnpm email:deliveries inspect
pnpm email:deliveries inspect --id <message-uuid>
pnpm email:deliveries retry --id <message-uuid> --expected-updated-at <inspected-timestamp>
```

The first two commands are read-only. The third returns a plan. After investigating the exact message, append `--apply --confirm-project erasogmsqpgiirovubjh` to queue an eligible retry. This changes only the chosen intent, uses a timestamp comparison against the inspected state, and sends nothing directly. The database refuses missing/invalid recipient correction, already-accepted delivery, suppression/bounce/complaint, exhausted attempts, expired idempotency, deleted content, or stale inspection. Inspect `conflictCount` and `errorCode` before retrying; fix configuration only when consistent with the existing frozen request.

For an uncertain send, inspect Resend's delivery record using the opaque message tag and original attempt time, without copying private content into logs. A matching signed callback can reconcile the existing intent; replay that existing provider event through the configured webhook during the approved operational rehearsal. If acceptance cannot be established and the safe retry window is over, leave the intent uncertain and record an operator decision. Do not invent nonacceptance, change recipients, reset attempts, or generate another confirmation.

## Disable and rollback

These controls have different purposes:

- The database `order_confirmation` control stops **new intents**. `read_order_confirmation_email_control` exposes its nonsecret revision; `configure_order_confirmation_email` changes it with an exact revision comparison. This does not stop already accepted work.
- `HELIX_EMAIL_DISPATCH_ENABLED=false` stops **new dispatcher invocations from sending queued work**. Already running requests can finish; preserve their leases, frozen requests, and callbacks. Verify hosted disable behavior during activation.
- Retain Stripe settlement credentials and Resend webhook verification while reconciling accepted financial and delivery events. Provider outages or email disablement never reverse paid Orders, rewards, cart effects, or history.

Rollback changes admission and dispatch controls, then deploys a reviewed compatible version if needed. Do not delete the migration or email identities, reset the database, rewrite historical Orders, or remove webhook reconciliation for outstanding sends.

## Restricted hosted rehearsal (R1-10)

Before any apply or send, record and approve the exact code SHA, Vercel target/origin, approved Supabase project, Stripe sandbox account, Resend account/sending identity, receiving Reply-To, signed webhook, allowed owner/simulators, disabled-to-enabled control revision, and hosting plan/cadence. This Ticket adds the authenticated endpoint but does not choose or configure a scheduler. Provider simulators consume quota and prove event processing, not delivery to a human mailbox.

With local listeners stopped, create new controlled guest and account demo Orders using an allowed address from the start. Prove normal return and no-return webhook settlement, then owned recovery/replay: one paid Order, original rewards/cart effects, one confirmation intent, and one provider email. Verify mobile/desktop HTML and plaintext receipt facts, demo labels, contact link, and privacy. Exercise blocked recipients, provider outage, interrupted send, callback replay/out-of-order events, bounce/complaint/suppression, disable/re-enable, and an attempt outside the safe retry window. Record only sanitized IDs, timestamps, exact code SHA, outcomes, and the distinction between actual mailbox receipt and simulator events. Tracking on these same Orders belongs to R1-02; do not claim tracking proof from confirmation alone.

## Local verification and sources

`node scripts/db/test-order-email-contracts.mjs <synthetic-container>` runs against a disposable PostgreSQL 17 database in a container labeled `helix.task=spec358-synthetic-sql`. It refuses an unlabeled container and accepts no remote database URL. It verifies real overlapping transactions, atomic financial/intent commit and rollback, restricted grants/RLS, frozen recipients and request bodies, historical exclusion, lease fencing, callback ordering, attempt limits, and identity retention. The approved high-level TypeScript delivery/route seams use provider stubs for network failures, without claiming hosted delivery.

Current provider contracts consulted: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [raw webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [delivery event types](https://resend.com/docs/webhooks/event-types), [test recipients](https://resend.com/docs/dashboard/emails/send-test-emails), and [API errors](https://resend.com/docs/api-reference/errors). Real hosted proof remains required in the R1-10 manifest and Spec closure.
