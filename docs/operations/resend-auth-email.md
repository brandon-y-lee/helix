# Resend delivery for Supabase Auth

Ticket #433 supplies source, templates, and read-only checks. It does not activate SMTP or send mail. The separately reviewed R1-10 activation manifest and restricted rehearsal own provider changes. Supabase remains the only issuer of verification/recovery/email-change tokens and the only trigger for these messages. Do not also enqueue them in Helix's transactional dispatcher or install a Send Email Hook.

## Account flow contract

The three reviewed Go templates are signup confirmation, password recovery, and email-change confirmation. They use only Supabase's `TokenHash`; no Helix token, email queue entry, Account lookup, or alternate mail send is created. Existing notification switches and other provider templates remain unchanged. There is no new email-change or resend interface in this Ticket.

`/auth/confirm` GET and HEAD do not verify a token. The standalone GET document contains no external assets or storefront analytics. Its native form requires an explicit POST, an allowed OTP type, bounded input, and the exact configured Origin. The form uses `strict-origin` so browsers retain their Origin on submission while omitting the token-bearing path from referrers; errors and terminal responses use `no-referrer`. All confirmation responses are private and uncached. An email-change confirmation that succeeds without a session can be waiting for the other address; it does not merge the current browser's Cart. Successful session confirmation retains the existing Cart merge and SSR-cookie behavior. Already issued PKCE links continue through `/auth/callback`.

Deployed account URLs use the reviewed `HELIX_EMAIL_SITE_ORIGIN`, falling back to the existing canonical origin when absent. Local development preserves the existing loopback-only `NEXT_PUBLIC_SITE_URL` behavior. A hosted origin change still requires the corresponding deployment, Supabase redirect settings, and template updates in the approved operational manifest. Password recovery returns the same account-independent response for accepted, rate-limited, and failed delivery requests; it does not promise an email arrived. Fixed operational failure messages omit recipients and provider payloads.

Unit coverage exercises real route/action boundaries with synthetic provider responses, template output, and the read-only operations command. The browser regression in `e2e/auth-confirmation.spec.ts` submits the real confirmation form on desktop/mobile and captures its Origin/referrer before intercepting POST, without contacting Supabase. Run it through the repository's normal production-verification adapter, not a separate server or direct Playwright invocation. Browser execution is a separate verification outcome from unit tests and SMTP rehearsal.

## Plan and verify

Use the reviewed checkout and a private environment file outside version control. Required values are `NEXT_PUBLIC_SUPABASE_URL=https://erasogmsqpgiirovubjh.supabase.co`, `HELIX_EMAIL_ENVIRONMENT=sandbox`, `HELIX_EMAIL_MODE=restricted`, `HELIX_EMAIL_SITE_ORIGIN=https://helixskin.vercel.app`, `HELIX_EMAIL_AUTH_FROM=onboarding@resend.dev`, the verified `HELIX_EMAIL_OWNER_RECIPIENT`, and an explicit `HELIX_EMAIL_ALLOW_SIMULATORS=true` or `false`. A future owned-domain cutover needs its own reviewed sender/recipient policy; changing the website origin does not verify an email domain.

```bash
pnpm exec tsx scripts/auth-email.ts plan
pnpm exec tsx scripts/auth-email.ts verify
pnpm exec tsx scripts/auth-email.ts verify --expected-fingerprint <previous-observed-fingerprint>
```

`plan` is offline and needs neither a Resend key nor a Supabase credential. It reports only proposed public SMTP settings, SHA-256 hashes of the exact UTF-8 template/subject strings, and the recipient-policy shape. It does not print the owner address, template HTML, or credentials. `verify` additionally requires `SUPABASE_ACCESS_TOKEN` supplied through the private environment. It performs one authenticated GET of the approved project's Auth configuration; no write or email operation is available. It reports fields that differ, a fingerprint, and fixed issue codes. Raw configuration and provider error bodies are never printed. A provider outage, invalid response, or project mismatch fails closed. If the `tsx` launcher cannot create its local IPC socket in a sandbox, use the equivalent `node --import tsx scripts/auth-email.ts plan` (or `verify`) command.

The fingerprint covers observed non-secret SMTP, mailer, email-hook, rate-limit, and redirect/security settings. It excludes password and hook secrets. It is a drift signal, **not** a secret backup or proof that credentials have not changed. `--expected-fingerprint` rejects changed observed settings; R1-10 must additionally compare the exact private credential versions and reviewed full configuration. A matching configuration is never reported as ready for activation.

## Required independent evidence

Record dated evidence against the exact R1-10 code SHA, Supabase project, Resend account/key identity, sending identity, and recipient policy. A local environment flag or passing mocked test is not provider evidence.

- Prove the Resend account owner may receive security mail and arbitrary addresses are rejected at the SMTP/provider boundary. Supabase's public Auth endpoints bypass Helix's application allowlist. An `onboarding@resend.dev` From address alone is not an account-specific delivery test.
- If enabled, prove the permitted simulator addresses work through the chosen SMTP route. They demonstrate delivery events, not a human opening a mailbox or completing authentication. The shared policy permits only the exact simulator addresses, without labels.
- For secure email change, prove the recipient restriction applies to both the old and new address. Do not activate a setup that accepts a change request but leaves an existing Account Holder unable to finish the required confirmation. Never reroute someone else's token to the owner or a simulator.
- Prove open/click tracking is disabled for Auth mail, including the provider-managed testing sender if used. Inspect delivered link targets for rewriting. The Auth Management API response cannot establish Resend tracking settings.
- Prove existing accounts retain working verification, recovery, and configured email-change delivery. If the shared project contains accounts outside the restricted policy, do not change its shared SMTP configuration until continuity is resolved in the reviewed operational plan.
- Privately preserve recoverable prior SMTP credentials and template/settings values. An omitted or masked `smtp_pass` response cannot restore the old provider. Record credential-version references without logging the credential itself.

These requirements remain visible in every command result. This tool intentionally has no command-line acknowledgement that turns missing provider evidence into a pass.

## Apply — R1-10 only

1. Confirm the approved operational manifest identifies the exact merged deployment SHA, project, site origin, sender, allowed recipient policy, expected template hashes, prior-state fingerprint, preserved Auth security settings, and private old/new credential versions. Deploy the non-consuming confirmation page and explicit confirmation action before switching templates. Preserve the existing PKCE callback for already issued links.
2. Capture the current complete Auth configuration privately and retain exact prior values for every field to be touched. Preserve existing verification, secure-email-change, OTP expiry, cooldown/rate limits, notification switches, signup, redirect allowlist, and session settings. Separately confirm the previous password is actually recoverable, or record that the prior provider is Supabase default SMTP and prove the precise restore procedure. Never treat redacted API output as a usable backup.
3. Re-read Auth and provider configuration immediately before mutation. Compare the expected fingerprint, all preserved fields, credential versions, and delivery evidence to the approved manifest. Reject any drift; investigate and review an updated manifest rather than overwriting concurrent changes. Confirm no enabled Send Email Hook conflicts with SMTP. Do not alter a hook automatically.
4. In the dedicated R1-10 runner, construct the minimal private `PATCH /v1/projects/erasogmsqpgiirovubjh/config/auth` body from the approved `buildAuthEmailTemplates(siteOrigin)` output plus `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, and `smtp_sender_name`. Include `site_url` only if its exact change is reviewed; do not replace the redirect allowlist or copy the documentation's broad security-setting example. SMTP values are `smtp.resend.com`, `"465"`, `resend`, a privately supplied Resend API key, `onboarding@resend.dev`, and `Helix` in this restricted phase. Send no management token or body to logs, shell history, screenshots, PRs, or public evidence.
5. Re-read and verify the changed fields and exact preservation of every unrelated setting. Record the applied state/fingerprint and touched field set privately for rollback. Run only the manifest's approved controlled Auth actions. Verify confirmation, recovery, configured email change, expired/replayed links, scanner GET/HEAD, human confirmation, cooldown/provider failure behavior, SSR session continuity, and Cart merge behavior. Confirm one delivery path and unchanged recipient identity.
6. Keep the Spec open if real SMTP or account-continuity acceptance fails. Successful simulator callbacks do not satisfy human mailbox receipt or account-access proof. No live-domain or unrestricted cutover is authorized by this Ticket.

## Roll back

1. Pause further operator-initiated rehearsal actions. Read the current configuration and compare it with the recorded applied state, including private credential versions. Reject drift; resolve concurrent changes before a restoration that could overwrite them.
2. Restore **only** fields changed by this activation using the exact private prior values/templates and recoverable prior SMTP credentials. If the prior state used Supabase's default service, use the pre-reviewed provider-specific reset procedure; do not guess that a masked or empty password is sufficient. Preserve accounts, sessions, Orders, and all unrelated security/provider settings.
3. Re-read the restored state and compare against the private baseline. Verify the prior email path with an approved recipient and distinguish provider acceptance from mailbox receipt. Retain sanitized evidence of the failure and restoration; keep secret backups access-restricted for the approved rollback window, then remove them under the operational retention policy.

## Sources

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) — custom SMTP removes the default project-team address restriction.
- [Supabase Auth templates](https://supabase.com/docs/guides/auth/auth-email-templates) — Go template variables, security links, and mail-scanner behavior.
- [Supabase Auth Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config) — exact configuration field names; current schema uses a string for `smtp_port`.
- [Resend SMTP](https://resend.com/docs/send-with-smtp) and [testing-domain recipient restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) — transport settings and testing-sender limitations.
- [Supabase June 2026 template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) — new Free projects using default SMTP cannot customize Auth templates; custom SMTP remains supported.
