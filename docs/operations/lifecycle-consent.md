# Lifecycle consent and authenticated activity foundation

Ticket483 / Spec482 is source and local proof only. No remote migration, provider resource, configuration, scheduler or email send is performed. Existing welcome-v1 generations and their frozen receipts remain valid; they never qualify for lifecycle behavior capture.

## Intake and upgrades
`POST /api/marketing/subscription` keeps the old welcome request when `scope` is absent or `welcome`. Lifecycle requires `scope: lifecycle`, explicit `consent: true`, and source `email_preferences` or `welcome_popup`. The server records fixed wording version `2026-11-13-lifecycle-v1`. `HELIX_LIFECYCLE_ENABLED=true`, existing restricted email configuration and separate private `HELIX_EMAIL_LIFECYCLE_CONTRACT` with `version: lifecycle_v1` are required. This foundation contract has the same three approved native template slots as welcome-v1; Ticket485 owns subsequent purpose/offer integration. Never use an old welcome-only confirmation template for lifecycle approval: publish/approve matching lifecycle wording separately.

Both the database control and application flag default off. The service-only optimistic `read_lifecycle_consent_control` / `configure_lifecycle_consent` pair does not change existing email dispatch controls. Only future explicit requests qualify; no old subscribers are silently upgraded.

An existing confirmed welcome subscriber keeps their original active generation while a next-generation upgrade confirmation is pending. Each pending request is token-bound, expires in 24 hours and snapshots base generation/revision. Withdrawal or provider denial during that interval invalidates the upgrade. Confirmation atomically switches generation, records new immutable lifecycle evidence and schedules existing provider preference synchronization. The prior native Topic binding cannot change to evade opt-out. Native global/Topic denial remains authoritative; no native opt-in is written. Old preference links still withdraw the current subscription. Confirming an already-consumed valid capability is idempotent.

Lifecycle confirmation uses the shared confirmation dispatcher and immutable template envelope, not a second sender. Existing order, support, tracking and waitlist preparation checks are retained verbatim; only confirmation-generation lookup supports a pending upgrade. This Ticket deliberately does **not** enqueue lifecycle welcome promotions: it retains a private current-generation preference capability for offer-aware admission in Ticket485. The stored capability is never logged or returned to the browser.

## Activity and privacy
`POST /api/marketing/activity` accepts only a bounded canonical `productSlug`, same origin, verified server auth, restricted environment and enabled flag. The database independently reads current verified Auth email through a narrow service-only private lookup, then requires confirmed current lifecycle consent. No user ID, email, timestamp, availability or consent is accepted from the browser. Anonymous/unverified/nonconsenting browsing is not persisted.

The public PDP mounts a five-second visible-page signal only when the server application flag is on. Navigation aborts it; it stores no cookies, local identifier or history. Backend rejects unavailable/unpublished products and coalesces one latest product per account, at most one accepted visit per minute.

Cart insert/delete/meaningful quantity/product/variant changes are captured in the same database transaction, only for verified authenticated owners with current lifecycle consent. Read/no-op updates do not rearm. A global sequence supplies mutation revisions so cleanup cannot reuse an old logical identity. No old carts are backfilled. Downstream admission must read current cart contents/availability/conversion and enforce the Spec’s cooldown; activity is not send authorization. Existing cart mutation locks precede address/subscriber activity locks; downstream workers must not invert that ordering by locking a cart after holding a marketing address lock.

`read_lifecycle_activity(user_id)` is service-only, rechecks current consent, and returns no email. `cleanup_lifecycle_activity(limit)` removes at most 1000 stale rows older than 30 days or immediately ineligible rows; it never deletes consent evidence, template generations, message or offer identities. Ticket485 owns the bounded internal scheduler invoking cleanup. No hosted schedule is added here.

## Local verification
`pnpm exec vitest run tests/lifecycle-*.test.ts tests/marketing-*.test.ts`

`node scripts/db/test-lifecycle-consent.mjs helix-spec358-pg`

The SQL harness refuses unlabeled containers, creates a unique owned disposable PostgreSQL 17 database, and executes the full existing product-notification suite after installing the migration, plus lifecycle assertions and real competing transactions. No remote database URL/provider calls are accepted. Confirming/withdrawing remains usable while new requests are paused. Activation requires separately approved matching native templates, database/app controls, recipient policy and provider proof; source tests do not establish operational sending.
