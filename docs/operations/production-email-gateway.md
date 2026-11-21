# Production email gateway: dark source stage

The Node POST `/api/webhooks/resend-production` is disabled by default. It does not change an existing webhook or enable support, welcome enrollment, sending or receiving. Do not retarget an active account webhook to this source stage: legacy runtime adapters are intentionally absent, and only support `email.sent` has a cleared delegate. Inbound and other support-owned events retry with 503.

## Configuration and ownership

The gateway requires `HELIX_PRODUCTION_EMAIL_GATEWAY_ENABLED=true`, its exact canonical `ORIGIN` (`https://www.helixskin.us`), its Vercel `PROJECT_ID` and a dedicated `WEBHOOK_SECRET`, all under the `HELIX_PRODUCTION_EMAIL_GATEWAY_` prefix. The secret must differ from the generic secret. Verify custody and development isolation separately.

The gateway requires the canonical customer origin, a valid raw signature, the Helix Vercel project running a Production build from `main`, and the expected parent database binding. Vercel routes the canonical domain to the promoted deployment. Each gateway and sending capability keeps its separate configuration. The event table below describes handling after those checks.

Raw verification is local, with a 128 KiB body ceiling, three-second body deadline and bounded fresh Svix headers. Existing handlers re-verify the unchanged raw body with the dedicated gateway secret. Configuration and qualification gates in those handlers remain independent.

| Owned event | Dark-stage behavior |
| --- | --- |
| Support `email.sent` | Existing support handler; only matched/duplicate storage results acknowledge. Unknown or conflicting ownership retries. |
| Support delivered, delayed, failed, bounced, complained, suppressed, received or unknown type | 503 without storage or provider reads. |
| Exact existing production confirmation/welcome tags, seven outgoing email event types | Existing welcome handler; its events/configuration guards remain active. Only recorded storage results acknowledge. |
| Unsupported owned welcome event or unconfirmed ownership | Retryable failure; malformed claims fail validation. |
| Legacy-owned outgoing or any inbound event in deployed composition | 503: no qualified frozen snapshot or legacy adapter is installed. |
| Auth/unrelated authenticated event without reserved ownership | Acknowledge without application storage. |

Conflicting reserved namespaces fail validation. Unknown reserved claims do not fall through to unrelated acknowledgement. There is no provider forwarding, content/attachment fetch, customer reply, logging of private payloads, or legacy sender in this gateway.

## Frozen legacy contracts

The injected test seam validates a versioned bounded snapshot tied to the original legacy target and a snapshot UUID. Actual identities/digests belong in private operator custody, never in Git. Outgoing matching requires exact frozen message/provider UUIDs and sender/recipient digests; a blocked intent cannot match. Explicit retained tombstones match only the exact IDs and do not pass sender, recipient or RFC metadata to a receipt adapter.

Inbound proof considers all normalized `to`, `cc`, `bcc` and `received_for` recipients. It requires an exact frozen event/provider/full-envelope record, or proved aliases resolving to one inquiry with no unrelated extra recipient. Native `support@` alone never proves legacy ownership. A complete validated snapshot may exclude native/unrelated messages without database access; absence of that snapshot must retry.

Receipt outcomes acknowledge only recorded/duplicate. Metadata queue outcomes acknowledge only queued/duplicate with a durable UUID; ignored, rate-limited, ambiguous, null-ID or unavailable outcomes retry. These tests prove the dispatch contract, not a hosted RPC, idempotency transaction or complete correspondence continuity. No snapshot/adapters are composed by the deployed route.

Before any live routing, independently review and qualify frozen extraction coverage, exact original-target receipt and queue adapters, downstream ingestion/reconciliation/retention, monitoring, unresolved provider outcomes and all non-sent support event policies. Preserve uncertain imports/intents and their original generations; email callbacks cannot resolve contact imports. Never retry/reimport, send blocked work, reconstruct redacted data or retire old obligations to make a readiness check pass.

## Support installation and restricted canary

Follow [production support operations](production-support-inbox.md) and the source-pinned manual SQL guide. Installation, private configuration, restricted owned testing and public activation are distinct stages. A source merge or dark deployment supplies none of their operational authorization or evidence.

Current support workers and admission require truthful full-media, isolation and operations qualifications in both runtime and stored controls. Resolve bootstrap with private component qualification of the actual deployed pinned decoder, private original/clean storage, download/restore, limits, native memory/deadlines and response/archive/alert coverage before enabling admission. Component qualification does not establish real Inbox delivery/threading/reply; those remain restricted-canary assertions. A separately reviewed private-artifact qualification runner may be necessary. This gateway adds no bypass or qualification endpoint.

An owned canary also needs an actually enforced, approved hosting restriction and negative access proof before turning on truthful support gates. Then prove the full text/upload/decoder/internal delivery/actual native Inbox/full media retrieval/threading/owned reply/archive chain, including the original-input and cleaned-provider boundaries. Existing local synthetic database/decoder evidence remains local proof. No flags may substitute for deployed evidence. Preserve the approved response promise and explicitly qualify real monitoring and preservation ownership.

## Release and rollback

Normal independent reviews and CI gates apply. The coordinating release owner selects the exact isolated production composition and operational queue. This dark source slice may be reviewed and deployed disabled; it is not a complete live cutover. Do not change the old webhook, rotate/revoke keys, modify network controls, install hosted SQL/storage or send a test merely because this guide exists. Provider retry destination/retention behavior and development isolation require actual evidence.

Before cutover, rollback can leave this route disabled without touching the active path. After production traffic, pause public admission/new sends as needed while retaining trusted reconciliation, the manual Inbox, records, original/clean media and archives. Preserve uncertain immutable send keys/bodies and retained obligations. Never restore development routing or credentials, drop schemas, purge data or invent a disposition as rollback.
