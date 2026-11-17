# Production support: disabled source seams

Ticket #528 / Spec #527 supplies isolated text persistence, photo declarations, a primary outbox and sent-metadata reconciliation. It does not implement full private media, route the Contact UI, configure a hosted target or activate support.

## Dedicated server-only configuration

All names below start with `HELIX_PRODUCTION_SUPPORT_` and have no generic Supabase, email or Resend fallback:

- `ORIGIN`: exactly `https://www.helixskin.us`.
- `PROJECT_URL`, `PROJECT_REF`: an explicit matching `https://<ref>.supabase.co` pair. Runtime also checks the independently stored project and contract identity before submission, claiming work or provider access.
- `CONTRACT_ID`: the configured UUID identifying the separately installed private SQL contract.
- `SERVICE_ROLE_KEY`: only the selected production support project's server credential.
- `ABUSE_SECRET`: a dedicated HMAC secret for purpose-separated source/email admission digests. Production accepts only the Vercel-supplied `x-vercel-forwarded-for` IP, never a generic proxy-header fallback.
- `WORKER_SECRET`: independent internal bearer authentication.
- `RESEND_SENDING_KEY`: a dedicated domain-restricted **sending_access** key. Runtime uses only Send Email REST, not receiving or full-access reads.
- `SENT_WEBHOOK_SECRET`: a dedicated signing secret for the production `email.sent` endpoint. Verification is local and needs no sending/read key.

`ADMISSION_ENABLED`, `WORKER_ENABLED`, `FULL_MEDIA_QUALIFIED`, `ISOLATION_QUALIFIED` and `OPERATIONS_QUALIFIED` all default to false. Stored controls must independently be actual booleans and qualified for the requested action. `VERCEL=1` and `VERCEL_ENV=production` are mandatory; a present `VERCEL_TARGET_ENV` must also be `production`. Request URLs must use the exact canonical origin.

These values and controls are configuration/operator attestations, not proof of the project's production role, effective development-access retirement, provider scope, media implementation or operational readiness. No operational target identity or credential is supplied by this module.

## Entry points and limits

- `GET/POST /api/support/production/intake`: the deployed `FULL_MEDIA_IMPLEMENTED` source constant is **false**, independently of every environment flag. GET reports unavailable; POST cannot admit text-only production work. There is no deployed test/environment bypass. Synthetic tests inject adapters into domain seams only. Once future source and operations qualify, success still means a durable saved receipt, not native Inbox delivery.
- `POST /api/internal/support-production-dispatch`: authenticated, bounded, awaited processing of at most one owned outbox item. It accepts no body or an empty JSON object, with a 256-byte streamed cap and one-second body deadline; no arbitrary worker options. Database leases fence completion. The permanent first-attempt marker precedes network access. Every retry uses the database's unchanged serialized request/hash/idempotency key; unknown outcomes are not definite pre-send failures. Automatic retries stop at 20 hours. Admission may pause independently of draining qualified owned work.
- `POST /api/webhooks/support-production-sent`: bounded raw-body signature verification precedes namespace filtering. Well-formed unrelated account-level `email.sent` events are acknowledged without support database access or database/abuse credentials. Missing/empty/non-support string tags are unrelated; malformed tags or reserved `helix_support_` claims cannot bypass strict validation. Owned events require fixed-envelope, owned outbox/token, provider UUID and actual RFC Message-ID reconciliation. It does not receive/fetch email bodies or attachments, and can reconcile already-owned attempts while admission and worker controls are paused.

No cron or other scheduler is installed. No automatic acknowledgement, customer reply, forwarding, AI, CC/BCC, subscription or account/order lookup exists here. New code does not modify sandbox acknowledgement/reply controls or workers. The only legacy ingress change excludes native production recipients before persistence, with a fail-closed exact stored-alias exception. Native-only or definitively unmatched mixed mail is acknowledged as excluded. Resolver timeout/error/unavailability or a malformed response instead produces a retryable failure without persistence, preserving a possible legacy obligation for a later successful retry.

SQL installation, preservation/capacity controls and disposable database proof are documented in `supabase/operations/support-production/README.md`. Full-media T2/T3 source and independently authorized operational qualification remain separate and closed.
