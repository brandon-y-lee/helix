# R1 — Proposed implementation Tickets

Status: **DRAFT FOR OWNER APPROVAL.** These are review labels, not GitHub issue numbers or claimable Tickets. Publish the approved set as native children/dependencies of the [R1 specification](./resend-customer-service-draft.md) only after its approval. Start the Spec Branch before marking any implementation Ticket ready.

Each Ticket delivers a narrow end-to-end result, includes its own meaningful tests and applicable private-data controls, and must pass Ticket Review and the Ticket gate. No Ticket may claim hosted activation from mocked evidence. Implementation is on the current integrated Stripe baseline, not the stale shared local checkout.

## R1-01 — Send one confirmation for a verified Sandbox Order

**Blocked by:** None.

**What it delivers:** A genuine verified demo purchase creates one durable confirmation and an independent hosted dispatcher delivers it to an allowed recipient using Resend, with inspectable delivery status and failure recovery.

- [ ] Use the common verified-paid transaction reached from Stripe webhook and authorized status recovery; preserve payment/refund/rewards/cart behavior.
- [ ] Persist one environment-qualified Order confirmation intent with fixed receipt facts and recipient; missing/malformed recipient is unsendable without failing financial settlement.
- [ ] Add minimal reusable email intent/dispatch/receipt storage with private access, stable idempotency, leases, bounded retries, uncertain-attempt reconciliation, and signed deduplicated provider callbacks.
- [ ] Keep outbound configuration purpose-aware and domain-portable; fail closed on missing configuration and nonpermitted development recipients. Never reroute private Order data.
- [ ] Separate no-new-email control from processing accepted financial events; provider outage cannot unpay an Order.
- [ ] Provide a narrow authorized delivery inspection/retry action or operator command; no generic email console.
- [ ] Use accessible demo templates and truthful active checkout/FAQ/terms/runbook disclosures. Do not email receipt-cookie capabilities or add unauthenticated private links.
- [ ] Demonstrate replay, concurrent receipt refresh, lost send response, independent payment success, blocked recipients, wrong-environment events, and no historical backfill with existing payment seams and real DB assertions. Prove verified-paid facts and one confirmation intent commit together or neither does; an invalid recipient commits an unsendable intent. Preserve minimal deduplication identity after content cleanup.
- [ ] Supply a reviewed restricted hosted rehearsal plan; actual account configuration/sends occur under R1-10.

## R1-02 — Demonstrate Tracking on the same paid Sandbox Order

**Blocked by:** R1-01.

**What it delivers:** An authorized Operator simulates dispatch and delivery for a real Stripe-created Sandbox Order and sees the corresponding labeled emails and private tracking state.

- [ ] Define the narrow validated shipment-event contract and durable simulation provenance; bind to an eligible verified-paid Sandbox Order and valid line quantities.
- [ ] Apply the specification transition table and atomic partial/split allocation under concurrency; delivered is terminal, exception resolution is explicit, and refunded Orders freeze further simulation. Deduplicate committed transitions and handle out-of-order events without inventing physical fulfillment.
- [ ] Offer a restricted auditable simulator interaction, unavailable in live environments and to unauthorized customers/catalog-only roles.
- [ ] Generate one dispatch/delivery/exception notice per relevant event, with intermediate movement reflected without redundant mail.
- [ ] Reuse the normal email intent/dispatch path; no label purchases, 3PL calls, invented carrier links, or inventory effects.
- [ ] Verify same-Order confirmation-to-tracking behavior, replay safety, privacy, simulation labels, and mobile/desktop presentation.

## R1-03 — Deliver account emails through Resend

**Blocked by:** R1-01 (shared environment and recipient contract).

**What it delivers:** Existing verification, recovery, and configured email-change flows retain their security and receive Helix-branded email through Resend SMTP.

- [ ] Preserve existing Auth token/session/SSR/cart ownership behavior; do not implement parallel authentication tokens or double-send through two integrations.
- [ ] Disable tracking for security links and verify safe redirects, expired/reused/scanned links, cooldowns, and generic recovery responses.
- [ ] Supply plan/verify/apply/rollback instructions that preserve prior SMTP settings and prove restricted development recipients before changing shared Auth configuration.
- [ ] Provide honest rate/provider failure states without weakening verification or breaking existing accounts.
- [ ] Test the relevant existing Auth routes and templates; hosted SMTP proof belongs to R1-10.

## R1-04 — Operate web Support Intake and manual replies

**Blocked by:** R1-01.

**What it delivers:** A Visitor submits a durable Inquiry; the owner sees it privately in Helix and approves a manually authored reply for delivery.

- [ ] Persist validated intake and acknowledgement intent with bounded abuse protection and truthful success/failure states.
- [ ] Add only the support list/conversation/status/reply interface and explicit support capabilities; catalog privileges alone grant no access.
- [ ] Enforce private RLS, server authorization, no-store behavior, safe rendering, and secure optional Order association.
- [ ] Bind approval to the exact recipient/content/Inquiry revision; prevent stale or concurrent approvals from duplicating sends.
- [ ] Keep internal notes private and distinguish Inquiry closure from email delivery.
- [ ] Preserve manual replies during provider or future AI outages; test accessibility and unauthorized direct requests.
- [ ] Assess native Inboxes/Chat SDK reuse using verified runtime contracts; do not make beta enrollment a requirement.

## R1-05 — Continue support conversations by email with private photos

**Blocked by:** R1-04.

**What it delivers:** Incoming emails and bounded photo attachments appear in the correct private Inquiry and can be answered from Helix.

- [ ] Registerable signed receiving endpoint persists receipts, safely fetches content, deduplicates, and routes only expected recipients.
- [ ] Correlate replies safely; quarantine ambiguous threads, forwarded content, loops, and automated replies for review.
- [ ] Treat sender/header/content as untrusted; no automatic private Order association or AI action authority.
- [ ] Support five JPEG/PNG/WebP photos, 10 MiB each, with actual-content, total-size, decoded-pixel, and processing bounds.
- [ ] Strip metadata, store privately, provide expiring authorized access, and retry ingestion safely before provider URLs expire.
- [ ] Verify wrong-owner access, malformed images/HTML, duplicate receipt, interrupted fetch, processing/rejection states, and safe threaded outgoing replies.

## R1-06 — Confirm subscriptions and run the native welcome series

**Blocked by:** R1-01.

**What it delivers:** A Visitor explicitly subscribes, confirms their address, receives the approved welcome sequence, and can withdraw reliably.

- [ ] Persist consent evidence and generation, confirmation, preferences, withdrawal, and provider-sync state without inferring permission from contact creation.
- [ ] Reuse Contacts/Topics and native welcome steps where validated: immediate welcome and educational follow-up after three days.
- [ ] Prove allowed-recipient enforcement, duplicate/ambiguous event submission handling, global and Topic withdrawal, and no stale-event resubscription. Rapid withdrawal/reconfirmation cannot bypass caps, revive old delayed sends, or make multiple generations eligible.
- [ ] Verify campaign frequency controls across enabled sends; limit activation to the tested welcome sequence if manual broadcasts cannot coordinate with the proposed cap.
- [ ] Include explicit unsubscribe links in approved templates; stopping the Automation must not be presented as cancelling existing runs.
- [ ] Provide the minimal subscription/preferences UI; keep campaign authoring in Resend.
- [ ] Add no abandoned-cart or replenishment components, events, settings, or dormant placeholders.

## R1-07 — Deliver the requested Product availability notice

**Blocked by:** R1-01, R1-06 (joint signup/consent behavior).

**What it delivers:** A Product-specific enrollee receives one requested notice when that Product becomes Purchasable, independently of marketing subscription.

- [ ] Preserve existing enrollment and consent evidence; support independent cancellation and the proposed 12-month expiry.
- [ ] React to a fresh canonical purchasability transition using current catalog rules, not a static fallback or search-only observation.
- [ ] Deduplicate enrollment/transition delivery, avoid historical mass replay, and honor restricted recipient policy.
- [ ] Test fresh enrollment with and without separate marketing opt-in, withdrawal, expiry, repeated catalog events, unavailable variants, and no newsletter permission inference.

## R1-08 — Qualify the owner’s Pro-backed hosted drafting route

**Blocked by:** None. This is a bounded qualification prerequisite, not application implementation.

**What it delivers:** An evidence-backed decision on whether the exact private hosted worker can use the owner's subscription with appropriate runtime support and customer-data controls.

- [ ] Verify official entitlement for this exact use, pinned supported runtime, managed authentication/refresh, account isolation, subscription privacy, quotas, and no paid fallback.
- [ ] Record sources and distinguish documented permission, technical capability, inference, and unknowns.
- [ ] Use synthetic information only for any authorized test; do not copy active desktop/browser tokens or process real customer messages before qualification.
- [ ] Provider contact or changed commercial terms are not silently authorized; prepare a concrete inquiry if the evidence remains insufficient.
- [ ] If eligible, publish the narrow worker contract/evaluation criteria for R1-09. If unresolved/ineligible, keep the dependency blocked and return the exact decision to the owner; no fictitious pass.

## R1-09 — Generate and approve an AI support draft inside Helix

**Blocked by:** R1-04, R1-08.

**What it delivers:** The owner requests a draft in Helix, reviews it against authorized facts, edits if necessary, and explicitly approves the exact outgoing reply.

- [ ] Use only the qualified private runtime with application-assembled minimized text/context; photos remain excluded.
- [ ] Isolate the worker from shell/network tools, plugins, mail, databases, payments, refunds, and administrative mutations.
- [ ] Persist bounded jobs and unapproved versioned drafts; handle concurrent requests, stale Inquiry context, cancellation, quota, restart, and reconnection safely.
- [ ] Evaluate factual grounding, unsafe instructions in inbound mail, uncertain policy/safety escalation, and privacy using a representative synthetic support set.
- [ ] Preserve the exact approval/send contract and manual reply path; no autonomous substantive reply sending.
- [ ] Working qualified integration is required; a mock adapter or disabled control does not complete this Ticket.

## R1-10 — Apply retention and prove the restricted hosted service

**Blocked by:** R1-02, R1-03, R1-05, R1-06, R1-07, R1-09.

**What it delivers:** Tested retention, guarded activation tooling, and an exact hosted acceptance/rollback runbook. This Ticket closes on source/tooling acceptance; the sole Spec Closer executes the approved remote rehearsal after the reviewed Spec is merged into dev, and keeps the Spec open until that rehearsal passes. The following operational checks are runbook requirements, not pre-merge Ticket-closure conditions.

- [ ] Implement/test cleanup for routine Inquiry text, photos, unsent drafts, minimal audit, and synthetic records with the proposed clocks and narrow holds; preserve unrelated commerce history and delete derivatives safely.
- [ ] Supply read-only preflight and exact drift-checked activation manifest for code SHA, environment, provider identities, callbacks, templates, SMTP, allowed recipients, scheduling, and purpose switches.
- [ ] Verify the selected hosting/provider plan supports required cadence and limits; no paid resource purchase, production promotion, or broad live delivery.
- [ ] Provide guarded apply for only approved restricted setup; capture recipient/secret values privately rather than in tracked documents or logs. Allowlisted external test messages are authorized only by approval of this exact operational Ticket and manifest.
- [ ] Specify executable rehearsal steps for fresh guest/account Stripe Sandbox Orders, no-return signed webhook settlement, receipt recovery/replay, matching confirmation, and simulated tracking for the same Orders with local listeners stopped.
- [ ] Provide verification steps for actual allowed-recipient delivery, inbound threading/photos/manual/AI replies, Auth flows, confirmed welcome/withdrawal, Product notification, and failure/suppression recovery; distinguish simulator events from mailbox receipt.
- [ ] Define required hosted Helix/email desktop/mobile inspections and sanitized evidence records. Keep Spec #408's unresolved operational claims separate.
- [ ] Test disable controls locally and provide the hosted rollback rehearsal preserving financial settlement and accepted Inquiry history. Explain in-flight native Automation limits honestly.
- [ ] Pass this Ticket's review, tests, and gate. Document the later Combined Spec review/integration gate and exact-SHA operational evidence required for Spec closure; unresolved AI/provider access stays visible rather than being silently marked done.

## Proposed execution order

Start R1-01 and R1-08 independently. After the first confirmation path, R1-02, R1-03, R1-04, and R1-06 can proceed independently. R1-05 follows support, R1-07 follows consent, and R1-09 follows support plus successful AI qualification. R1-10 is the final operational-tooling slice; earlier Tickets carry their own tests and rehearsal plans rather than deferring correctness until the end.

All required Tickets, including AI, must finish before final dev integration under this single Spec; releasing deterministic email earlier would require an explicitly approved split.

The owner approves this exact granularity and dependency set before issue publication and implementation. No GitHub issues have been created by this draft.
