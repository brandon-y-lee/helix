# Restricted Resend activation

Spec #430 / Ticket #440. This runbook operates the reviewed service on
`https://helixskin.vercel.app`; it does not authorize live payments, unrestricted
mail, a paid upgrade, or promotion to `main`. The source Ticket closes after its
review and gate. The Spec stays open until the exact integrated `dev` SHA passes
the separately approved hosted rehearsal below. Preserve unresolved evidence in
[the Stripe runbook](hosted-sandbox-checkout.md) and #408 separately.

## Freeze the operational change

After all ten Tickets are integrated, the sole Spec Closer incorporates current
`dev`, obtains Combined Spec Review and the full `integration-gate`, and
regular-merges the Spec PR. Freeze that resulting 40-character SHA. A preview,
green source test, installed plugin, or successful device sign-in is not hosted
acceptance.

Keep the private manifest, provider baselines, recipient and postal identity,
credential-version references, and rollback material outside Git in a mode-0700
directory with mode-0600 files. Load secrets through the private environment;
never put them in command arguments, approval text, logs, screenshots or issue
comments. Print only IDs, hashes, field names, timestamps and fixed outcomes.

The exact approval packet must bind these facts:

| Boundary | Required binding |
| --- | --- |
| Source and deployment | Integrated SHA, migration filenames/hashes, Vercel deployment ID, Preview / `dev`, alias-to-deployment mapping, Node runtime and function limits |
| Fixed targets | Supabase `erasogmsqpgiirovubjh`; Vercel project `prj_N9nyPL9SixJHOROIovS8PDQ9aKny`, team `team_uriJjJWNwpZnZHnIp5AiXuv0`; existing Stripe sandbox account and endpoint |
| Resend | Actual account/key provenance and scopes, independent senders, account-assigned receiving mailbox, Reply-To, exact signed callback URL and event set, tracking disabled |
| Audience | Verified account-owner address and explicit exact simulator policy, canonical Contact namespace, factual postal identity; no arbitrary recipient or historical backfill |
| Native assets | Exact Topic/template aliases, names and desired payload hashes; existing IDs/version hashes where present; SMTP/template fingerprints and private old/new credential versions |
| Runtime | Exact deployment environment revisions, bucket policy, AI owner/runtime pins, named schedules/command hashes, purpose-control revisions, activation order and stop thresholds |
| Recovery | Recoverable prior SMTP settings/credentials, baseline controls, in-flight reconciliation obligations, selected synthetic cohort and narrow holds |

Use the operations command's read-only plan and verification output as evidence,
then approve its exact manifest digest. Missing resources remain explicit in the
plan; approved creation receipts bind their generated IDs to the exact intended
names/payloads without a second scope approval. Verification requires a unique
matching resource. Changed desired content, SHA, credential version, environment,
template, schedule or control revision needs a fresh plan; do not override drift.
Source approval does not substitute for this final
operational approval. No messages or remote configuration changes occur while
collecting the read-only packet.

Use the exact version-1 [manifest schema](../../scripts/resend-operations/operations.ts)
without extra fields. `codeSha` is the integrated commit; `migrations` is the
ordered file/hash list; `expectedControlsFingerprint` and
`smtp.beforeFingerprint` bind fresh observed baselines. Existing
`credentialVersions` entries are `{version,sha256}`; planned new credentials use
`{version,generated:true}`, never a raw key. Every `evidence` entry names an
absolute private file with its SHA-256, or `sha256:null` for a proof produced by
the approved setup. `expectedControlsFingerprint:null` is permitted only for a
fresh post-migration baseline with every control disabled. Template `alias` values start `helix-r1-`;
`contentSha256` uses `templateContentFingerprint` over subject, HTML, plaintext,
sender and Reply-To, excluding the provider-generated IDs/version. After setup,
use the full native fingerprints from [the welcome procedure](resend-welcome.md#immutable-template-approval)
to configure `HELIX_EMAIL_MARKETING_CONTRACT` privately.

`setupReceiptFile` names an absolute private receipt path. After approved setup,
write the receipt's `manifestSha256`, `codeSha`, observed `controlsFingerprint`,
`credentials` map of `{version,sha256}`, and `evidence` map of proof-kind to hash.
This binds generated values and future proofs without rewriting the approved
manifest. Missing receipts/resources/proofs remain plan findings. For sensitive
Vercel values that cannot be retrieved, `environment` records each key's applied
`{id,updatedAt}` metadata; the local credential hash must still match its approved
or generated receipt. After successful minimal SMTP postflight, privately record
`smtpApplied:{fingerprint,credentialVersion}` for retry-baseline verification.
After successful control postflight, record the returned
`observations.controlsFingerprint` as `controlsAppliedFingerprint` in that same
manifest-bound receipt. Repeated verification/apply requires either the exact
initial baseline or this exact recorded postflight. Matching enabled flags alone
does not authorize changed revisions or admission cutoffs; an intervening
disable/re-enable requires a fresh reviewed plan.
With `smtp.change:true`, apply installs the approved credential even when public
SMTP fields already match; those fields cannot prove the current password.
With `smtp.change:false`, apply preserves the exact observed Auth mail baseline,
including default SMTP and existing templates. Security, site-origin and drift
checks still apply; independent email purposes can be enabled without an Auth patch.

The existing `enable.support` selection covers Support Intake and both outgoing
support purposes (`support_acknowledgement` and `support_reply`). The observed
control fingerprint includes each delivery row's flag, revision and acceptance
cutoff. Apply changes them in the same locked transaction as intake and checks
all three afterward. A previous fingerprint that omitted delivery rows must be
replaced by a fresh reviewed baseline; do not reinterpret the old receipt.

```sh
export DOTENV_CONFIG_PATH=/private/path/helix-resend.env
HELIX_RESEND_MANIFEST=/private/path/helix-resend-activation.json
pnpm email:operations plan --manifest "$HELIX_RESEND_MANIFEST"
pnpm email:operations verify --manifest "$HELIX_RESEND_MANIFEST"
```

Both commands observe current state without changing it. Missing assets and read
failures remain findings; neither claims operational acceptance. The plan returns
the exact callback events and four schedule commands for native setup. Supply
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_ACCESS_TOKEN` and
the required Resend/application values only through the private environment.
Do not extract a managed CLI token to supply `VERCEL_ACCESS_TOKEN`.

After the approved resources below verify, run with the **approved raw-file
SHA-256** as `HELIX_RESEND_APPROVED_DIGEST`, not a newly computed replacement:

```sh
pnpm email:operations apply --manifest "$HELIX_RESEND_MANIFEST" \
  --confirm "$HELIX_RESEND_APPROVED_DIGEST"
```

Apply performs only the explicit minimal SMTP patch and existing revision-checked
database control changes. It does not create native assets, apply migrations,
change Vercel settings or send mail. Preserve partial progress; re-read before a
retry. Setting the desired state again does not create a fresh activation cutoff.

## Prepare the approved resources

Execute only the approved packet's mutations, re-reading each target immediately
before changing it. Keep admission and dispatch off until postflight passes.

1. Use the official authenticated `vercel api` interface for project, deployment,
   alias and environment metadata; do not extract its cached credentials or print
   decrypted environment values. Preserve the existing host restriction and
   prove old immutable deployments cannot admit new work through an unapproved
   hostname. Keep signed Stripe/Resend callbacks reachable. Verify the actual
   deployed Node functions' duration/memory; plan names alone do not prove them.
2. Compare fresh remote migration history with the frozen source. Follow
   [selective migration delivery](selective-legacy-migrations.md): a fresh private
   CLI workdir, fetched actual history, only the exact missing approved files,
   `--skip-vault --dry-run`, then the identical reviewed pending list without
   `--dry-run`. Never run a repository-wide push or repair timestamps. The Resend
   sequence is `20260929005855_order_confirmation_email.sql`,
   `20260929031014_simulated_tracking.sql`, `20260929035132_support_intake.sql`,
   `20260929041508_marketing_subscription_contracts.sql`,
   `20260929044942_support_inbound.sql`,
   `20260929052000_product_notifications.sql`,
   `20260929071609_support_ai_drafts.sql`, then
   `20260929075433_support_retention.sql`.
   Verify each applied version, forced private RLS, narrow RPC grants, and
   disabled controls. Record committed progress if a later migration fails.
3. Coordinate the Product enrollment migration with the matching application
   deployment: it replaces the old six-argument RPC, so old intake fails closed.
   Record the bounded unavailability window; never restore the old overload.
   Deploy the frozen SHA with public admission/dispatch flags false, verify the
   canonical alias, then smoke-test checked and unchecked enrollment only after
   the corresponding controls are deliberately enabled.
4. Provision the manifest's native Resend assets through its approved provider
   steps. Use one callback at `/api/webhooks/resend`, the account's actual
   `<id>.resend.app` receiving domain and separately held full-access receiving
   credential. The current welcome implementation also reads Contacts, Topics and
   templates through `RESEND_API_KEY`, so that key requires full access; a
   sending-only key cannot activate all R1 purposes. Capture credentials privately;
   do not use a connector action that exposes the token in its output. Create
   the opt-in-default Topic and three immutable published templates; verify their
   complete fingerprints with the [welcome contract](resend-welcome.md).
   Broadcasts and native welcome Automations remain disabled: this release's
   existing Helix dispatcher owns welcome handoff and the shared promotional cap.
5. Create the exact private photo bucket: object limit `10485760`, MIME types
   exactly `image/jpeg`, `image/png`, `image/webp`, public access false. Verify
   browser roles cannot list/read objects and the privileged application still
   enforces Inquiry/photo ownership. Preserve the qualified receiving route and
   secrets for replies to already published addresses.
6. Complete the independent [Auth prerequisites](resend-auth-email.md#required-independent-evidence):
   account-owner/simulator restriction at SMTP itself, both sides of secure email
   change, existing-account continuity, disabled tracking, no Send Email Hook,
   and recoverable prior SMTP credentials. If the shared project has Accounts
   outside the restriction, leave SMTP unchanged until continuity is resolved.
   Record this deferral in the private Auth evidence; it is not passed Resend Auth
   qualification, and the Spec stays open until that qualification is complete.
   Apply only the approved SMTP/template patch; preserve all other Auth security,
   rate-limit, redirect, session and notification settings. Deployed scanner-safe
   confirmation must precede the template switch.
7. Install the reviewed schedules below with their dedicated endpoint secrets in
   Vault. Verify private environment/version metadata and then enable only the
   manifest's database purposes and application flags. Enabling confirmation or
   marketing starts a new cutoff; tracking retains its first cutoff. Create new
   demo Orders after activation. Do not re-date old records or replay historical
   events to manufacture eligibility.
8. Start one [Mac AI worker](resend-support-ai.md#mac-development-worker) using its
   existing dedicated managed sign-in. Keep its account credentials off Vercel.
   Verify the configured Helix owner and current support authority; retain the
   qualified runtime/model/configuration pins and disabled extra purchases.

## Hosted scheduling and limits

The September 29 inventory found Vercel Hobby, whose native cron is daily and
targets production deployments. Use the existing Supabase Pro project's
`pg_cron` with installed `pg_net` and Vault for the fixed development origin.
`pg_cron` was available but not installed; enabling it is part of the approved
manifest, not an already completed setup. Recheck these facts before apply.
See [Vercel cadence](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[deployment targeting](https://vercel.com/docs/cron-jobs), and
[Supabase's Vault-backed HTTP schedule](https://supabase.com/docs/guides/functions/schedule-functions).

| Fixed path at the approved origin | Cadence | Credential |
| --- | --- | --- |
| `/api/internal/email-dispatch` | Every minute | `HELIX_EMAIL_DISPATCH_SECRET` |
| `/api/internal/marketing-sync` | Every minute | `HELIX_EMAIL_DISPATCH_SECRET` |
| `/api/internal/support-ingest` | Every minute | `HELIX_SUPPORT_INGEST_SECRET` |
| `/api/internal/support-retention` | Every minute | `HELIX_SUPPORT_RETENTION_SECRET` |

Record each exact job name, POST URL, schedule, HTTP timeout and SQL command hash.
In Supabase's Cron Jobs interface, create `helix-email-dispatch`,
`helix-marketing-sync`, `helix-support-ingest` and `helix-support-retention` with
schedule `* * * * *` and each exact `intended.schedules[].command` from the plan.
Create the three Vault entries under the credential names in the table, using
private secret input. Re-read the unique jobs and compare to the plan before
activation; do not invent or edit the generated SQL. The operations verifier
requires these exact active names, schedules and commands.
The command must read only its named Vault secret at execution; never embed a
literal token or service-role key. Use a reviewed 55-second HTTP timeout for
60-second routes: `pg_net` defaults to two seconds. Do not add another retry
queue; the application already owns leases and retry state. Use the provider's
schedule/alter functions, never direct `cron.job` writes. A same-name schedule
overwrites its prior command, so compare its exact existing hash before changing
it. Observe installed extension versions rather than assume a `VERSION` clause
pins them. [Cron controls](https://supabase.com/docs/guides/cron/quickstart),
[extension-version behavior](https://supabase.com/changelog/extension-version-pinning-ignored).

A scheduled SQL success proves only that HTTP was queued. Correlate bounded
`cron.job_run_details` and `net._http_response` timestamps/status with application
inspection; never dump HTTP headers, payloads or raw response bodies. Responses
normally expire after six hours, so capture sanitized evidence promptly. Verify
401 for a missing/wrong bearer and no redirects, then observe real authenticated
scheduled invocations with local listeners stopped. Cron run history is not
automatically pruned: include bounded cleanup of only these job IDs' old run
records after retaining the required evidence, preserving other jobs' history.

Retention requires `HELIX_SUPPORT_RETENTION_ENABLED=true` and reserves its own
45-second budget, independent of the ingest backlog. Four minute jobs mean
5,760 calls/day before retries. Approve a bounded rehearsal
window and request/storage/email/AI stop thresholds within the freshly observed
plans; no upgrade or purchase is implied. Measure latency, backlog age, retries,
429s, cleanup progress and memory. Require cleanup to progress under sustained
ingest. Do not equate a successful worker response with an empty backlog or the
10 requests/second Resend limit with proven throughput. Leave admission off if
the measured load approaches route deadlines or the backlog grows.

## Rehearsal and evidence

Stop task-owned local web servers, Stripe listeners, tunnels and local email
dispatchers. The Mac AI worker is the approved private hosted-client exception;
it must point at the fixed deployed origin. Confirm each browser visit and
callback is served by the frozen deployment. Use controlled synthetic content
and only the manifest's permitted addresses. Record provider acceptance, signed
delivery event and actual mailbox receipt as separate observations.

Perform the following in order; detailed negative cases remain in the linked
feature runbooks and their existing tests rather than another test harness.

| Action | Evidence required |
| --- | --- |
| Guest demo purchase | Start after both email/tracking cutoffs using the verified owner address. Complete actual Stripe sandbox Checkout and close the checkout tab before returning. The existing hosted signed webhook alone produces one paid Order and one confirmation intent. Open the original browser's receipt through its existing authority; provider receipt facts match immutable lines, totals and delivery snapshot. |
| Account demo purchase | Sign in as the controlled Account and repeat with an allowed address from the start. Prove normal return plus owned receipt recovery/concurrent refresh. Replay the same signed Stripe event through the existing provider destination. Payment, rewards/cart effects, intent and provider message remain single. A clean guest/wrong Account receives no private Order facts. |
| Same-Order simulated tracking | On each of those exact Orders, use `/admin/demo-orders`: partial/split dispatch, in transit, exception, explicit resolution, delivery. Counts and quantities stay valid; only applicable transitions send one notice. Replay/stale commands do not repeat mail. Receipt and mailbox explicitly say simulated/no goods/no real charge; no carrier link or external fulfillment action exists. |
| Financial and delivery independence | Pending/failed/expired/mismatched Checkout creates no paid confirmation. A forbidden recipient is blocked without rerouting and without reversing payment. A verified full sandbox refund freezes further simulation/preparation while existing financial reconciliation and delivery callbacks remain usable. |
| Support web and email | Submit `/contact` with controlled JPEG/PNG/WebP photos; verify durable acceptance before mail. In `/admin/support`, save/review/approve the exact manual reply; replay approval yields one message. Reply from the allowed mailbox to the exact opaque Reply-To and verify signed receiving, threading, private photos and the next revision. Forwarded, ambiguous, automated or failed-authentication mail stays held/dismissed under the existing policy. |
| Private photo boundaries | Reject wrong type, malformed/animated bytes, excessive count/bytes/pixels. Confirm metadata stripping and readable WebP. Wrong Operator, expired capability and direct public Storage access fail; authorized reads are private/no-store. Test interrupted upload/ingestion and late raw writes against deletion/re-sweep without reviving slot capacity. |
| AI inside Helix | Owner requests a real draft from the running Pro worker. Exercise demo-order, injection and skin-safety synthetic text; require qualified facts, supplied references and appropriate human attention. Edit/new inbound/cancel invalidates stale completion; unsaved editor text survives. An AI draft sends nothing until explicit human approval. Stop the worker or revoke its app access to prove truthful failure and manual fallback. Do not exhaust quota or buy usage to simulate a limit. |
| Auth | Through the configured flows, prove mailbox delivery, scanner GET/HEAD without consumption, human confirmation, recovery, applicable secure email change, expiry/replay, safe redirects, generic failures, original SSR/cart behavior and existing-account continuity. Inspect actual links for tracking rewrites. Simulated delivery alone cannot prove Account access. |
| Welcome | On `/email-preferences`, request and confirm explicit consent; scanners do not confirm. Repeated requests/confirmation do not duplicate the initial welcome. Observe education after the real 72-hour delay; do not backdate shared records. Withdraw locally and at the native Topic/global level, including during sync/import or before a retry; no later eligible handoff occurs, and old links can still withdraw. Existing imports/Contacts must not restore native opt-out. |
| Product notice | Record a fresh unchecked Product request and a separate checked request; only the latter starts independent marketing confirmation. Perform the exact manifest-approved canonical Catalog Draft → Publish transition to Purchasable and verify one notice. Inspect cancellation via `/product-notifications`, scanner-safe links, expiry and continued cancellation when the Product disappears or sends pause. Re-publishing does not replay a consumed transition. |
| Failure and suppression | Use exact official delivered/bounced/complained/suppressed simulator addresses only when enabled. Replay genuine signed callbacks in delayed/repeated order; invalid signatures fail. Diagnose interrupted sends and uncertain imports through existing inspection, never reset keys or infer nonacceptance. Confirm suppression blocks retry and email failure does not undo a paid Order. |
| Disable/recovery | Execute the reviewed disable packet below while a controlled accepted Checkout and email/ingest work are pending. New work stops, accepted payment still settles, signed callbacks reconcile, withdrawals/import repairs and retained Inquiry/photo access continue. Re-enable only through a fresh verified manifest; confirm no historical backfill. |

For uncertain delivery use `pnpm email:deliveries inspect` and the exact message
inspection/retry procedure in [Order confirmations](resend-order-confirmation.md#inspection-and-recovery).
Never reset attempts, replace a recipient, change an idempotency key or resend
outside the conservative 23-hour window. Replay a genuine matching provider
event when available. For imports use `pnpm email:deliveries marketing-status`;
an unknown import ID remains blocked unless provider identity evidence resolves
it. Approximate times, counts or a Contact's existence are insufficient.

Inspect `/contact`, `/admin/support`, `/email-preferences`,
`/product-notifications`, `/admin/demo-orders` and the owned receipt at 390×844
and 1440×900 in the in-app browser, including keyboard/focus and mobile touch.
Check truthful pending/disabled/error states, privacy, overflow and approval
content. Inspect actual owner-received HTML and plaintext on desktop/mobile for
demo labels, correct links, legibility, postal identity and unsubscribe. Keep
private content out of screenshots. If browser tooling fails, record the missing
inspection; CI Chromium coverage does not become hosted UI proof.

The retained production build must additionally qualify the compiled, relocated
Linux artifact: Sharp 0.35.5 and libvips resolve from the actual output, a real
photo processes successfully, malformed/oversized inputs fail, and timeout kills
and reaps the child. Measure peak memory under the actual function limit. Darwin
tests or merely finding a dependency in the lockfile do not prove this. Stop
photo admission if the deployed artifact cannot pass; keep the Spec open.

## Retention and restoration

Use explicit synthetic membership, never `sandbox` as a proxy for disposable
data. Exercise the real cleanup path against selected synthetic fixtures with a
controlled local clock; hosted work uses its real clock. Do not age real records
to make a test pass.

| Data | Clock and retained boundary |
| --- | --- |
| Routine Inquiry text and related private copies | Twelve months after closure; reopening resets this clock |
| Raw/derived photos | Ninety days after receipt; reopening does not extend it; raw quarantine cleanup can occur earlier after token/lease safety windows |
| Unsent drafts | Thirty days after creation |
| Minimal operational audit | Twelve months |
| Explicit synthetic Inquiry/email cohort | Thirty days from record creation, without deleting unrelated commerce/accounting history |

Use only the implemented narrow safety/legal hold interface, with an accountable
reason, scope and expiry. Prove a held item is skipped and becomes eligible after
release/expiry; a hold must not extend every record indefinitely. Test concurrent
reopening, new inbound, draft approval and cleanup, failed Storage deletion and
retry, raw/clean derivative deletion, revoked photo access, expired capabilities,
and uncertain-delivery holds. Retain minimal logical-message/event/generation and
consumed-slot identities so cleanup cannot authorize another send or upload.
Record cleanup counts/backlog and demonstrate progress while ingestion is busy.
Synthetic age always uses original creation time; marking never resets it.
Photo age uses original received-email time or web upload admission. Both raw and
clean tombstones repeat deletion daily, with failed deletion retry after five
minutes; retain admission digests until raw deletion is acknowledged. Unresolved
provider acceptance holds linked content and contributes to `heldInquiries`;
`oldestOverdueAt` covers all retention categories, not just those held Inquiries.

An authorized support admin uses service-only `configure_support_retention` with
the exact `p_actor_id`, `p_inquiry_id`, current `p_expected_revision`, paired
`p_hold_until`/`p_hold_reason` (`safety` or `legal`), and explicit
`p_mark_synthetic`. Null hold fields release the hold, so preserve an existing
hold when marking a synthetic Inquiry. Mark only named test email IDs through
`mark_synthetic_email_intents(p_actor_id,p_ids)` (maximum 100); neither operation
infers a cohort from an Order's sandbox flag. Keep these identities in the private
packet. Run local clock/concurrency proof with
`node scripts/db/test-support-retention-contracts.mjs helix-spec358-pg`; the
production `run_support_retention` accepts no caller-supplied clock.

Before restoring a backup, keep admission/sends off, restore the deletion/hold
decision evidence, then rerun due cleanup and object reconciliation before access
is restored. Prove on a disposable restore that expired content cannot reappear
and financial facts/deduplication survive. Never restore the shared project just
to run this test.

Resend's [Security FAQ](https://www.resend.com/security) specifies 30-day email/log
retention for Free, Pro and Scale. Verify the actual account plan and attachment
scope during activation; record provider limitations separately from Helix's
cleanup. Download URL expiry is not deletion evidence. Rely on native provider
retention rather than inventing a deletion API or claiming zero retention. The
Pro AI account likewise supplies no zero-retention guarantee.

## Disable and rollback

1. Re-read and verify the exact applied state, then use the approved disable
   manifest to turn off new database admission/purposes, including both support
   delivery purposes. The command preserves the observed receiving state so
   published reply routes and inbound reconciliation remain available. Disable deployed
   `HELIX_EMAIL_DISPATCH_ENABLED`, `HELIX_SUPPORT_INTAKE_ENABLED`,
   `HELIX_SUPPORT_PHOTOS_ENABLED`, `HELIX_ORDER_SIMULATION_ENABLED`,
   `HELIX_MARKETING_ENABLED` and `HELIX_SUPPORT_AI_ENABLED`; stop the Mac worker.
   Rebuild the same compatible source, verify alias/SHA and probe each disabled
   path. Controls do not recall requests already handed to a provider.
2. Retain Stripe settlement credentials and signed endpoint, Resend signing and
   receiving configuration, accepted Inquiry/history, prepared message identities,
   private photo access, and the host restriction. Keep marketing-sync and
   ingest/retention workers running for withdrawals, imports, queued work and
   cleanup. Do not revoke the credentials or old reply domains they still need.
3. Restore Auth only through its [exact prior-state procedure](resend-auth-email.md#roll-back),
   comparing applied state first and restoring only touched fields with actual
   prior credentials. Refuse drift rather than overwrite another operator's work.
   Verify the restored allowed-recipient path and Account continuity.
4. Native Automations are not enabled by this release. If an independently
   authorized native run exists, stopping its Automation prevents new runs but
   existing runs may finish; record that exposure and use verified provider
   controls. Do not claim the Helix switch recalls in-flight native mail.
5. Record partial progress and reconcile before retrying. Never reverse migrations,
   delete financial history, reset delivery/consent identities, remove suppression,
   or recreate an uncertain provider operation. Re-enable through a new exact
   plan after the cause is fixed, not a force flag.

```sh
pnpm email:operations disable --manifest "$HELIX_RESEND_MANIFEST" \
  --confirm "$HELIX_RESEND_APPROVED_DIGEST"
```

This switches off the fixed database admission controls with fresh revision
checks and remains usable during a Resend/Vercel outage. It does not pause a
running dispatcher or alter hosted environment flags: complete step 1's rebuild
and verify it. Keep `HELIX_MARKETING_SYNC_ENABLED` and
`HELIX_SUPPORT_RETENTION_ENABLED` true for outstanding repair/cleanup.

Publish only a sanitized evidence index: integrated SHA/deployment, manifest
digest, dated provider/configuration hashes, reviewed migration list, test/gate
links, each rehearsal outcome and timing, desktop/mobile inspection, actual
mailbox versus simulator evidence, quota/backlog observations and rollback result.
Keep private correlations separately. Leave #430 open for any missing real
delivery, delayed welcome, AI, retention, Linux photo or hosted UI proof.
