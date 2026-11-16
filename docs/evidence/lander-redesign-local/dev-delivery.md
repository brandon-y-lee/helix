# Landing delivery to shared dev

User authority: “Let's merge these updates to dev.” Necessary bounded tracking, branch push, PR and gated merge operations only; no main/production promotion, manual deployment or provider/security changes. Standalone Ticket [#479](https://github.com/brandon-y-lee/helix/issues/479), assigned to the verified authenticated user. Prior local prototype reports are historical observations, not the current integration attestation.

Exact delivery plan SHA256 `8217b3878d7ed691257aa7452add3226314841ba4ab8d03fc7cfb414520af313`, independently approved before delivery operations by `/root/spec_review` and `/root/standards_review`. Both approved the bounded standalone path, additive history, native-touch proof and mandatory exact-head integration gate. No approval waives a failed check or supplies production authority.

## Source and isolation

- Frozen reviewed landing `9a38d9269c0a5544e4c0bc6b29932a09639cf758`, latest applicatione61b301. Shared GitHubdev `cf50f39ac5b70b57f06b1b437538d1b9fdc7a7e6` freshly verified before setup.
- Isolated shared clone under/tmp; original origin points to the original checkout, verified `github` remote is `git@github.com:brandon-y-lee/helix.git`. Only github is used for remote delivery. Clean isolateddev advanced tocf50; helper createdcodex/479-landing-redesign from that exact base.
- Additive carry-forward merge `51cdba65b166dac6ad85d1fd84c137ddc088c5ef` preserves both frozen landing and current shareddev ancestry. Auto-merged globals.css without conflicts; exact delta againstcf50 is only the intended5-line About-anchor offset. Upstream FAQ/privacy/Treat changes remain intact.
- Root localdev830a397 remains untouched with its12unrelated legal edits and untracked generated/output files. No stash, reset, rebase, force push, cherry-pick or cleanup of original source occurred. The persistent3100 preview remains unchanged while integrating.

## Verification and combined review before PR

Frozen install, lint, typecheck and diff whitespace PASS. Complete local default Vitest:261files/2747tests PASS,1file/8tests skipped (unchanged SQL-service proof),61.83s. Test-only hydration correction then passed affected lint/typecheck; exact final remote gate must rerun the complete suite.

Added one qa-owned native Chromium touch regression: pan beginning over inactive Innovation must physically scroll the browser without selection/navigation; deliberate tap must then select its CTA/image. Spec review identified a false-positive risk before hydration; checkpoint `02cf6c7c307020a7debd7a403b226fd312d5c4b4` first proves Innovation→Mission interaction before the measured pan. Chromium-specific protocol input is confined to this test; non-Chromium project explicitly excludes it. Mandatory Linux Chromium CI must execute/pass it. Physical hardware touch remains distinct from this browser simulation.

Independent full combined Spec and Standards code reviews of02cf6c7 againstcf50: **approve**, no remaining actionable findings. Both inspected full application/test/public-artifact delta and preserved ancestry. Standards confirmed generated WebPs have no EXIF/XMP; audit found no env files, original private reference images, credentials, customer data, signed download URLs or private-key material. This code approval is not merge clearance.

Combined local Browser inspection on temporary3101:1440×900 and390×844, exact title, centered serum, black principles descriptions, equal panels, no overflow; canonical Super Serum navigation renders updated PDP without homepage islands; mobile hero pause/resume and principles End selection/focus passed. Upstream privacy control remains present. Browser used explicit App Router URL waits after an initial unconfirmed navigation attempt; no application defect reproduced. A sandbox-only listen refusal was resolved by host-loopback permission; persistent3100 was not interrupted. Temporary3101 server stopped after inspection. Machine observations indev-delivery-browser-checks.json.

## Required merge boundary

GitHub dev uses rulesets: PR required, resolved review threads, strict exact-current-base `integration-gate`; no approval-count requirement and no protection bypass. Ready PR must pass integration-quality (locked install/lint/typecheck/complete Vitest) and integration-verification (one receipted production build and complete Chromium suite). Gate/PR/merge outcome remains pending until observed. Any failure blocks integration; do not hide it by blind retries, test weakening, changed workflow or unrelated repairs. If shareddev advances, incorporate additively, review and gate again. Regular merge with expected-head guard only; no direct dev push.

No remote deployment is manually invoked. Normal repository-managed PR checks/previews or dev staging automation may run from authorized Git operations; main and production promotion remain excluded. Root dirty localdev is intentionally not fast-forwarded across unrelated changes; final report must distinguish it from shared GitHubdev.

Refs #479
