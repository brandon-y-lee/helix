# Resend scope confirmation and implementation handoff

Date: September 28, 2026. Source baseline: `2471aa8e162456266cc80de3e2d744537aaaf030` on remote `dev`. Shared understanding accepted by the owner with the exclusions below; the concrete specification and Ticket breakdown still require approval.

## Record continuity

The earlier uncommitted discovery artifact under `/private/tmp/helix-resend-discovery` was no longer present when this turn resumed. This note reconstructs the accepted decisions from the conversation and records a fresh source audit; it is not a byte-for-byte restoration or a claim that earlier remote observations are current. No user files were removed. Work proceeds in `/private/tmp/helix-resend-spec-review` on `codex/plan-resend-spec-review`, preserving the shared checkout's unrelated output files.

## Owner decisions

- Use Resend's existing email, template, audience, and appropriate Automation features. Keep Helix Admin focused on a private support inbox and exact human approval of replies; do not duplicate Resend's campaign editor or configuration console.
- Include authentication emails, order confirmation, tracking notifications, support intake/replies, private photo attachments, marketing subscriptions, the welcome series, and the existing product-specific availability notification purpose.
- **Exclude abandoned-cart and replenishment campaigns from this specification.** Do not build their events, schedules, configuration, copy, or placeholders.
- Exercise order confirmation using genuine verified Stripe Sandbox Checkout. Exercise tracking on those same Sandbox Orders using explicitly Simulated Shipments until a selected 3PL/fulfillment provider supplies real events.
- Restricted development sends may reach only the verified Resend account owner and official simulator recipients. The earlier absolute prohibition on Sandbox Order email is superseded; restrictions on live charges and real Fulfillment remain.
- Use `https://helixskin.vercel.app` for development web links. Configure web origin, sending identity, receiving address, and reply address separately for a later owned domain.
- Support drafts start and finish in Helix and require human approval. The owner prefers existing ChatGPT Pro 20x and has not approved separately billed API inference.
- Preserve separate marketing permission and Product Waitlist Enrollment. Testing may exercise both with an explicit opt-in; historical enrollment does not become promotional consent.

## Current Stripe evidence

Remote `dev` contains the Stripe source integration and subsequent receipt, discount, and cart-refresh repairs through [PR #428](https://github.com/brandon-y-lee/helix/pull/428). [Spec #408](https://github.com/brandon-y-lee/helix/issues/408) remains open for operational evidence; its comments report successful signed-webhook demo settlement but do not establish every remaining acceptance check. This task does not close or change that Spec.

Signed webhook handling and receipt-authorized status recovery both converge on verified checkout finalization. Email intent must be durable at that shared verified-paid boundary. Dispatch cannot depend on the browser returning or call Resend inside financial settlement. Repeated payment verification must not create another logical confirmation.

The verified customer email and immutable purchase facts already exist in settlement. Guest receipt access uses a separate, expiring cookie capability. A Checkout Session ID, email address, or Order Number is not permission to view the private Order. Do not email internal receipt tokens or silently reroute customer Order details to the maintainer.

The repository has no operating shipment provider. Stripe confirms payment, not dispatch or delivery. A restricted Operator simulator must validate a paid Sandbox Order and preserve clear simulation provenance. A future 3PL adapter can use the same accepted event contract without representing simulation as physical fulfillment.

## Provider findings retained and refreshed

- [Resend MCP](https://resend.com/docs/mcp-server#codex) supports hosted agents as well as Codex. Installing the plugin does not configure the website or supply an AI model. Deterministic application events use ordinary server-side integration.
- The current plugin and MCP documentation expose **Inboxes beta**, including threads and stored drafts. Enrollment has not been verified. Prefer reuse when its account access and documented runtime contract are suitable; do not make the approved experience depend on unverified beta access. Exact Helix authorization and approved-revision binding remain application responsibilities. No inbox or customer messages were read.
- [Automations](https://resend.com/docs/dashboard/automations/introduction) support native welcome sequences. [Runs](https://resend.com/docs/dashboard/automations/runs) documents skipping remaining email steps after global unsubscribe, while stopping an Automation only prevents new runs. Verify Topic preferences, duplicate enrollment, development recipients, and send-time withdrawal before activation.
- Resend's [AI Email Editor](https://resend.com/blog/ai-email-editor) assists template/broadcast authoring. It is not evidence of a configured Helix support-drafting backend. The [Chat SDK adapter](https://resend.com/docs/chat-sdk) is another reuse candidate, subject to production persistence and approval requirements.
- [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) have a 24-hour window. Helix therefore needs durable logical-message uniqueness and an explicit uncertain-delivery state, not blind retries beyond that period.
- [Receiving](https://resend.com/docs/dashboard/receiving/introduction) can use a Resend-managed address. That does not confer arbitrary outbound delivery rights on the development website domain.

## AI and completion boundary

Earlier research found a plausible private Codex SDK worker with managed subscription authentication, but did not establish that this exact hosted owner-only service is entitled under Pro. That qualification is still unresolved; no authentication, customer-data inference, paid fallback, or provider confirmation is implied. Retain a separate qualification Ticket and a dependent draft-worker Ticket. Ordinary email and inbox Tickets can proceed. If functional AI drafting remains required, the Spec cannot close merely because a disabled control or test adapter exists.

The research identified [Codex application integration](https://developers.openai.com/blog/codex-as-a-platform) and [trusted-runner authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth) as technical evidence, not permission to repurpose a subscription as an unrestricted inference service. Qualification must reverify the exact runtime, subscription eligibility, privacy, isolation, and quota behavior before real customer messages enter it. Contacting a provider is not authorized by this planning task.

## Critic iteration 8 and verification

`boundary_critic_iteration8` independently reviews this iteration. Dedicated agents audit the completed Stripe seams and current Resend capability changes. Their required corrections include: shared verified settlement rather than webhook-only email; separate dispatch; explicit shipment simulation; no rerouting private Orders; and honest conditional AI completion. Final review evidence accompanies the specification package.

Only documentation and glossary changes are planned here. No application implementation, provider setup, sends, migrations, or production promotion has occurred. Existing runtime tests are not rerun for prose-only changes; whitespace, source references, scope consistency, and independent reviews are checked. The implementation package is [the draft specification](../specifications/resend-customer-service-draft.md) and [the draft Ticket breakdown](../specifications/resend-customer-service-tickets-draft.md).
