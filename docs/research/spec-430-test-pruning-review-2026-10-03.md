# Spec 430 test pruning review

Review baseline: first parent `7470542` to merged spec commit `4b15ad2`; current `dev` at `cac2e99`. The spec added 14,597 test lines in 91 files: 6,524 Vitest, 970 browser, 5,061 SQL integration, and 2,042 JavaScript database runners. These are lines introduced by the merge, not a count of redundant assertions. The spec's [testing decisions](../specifications/resend-customer-service-draft.md#testing-decisions) call for direct proof of payment, privacy, authorization, concurrency, idempotency, and recovery, plus representative browser coverage at 390×844 and 1440×900.

**Decision rule.** Keep a test when it catches a distinct consequential failure at the right boundary. Condense repeated setup or variants that have the same outcome and failure mechanism. Remove a test only when a named retained test proves its material behavior equivalently. A `Keep` decision for a file does not imply every assertion in it is permanent. These are proposed source changes, not claims that retained coverage has already been rerun.

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

Implement cuts in small groups and record the retained executable proof before removing each duplicate. Run affected Vitest/browser checks, local disposable database suites for SQL or runner changes, and the existing full CI gates in [engineering workflow](../agents/engineering-workflow.md). The current local checkout has missing test dependencies (`@react-email/render`, `resend`, `sharp`), so its earlier Vitest run had 2,473 passes, eight pending, and 15 import failures; it is **not a passing baseline**. No database suite was run for this review. Hosted delivery, native welcome restrictions, AI runtime isolation, image-content validation, and backup restoration still need separate operational evidence; SQL tests alone do not establish them.
