# Disabled production support source package

Ticket #528 / Spec #527, outcome #524. This directory is deliberately **outside** `supabase/migrations`. Nothing discovers, installs or activates it automatically. It contains no operational target identity, secrets, networking, polling/cron, storage grants or customer-send mechanism.

## Installation boundary

`install.sql` is a single transaction intended for a trusted owner/operator with BYPASSRLS. It refuses to replace an existing private schema. The future operator must first obtain action-specific installation approval, independently verify the exact selected production project and effective development-access cutover, inspect grants/default privileges and the reviewed source, and use the separately approved installation procedure. Do not run ordinary dev migration discovery against this package. No hosted installation was performed for this Ticket.

The singleton contract has null project/contract identity, zero capacity/quotas and five false controls: admission, worker, full-media qualification, isolation qualification and operations qualification. Source includes no setter RPC or operational identity values. Future operator configuration is a distinct approved action. These flags are operator attestations, not independent evidence of actual storage, provider, custodian, access isolation or operational readiness. Full-media and operational qualification remain mandatory; no text-only release is permitted. Admission can pause independently of draining owned work. Signed owned callbacks can reconcile even while admission and worker are off.

`legacy-alias-resolver.sql` is a **separate** manual-only installation on the separately verified legacy reconciliation target, after appropriate approval. It does not install the production schema and `install.sql` does not install it. It only checks opaque SHA256 digests against all exact normalized stored legacy reply aliases. It does not read provider bodies or fetch attachments. Missing legacy relation fails closed.

## Data and RPC boundary

`support_production_private` is non-exposed. Every table forces RLS. PUBLIC, anon, authenticated and service_role have no direct schema/table/function privileges, even when service_role has BYPASSRLS. Public SECURITY DEFINER functions use `search_path=pg_catalog`; only service_role gets EXECUTE. Trusted owners/operators remain trusted. No generic support, commerce or email-intent tables are reused.

- `read_support_prod_contract()` returns `{projectRef,contractId,admissionEnabled,workerEnabled,fullMediaQualified,isolationQualified,operationsQualified}`.
- Other production functions take a single `p_input jsonb`. All require `projectRef` and `contractId` matching the stored contract. Unknown keys fail closed.
- `submit_support_prod_inquiry`: additionally `submissionId,payloadHash,capabilityHash,sourceHash,emailHash,name,email,inquiryType,subject,body,photos`. Photos are ordered `{uploadId,contentType,byteSize}` declarations. It returns stable `{inquiryId,submissionId,status:"saved",outboxId,photoStatus:"declared",reservedBytes}`. Exact canonical text/manifest, supplied payload hash and capability hash are all compared on retry. Source changes do not charge a retry again.
- `claim_support_prod_outbox`: additionally `leaseId` (fresh UUID on every claim) and `leaseSeconds` (30–120), returning one `{outboxId,leaseId}` or null. Lease IDs cannot be reused.
- `start_support_prod_send`: additionally `outboxId,leaseId`, returning `{outboxId,requestText,requestHash,idempotencyKey,attemptCount,firstAttemptAt}` or null. It commits the permanent first-attempt marker before the caller can perform its bounded provider call. A lease can prepare once.
- `complete_support_prod_send`: additionally `outboxId,leaseId,outcome` (`accepted`, `unknown`, `rejected`) and `providerEmailId` UUID only for acceptance; returns a fenced boolean. Rejected work is held for reconciliation, not rekeyed.
- `record_support_prod_sent`: additionally `outboxId,deliveryToken,providerEmailId,messageId,from,to,eventId`, returning `matched`, `duplicate`, `conflict` or `unmatched`. The caller must verify the signed provider event first. Matching requires an already-owned first attempt, exact token/envelope and immutable provider UUID/RFC Message-ID. Callback correlation remains available when paused and after the automatic retry window.
- Separate legacy RPC: `support_legacy_reply_aliases_match(p_address_hashes text[]) -> boolean`. Requires a nonempty one-dimensional array of at most 100 lowercase64hex digests. Every digest must match a stored exact normalized alias. No domain/prefix inference.

The outbox freezes JSON text, its SHA256 and `support-primary:<outbox UUID>` idempotency key at admission. All retries use these exact serialized bytes/key. From is `Helix Website <contact@helixskin.us>`, To is only `support@helixskin.us`, visitor is Reply-To only, subject is `Helix Website inquiry <outbox UUID>`. Visitor subject/message appear only in plain text. Provider REST tags are the opaque outbox ID, contract ID and unguessable64hex per-outbox delivery token (`helix_support_outbox`, `helix_support_contract`, `helix_support_delivery`). Do not log requests, text, token or private event payloads.

The first-attempt horizon is 20 hours, before provider24-hour idempotency expiry. Unknown work retries only the same frozen body/key before that horizon, then remains held for reconciliation. Provider acceptance or an `email.sent` callback is **not** proof of native Inbox arrival. Provider UUID and actual RFC Message-ID are separate immutable fields. No customer send, auto-ack, reply, forwarding, AI, CC/BCC or late-media send exists here.

## Capacity and preservation

Admission serializes the identity, three independent hourly source/email/global limits, capacity reservation, validated text/manifest and primary outbox in one transaction. Default limits are zero. Production thresholds require separate operational approval. Each declared slot reserves 14 MiB (10 MiB raw + 4 MiB clean), even for one declared byte: max five slots reserve70 MiB although accepted original aggregate remains20 MiB. No upload is minted or object accepted in T1. No capacity release, record deletion, cleanup or retention routine is provided. Originals/unassessed records stay preservation-held by default; future media/assessment work must preserve this boundary.

## Local proof

Run `node scripts/db/test-production-support-contracts.mjs`. It uses only the existing running `helix-spec358-pg` container, verifies label `helix.task=spec358-synthetic-sql`, exact image `public.ecr.aws/supabase/postgres:17.6.1.159` and PostgreSQL17, and creates/drops one uniquely owned database. It never starts/removes the container, changes shared roles/security, reads credentials or calls a provider. Synthetic fixtures configure identity/controls only inside that database. Concurrent proofs observe a second actual connection blocked on the admission lock before releasing the first transaction. Provider mutations stay zero. This is local contract proof, not production readiness or qualification.
