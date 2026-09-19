# Hosted sandbox payment recovery preparation

Ticket #411 prepares the hosted worker. `pnpm payments:plan` performs authenticated reads only. It reports fixed resource identities, configuration presence, extension/signature/privilege inventory, safe inbox identifiers and state, pending age, and worker heartbeat age. Missing credentials, unavailable migrations and failed reads remain unverified. It never schedules a job, changes a secret, updates Stripe, replays an event or publishes a Product. Only the `plan` command is accepted.

The command may use existing local `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` values. It prints none of them and never prints raw provider errors, SQL definitions, cron commands, logs, request headers or Vault values. The management query endpoint enforces read-only SQL. Its first query uses database catalogs and tolerates absent extensions; its second query reads only counts and booleans about the fixed job and Vault reference after the required relations exist. Inventory contains extension versions, exact required function contracts, effective privilege risk counts, custom definer signatures needing review, and catalog execution prerequisites. A failed or malformed stage remains unverified; missing or unsafe observed prerequisites report failed checks. A passed database inspection means those automated checks passed, not that indirect custom code, actual denial probes, delivery or deployment have been approved. Presence of local configuration does not establish the effective configuration of a deployed function.

## Exact proposed resources

| Resource | Approved target |
| --- | --- |
| Supabase | `erasogmsqpgiirovubjh`, nonproduction only |
| Stripe account | `acct_1Tm9WRFEzyaKzdmq`, sandbox only |
| Existing Stripe endpoint | `we_1U6GHJFEzyaKzdmqVxkG9jRC` |
| Endpoint URL and API | `https://helixskin.vercel.app/api/webhooks/stripe`, `2026-06-24.dahlia` |
| Worker target | `POST https://helixskin.vercel.app/api/internal/payments/reconcile` |
| Job / wrapper | `helix-sandbox-payment-reconciliation` / `private.wake_sandbox_payment_worker()` |
| Cadence / timeout | Every minute / 50,000 ms |
| Work / route limits | 40 seconds, at most 20 items / Node duration 60 seconds |
| Credential references | Vercel `PAYMENT_WORKER_SECRET`; Vault `helix_sandbox_payment_worker_secret` |

This command does not inspect Vercel. Separate official-CLI `59.23.2` inventory on 2026-09-19 verified the restored account access and `helixskin.vercel.app` mapping to a ready preview deployment of `dev` at planning SHA `32641a092d213e93e21bfd629784cb6fcea91d5a`. That deployment does **not** contain the S1 worker. The observed Hobby plan with Fluid Compute supports the proposed 60-second Node duration, but neither observation proves the final deployed route or effective configuration. Fresh mapping to the reviewed integrated `dev` SHA, endpoint access, current plan capacity and complete shared-consumer protection are mandatory before activation. `main` promotion remains unauthorized.

The desired Stripe event set adds `refund.created`, `refund.updated` and `refund.failed` to `charge.refunded`, `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. #413 may update only that exact existing endpoint after fresh account, mode, identity, URL and API checks. Preserve its signing secret and API version. A missing endpoint or conflicting destination is a blocker, never permission to create a replacement.

## Activation preconditions retained for #413

1. All approved source Tickets are integrated through Combined Spec review and the integration gate into the exact recorded `dev` SHA. Inventory every deployed consumer of the shared catalog. Preserve settlement on old accepted checkouts while preventing unsafe new creation.
2. Verify the current project's entitlement/capacity, extension availability and actual signatures, Vercel Node duration, fixed endpoint access and deployed configuration. No new paid plan is authorized. Supabase ignores explicit extension version clauses; inspect installed versions after any approved bare extension installation.
3. Assign an actual active admin Operator to supervise the run. Discovering a membership alone is not assignment. The Operator checks `/admin/payments` every five minutes and at run end.
4. Apply only reviewed compatible migrations after fresh migration-history checks. Re-run `payments:plan`. Read-only SQL inspection cannot substitute for migration compatibility, privilege-denial probes or actual delivery evidence.
5. Use the prepared `scripts/payments/scheduler.sql` only through the guarded #413 manifest. Inspect the existing job first; preserve unexpected jobs and stop on drift. The template prepares one **inactive** job. It does not activate it or provision credentials.
6. Provision one dedicated random 32-byte canonical base64url credential (43 characters) in the fixed Vault reference and the server-only Vercel variable using secure provider input/parameter binding. Never embed it in SQL text, command arguments, cron configuration, logs, screenshots or repository artifacts. No customer/anon credential may substitute.
7. Before queueing that credential, prove ordinary/public/catalog-role denial on Vault, cron metadata/logs and pg_net queues/responses, including effective inherited and column permissions. Queue UPDATE access is dangerous because changing its URL can disclose an already queued credential. Inspect old response helper definers and indirect wrappers/views. Preserve existing catalog sender owner privileges and demonstrate unchanged catalog delivery after ACL hardening.
8. After a final fresh manifest check, enable exactly the recorded prepared job with the installed supported `cron.alter_job` function. Verify one exact enabled job, authenticated worker execution, genuine signed delivery, durable receipt/recovery and a completed heartbeat with local forwarding and application/database services absent. Cron success only proves a wakeup was queued; it does not prove reconciliation.

The trusted infrastructure boundary includes documented Supabase platform database administration roles. Supabase explicitly permits platform Read-Only project collaborators to access secrets, and its image grants `pg_read_all_data` to `supabase_read_only_user` and `supabase_etl_admin`. Review actual project membership before credential provisioning. This preparation protects application/customer/catalog roles and flags unexpected custom database grants or ownership; it preserves documented platform administration access. See [Supabase access control](https://supabase.com/docs/guides/platform/access-control) and the [official initial schema](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql).

The app inbox is the durable work record. The pg_net queue is only a wakeup mechanism and must not become a second payment queue. Scheduler health derives from the latest completed heartbeat at read time: five minutes old or missing is stale. Pending work fifteen minutes old is overdue even if no worker ran to create an incident. The command always leaves activation readiness false: deployment/operator/hosted proof belongs to the guarded rollout, not a local inspection.

If activation fails, keep new admission disabled while preserving receipt, reconciliation and historical payment facts. An uncertain job write is reconciled by fresh job identity/state inspection before another write. A paused schedule may be disabled through its exact recorded job ID; do not delete payment history, reset balances or disable accepted settlement.

## Local regression checks

`pnpm exec vitest run tests/payment-operations-plan.test.ts tests/payment-scheduler-inventory.test.ts tests/stripe-sandbox-webhook.test.ts` checks the read-only caller, redaction, prerequisite drift, exact event set and strict inventory parser.

`pnpm exec tsx scripts/db/test-payment-scheduler.ts helix-spec358-pg` checks the SQL against PostgreSQL 17 in the existing labeled local test container. It creates and removes one temporary database and fixture roles, using inert HTTP/Cron/Vault interfaces. It covers absent extensions, inactive/idempotent preparation, direct/column/sequence/composed-role and ownership denials, indirect views, job/function drift, and preserved catalog fixture delivery. It makes no real HTTP request or scheduler change. These checks do not establish installed hosted extension behavior, actual project ACLs or hosted delivery; those remain #413 evidence.

## Documentation checked

Current source facts were checked on 2026-09-19 using the research and Supabase skills. Supabase documents [Cron with pg_net and Vault](https://supabase.com/docs/guides/functions/schedule-functions). HTTP work begins after transaction commit and pg_net stores its supplied headers in its queue; upstream [pg_net v0.20.3 SQL](https://github.com/supabase/pg_net/blob/v0.20.3/sql/pg_net.sql) includes broad PUBLIC table grants. [Supabase platform setup](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000003-post-setup.sql) adjusts sender privileges, so installed privileges must be measured rather than inferred from upstream defaults.

Supabase's [extension version change](https://supabase.com/changelog/extension-version-pinning-ignored) applies from 2026-08-05. [Direct cron table changes are unsupported](https://supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed). Use the installed supported cron functions. Stripe's [refund events](https://docs.stripe.com/refunds#refund-events) and [webhook delivery rules](https://docs.stripe.com/webhooks) require current provider reconciliation; event arrival order cannot establish current payment facts. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) documents the route export, while actual project entitlement and deployed behavior still need verification.
