# P1 local verification and handoff

Ticket #539; Spec #538. Immutable Ticket Snapshot `0ce8de1b2e67d5c0f8c41eed5729cab32d188945`. Disabled source only: no push/PR/merge, deployment, hosted database/provider changes, credentials provisioned, activation, real participants or messages.

## Boundaries implemented

- Separate production consent tables/RPCs and standalone UI/API routes. No historical sandbox subscriber, capability, intent, credential or contract migration/reuse. Account, purchase and Product Waitlist flows are unchanged.
- Frozen welcome-only wording `production_welcome_v1`, explicit unchecked opt-in and double opt-in. Enrollment and confirmation require both dedicated runtime configuration and database enrollment control. Fresh controls are OFF; dispatch has no P1 worker. Confirmation requests create held input, not sent-mail claims or welcome admission.
- Exact production binding: parent project `erasogmsqpgiirovubjh`, origin `https://www.helixskin.us`, asserted Vercel production project/deployment identity. These environment claims are fail-closed configuration assertions, not cryptographic hosting proof or activation approval. Dedicated service/capability/abuse variables have no generic/sandbox fallback.
- Same-origin bounded human POST; capability-only RFC8058 unsubscribe POST without Origin or login. Withdrawal ignores enrollment/dispatch pause. GET/HEAD landings never mutate; browser fragments are removed before any explicit action; no third-party resources, storage or token-bearing DOM. Restrictive old capability hashes remain usable across generations.
- Finite issuance limits:3/address/UTC day,10/trusted-requester/hour,30/global/hour; one live pending generation. Shared address locks and monotonic revisions fence stale confirmation against withdrawal. Service-only RPCs, private forced RLS and no direct table grants.
- C1 envelope seam candidate SHA256 `66fd887454a59194f510ad607e33c1d4cc18f782d5f953c998246a545b531456` independently approved by the Spec and Standards roles before implementation. Dedicated AES256GCM key/key ID, fresh12-byte nonce,16-byte tag and authenticated immutable request/recipient/scope/wording/time identity; no production decrypt/read endpoint. P2 must authenticate and compare full binding and both hashes before admission.

## Retention interpretation and remaining gates

24hours is a hard confirmation/delivery-input eligibility deadline, not a promise of physical erasure at exactly24hours. Confirm/withdraw/superseding issuance clear associated ciphertext; a narrow idempotent service cleanup RPC clears expired held payloads. No scheduler is installed by P1, so physical cleanup can lag. Qualified cleanup cadence before activation is P2 operational work. Stored hashes/evidence retain restriction authority. Future welcome preparation requires its own withdrawal-only capability hash and frozen payload; it must not resurrect or broaden consent. No backfill of prior synthetic confirmations or P1 dispatch is implied.

One-click URLs necessarily transport the capability to the API endpoint; application source does not log requests, addresses, raw tokens, keys or payloads. Platform/proxy URL-log redaction and provider isolation still require operational qualification before activation. Human pages accept only fragment capabilities and carry no-referrer/no-store/strict hash CSP.

## Test selection and execution

Tests are additive at the approved request/storage/UI and real SQL seams. No existing tests were removed/consolidated. Request tests cover public behavior and generic errors; storage mocks only the external RPC transport, not SQL guarantees. Real SQL tests use a new harness-owned, labelled, no-network PostgreSQL17 container and reject remote URLs/container arguments/Docker overrides. Synthetic handler integration executes the actual handler over real SQL. UI tests use standalone HTML and dedicated local Chromium to prove keyboard actions, default paused/unchecked state, duplicate click prevention, refresh no replay, scanner safety, paused withdrawal, storage/resource privacy, feedback and mobile overflow.

Observed TDD RED stages: absent production request module; explicit-consent400 versus initial200; paused-confirmation/one-click behavior; absent storage module; encrypted envelope absent; arbitrary matching HTTPS origin accepted; SQL admission/confirmation/obsolete-intent cancellation. Each retained contract was implemented to GREEN. No skipped proof substitutes for the new SQL or browser seams.

Executed before final checkpoint:
- `pnpm install --frozen-lockfile --offline`: PASS,510 packages from local cache,0 downloads, no lockfile changes.
- `pnpm lint`: PASS, no warnings/errors; existing Next15 lint-deprecation notice only.
- `pnpm typecheck`: PASS.
- Focused production Vitest: PASS (request6, storage4, UI6).
- `pnpm exec tsx tests/helpers/production-marketing-browser.ts`: PASS mobile Chromium synthetic interaction/privacy matrix.
- `pnpm exec tsx tests/helpers/production-marketing-browser.ts http://127.0.0.1:3549`: PASS actual owned local Next default-off GET/HEAD/privacy and synthetic interaction matrix. Owned server stopped. @Browser was unavailable; no unrequested Chrome session was used.

Final complete Vitest, final SQL/envelope integration, whitespace/prepare and checkpoint results are recorded below after their runs. Build, full production browser suite, hosted advisors/remote deployment and provider rehearsal are NOT RUN and are not Ticket gate requirements. Essential P1 browser proof above is run. Independent final Ticket Review and remote CI/integration remain the delivery lead's next gates.

## Documentation consulted

Repository AGENTS, engineering workflow, testing strategy and applicable platform contracts; local TDD/implement/code-review skills; Supabase skill and current [changelog](https://supabase.com/changelog.md), [functions](https://supabase.com/docs/guides/database/functions) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) documentation; official [Node24 crypto](https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html) documentation. No Supabase CLI/keychain/auth probes were run. The new migration was written directly because the explicit no-CLI safety boundary overrides generic skill advice to use migration commands.

## Final checkpoint verification

- Complete `pnpm test`: PASS,299 files /2968 tests passed;1 file /8 pre-existing opt-in Catalog Restore SQL tests skipped by its normal `describe.skipIf` harness boundary. That catalog-specific PostgreSQL harness was not run by this unrelated production-consent Ticket. No new P1 test is skipped. An earlier exploratory complete run had the intentional pre-implementation envelope RED; a later test process passed but its shell wrapper used zsh's reserved `status` variable. The final clean-wrapper run exited0 with the totals above.
- Final `pnpm lint && pnpm typecheck && node scripts/db/test-production-marketing-consent.mjs && git diff --check`: PASS. The real no-network PostgreSQL17 runner reports actual handlers through PostgreSQL, forced RLS, service-only RPCs, expiry/finite bounds, concurrent normalized-address requests, concurrent confirmation, both withdrawal orderings and concurrent global-limit exhaustion, with0 provider calls. Envelope shape/canonical encoding/size/time/unique request checks and erasure on confirm/withdraw/supersede/expired cleanup pass; synthetic decryption verifies authenticated binding and hashes before use.
- All new SQL/UI implementation workers finished. The owned database containers and owned Next server were removed/stopped. No unrelated container was modified.

Next: local checkpoint with Ticket/Spec footers and `codex-task.sh prepare`, then independent Spec and Standards Ticket Review by the delivery lead. This is not an activation/readiness claim. P2/P3/P4 remain separate approved Tickets; no worker/event/operator or live provider work is delivered by P1.

## Standards review alias correction

The Standards review of checkpoint `3f30d9aac11116d914d11ffb5fdca730cd4b68c1` found that comparing the canonical request origin directly with `VERCEL_PROJECT_PRODUCTION_URL` would reject the normal apex system alias. Vercel documents that variable as the shortest attached production custom domain: https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_production_url . The existing storefront transition records both approved hostnames and the canonical www origin.

The correction accepts only exact `helixskin.us` or `www.helixskin.us` system aliases independently of the exact canonical `https://www.helixskin.us` request/config origin. Production environment, project, deployment, Supabase and dedicated-credential assertions remain required. It changes no UI, SQL, retention, dispatch or provider behavior and grants no activation authority.

The new apex-alias success test failed before the correction and passed afterward. It also verifies apex Origin/config rejection; the existing rejection loop now covers the old dev domain and a lookalike suffix. Focused request/storage checks: 2 files / 11 tests PASS. Full lint and typecheck PASS. Full Vitest exits 0: 299 files / 2,969 tests passed; the same one pre-existing opt-in Catalog Restore SQL file / 8 tests skipped. No P1 skip was added. `git diff --check` PASS. The unchanged real PostgreSQL/browser results above are prior checkpoint evidence; those suites were not rerun for this configuration-only correction. No production build, hosted operations or send occurred. Independent delta review is required on the new committed candidate before publication.
