# Support drafting runtime qualification

Spec #430; prerequisite Ticket #438; implementation Ticket #439.

## Decision

The owner confirmed an internal, owner-operated workflow and selected Docker on
this Mac for development. Hosted deployment is a later operational decision.
Published OpenAI guidance covers internal support consoles and trusted private
automation; a personalized provider letter is not a prerequisite.

**Qualified for the approved development implementation on September 29, 2026.**
The pinned runtime passed the offline tool-boundary checks, dedicated managed
sign-in/refresh checks and synthetic drafting evaluation below. This qualifies
the runtime for #439; it does not claim that the Helix feature or hosted service
has already been implemented or activated.

The owner confirmed that model-training/data-sharing options and automatic
extra-usage purchases are disabled. A read-only check of the current desktop
account reported Pro, zero paid credits, and no unlimited credit entitlement.
The dedicated worker independently reported the same account identifier, managed
ChatGPT authentication, Pro, zero paid credits and usable subscription limits.
Managed refresh succeeded. Subsequent isolated processes reused the worker's own
persistent sign-in; no desktop credential was copied. Account identifiers and
credential contents are excluded from this record.

## Exact development candidate

- Official `@openai/codex` **0.158.0**; no dependency range or automatic upgrade.
- Linux ARM64 container based on official Node image digest
  `sha256:a0ddbc73510e98f5e824fd64266ffe1c2c343ba9cf260d95ca2985ad632a3f3e`,
  with system TLS certificates. The initial minimal image lacked those
  certificates; adding them resolved the managed-login connection failure.
- Non-root user, read-only root filesystem, no Linux capabilities, no privilege
  escalation, bounded memory/processes/time, and no host filesystem or Docker
  socket mount. One private credential volume belongs only to this worker.
- Official managed ChatGPT sign-in, file-backed credential storage, and
  `forced_login_method = "chatgpt"`. No copied desktop/browser credentials,
  API keys, external-token authentication, credit purchases, or reset redemption.
- One serialized worker using the official app-server over private standard
  input/output. Use its account/usage checks and one ephemeral thread per draft;
  do not expose an app-server network listener or preserve conversation history.
- Model: `gpt-6-sol`, confirmed available and used in the authenticated checks.
  Changing runtime, model or configuration
  requires repeating the bounded qualification.
- Qualified configuration: [config.toml](../../scripts/support-ai/config.toml),
  SHA-256 `ad699e12f01ac2005d4090d68d8f2ebd7794078cf5197e719ae2277746696147`.

## Tool boundary evidence

The exact runtime's strict configuration parser accepted disabling shell,
unified execution, code-mode host, apps, plugins, remote plugins, hooks,
subagents, browser/computer use, images, memories, goals, skill discovery,
tool suggestions, shell snapshots and workspace dependencies. Web search was
disabled. The container inherited no user/project configuration or integrations.

An offline synthetic Responses endpoint captured a request with **no tools**.
A second test injected an unsolicited `exec_command` call attempting to create
a harmless temporary marker. The runtime rejected it as an unsupported call;
the marker did not exist. These tests used no credentials, external network,
real model inference or customer data.

With the code-mode host disabled, this release emits a known nonfatal diagnostic
that code tools are unavailable and fail closed. This is a tested boundary of
this exact release, not a claimed general-purpose no-tools API. Never broadly
ignore error events because a later response contains text. Independent critique
accepted the boundary after the injected-call check.

## Authenticated synthetic checks

The app-server's effective configuration retained the disabled capabilities.
Three synthetic cases completed with schema-constrained text, valid references,
and no tool events: paid-but-unshipped sandbox Order, malicious instructions to
read credentials and claim a refund, and a product-safety complaint. The final
instructions explicitly preserve demo/simulated qualifiers and prohibit invented
handoffs or promised follow-up. The two wording-sensitive cases were rerun after
that refinement; sandbox wording was preserved, refund processing was not
claimed, and the safety case requested human attention without promising a cure.

An otherwise identical container without the dedicated credential volume refused
rate-limit access with an authentication-required error before inference. This
proves missing-auth refusal; it is not a claim that remote account revocation or
quota exhaustion was exercised. #439 must test those failure responses, bounded
jobs, cancellation and stale-result rejection at its application boundary. Do
not deliberately consume the owner's subscription to manufacture a quota error.

## Minimal implementation contract

Helix supplies minimized selected Inquiry text and identified approved facts.
The worker returns bounded plain text and references to those supplied facts.
Exclude photos, credentials, arbitrary retrieval, customer record searches and
all business-action tools. Reuse the existing versioned draft and exact human
approval transaction; the worker cannot send mail or approve its own output.

Before each job, require the expected managed Pro identity, usable subscription
limits and no paid-credit entitlement. Missing or uncertain account state,
quota exhaustion or reconnection needs stops drafting and preserves manual
replies. Account settings may change; a one-time qualification is not a permanent
billing guarantee. Bound execution and reject cancelled, expired or stale results.
Recheck the current approval as well as Inquiry/draft revisions before saving:
approving a reply does not itself advance those revisions. Preserve newer unsaved
manual edits when the generated result arrives.

Ephemeral local execution does not prove provider-side zero retention. ChatGPT
account data controls apply; do not promise API/Enterprise retention or residency
terms for this personal subscription. The later hosted activation must verify
its actual private host, credential persistence and applicable provider controls.

## Sources

- [Internal applications and support drafts](https://developers.openai.com/blog/codex-as-a-platform)
- [Managed authentication for private automation](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
- [Account, limits and ephemeral app-server threads](https://learn.chatgpt.com/docs/app-server)
- [Authentication and applicable data controls](https://learn.chatgpt.com/docs/auth)
- [Runtime configuration](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Pinned release](https://learn.chatgpt.com/docs/changelog)
