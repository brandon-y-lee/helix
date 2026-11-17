# Production support: disabled source seams

Tickets #528–530 / Spec #527 supply isolated text persistence, private-photo transport/processing, primary and media outboxes, and signed sent-metadata reconciliation. The full UI/source path is complete; operational admission remains disabled by default pending independently qualified operations. The completed-source marker is not activation authority. No hosted target or service is configured or activated.

## Dedicated server-only configuration

All names below start with `HELIX_PRODUCTION_SUPPORT_` and have no generic Supabase, email or Resend fallback:

- `ORIGIN`: exactly `https://www.helixskin.us`.
- `PROJECT_URL`, `PROJECT_REF`: an explicit matching `https://<ref>.supabase.co` pair. Runtime also checks the independently stored project and contract identity before submission, claiming work or provider access.
- `CONTRACT_ID`: the configured UUID identifying the separately installed private SQL contract.
- `SERVICE_ROLE_KEY`: only the selected production support project's server credential.
- `ABUSE_SECRET`: a dedicated HMAC secret for purpose-separated source/email admission digests. Production accepts only the Vercel-supplied `x-vercel-forwarded-for` IP, never a generic proxy-header fallback.
- `WORKER_SECRET`: independent internal bearer authentication.
- `RESEND_SENDING_KEY`: a dedicated domain-restricted **sending_access** key. Runtime uses only Send Email REST, not receiving or full-access reads.
- `PHOTO_BUCKET`: a separately approved private production bucket, bound to `photoBucket` in the stored contract. The legacy support and catalog buckets are rejected. No bucket is created here.
- `SENT_WEBHOOK_SECRET`: a dedicated signing secret for the production `email.sent` endpoint. Verification is local and needs no sending/read key.

`ADMISSION_ENABLED`, `WORKER_ENABLED`, `FULL_MEDIA_QUALIFIED`, `ISOLATION_QUALIFIED` and `OPERATIONS_QUALIFIED` all default to false. Stored controls must independently be actual booleans and qualified for the requested action. `VERCEL=1` and `VERCEL_ENV=production` are mandatory; a present `VERCEL_TARGET_ENV` must also be `production`. Request URLs must use the exact canonical origin.

These values and controls are configuration/operator attestations, not proof of the project's production role, effective development-access retirement, provider scope, media implementation or operational readiness. No operational target identity or credential is supplied by this module.

## Entry points and limits

- `GET/POST /api/support/production/intake`: the completed media implementation is still behind every dedicated runtime/stored operational gate. Under defaults GET reports unavailable and POST admits nothing. There is no deployed test/environment bypass or temporary text-only release. Synthetic tests inject adapters into domain seams only. A qualified success means a durable saved receipt, not native Inbox delivery.
- `POST /api/support/production/photos`: operationally disabled by default. Capability-bound admission reuses an immutable declared slot and path; completion only queues byte verification. Status returns processing outcomes, not proof of Inbox delivery. No file bytes pass through this route.
- `POST /api/internal/support-production-photos`: independently authenticated, one claimed photo or one immutable media preparation per invocation, with a 35-second processing deadline inside a 60-second function duration and 120-second database lease. A stored lease-count limit starts at zero. It is not an OS process/RSS limit.
- `POST /api/internal/support-production-dispatch`: authenticated, bounded, awaited processing of at most one owned outbox item. It accepts no body or an empty JSON object, with a 256-byte streamed cap and one-second body deadline; no arbitrary worker options. Database leases fence completion. The permanent first-attempt marker precedes network access. Primary retries use the database's unchanged serialized request/hash/idempotency key; media reconstructs the version-pinned bytes from the immutable recipe and hash-verified clean objects before recording a provider attempt; unknown outcomes are not definite pre-send failures. Automatic retries stop at 20 hours. Admission may pause independently of draining qualified owned work.
- `POST /api/webhooks/support-production-sent`: bounded raw-body signature verification precedes namespace filtering. Well-formed unrelated account-level `email.sent` events are acknowledged without support database access or database/abuse credentials. Missing/empty/non-support string tags are unrelated; malformed tags or reserved `helix_support_` claims cannot bypass strict validation. Owned events require fixed-envelope, owned outbox/token, provider UUID and actual RFC Message-ID reconciliation. It does not receive/fetch email bodies or attachments, and can reconcile already-owned attempts while admission and worker controls are paused.

No cron or other scheduler is installed. No automatic acknowledgement, customer reply, forwarding, AI, CC/BCC, subscription or account/order lookup exists here. New code does not modify sandbox acknowledgement/reply controls or workers. The only legacy ingress change excludes native production recipients before persistence, with a fail-closed exact stored-alias exception. Native-only or definitively unmatched mixed mail is acknowledged as excluded. Resolver timeout/error/unavailability or a malformed response instead produces a retryable failure without persistence, preserving a possible legacy obligation for a later successful retry.

SQL installation, preservation/capacity controls and disposable database proof are documented in `supabase/operations/support-production/README.md`. The UI retains the owner-confirmed response countdown. Independently authorized operational qualification remains separate and closed. See `docs/operations/production-support-inbox.md` for the read-only packet, owned canary, private preservation and pause procedure.

## Photo/media preservation and transport

Five JPEG/PNG/WebP originals remain limited to 10 MiB each and 20 MiB accepted aggregate. Every declared slot retains the full 14 MiB reservation (10 MiB raw plus 4 MiB clean), including rejected, expired or uncertain uploads. No deletion, capacity-release or disposal path is introduced. Capacity exhaustion closes new admission rather than deleting evidence. Minting is bounded and non-upsert; signed Storage URLs are not invalidated by Auth-key rotation.

The worker records actual original type, byte count and SHA256 under a fenced lease before accepting or decoding it. The isolated decoder preserves the existing full-decode/container, metadata stripping, 25 MP/10k dimension and 2560px/4 MiB clean limits. Original objects remain preserved on failure. Local decoder success is not a proof of hosted packaging, memory headroom or production execution.

Media waits for the verified primary RFC Message-ID, keeps the primary subject and freezes ordered attachment membership and parent permanently. Late-ready photos become new media work. A version-pinned recipe and exact serialized hash avoid another large payload object. Five maximum cleaned attachments require 27,962,040 Base64 bytes before envelope/JSON; the dedicated serialized request cap is 29,000,000 bytes. Base64 never traverses the small metadata RPC boundary. Only one assembly runs per Node process. A reconstruction mismatch is held for reconciliation, never automatically split, mutated or rekeyed.

Actual maximum-size provider acceptance, native Inbox grouping, complete operator attachment retrieval, private archive restoration, platform memory/deadline headroom and provider quota/isolation remain unverified operational prerequisites. A 5×4 MiB synthetic-buffer serialization test does not establish those facts. The manual native-Inbox reply path is separate from these internal media sends.
