# P1 held confirmation capability seam: review candidate C1

Scope: local disabled source for Ticket #539 / Spec #538 only. No credentials are generated/provisioned, no provider/DB settings change, no real data, no sends, no worker or claim/read RPC. Configuration is not operational approval.

## Frozen issuance

The request handler creates two independent 32-byte random base64url capabilities and SHA256 hashes them. Only hashes enter generation/evidence lookup state. A fresh random UUID `requestId` identifies the issuance, independently of DB-assigned subscriber/generation/revision. The request RPC atomically binds this issuance to the new generation and request revision. One current pending generation and existing finite issuance limits remain authoritative.

A bounded held envelope contains exactly `version:1,keyId,requestId,issuedAt,expiresAt,iv,tag,ciphertext`. Its frozen decrypted JSON contains exactly recipient email, `scope:welcome_only`, immutable `wordingVersion:production_welcome_v1`, requestId, issuedAt, expiresAt, confirmationToken and preferenceToken. The caller-provided envelope is not evidence of delivery or consent. It is a future delivery input held with the generation and immutable source metadata, not a prepared provider payload or delivery attempt. P2 still must qualify its exact sender/template/provider payload before dispatch.

Runtime timestamps use an ISO UTC issuedAt and expiresAt exactly24h later. SQL rejects envelope issuance more than60sec from its clock, expiry not exactly24h from issuance, expired inputs, duplicate requestId, unknown fields, malformed UUID/key ID/base64url or envelope over8192bytes. The generation and intent expiry use that accepted expiresAt, so encryption can never extend confirmation validity. No public API returns envelope, hashes, recipient status, IDs or raw capabilities.

## Encryption and associated data

AES-256-GCM uses only `HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY` (exactly32bytes represented by64hex digits) and nonempty `HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID` (safe64-character maximum). No fallback to provider, worker, generic Supabase, Auth/support or sandbox keys. Missing/malformed encryption configuration fails enrollment closed before persistence. No key enters SQL, public responses, browser source, logs or errors.

Generate a fresh cryptographically random12-byte nonce for every encryption, never derive or reuse one. Use a128-bit authentication tag. Associated data is UTF-8 JSON of the ordered array `["helix:production-marketing:confirmation",1,keyId,requestId,email,"welcome_only","production_welcome_v1",issuedAt,expiresAt]`. Plaintext repeats these immutable fields so P2 must compare the decrypted binding to its actual intent/generation/hash records before any future admission. Any change to recipient, scope, wording, issuance, envelope/key identity or ciphertext fails authentication or that exact comparison.

Only one currently selected key/key ID is used for new issuance. Key rotation is a later separately approved operational action. P2 must resolve retained key IDs through a server-only explicitly configured allowlist, never a user-chosen filename, URL or external fetch. Unknown/missing/retired keys hold the intent and cannot generate a new confirmation or send identity. Do not delete an old key until its retained envelopes expire or are destroyed. C1 adds no multi-key resolver or decrypt endpoint to production runtime.

## Retention and restrictive capabilities

The encrypted confirmation delivery payload is retained for at most24h and only in the held intent. Confirm, withdrawal and superseding issuance cancel the held intent and clear ciphertext. An idempotent narrow service-only cleanup RPC clears expired payloads; P1 does not schedule or expose it publicly. New request/confirm/withdraw paths also clear their own stale/consumed envelopes. P2 must run cleanup before any future claim and arrange qualified scheduled cleanup before activation. Expired unread ciphertext is never eligible for dispatch even if cleanup was delayed.

Generation hashes and immutable evidence are not cleared. Old confirmation and preference hashes retain withdrawal-only authority over current consent; neither can reconfirm an old generation. In P2, the confirmation email will contain the original preference link, so clearing the consumed envelope does not invalidate the recipient's retained withdrawal link.

For later welcome messages, P2 must mint an independent withdrawal-only capability during its atomic prepare, persist its hash against the existing subscriber without granting/altering consent, and freeze that capability in the prepared message under P2's approved payload/retention contract. Existing withdrawal hashes remain valid. A new withdrawal capability is not a consent generation and does not bypass local/provider suppression. P1 does not implement that future preparation capability. There is no requirement to retain a raw confirmation capability indefinitely to support welcome withdrawal.

## Failure behavior and proof

Encryption/persistence failures produce only a generic unavailable response; no retry of an unknown write. A lost HTTP result can be retried by the human, but SQL's one-current-generation and limits prevent repeated issuance. No raw cap or key is logged. No unencrypted fallback. Boolean issued/throttled/already-pending outcomes remain identical publicly.

Keep executable tests for the ciphertext being decryptable only by its synthetic dedicated key; distinct nonce per issuance; exact24h frozen binding; tamper/key mismatch rejection; hashes matching decrypted caps; missing key fails before storage; response/storage state excludes raw caps; SQL validates bounded shape/time/UUID/unique issuance; clearing on confirm/withdraw/expiry; old hash withdrawal remains effective after clearing. Prove the actual request/confirm/withdraw handlers against disposable local PostgreSQL17, using synthetic decryption inside the test only, plus real grants/RLS/concurrency. Provider I/O remains absent.
