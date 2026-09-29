# R1 — Resend customer service and event email

Status: **DRAFT FOR OWNER APPROVAL — no implementation authorization inferred for this exact package.** Shared scope accepted September 28, 2026, excluding abandoned-cart and replenishment campaigns. Source baseline: remote `dev` at `2471aa8e162456266cc80de3e2d744537aaaf030`. This document is a review artifact; GitHub Issues will be canonical after approval and publication.

## Problem statement

Helix can create and verify Stripe Sandbox Orders, but lacks operated support intake and reliable customer email. The owner needs to demonstrate confirmation and tracking through the actual demo-order flow, manage private support conversations inside Helix, and use Resend's existing marketing capabilities without building a second email platform.

## Solution and completion

Integrate Resend as the email provider with environment-specific identities, reliable delivery, and a small private support workspace. Reuse native templates, audience tools, and appropriate welcome Automations. Helix remains authoritative for authentication, customer access, verified commerce facts, consent evidence, and support-reply approval.

Demonstrate a fresh guest and account Sandbox Checkout, automatic order confirmation, and simulated tracking notices under restricted development delivery. Support accepts web inquiries and email replies, stores bounded private photos, and lets an authorized Operator write or review a reply before sending. Marketing subscription is explicit and confirmed; a welcome series is the only behavioral marketing journey in R1. Existing Product Waitlist Enrollment remains a separate purpose.

Working AI drafting remains a required but externally gated outcome. Qualification of the proposed Pro-funded hosted worker is a direct prerequisite only for its AI Ticket. Other source implementation can proceed. Under the single Spec Branch delivery workflow, final integration into dev and hosted activation still wait for all required Tickets, including qualified AI drafting. The Spec remains open while required AI or hosted acceptance is unresolved. No paid API fallback is assumed. If the owner later wants the deterministic service released separately, split the delivery boundary explicitly rather than silently reducing this Spec.

## User stories

1. As a Visitor, I can submit a Support Inquiry and receive an honest acceptance state even during a provider outage.
2. As a Customer, I can reply by email and have it associated with the correct private Inquiry.
3. As a Customer, I can attach supported product or damage photos without making them public.
4. As an Operator, I can see conversations, status, delivery failures, and authorized Order context inside Helix.
5. As an Operator, I can write, edit, approve, and send a specific reply once, including after a retry.
6. As the owner, I can request an AI draft in Helix once subscription qualification passes, review it, and retain control of sending.
7. As an Operator, I can continue replying manually when AI is unavailable or quota-limited.
8. As an Account Holder, I receive verification, recovery, and configured account-security emails without changing existing authentication semantics.
9. As a demo Customer, I receive one clearly labeled confirmation after verified payment even if I never return from Stripe.
10. As a demo Customer, I receive clearly labeled simulated shipment and delivery notices for the same Sandbox Order.
11. As a Customer, I never receive an invented shipment fact or gain another person's Order access from an email link.
12. As a subscriber, I explicitly choose and confirm marketing and can stop future promotional messages.
13. As a subscriber, I receive the approved welcome sequence without duplicate enrollment or a backlog of delayed messages.
14. As a Visitor, I can request one Product's availability notice independently of general marketing.
15. As the owner, I manage campaigns and templates using Resend's native tools and inspect failures without exposing private content in logs.
16. As the owner, I can switch the web and email domains through reviewed configuration without rewriting business logic.
17. As the owner, I can demonstrate all enabled flows with controlled recipients and preserve a clear boundary from real payments and Fulfillment.

## Scope and authority

| Area | R1 contract |
| --- | --- |
| Website | Existing Next.js/Vercel application; development origin `https://helixskin.vercel.app` |
| Data | Approved non-production Supabase project `erasogmsqpgiirovubjh`; additive history-preserving changes |
| Stripe | Existing verified sandbox integration; no live keys, charges, account changes, or payment-economics changes |
| Email development | Only verified Resend account owner and supported official simulator recipients; require explicit restricted-mode configuration |
| Support | Private Helix inbox, web/email intake, manual replies, bounded photos, optional owner-requested AI drafts with mandatory approval |
| Marketing | Confirmed subscription, preferences, native campaign management, two-message welcome, independent Product availability notice |
| Fulfillment | Simulated Shipment events for eligible Sandbox Orders; provider-neutral event contract, no actual 3PL integration |
| AI | Existing Pro preference preserved; supported and eligible hosted runtime must be demonstrated before activation |
| Delivery | Reviewed Tickets into a Spec Branch, then reviewed integration into `dev`; no `main` promotion |

## Implementation decisions

### Provider boundary and configuration

Use a narrow server-owned email service for message intent, approved templates, recipient policy, and delivery state. Prefer Resend's native capabilities over custom editors or a generalized workflow system. Assess Inboxes beta or Chat SDK reuse without requiring unverified beta enrollment; Helix must retain durable authorization and approval evidence regardless of transport.

Configure website origin, sending identities by purpose, receiving address, Reply-To, provider credentials, webhook secret, environment, and recipient policy separately. Never derive a sending domain from the web origin. `vercel.app` is not an owned verified email domain. Missing or mismatched configuration fails closed with an actionable Operator state. Secrets remain server-only. Domain migration must preserve private links and in-flight conversations, and verify the new sender/receiving DNS before activation.

Use one durable logical-message identity for each business occurrence. Persist intent with the accepted business transition or provide equivalent gap-free transactional handoff. An independent hosted dispatcher claims bounded work with leases and retry backoff. Concurrent invocations cannot dispatch the same logical intent twice. A provider timeout after acceptance is uncertain, not automatically failed. Preserve provider identifiers and stable idempotency keys; reconcile uncertain attempts rather than blindly replaying outside the provider window. No Resend request runs inside payment settlement; existing trusted Stripe verification is preserved.

Raw-body signed Resend webhooks persist event receipts before acknowledgement, deduplicate, tolerate out-of-order events, and update delivery facts without rewriting business history. Forged events cannot change state. Bounce, complaint, suppression, and transient failure have distinct outcomes; never work around suppression by changing senders. Do not log bodies, addresses, raw payloads, tokens, or photo URLs. Resend delivery failure must not reverse a paid Order.

### Order confirmation and demo tracking

The shared verified-paid transition used by Stripe webhook settlement and receipt-authorized recovery creates confirmation intent. It uses fixed Order Lines, quantities, totals, currency, Order Number, and the verified customer-email snapshot. A browser redirect is never proof of payment. Pending, failed, expired, mismatched, or unverified attempts produce no paid confirmation. Re-verification and duplicate provider events preserve one logical confirmation. A paid-to-refunded transition must not create another confirmation.

Freeze the recipient chosen at first verified settlement in the message intent. Missing or malformed email becomes an inspectable unsendable intent; it must neither invalidate legitimate payment nor fall back to an unrelated Account address. Delivery-address content comes from the separately verified checkout delivery record; do not trust legacy Order shipping columns that may contain billing data. Update active checkout, FAQ, terms, and operational disclosures when enabling demo email so they no longer promise that no email can occur; preserve historical Stripe-spec evidence and the no-real-charge/no-real-fulfillment notices.

Enable confirmations only for eligible Orders accepted after the activation boundary. Do not automatically backfill old Orders. For testing, create controlled new demo orders using an allowed email from the start. A blocked recipient produces an inspectable blocked state; never rewrite it to the owner's address or send arbitrary Order details elsewhere.

Sandbox subjects and bodies clearly say the purchase is a demo, no real charge occurred, and no goods will ship. Links use the configured Helix origin. Existing authenticated/guest receipt access remains private; Session IDs and Order Numbers grant no access, existing cookie tokens are never copied into emails, and a fresh browser is not promised access it does not have. R1 may omit a guest Order-detail link rather than invent a second authorization system; the message still includes its bounded receipt details and support path.

A capability-protected, auditable development simulator accepts only a currently paid, non-refunded Sandbox Order, existing Order Lines, bounded quantities, and the transitions below. It creates a distinct Simulated Shipment identity, supports partial/split shipments without exceeding ordered quantities, and records dispatched/in-transit/delivered/exception events. Dispatch, delivery, and exception notifications each have distinct durable event identities. Intermediate tracking can update the timeline without another email. Allocation across split Simulated Shipments is atomic and cannot exceed each Order Line quantity under concurrent requests. Notification uniqueness refers to the committed shipment transition, not only a caller-supplied event ID. Replay and stale events do not regress delivery or repeat notices. No labels, real carrier links, stock operations, or external fulfillment requests are created.

| Current simulated state | Accepted next state | Result |
| --- | --- | --- |
| None | Dispatched | Atomically allocate valid line quantities and create one dispatch notice |
| Dispatched | In transit, delivered, or exception | Record newer event; delivery/exception may create one notice |
| In transit | Delivered or exception | Record newer event; create one relevant notice |
| Exception | In transit or delivered | Require explicit Operator resolution; update state and notify only for delivery |
| Delivered | None | Terminal; replay is a no-op and conflicting later changes require review |
| Any state on a refunded Order | None | Freeze further simulation and new notices, preserving all prior history |

The same Order can demonstrate confirmation and subsequent simulated tracking, including missing payment, wrong-owner denial, repeated events, and provider failure. Emails and any tracking view say the carrier events are simulated. Real fulfillment later requires its own authenticated provider adapter and activation; Stripe never supplies shipment truth.

### Authentication

Preserve Supabase's token, session, verification, recovery, and email-change authority and existing SSR/cookie behavior. Configure Resend through custom SMTP for supported configured Auth actions rather than generating replacement tokens. Keep auth tracking off. Verify safe redirects, expired/used links, resend limits, generic recovery responses, and no accidental duplicate sending through two integrations. Restricted delivery applies to Auth too; if the chosen SMTP route cannot enforce the permitted recipient boundary in the verified development account, do not activate it until that boundary is proved. Do not weaken verification or switch broad public users into a broken auth configuration.

### Support and attachments

Persist accepted Support Inquiries and receipt-acknowledgement intent before showing success. Provide validation, bounded abuse controls, same-origin browser mutations, and truthful unavailable/error states. Initially the owner operates support with explicit support capabilities, separate from catalog capabilities. Read access, mutation access, and attachments are authorized server-side; private tables and storage deny cross-customer/catalog-only access. No public caching.

Associate inbound email by expected recipient and opaque conversation correlation plus known message history; ambiguous/forwarded mail requires Operator review. Sender address and reply headers alone never prove customer or Order ownership. Avoid automatic disclosure of private Order facts in acknowledgements. Prevent mail loops and inappropriate replies to automated/bounce traffic. Render sanitized text or safe HTML without loading tracking content.

Approval binds the exact Inquiry revision, recipient set, subject, body, and outgoing attachments. New inbound context or material edits invalidate stale approval. Concurrent approval/retry cannot send twice. Internal notes never enter the outgoing body. Inquiry closure and message delivery status remain separate. Recheck the approval binding when claiming queued work for dispatch, not only when the Operator approves. Show queued, sent, delivered, blocked, failed, and uncertain states truthfully.

Allow up to five JPEG/PNG/WebP photos per Inquiry message, each at most 10 MiB, with additional total request, decoded-pixel, and processing-time limits. Validate actual content, strip unnecessary metadata, store privately, and provide short-lived authorized access. Reject active content and unsupported files; do not trust filenames or provider MIME claims. Retry ingestion safely before temporary provider URLs expire. Photos are Operator-visible and excluded from AI input in R1. Customer-facing failures explain rejected/processing files without exposing infrastructure detail.

### Consent, welcome, and Product availability

Use explicit unchecked Marketing Consent and address confirmation. Store purpose, wording version, source, and request/confirmation/withdrawal timestamps in Helix. Provider Contacts or Segments are not permission. Synchronize preferences without restoring withdrawn consent from stale events or imports. Necessary auth, order, and support messages do not depend on a marketing subscription.

Proposed welcome: one message after confirmed subscription and one educational follow-up three days later, once per subscription generation. Prefer native Automations after proving recipient restrictions, withdrawal, Topics, and duplicate-event behavior. Template/campaign approval covers an immutable reviewed version. Native broadcasts remain operated in Resend; R1 does not build a campaign console. Proposed shared promotional policy is at most one message per address in 24 hours and three in seven days, including manually initiated campaigns; prove provider enforcement or restrict activation to the reviewed welcome sequence until a coordinated policy is established. Do not silently bypass the cap with a native send. Enforce the cap across subscription generations too: rapid withdrawal/reconfirmation must not create repeated immediate welcomes, revive an old delayed run, or make multiple generations eligible concurrently. A welcome-only activation still requires those tests.

Product Waitlist Enrollment sends one requested notice for that Product's next canonical transition to Purchasable, with independent withdrawal and a proposed 12-month expiry. Do not replay already historical transitions or enroll every waiting address into marketing. Preserve existing consent evidence and allow fresh test enrollments to opt into both independently. Define purchasability using existing catalog authority, not a static fixture or an Algolia-only change. No abandoned-cart/replenishment events, schedules, templates, or dormant scaffolding belong in R1.

### AI qualification and reply generation

First obtain authoritative eligibility evidence for the exact owner-only hosted Pro use and verify a suitable supported runtime. Prefer an official Codex SDK/noninteractive worker only if those conditions hold. No copied browser sessions, unsupported token proxy, public unauthenticated worker, shared account, or paid fallback. A successful login or synthetic completion alone does not establish entitlement.

After qualification, the owner requests a draft inside Helix. Helix assembles a minimized selected Inquiry snapshot, approved public knowledge, and only authorized private facts. The isolated worker receives no mail, payment, refund, database, browsing, shell, attachment, or admin mutation tools. Return constrained text and references; save only an unapproved draft for the current Inquiry revision. Deduplicate jobs, bound concurrency/time/retries, reject stale results, and audit model/version and approval without retaining unnecessary sensitive payloads.

Test privacy controls, credential isolation/refresh/revocation, restart recovery, cancellation, quotas, and no hidden billing fallback. Escalate uncertain policy, safety, privacy, or account-security requests to a human. No invented dispatch, refund, medical, or performance claims. Manual replies remain available throughout. Do not label AI operational until real qualified integration and support-quality evaluation pass.

### Retention and operation

Proposed defaults: routine Inquiry text 12 months after closure; photos 90 days after receipt; unsent drafts 30 days after creation; minimal operational audit 12 months; synthetic development records 30 days. Reopening resets the closure clock. Apply narrow documented holds for safety/legal needs; do not extend all data indefinitely. Delete derived copies, revoke access, and reapply deletion decisions after backup restoration. Immutable commerce/accounting records follow their own existing lifecycle and are not deleted by support cleanup. Retain a minimal non-PII logical-message identity or tombstone while its business occurrence remains replayable; deleting message content, audit detail, or synthetic records must not make an old Order/transition/enrollment eligible for another send. Provider storage/retention must be verified and disclosed; temporary download URL expiry is not a deletion guarantee.

Use durable hosted scheduling for dispatch and cleanup with an authenticated endpoint and bounded work. Verify the actual provider/hosting plan supports the chosen cadence before selecting it; no paid upgrade is authorized. At activation capture exact code SHA, Vercel target/origin, Supabase project, Stripe sandbox identity, Resend identity/domain/webhook/templates, allowed test recipients, and enabled purposes. Default operational tools are read-only plans; apply is drift-checked, narrow, and repeat-safe. Disabling new email work preserves financial settlement, accepted inquiries, delivery reconciliation, and history.

## Testing decisions

Prefer existing high-level checkout reconciliation and private-service seams; add one shared email-intent/dispatch contract rather than tests for each helper. Provider stubs exercise failure edges, while hosted acceptance proves real delivery. Use real database concurrency/RLS tests where database guarantees are claimed.

| Proof | Required outcomes |
| --- | --- |
| Payment-to-confirmation | Guest/account actual sandbox flow; no-return webhook settlement; owned recovery; pending/failed/expired/mismatch; replay and concurrent refresh; one logical confirmation; no PII rerouting |
| Delivery resilience | Accepted send with lost response; duplicate worker; crash/retry; stale lease; replay outside 24 hours; provider outage; delayed/out-of-order webhook; bounce/complaint; blocked recipient; independent payment success |
| Simulated Tracking | Same paid demo Order; partial/split quantities; wrong environment/owner; invalid progression; replay/stale updates; one relevant notice per event; no real fulfillment side effects |
| Auth | Verification/recovery/email-change actions in use; link replay/expiry/scanners; safe redirects; restricted recipients; original SSR/cart behavior |
| Support | Durable intake; threaded reply; private authorization; invalid/stale approval; concurrent sends; loop/forwarded mail; prompt injection; HTML safety; private photo rejection/limits/expiry |
| Marketing/availability | Double opt-in, withdrawal/Topic precedence, duplicates/reordered events, native welcome restrictions, cap, Product-specific request, no inferred consent, no excluded journeys |
| AI | Eligibility/runtime proof plus synthetic support-quality and isolation evaluation; then qualified owner-only job, stale draft, quota/reconnect, manual fallback; no model tools/send authority |
| Retention | Fake-clock expiry, holds, derived files, failed cleanup retry, backup restoration behavior, preservation of financial history |
| Browser | In-app browser at 390×844 and 1440×900 for contact, private inbox, preferences, and demo receipt/tracking; keyboard/focus, truthful states, no overflow, no public private-data cache |
| Hosted | Fresh controlled Stripe demo Orders, real signed provider callbacks and allowed-recipient delivery with local listeners stopped; simulated tracking clearly labeled; exact deployed SHA and sanitized evidence |

Source/tooling Tickets close after their applicable reviews and Ticket gate. R1-10 provides activation tooling, local verification, and the exact operational runbook; its closure does not require the later Combined Spec Review or live provider rehearsal. After all Tickets are integrated and closed, the sole Spec Closer performs Combined Spec Review, merges the passing Spec PR into dev, and executes the separately approved restricted activation against that exact merged SHA. The Spec stays open if operational acceptance fails. Ticket gate: frozen dependency install, lint, typecheck, and complete Vitest. Combined Spec integration gate additionally retains a production build and complete Chromium verification. Provider-dependent acceptance is separate from mocked CI. Do not claim a simulator delivery event proves a human mailbox receipt. SMTP changes, hosted activation, and actual sends require the approved operational Ticket and exact reviewed manifest, not generic Spec approval.

## Out of scope

Abandoned-cart/replenishment campaigns; real 3PL/carrier integration; real shipment creation, label purchasing, returns/refunds automation; live Stripe or production-domain cutover; public autonomous support replies; custom campaign/workflow builders; photo interpretation by AI; paid inference fallback; historic Order email backfill; transferring the owner's Pro login to other users; promotion to `main`.

## Further notes

The owner's demo-email direction supersedes the historical no-email restriction in the Stripe Spec only for this bounded integration. Preserve Stripe history and existing financial guarantees. Operational evidence missing from #408 is not silently declared complete. [Research and source evidence](../research/resend-scope-confirmation-2026-09-28.md). [Proposed implementation Tickets](./resend-customer-service-tickets-draft.md).
