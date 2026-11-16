# Stripe checkout scope reassessment

Date: 2026-09-19. Requested by the owner because implementation appeared over-engineered. The owner approved lean checkout with manual exception recovery on 2026-09-19. Implementation has resumed with two bounded implementation owners and no children. This is the approved reduction, not a claim of deployed behavior or live-payment approval.

## Finding

There is excess scope. We expanded a hosted checkout integration into a custom payment recovery platform. Stripe does not replace Helix's order, rewards, ownership, and fulfillment logic, but the current milestone does not need to automate every exceptional recovery.

Compared with planning baseline `32641a0`, the three completed Tickets on the Spec Branch at `fbdda2c` change 131 files, adding 16,263 lines and removing 935. Of the additions, 9,281 are tests/database harnesses, 3,921 application code, 1,824 migrations, 1,048 operational tooling, and 189 documentation. Ticket #411 alone adds 7,809 lines. Uncommitted #412 adds approximately another 4,600 lines including its tests. These counts describe scope, not a quality metric or a promised deletion target.

This work is integrated only into the Spec Branch. No S1 database, scheduler, provider configuration, or catalog activation has been performed. The existing hosted checkout still needs actual verification; Super Serum has not been published by this work.

## Provider and application responsibilities

Stripe supports safe keyed retries with identical parameters; stored results can be pruned after at least 24 hours. Keys are not permanent duplicate protection. Official SDKs handle network retry policy when configured. A timeout or server error can leave the result indeterminate. [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [error handling](https://docs.stripe.com/error-low-level).

Stripe retries failed webhook deliveries: three times over a few hours in sandbox, up to three days in live mode. Dashboard and CLI resend are available within documented windows. Events may be duplicated and delivered out of order. Helix must make local settlement repeat-safe and must not acknowledge incomplete processing as successful. [Webhooks](https://docs.stripe.com/webhooks#event-delivery-behaviors).

Stripe's hosted Checkout guide shows fulfillment inside the webhook handler, with successful acknowledgment afterward, and requires concurrent/repeated calls to be safe. Its general webhook guidance recommends an asynchronous queue for scale. A short synchronous handler is a reasonable current choice, subject to hosted latency testing; it is not equivalent to an independently scheduled recovery service. [Hosted fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), [queue guidance](https://docs.stripe.com/webhooks#handle-events-asynchronously).

The local Stripe listener is a development forwarder. A deployed HTTPS webhook receives events directly from Stripe. Supabase RPC calls are hosted database functions, not a payment service that must run on a laptop. [Hosted webhook setup](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted).

## Recommended smaller scope

Keep:

- Hosted Checkout, server-authoritative cart and prices, immutable order terms, integer amounts, and explicit sandbox/card configuration.
- Signed raw-body webhooks, trusted payment/amount/order checks, correct shipping capture, private receipts, and truthful pending states.
- Existing transactional order/reward/referral settlement and reservation protections; one shared settlement function for webhook and authorized confirmation refresh.
- Stable attempt identity before the provider request. A lost response stays unresolved and blocks duplicate creation; do not release reservations merely because time elapsed.
- Existing full-refund safeguards and durable local exception visibility. Do not claim that partial-refund/rewards accounting is production-complete.

Remove from this milestone:

- The custom payment worker, Cron/Vault/pg_net wakeup installation, worker leases/backoff/dead-letter dispatcher, and payment replay console introduced by #411.
- #412's account-wide Session discovery, pagination cursors, candidate cycling, automatic replacement lineage, automated expiry-to-replacement, and new operator forms.
- #413's scheduler activation and worker-specific acceptance requirements. Use a short deployment/configuration/catalog runbook, not another generalized provisioning framework.

Replace those with:

1. A bounded webhook that verifies current provider facts, completes required local effects, records completion, and only then returns success. Return a retryable failure for incomplete or uncertain processing. Do not restore the old handler unchanged: it acknowledged an in-progress claim as a duplicate even when processing could still fail.
2. A small durable attempt record and Stripe SDK retries with a stable key. If cross-request replay is retained, freeze the exact request once and enforce the conservative retry window. No fresh key while the original result is unknown.
3. Recovery from a returned Session or trusted webhook metadata. Exceptional unresolved cases use Stripe Dashboard investigation/resend and a narrowly scoped verified reconciliation path; no operator action can invent payment or free uncertain reservations.
4. Normal checkout after positively verified nonpayable termination. Unknown or processing payments remain blocked; a missing URL, empty search, or elapsed clock is insufficient.
5. Hosted tests of guest/account purchase, decline/cancellation, concurrent duplicate delivery, response/attachment loss, no browser return, private confirmation, and existing reward behavior, with local services stopped. Measure webhook latency before accepting the synchronous design.

The deliberate tradeoff is manual attention after rare unresolved failures or an outage beyond Stripe's delivery retries. Automatic order settlement on ordinary successful payments remains required. A queue can be reconsidered for measured latency/load or actual asynchronous downstream work; it is not a prerequisite imposed by Stripe for this sandbox milestone.

## Independent review and delivery boundary

A separate full-stack reviewer (`stripe_scope_audit`) read the current code, baseline handler, diffs, Tickets, and primary Stripe documentation. Verdict: approve the smaller architectural direction; the current recovery platform is overbuilt for this milestone. The reviewer specifically requires completed-event deduplication, transactional/repeat-safe rewards, non-success acknowledgment for incomplete processing, bounded latency, and a manual recovery runbook. This is architectural approval, not source approval of an unimplemented replacement.

Both active implementation leads independently identified discovery, replacement, and operator automation as the largest simplification opportunities. They and their children are paused; existing work and checkpoints are preserved. No additional implementation agents, test runs, commits, or remote changes were started for this assessment.

The owner explicitly approved replacing the automatic-recovery guarantee with manual exception handling. Update the existing Spec and remaining Ticket descriptions to match. Preserve additive Git history and all existing financial records; do not revert applied database state. Retain required source review and CI, with no recursive pre-review agent tree. Production/live activation and `dev` to `main` promotion remain outside S1 authority.
