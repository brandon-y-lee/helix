# Private support drafts

Spec #430, Ticket #439. This uses the qualified [Pro runtime](resend-ai-qualification.md)
and the existing support draft, review and send transaction. It creates no email
intent until an authorized Operator explicitly approves the exact reply in Helix.

## Behavior

Only the configured owner, with current `support.reply` authority, can request a
draft. Helix supplies the latest accepted inbound message (at most 6,000
characters) and eight identified, status-qualified public FAQ answers. Names,
addresses, internal notes, photos and Order records are not added. The customer
may still have put personal information in their message; this is minimized
context, not an assertion that it contains no personal data.

One active job is allowed across the service. A queued job expires after five
minutes; a worker claim lasts two minutes, with one model attempt of at most 90
seconds. A crashed worker's job expires rather than silently generating again.
The owner may explicitly request a fresh draft. The worker checks cancellation
every three seconds and stops on failed or uncertain checks.

Completion rechecks authority, lease, Inquiry revision, draft version, existing
approval and pending inbound context. Accepted text becomes an ordinary,
unapproved versioned draft. A later manual edit or new customer message prevents
an obsolete result from replacing current work. Unsaved editor text is preserved.
The UI shows the supplied references and whether human attention is required;
the owner must still review every answer. Quota, sign-in and runtime failures
leave the manual reply flow available. The worker never approves or sends.

## Configuration

The application needs `HELIX_SUPPORT_AI_ENABLED=true`, the exact Helix owner UUID
in `HELIX_SUPPORT_AI_OWNER_ID`, and a random 32–256 character bearer secret in
`HELIX_SUPPORT_AI_WORKER_SECRET`. Existing sandbox/restricted email configuration
and support controls must also be valid. Keep the enable flag false until the
restricted activation manifest is reviewed.

The worker needs only three private values: `HELIX_SUPPORT_AI_URL` (the Helix
origin), that bearer secret, and `HELIX_SUPPORT_AI_ACCOUNT_ID` (the dedicated
managed account identifier returned by `account/rateLimits/read`). It does not
receive Supabase, Stripe, Resend or Vercel credentials. Keep these three values in
a local mode-0600 environment file outside the repository. Never copy the
desktop's authentication file or print the worker's tokens.

The URL must be HTTPS, except a local development origin. For the Mac's local
Helix server use `http://host.docker.internal:3000`. Deployment protection, if
enabled, must admit the exact authenticated worker endpoint through the reviewed
deployment configuration; the worker does not follow redirects or scrape login
pages. A public website URL is independent of the email sending domain.

## Mac development worker

Docker on this Mac is the approved development target. Run a single instance.
The image pins the already qualified runtime, model and immutable configuration.
Build from the worker directory so application files and secrets never enter the
image context:

```sh
docker build -t helix-support-ai:0.158.0 scripts/support-ai
```

The dedicated `helix-resend-ai-auth` volume already has its own managed sign-in.
It belongs only to this worker. The entry point installs the image's configuration
on first use and refuses configuration drift. The account is refreshed and its
identity, Pro plan, available subscription limits and zero paid-credit entitlement
are checked before every draft. An uncertain account response stops the job.
No reset credits, purchases, extra-usage fallback or API-key route are used.
The qualification run left an empty bind-mount placeholder for `config.toml` in
this existing volume. Installation replaced only that verified empty file with
the pinned configuration and restored ownership to the non-root worker. The
runtime continues to reject any differing configuration.

Use the same isolation options for sign-in and drafting:

```sh
docker run --rm --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 512m --cpus 1 --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --mount type=volume,source=helix-resend-ai-auth,target=/home/node/.codex \
  --env-file /private/path/helix-support-ai.env \
  helix-support-ai:0.158.0
```

Append `--once` to process at most one claim for a controlled test. The process
logs only outcome codes, never messages, provider payloads, addresses or tokens.
Its model child receives no worker bearer or application environment. Stop the
container to stop polling and cancel active inference; an interrupted completion
is resolved by the server's lease and stale-result rules.

If the worker later requires reconnection, stop its drafting container and run
the same image and isolation options with `--login` instead of the environment
file. Complete the official device flow yourself. Device sign-in must be enabled
in ChatGPT Security Settings. Do not sign in multiple concurrent copies.

## Verification and operation

Focused tests cover the owner-only HTTP boundary, database races and stale
approval, unsaved UI edits, bounded worker cancellation and runtime isolation.
The disposable PostgreSQL runner is:

```sh
node scripts/db/test-support-ai-contracts.mjs helix-spec358-pg
pnpm exec vitest run tests/support-ai-routes.test.ts tests/support-ai-ui.test.ts tests/support-ai-worker.test.ts tests/support-ai-runtime.test.ts
```

Use synthetic Inquiries for initial integration and quality checks: unshipped
demo Order, an instruction to expose credentials or claim a refund, and a skin
safety complaint. Require preserved demo qualifiers, no invented actions,
references only to supplied facts, appropriate human-attention status, and an
unapproved draft. A successful model response is not evidence of email delivery.

On September 29, 2026, the actual Docker image passed those three cases through
the application request/worker/status handlers and a disposable PostgreSQL 17
database with the current migrations. The database produced three ordinary
unapproved drafts and no approvals for those Inquiries. Every result requested
human attention; the demo answer preserved sandbox qualifiers, the injected
request did not expose credentials or claim a refund, and the safety answer
recommended stopping use and seeking qualified clinical guidance without a cure
claim. This was real managed Pro inference with synthetic text, not a mocked
model response. The temporary HTTP harness supplied the synthetic owner identity
and local SQL transport; it does not establish deployed login, UI or hosted
acceptance. Separately, timeout/cancellation tests exercised and reaped both the
Codex launcher and its native child, including during the version check.

Disable `HELIX_SUPPORT_AI_ENABLED` to prevent new claims and reject active-job
checks/completion. Stop the private worker as well. This leaves manual support
and already approved email reconciliation intact. Re-enable only after resolving
the recorded failure; do not add retries or silently switch providers.

The owner confirmed training/data-sharing and automatic extra purchases are
disabled. Recheck these settings before processing customer content after an
account change. This subscription does not promise provider zero retention.
Runtime/model/configuration changes require the bounded qualification again.
Hosted deployment remains a later choice; Mac sleep/offline means drafts cannot
complete and manual replies remain available. Remote activation, provider sends
and hosted acceptance remain the separately approved #440 rehearsal.
