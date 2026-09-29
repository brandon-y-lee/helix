# Private web Support Intake and manual replies

Ticket #434 / Spec #430 adds source and local verification for `/contact` and the private `/admin/support` Inbox. Intake and support email delivery start disabled. This Ticket does not configure Resend, apply remote migrations, activate hosted intake, send email, or introduce AI drafting. Hosted activation and retention rehearsal belong to R1-10; incoming email and private photos belong to R1-05.

## Admission and privacy

The Contact form checks current availability without exposing configuration or Account existence. Admission requires `HELIX_SUPPORT_INTAKE_ENABLED=true`, the restricted sandbox environment, the exact configured website origin, and the separate database intake control. Public content describes availability conditionally. A success response means that the Inquiry, original message, and generic acknowledgement intent committed together; it does not claim email delivery, a reply, or a response time.

The same-origin JSON endpoint limits the body to 48 KiB, validates finite field names and bounded plain text, and rejects unsupported Inquiry Types. It stores private names, email addresses, subjects, and messages. Source IP and normalized email are converted into purpose-separated keyed digests before the database sees them. On Vercel, the trusted `x-vercel-forwarded-for` header supplies the source. Local development can use `x-forwarded-for`; missing source information fails closed. No raw addresses, message bodies, raw provider responses, or keys are logged.

A cryptographically random submission UUID binds the exact normalized payload independently of the source digest. An identical retry, including after a network change, returns the same acceptance without another Inquiry, acknowledgement, or rate-limit charge. A changed payload under that identity conflicts. The database bounds new submissions to five per hour/twenty per day per source and three per hour/ten per day per email digest. Durable admission and the acknowledgement share a transaction; failure rolls them all back. Expired rate-window rows are cleaned during bounded admission work.

Order association is optional and server-authorized through the existing Checkout receipt authority. Supplying a Session ID alone does not grant access. The server verifies the signed-in owner or existing guest receipt cookie before associating the Order; the public result contains no Order facts or inquiry identifier. The first form does not solicit Session IDs or email private receipt capabilities.

## Private Operator workflow

Only an active `admin` membership receives `support.read` and `support.reply`. Catalog roles retain only their catalog capabilities. Every page, read, and mutation checks server authority; the database rechecks active membership. Support tables force RLS, are outside browser grants, and are accessed through service-only RPCs. Responses and protected routes use private/no-store behavior. Customer text is rendered as text, never trusted HTML.

The Inbox lists twenty-five Inquiries per page and filters open/closed status. Conversations load the latest fifty immutable messages in chronological order. “Load earlier messages” uses a stable same-Inquiry cursor; a cursor from another Inquiry is rejected. Older-page loading preserves the current editor and draft context. The database also bounds mutation responses, so a long history does not turn a committed action into an oversized response.

An Operator saves a manually authored subject and body, reviews the fixed recipient and exact saved content, and explicitly approves that draft version. Approval atomically creates one immutable outgoing message, approval record, and delivery intent. Concurrent or repeated approval cannot duplicate the logical message. Recipient editing, arbitrary CC/BCC, and attachments are unavailable in this slice. Manual drafting, notes, and approval remain available when the provider or future AI service is unavailable.

Saving a revision, adding a private note, or changing open/closed status advances the Inquiry revision. A prior approval must still match the current Inquiry and draft at the delivery boundary. Notes remain private; closure records a separate status and closure time and makes no delivery claim. Reopening clears the closure time. An already accepted message is immutable history and is not recalled by editing or closing an Inquiry.

## Exact approval and delivery

`support_acknowledgement` contains only the fixed receipt acknowledgement and no submitted message, Account existence, or Order facts. `support_reply` freezes the exact human-approved subject, plain text, escaped HTML, recipient, render version, Inquiry revision, draft version, and empty attachment list. The renderer validates these values and reuses the frozen content without adding a new footer, link, or mutable template content.

Support uses `HELIX_EMAIL_SUPPORT_FROM`; Order sender configuration is independent. Global API/restricted-environment readiness, Reply-To, allowed owner/simulator recipients, frozen provider requests, leases, idempotency, retry limits, signed callbacks, and reconciliation use the shared email boundary documented in [the delivery runbook](./resend-order-confirmation.md). No disallowed recipient is rerouted to an Operator.

Each support purpose has its own disabled database delivery control. Intake, support-purpose delivery controls, and global dispatch are distinct. Turning off dispatch or a purpose does not remove an accepted Inquiry or prevent manual drafting. Approval creates durable work, not proof of sending. The database checks approval validity and the current approver's authority while serializing against Inquiry changes immediately before preparing the provider call.

If an outdated approval has never attempted delivery, it is blocked and a current draft can be approved. If a provider attempt could already have occurred, the old identity remains on hold for reconciliation; do not resend the old key or create a replacement blindly. Ordinary retry tooling cannot revive stale/revoked approvals or override reconciliation. A matching signed provider callback can still establish what happened. An in-flight external call cannot be recalled; the database serialization boundary determines whether an edit preceded handoff.

## Native Resend reuse assessment

The Resend [MCP integration](https://resend.com/docs/mcp-server#codex) and current Inboxes beta expose useful provider-side inbox/thread/draft facilities. Beta account enrollment and a production runtime contract were not verified and are not required by this implementation. A native draft send protects against sending an already-sent draft, but the reviewed contract did not provide an expected draft revision/hash precondition binding Helix's human approval to a later send. A mutable provider draft therefore cannot replace the canonical approval transaction safely.

The [Chat SDK adapter](https://resend.com/docs/chat-sdk) can handle transport/thread abstractions but does not supply Helix's authorization, exact approval, private persistence, recipient restrictions, or uncertain-delivery policy. Supabase remains canonical for the private Inquiry and approval, while standard Resend email delivery supplies the provider transport. No beta Inbox, mirrored provider draft, new platform, or competing send path is introduced. R1-05 can add receiving and attachment facts to this same conversation and revision boundary.

## Activation, retention, and verification

R1-10 must review exact code, migration order, target project, web origin, owner/simulator recipients, verified sender/Reply-To, signed callbacks, and hosting cadence before enabling anything. Read `read_support_intake_control` and pass its exact `updatedAt` to `configure_support_intake`; the database rejects stale changes. Do not treat the source-controlled Contact form as proof that a hosted Support Channel is operating. Existing prepared requests keep their original identity across a future domain switch.

Content retention is not a deletion job in this Ticket. Later retention must honor the recorded closure clock and preserve minimal delivery identities/approval evidence needed to prevent duplicate sends. Do not cascade-delete email history or advertise an automatic deletion period before the approved cleanup and hosted proof exist.

Local checks use synthetic data and provider stubs. `node scripts/db/test-support-intake-contracts.mjs <synthetic-container>` refuses an unlabeled container or remote URL and creates a disposable PostgreSQL 17 database. It exercises earlier payment/email regressions, atomic admission/rollback, durable rate limits, private grants/RLS, exact approvals, active-approver revocation, status clocks, bounded history, uncertainty, and genuinely overlapping intake/approval/edit-versus-prepare transactions. TypeScript and UI tests cover same-origin/private routes, body limits, forged fields, unauthorized Order links, truthful error states, and manual reply/pagination interactions. Actual hosted mailbox receipt, provider failures, remote configuration, and visual browser review remain explicit operational evidence, not inferred from these tests.
