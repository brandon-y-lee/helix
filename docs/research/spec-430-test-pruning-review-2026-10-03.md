# Spec 430 test pruning review

Review baseline: first parent `7470542` to merged spec commit `4b15ad2`; renewed cleanup baseline `cac2e99`. The spec added 14,597 test lines in 91 files: 6,524 Vitest, 970 browser, 5,061 SQL integration, and 2,042 JavaScript database runners. These are lines introduced by the merge, not a count of redundant assertions. The spec's [testing decisions](../specifications/resend-customer-service-draft.md#testing-decisions) call for direct proof of payment, privacy, authorization, concurrency, idempotency, and recovery, plus representative browser coverage at 390×844 and 1440×900.

**Decision rule.** Keep a test when it catches a distinct consequential failure at the right boundary. Condense repeated setup or variants that have the same outcome and failure mechanism. Remove a test only when a named retained test proves its material behavior equivalently. A `Keep` decision for a file does not imply every assertion in it is permanent. These are proposed source changes, not claims that retained coverage has already been rerun.

## Renewed cleanup decision — 2026-10-07

Issue [#430](https://github.com/brandon-y-lee/helix/issues/430) is closed for its completed milestone. This renewed request authorizes local test cleanup, not reopening operational acceptance. The October 3 estimates below remain candidate opportunities, not a deletion quota or completed work.

**Delivered scope:** the two browser files and three capability/registry files in the handoff patch. Import this testing guide/review; do not change production code, context routing, email implementation, CI gates, migrations, SQL fixtures, or database runners. Further provider/auth/marketing and harness proposals below remain deferred until their individual assertion maps and executable proof are reviewed.

| Removed or consolidated coverage | Retained executable proof / risk decision |
| --- | --- |
| Simulator stale-mutation browser case | `simulated-tracking-console`: “requires an explicit internal reason to resolve an exception, then shows fresh conflict history” proves authoritative conflict history, disabled terminal mutations, private reason redaction and heading focus. Server route and SQL concurrency suites remain intact. |
| Repeated desktop simulator dispatch and its mobile menu checks | Keep native Tab/Enter dispatch and heading focus at 390×844. Customer split history remains at both 390×844 and 1440×900. `admin-shell-verification` keeps desktop shell and mobile drawer focus; the retained Support photo browser case keeps mobile Tab containment, Escape and focus restoration. |
| Both upload-retry browser variants | `support-photo-ui`: “keeps accepted text after a photo upload fails and retries only that photo” proves exactly one intake POST, original upload identity, already-existing asset recovery, generic rejection and token concealment. Browser intake keeps native submission/status-check and processing/rejection at both sizes. |
| Desktop duplicate of new-context approval flow | Keep the full 390×844 conflict → refreshed context → edit/save → enabled approval → queued reply flow. The separate component conflict and ordinary save cases do not prove that recovery clears the review fence; both independent reviews caught this gap before final delivery. Component request binding and SQL approval/concurrent-send proof remain unchanged. |
| Desktop duplicate of AI draft browser flow | Keep the full 390×844 flow: native Generate/Load keyboard actions, edits during generation, manual load and explicit queue approval. `support-ai-ui` retains request identity, stale result, cancellation, reconnect and manual fallback checks. Inbox/photo layout remains at both sizes. |
| `support-capabilities.test.ts` | Merge all role grants, catalog-role exclusion and revoked membership assertions into the existing `admin-capabilities` case. It now checks both Support capabilities through the real guard, including active-admin allow and revoked-admin deny. Existing `admin-modules` case retains admin registration, checks both catalog roles and explicitly proves `support.read` registration. No extra test case or generic fixture is needed. |

**Rejected handoff cuts:** retain simulator lookup-error browser recovery/focus and Support refresh-error edit preservation/approval fencing/manual recovery. Existing component tests did not exercise those failure paths equivalently. Keep one new-context approval recovery flow because separate conflict and ordinary-save component tests do not prove recovery in the same state. Keep uncertain simulator retry because native alert → Tab → Enter recovery/focus is distinct from component request-identity proof. Keep hostile markup in a real browser and actual blob-image decode/private-preview focus, rather than relying only on jsdom. All payment, Auth, delivery, webhook, retry/idempotency, RLS and database concurrency suites remain unchanged.

| Inventory (not instrumented line/branch coverage) | Before | After |
| --- | ---: | ---: |
| Scoped browser cases / Chromium total | 19 / 190 | 13 / 184 |
| Scoped capability/registry cases / files | 11 / 3 | 9 / 2 |
| Complete Vitest cases / files | 2,674 / 252 | 2,672 / 251 |
| Scoped browser source lines | 346 | 313 |
| Scoped capability/registry source lines | 247 | 219 |

The delivered reduction is **61 net test source lines, six generated browser cases and two Vitest cases**. Behavioral coverage is preserved as mapped above; no instrumented statement/branch coverage claim is made. Documentation additions are excluded from test-source savings.

**Verification:** baseline complete Vitest passed (2,666 passed, eight skipped); retained component/authorization proof passed (62 tests in seven files). Final complete Vitest passed with one worker (2,664 passed, eight skipped, no failures or runner errors). The two default-worker post-change attempts failed under shared-machine load: two unchanged workflow cases failed on the first; the second had 17 timeout failures across four unchanged files and two runner RPC timeouts. All 51 workflow cases passed a focused rerun. The serial complete rerun preserved existing timeouts/assertions and executed every suite; parallel local results are not silently reported as green.

| Command | Outcome |
| --- | --- |
| `pnpm install --frozen-lockfile --offline --store-dir /tmp/helix-pnpm-store` | Passed using a local dependency copy; backing/reference checkout unchanged. |
| `pnpm lint` | Passed, no ESLint warnings/errors. |
| `pnpm typecheck` | Passed before and after production generation. |
| Focused Vitest: capability/module, simulator, Support photo/conversation/AI and shared shell | Passed: 62 tests / seven files. |
| `pnpm exec vitest run --maxWorkers=1` (default + JSON reporters) | Passed: 2,664 passed / eight skipped / 251 files. Skips are the existing opt-in database-backed `catalog-restore-sql-service` cases. |
| `CI=1 pnpm e2e` | Passed: fresh production build, verified server identity, complete Chromium and owned-process cleanup. 184 cases = 180 direct passes + one existing System anchor case passed on retry + three catalog-dependent skips. All 13 retained tracking/Support cases passed. Earlier 183-case run passed without that retry; it preceded restoring the recovery case. |
| `scripts/git/codex-task.sh prepare`, `git diff --check` | Passed. Standards and Spec reviews: one shared recovery finding fixed; both delta reviews have zero unresolved findings. |

The final browser retry was `system-core-flow`: “current System hashes reveal their targets below the header at 721px” (initial viewport ratio zero). Its source is unchanged; report this as remaining test flakiness, not a pruning regression or an unconditionally clean first attempt. Production build `IKhuRPjrBbroiZTHYj3nd` was verified against the final test source; the later commit records documentation only.

Local production verification uses public catalog credentials and read-only canonical catalog access. The sandbox denied the initial tsx IPC socket; the authorized local browser/build rerun used expanded local process/network permissions. No live settings, real sends, push, deployment or merge occurred. No SQL/runner suite is rerun for this increment because none changed; unchanged source coverage is not fresh database execution evidence. GitHub CI gates, WebKit and hosted operational acceptance are not run for this local Chromium cleanup. Actual sends remain outside this request.

## Browser tests: 970 introduced lines

| File | Decision | Retained proof and cut |
| --- | --- | --- |
| `e2e/auth-confirmation.spec.ts` | **Keep** | Real browser Origin/Referer and token-safe keyboard submission have no equivalent server-only proof. |
| `e2e/email-preferences.spec.ts` | **Condense** | Keep successful consent, explicit keyboard confirmation, and both withdrawal scopes at both sizes, including actual referrer and private response headers. Remove pending/503/error/retry branches retained in `tests/marketing-ui.test.tsx`. Estimated 95–120 lines. |
| `e2e/product-notifications.spec.ts` | **Condense** | Keep enrollment dialog/focus/Escape and one cancellation URL/no automatic write/token-safe keyboard POST, including real referrer and private headers. Remove browser recovery and repeated 503/retry branches retained in `tests/product-notifications-ui.test.tsx`. Estimated 110–130 lines. `tests/product-notification-requests.test.ts` still owns the server-side HEAD no-cancel proof. |
| `e2e/simulated-tracking.spec.ts` | **Condense** | Keep one mobile Admin Tab/Enter dispatch and heading-focus proof, plus customer split tracking at both sizes. Remove duplicate Admin menu and uncertain/retry/lookup/stale-mutation presentation cases covered by `e2e/admin-shell-verification.spec.ts` and `tests/simulated-tracking-console.test.tsx`. Estimated 55–65 lines. |
| `e2e/support-inbound-photos.spec.ts` | **Condense** | Keep contact photo processing, private preview/focus at both sizes, and one hostile-markup browser check. Remove repeated upload retry, new-context, AI draft, refresh, and Admin menu cases covered by focused component or existing browser tests. Estimated 75–105 lines. |

These cuts total an estimated **335–420 browser lines**. The corresponding component cuts below retain failure and recovery cases, so the two estimates are additive. Keep each retained browser outcome executable before deleting its overlapping component assertion; the Admin keyboard case is unique because component `fireEvent.click` does not prove native Tab/Enter and focus.

## Vitest: 6,524 introduced lines in 69 files

**48 Keep, 20 Condense, 1 Remove after merging its unique assertions.** The estimated net Vitest cut is **350–520 lines**, conditional on retaining the browser and database proofs named here.

| Decision | Files and reason |
| --- | --- |
| **Keep — auth, email, commerce, and marketing (15)** | `auth-cart`, `auth-email-actions`, `auth-email-operations`, `auth-email-templates`, `checkout-order-verification`, `email-provider`, `email-storage-deadline`, `marketing-provider-flow`, `marketing-provider`, `marketing-requests`, `marketing-storage`, `marketing-sync-route`, `marketing-templates`, `order-confirmation-state`, `order-tracking-email`. These cover distinct auth preservation, server/provider boundaries, payment-linked facts, and recipient policy. |
| **Keep — Admin, demo, Product, and tracking (14)** | `admin-capabilities`, `admin-verification-route-mode`, `demo-orders-page`, `demo-orders-verification-route`, `footer-support`, `pdp-product-waitlist`, `product-notification-delivery-storage`, `product-notification-email`, `product-notification-requests`, `product-notifications-verification-route`, `product-waitlist-route`, `simulated-tracking-console`, `simulated-tracking-presentation`, `simulated-tracking-routes`. Preserve the PDP lost-response/consent test because the slim browser enrollment drops that retry. Preserve tracking presentation: its fixture includes private fields absent from the browser fixture, so the browser redaction assertion alone is partly vacuous. |
| **Keep — support (19)** | `support-admin-routes`, `support-ai-routes`, `support-ai-runtime`, `support-ai-worker`, `support-delivery`, `support-email`, `support-inbound-provider`, `support-inbound-review`, `support-inbound-worker`, `support-ingestion-route`, `support-intake`, `support-photo-access`, `support-photo-cancellation`, `support-photo-request`, `support-photo-storage`, `support-photo-worker`, `support-photos`, `support-retention`, `support-ui`. These own private authorization, safe intake, reply approval, provider and worker effects, actual photo handling, and recovery. |

All names in this Vitest section are `tests/<name>.test.ts` or `.test.tsx`; the file inventory is the exact 69-file spec diff, including existing files modified by the spec.

| Condense these 20 files | Retained proof and change |
| --- | --- |
| `auth-callback-route`, `auth-confirmation-route` | Fold repeated fixed-origin or malformed-redirect variants into one boundary check each; keep distinct redirect and token decisions. |
| `checkout-refund-reconciliation` | Fold repeated frozen-Order assertions; keep refund and confirmation independence. |
| `email-delivery-command`, `email-delivery`, `email-routes` | Merge same-outcome remediation, generic guard, and scheduler-auth permutations; keep provider uncertainty, idempotency, immutable sender, and protected route proof. |
| `marketing-delivery`, `order-confirmation-email` | Consolidate repeated recipient guard and long-text fixture setup; keep domain-specific send and rendered receipt facts. |
| `marketing-ui` | Remove the repeated happy flows at lines 10–126 only after moving the unique stale-success-on-email-edit assertion at lines 46–49 into a retained component case. The browser owns the successful actions; this component file keeps pending/503, invalid links, network and malformed-200 responses, metadata, and link-switch races at lines 128–333. |
| `admin-modules`, `admin-route` | Replace repeated role-by-surface navigation matrices with one module registry assertion and one server route-wiring assertion. Keep direct authorization checks elsewhere. |
| `admin-shell` | Keep a short `navigationEnabled=false` test for link absence and desktop `aria-disabled`; remove repeated mobile drawer/focus assertions already covered in existing browser and shell tests. |
| `product-notifications-page`, `product-notifications-ui` | Keep invalid-token and link-switch cases. Fold recovery happy assertions into its lost-response/identity test; remove duplicate happy cancellation while retaining pending, error, privacy, and malformed-200 cases. The browser owns explicit keyboard cancellation. |
| `resend-operations` | Merge only duplicate verify smoke assertions; preserve the later operational gate, drift, and compare-and-swap cases added after spec 430. |
| `support-ai-ui`, `support-inbox-list`, `support-pagination`, `support-photo-ui`, `support-verification-fixtures` | Trim repeated presentation, paging, upload retry, and synthetic fixture assertions. Retain AI approval semantics, keyset/concurrent paging, photo safety, and exact hosted/local verification guards. |

**Remove after merge:** `tests/support-capabilities.test.ts` repeats the generic revoked-membership check in `tests/admin-capabilities.test.ts` and the support module registration in `tests/admin-modules.test.ts`. First move its unique Support role/capability assertions into the retained capability test, then remove the 26-line file. This is the only whole Vitest file with an evidenced removal; the net saving is smaller than 26 lines because its unique assertion moves.

## SQL integration tests: 5,061 introduced lines

| File | Decision | Distinct proof to retain; possible condensation |
| --- | --- | --- |
| `order_email_contracts.integration.sql` | **Keep** | Payment-to-intent atomicity, frozen receipt, uncertainty/lease/webhook handling, RLS; its pre-migration paid Orders prove no historical backfill. |
| `simulated_tracking.integration.sql` | **Keep** | Split allocation, races, refund/activation interactions, and private simulated shipment state. |
| `product_notification_contracts.integration.sql` | **Keep** | Canonical publication, legacy consent snapshot, recovery, claim/replay. |
| `support_ai_contracts.integration.sql` | **Keep** | Owner-only minimized context, stale/leased jobs, cancellation, manual fallback. |
| `support_inbound_contracts.integration.sql` | **Keep** | Ambiguous/forwarded routing, base-address no-auto-ack, deduplication, holds, backpressure, RLS. Automated-mail loop quarantine is in `tests/support-inbound-provider.test.ts`. |
| `support_inbound_photos.integration.sql` | **Keep** | Actual-byte quotas, durable attachment slots, private derivatives, cleanup. |
| `marketing_subscription_contracts.integration.sql` | **Condense** | Share repeated subscription setup and combine diagnostic variants only where they prove one rule. Keep double opt-in, withdrawal precedence, cap, stale import, and uncertainty. |
| `support_intake_contracts.integration.sql` | **Condense** | Remove duplicate invalid-email fixture; replace 25,031-row/1,002-page Inbox traversal with a smaller keyset/concurrent-insert test that still crosses the former 25,025-row offset ceiling and proves no omitted or duplicate records. Keep durable intake, approval fencing, role checks, rollback. |
| `support_retention_contracts.integration.sql` | **Condense** | Share photo/email fixtures. Keep closure clocks, holds, cleanup leases, re-sweeps of tombstoned photo paths, and financial-history preservation. |

**No whole SQL test file is an evidenced removal.** The low-risk SQL source reduction is tens to low hundreds of lines; larger fixture refactors need assertion-by-assertion review. A mock cannot replace the database RLS, transaction, or race checks.

## Database runners: 2,042 introduced lines

| Files | Decision | Retained proof and cut |
| --- | --- | --- |
| `test-order-email-contracts.mjs`, `test-simulated-tracking.mjs`, `test-support-ai-contracts.mjs`, `test-support-retention-contracts.mjs` | **Keep; share setup** | Preserve disposable database creation, migration-stage fixtures, PostgreSQL 17 and labeled-container checks, two-connection races, safe error output, and AI/retention `--keep` behavior. |
| `test-support-intake-contracts.mjs` | **Condense** | About 238 lines copy tracking runner setup/scenarios. Share those scenarios while still executing the relevant old-schema and later-schema race checks. |
| `test-marketing-subscription-contracts.mjs`, `test-support-inbound-contracts.mjs`, `test-product-notification-contracts.mjs` | **Condense** | Remove recursive rewriting and full re-execution of predecessor runners. After each migration that replaces shared dispatch functions, run a small prior-purpose sentinel instead. The Product migration is the final shared claim/prepare/retry/finish override and needs a final-schema prior-purpose dispatch check. |

Extracting shared local database and concurrency setup, sharing the copied tracking scenario, and replacing recursive predecessor replays could save **roughly 350–500 net runner lines** and more execution time. Later migrations replace shared dispatch functions, so the small sentinel must still exercise prior email purposes after each replacement. Preserve the historical Order and waitlist pre-migration snapshots and the tracking install race.

## Net opportunity and delivery split

The evidence-backed target is **about 1,000–1,600 net test lines**, or **7–11%** of the 14,597 introduced lines: 335–420 browser, 350–520 Vitest, 350–500 runners, and at most roughly 150 low-risk SQL lines. These are estimates until a concrete rewrite passes the retained checks. The earlier exploratory 1,800–3,500-line range overstated savings by counting some browser/component overlap twice and treating shared runner extraction as gross deletion. Cutting thousands more would require a new assertion-by-assertion case, especially for SQL.

Proposed implementation breakdown for the repository's approval workflow:

1. **Browser and Vitest overlap:** use the paired proof ownership above; keep both specified viewports, native keyboard/focus, private headers, and retained component failure paths. Remove the single merged Support capability file only after its unique assertions move.
2. **Disposable database harness and narrow SQL fixtures:** share setup and copied tracking races, replace recursive predecessor suite replays with prior-purpose sentinels, then make only the evidenced SQL fixture cuts. Run real local database checks at each migration stage.

## Migration boundary

The eight SQL migrations merged by spec 430 are historical execution records, not disposable test scaffolding. Their remote apply state was not checked for this read-only review. Do not edit, squash, or delete them in this cleanup. A future schema checkpoint or runner refactor must prove equivalent migration-stage behavior. This review makes no remote database or provider changes.

## Verification and limits

Implement cuts in small groups and record the retained executable proof before removing each duplicate. Run affected Vitest/browser checks, local disposable database suites for SQL or runner changes, and the existing full CI gates in [engineering workflow](../agents/engineering-workflow.md). The October 3 review checkout was missing test dependencies (`@react-email/render`, `resend`, `sharp`): that historical Vitest run had 2,473 passes, eight pending, and 15 import failures, so it was **not a passing baseline at that time**. The renewed cleanup establishes its own baseline above. No database suite was run for the October 3 review. Hosted delivery, native welcome restrictions, AI runtime isolation, image-content validation, and backup restoration require separate operational proof; this cleanup does not reopen or reassess the closed milestone’s operational acceptance. SQL tests alone do not establish hosted facts.
