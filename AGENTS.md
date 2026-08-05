# Mei Pelle — Codex Agent Rules

Mei Pelle is a production-quality prestige men’s skincare ecommerce platform for Vercel. Build durable software that serves real customers safely and fails honestly when dependencies are unavailable.

Customer-facing name: `Mei Pelle`  
Customer-facing wordmark: `MEI PELLE`

Stable technical identifiers such as `mei-pelle` may remain when renaming risks compatibility. Verified non-production services and test credentials do not justify describing Mei Pelle publicly as a demo, prototype, or development store. Task prompts are scoped product deltas. This file contains durable project-wide rules, not an invitation to redesign adjacent systems or automate every possible check.

## 1. Instruction Priority

Follow, in order:

1. The current user request and explicit acceptance criteria.
2. The most specific applicable `AGENTS.md`.
3. This root `AGENTS.md`.
4. Current code, tests, migrations, and maintained documentation.
5. Verified non-production services and official provider documentation.
6. Historical prompts and third-party references as supporting context only.

Inspect the current repository instead of assuming an earlier task completed correctly. Report material conflicts rather than silently preserving stale requirements.

## 2. Smallest Complete Change

- Implement the smallest complete change that satisfies the request.
- Treat scope as a constraint. Do not fix or redesign unrelated code merely because an improvement is possible.
- Fix the root ownership layer rather than adding route-by-route patches.
- Preserve established behavior unless the task explicitly changes it.
- Prefer deleting, consolidating, or extending existing code over creating a parallel system.
- Add an abstraction only when the current task needs it and it removes net complexity for concrete current uses or isolates a genuinely high-risk boundary.
- Do not add dependencies, services, wrappers, page-object hierarchies, custom DSLs, generalized infrastructure, or speculative extensibility when the current stack can solve the requirement simply.
- Implement only relevant, reachable loading, empty, error, retry, cancellation, and recovery states. Do not build hypothetical future states.
- Ask a question only when a missing decision materially affects architecture, security, claims, irreversible data work, external cost, or product direction.
- Never fake success, silently substitute data, or claim an unrun check passed.

“Production quality” means an appropriately scoped implementation with correct security, accessibility, data integrity, reliability, performance, and recovery—not maximal code, abstraction, or test count.

## 3. Proportional Preflight

Before editing, run:

```bash
pwd
git branch --show-current
git status --short
git diff --stat
git log --oneline --max-count=10
git worktree list
```

Then:

- Read applicable `AGENTS.md` files from the root to the target path.
- Preserve uncommitted user work.
- Inspect the owning implementation, direct callers, existing tests, and relevant scripts.
- Reproduce current runtime or UI behavior when the task changes it.
- Consult provider documentation only for version-specific, uncertain, or security-sensitive behavior.
- Verify remote state only before a database, search-index, payment, catalog, or other remote mutation.

Do not start the full application, contact external services, perform broad repository archaeology, or run the full matrix for a documentation-only or narrowly local task without evidence it is needed. Never reset, discard, overwrite, or blindly stash unrelated work.

## 4. Testing and Verification

Testing should maximize confidence per unit of maintenance cost. A larger suite is not inherently safer.

### Choose the test before writing it

For every behavior change, determine:

1. The externally observable behavior that changed.
2. The plausible regression a test would catch.
3. The existing test nearest to owning that behavior.
4. The lowest reliable test layer.
5. Whether existing coverage can be updated or consolidated instead of expanded.

“No new automated test” is valid when existing coverage already catches the regression and focused manual verification is sufficient. Do not add tests merely to make a change appear production-grade.

### Test-layer ownership

- **Unit:** pure logic, policies, calculations, sequencing, formatting, content selection, and mapping.
- **Component:** local UI state, keyboard/focus behavior, loading/error rendering, and component accessibility.
- **Route/integration:** handlers, authorization, validation, persistence, RLS-facing behavior, webhooks, and provider adapters.
- **Playwright E2E:** critical multi-boundary customer journeys and behavior that truly requires a browser, navigation, scrolling, history, cross-route focus restoration, or touch/hover differences.
- **Visual snapshots:** a few critical appearance contracts, only when deterministic infrastructure already exists.

Do not duplicate the same contract at multiple layers without a distinct failure mode.

### Test-writing rules

- Update the nearest existing test before creating a new spec or suite.
- Use one representative route, product, or record unless the defect is data-specific.
- Use representative desktop (`1440 × 900`) and mobile (`390 × 844`) viewports. Add another width only for a documented breakpoint risk.
- Do not create route × viewport, product × viewport, state × browser, or similar Cartesian matrices.
- Do not turn every acceptance criterion or browser observation into a permanent assertion.
- Do not reimplement CSS formulas or use functional E2E tests as handwritten visual-regression engines.
- Avoid exact pixel, RGB, font, spacing, transform, animation-progress, and broad `getComputedStyle` assertions in functional E2E.
- Avoid historical negative assertions about old copy, selectors, or layouts unless they protect a current security, privacy, legal, claims, accessibility, or commerce contract.
- Prefer roles, labels, visible outcomes, URLs, and stable public state over private classes or DOM structure.
- Do not use fixed sleeps. Wait for the actual state, event, network boundary, or web-first assertion.
- Keep tests focused and readable. A test approaching roughly 150 lines needs clear browser-level justification and should usually be simplified or moved down a layer.
- Remove or consolidate obsolete coverage when behavior changes instead of accumulating historical expectations.
- Preserve high-risk payment, authorization, data-integrity, idempotency, and recovery coverage at the lowest reliable layer.

### Browser inspection is not test generation

For meaningful UI work, inspect the changed surface at desktop and mobile. Check only affected modalities and states, such as keyboard, pointer, touch, overlays, navigation, reduced motion, zoom, or overflow. Manual inspection does **not** require an automated assertion for every inspected detail.

### Proportional validation

- Run focused tests while developing.
- Before committing, run the smallest complete set covering the changed ownership layer and critical integration boundary.
- Run the full unit suite, Playwright suite, production build, database checks, or provider smoke tests only when the change can affect them or CI requires them.
- A documentation-only `AGENTS.md` change normally requires diff review and available Markdown validation, not the application suite.
- Report external blockers exactly and never report a blocked check as passed.

## 5. Brand, References, and Product Contracts

Mei Pelle should feel editorial, modern, visually led, sparse, confident, ingredient-literate, and masculine without tactical or hyper-macho styling. Use Marcellus selectively for display and wordmark treatment; use Manrope for functional UI and body text.

Public support, legal, order, rewards, and service-status content must be factual. Do not publish fake contact details, placeholder policies, unsupported service levels, or unverified claims.

Rhode may inform structural UX, but do not copy its assets, footage, branding, exact copy, source code, exact CSS, proprietary typography, campaign identity, or full trade dress.

Leaders Cosmetics may inform verified supplier facts and operational details. Customer-facing naming, merchandising, palette, and presentation remain Mei Pelle. Do not import supplier reviews, ratings, testimonials, loyalty branding, customer imagery, before-and-after imagery, transient campaign copy, or runtime supplier media.

Durable contracts:

- Products: `CLEANSE`, `REFINE`, `TREAT`, `FRAME`, `SEAL`, `LIFT`.
- System order: `01 CLEANSE`, `02 REFINE`, `03 TREAT`, `04 FRAME`, `05 SEAL`, `06 PROTECT`, `07 LIFT`.
- Core: `CLEANSE` → `TREAT` → `SEAL`.
- Customer-facing terminology is `The System` / `System` / `SYSTEM`; `/system` is canonical and `/method` is compatibility only.
- `PROTECT` is editorial, not merchandise, unless a future task creates a verified catalog item.
- The free-standard-shipping threshold is `$50.00`, stored as `5000` cents in one shared server-safe policy source.

Legacy technical identifiers may remain only for compatibility; they must not remain canonical customer-facing names or routes. Keep transient copy, exact layouts, hero geometry, and one-off merchandising decisions in the implementation, current prompt, or focused product documentation. Automate only durable behavior that warrants regression protection.

## 6. Architecture and Data Authority

- Use the installed Next.js conventions and deploy to Vercel.
- Supabase is canonical for catalog and application data. Approved non-production project: `erasogmsqpgiirovubjh`.
- Algolia powers interactive search; it is not the canonical PDP source.
- Public catalog reads follow the repository’s cache and revalidation architecture. Customer-specific data must never be publicly cached.
- Do not introduce a static runtime product fallback. Fixtures are for tests, seeds, imports, and controlled tooling only.
- Product media must be project-controlled.
- Prefer server components and server-side data for initial rendering. Add client components only where interaction requires them; do not make whole routes dynamic for small islands.

## 7. Authentication, Commerce, and Security

Preserve the established Supabase SSR/cookie authentication and server-backed cart architecture. Keep browser and server clients separate and authorize protected data server-side. Never trust browser-submitted prices, totals, discounts, balances, availability, ownership, user IDs, order state, referral eligibility, or payment state.

Stripe remains sandbox/test only until explicit live-mode approval. Reject live keys, objects, and webhook events outside an approved live environment. Use server-authoritative cart and pricing data, integer minor units, immutable order snapshots, raw-body webhook verification, and idempotent event handling that tolerates retries and out-of-order delivery. Do not store card data, expose secrets, finalize solely from a redirect, clear carts, award rewards, or claim payment before server verification. Missing configuration must produce an honest unavailable state. Live payments, fulfillment, and customer communications require separate approval.

Orders, addresses, payment references, support messages, feedback, and fulfillment state are private. Enforce strict RLS and ownership checks, preserve historical order facts, and avoid logging PII or raw provider payloads.

Rewards and referrals require an immutable auditable ledger, transactional/idempotent changes, protection against concurrent overspending, and trusted server-side writes. Trustpilot reviews must never earn incentives. A private first-party feedback program may be rewarded only when clearly separate from public reviews and independent of sentiment.

Apply least privilege, server-side validation, CSRF/origin protection, safe redirects, bounded abuse controls where supported, retry-safe webhooks, and auditable state. Fail closed when authorization, security, or provider checks fail. Keep secrets out of source, logs, browser bundles, screenshots, and errors. Privacy and legal content must describe actual behavior.

## 8. Supabase and Remote-Mutation Safety

Use only the verified non-production project. Never modify production data.

Before mutation:

```bash
pnpm dlx supabase projects list
pnpm dlx supabase migration list
pnpm dlx supabase db push --dry-run
```

Confirm project `erasogmsqpgiirovubjh`. Inspect schema and migration history; prefer additive changes; review RLS, grants, foreign keys, indexes, functions, triggers, and safe `search_path`; apply only understood changes; verify the resulting schema; run available database linting; regenerate types.

Every exposed application table requires appropriate RLS; public catalog writes are forbidden; privileged credentials remain server-only; security-definer functions require a fixed safe `search_path` and narrow grants. Never reset the linked database, weaken RLS, truncate broadly, delete real users or catalog history, force migration history, run destructive drops without explicit approval, or expose privileged credentials. Back up affected non-production data before bulk transformations. Prefer archiving over hard deletion and reconcile Supabase, cache state, and Algolia after bulk catalog changes.

## 9. UI, Accessibility, Reliability, and Performance

Own shared behavior in shared components or the application shell. Use semantic HTML and native controls; avoid nested interactive elements. Preserve affected focus trapping/restoration, Escape handling, body-scroll locking, keyboard and touch operation, reduced motion, visible focus, and truthful loading/error states.

Target WCAG 2.2 AA. Prevent layout shift and horizontal overflow, keep client bundles proportional, avoid N+1 queries and duplicate requests, preserve cache boundaries, and handle relevant provider latency or outage states honestly.

## 10. Skills, Review Loops, Git, and Integration

Skills and subagents are optional workflows; they do not expand the user’s request or override this file.

- Invoke a skill only when its trigger matches.
- Do not start recursive improvement, repeated review/fix, or open-ended orchestration for an ordinary scoped task.
- Any iterative workflow needs a finite objective and explicit stop condition. Report unrelated findings instead of automatically fixing them.
- Review agents may suggest coverage, but every proposed test must satisfy the layer and non-duplication rules above.
- Use subagents only when parallelism clearly reduces risk or time; keep workstreams narrow and non-overlapping.

Preserve uncommitted user work, review the final diff for scope drift and unnecessary complexity, and commit only completed task-related work. Do not push unless requested. Do not amend, reset, force-push, or rewrite unrelated history. Remove completed temporary worktrees.

### Codex task branches

- `main` is the production branch. `dev` is the staging and integration branch; task work never merges directly to `main`.
- Start every Codex task in a managed worktree from the current local `dev` head. Before editing, run `scripts/git/codex-task.sh start <slug>`; it refuses dirty or non-detached worktrees and creates `codex/<slug>` from the latest local `dev` commit.
- Work and commit only on the task branch. If `dev` advances, merge `dev` into the task branch and rerun all affected verification.
- Only after the task is complete and the relevant checks pass, run `scripts/git/codex-task.sh merge`. The command fast-forwards `dev` in a temporary integration worktree, then detaches the task worktree and deletes the merged task branch.
- Never merge incomplete, unverified, dirty, or conflicted work. Keep `dev` free from long-lived checkout so the guarded merge can acquire it. Do not push `dev` or promote `dev` to `main` unless the user explicitly requests it.

See `docs/git-workflow.md` for the full operator workflow and recovery steps.

## 11. Definition of Done and Reporting

A task is complete when the requested behavior is implemented with the smallest reasonable diff; affected security, privacy, data, accessibility, and recovery boundaries are preserved; the lowest appropriate test layer is used; obsolete coverage is consolidated where relevant; the complete relevant validation set passes or exact blockers are documented; remote changes are verified in the approved non-production environment; and the final diff contains no secrets, debug output, temporary files, placeholder copy, or unrelated changes.

For meaningful tasks, report concisely:

- starting state or root cause
- behavior implemented and key decisions
- files changed
- test impact, including tests updated, added, consolidated, or intentionally not added and why
- commands and exact outcomes
- relevant routes, browsers, and viewports inspected
- remote changes, skipped checks, and blockers
- skills, subagents, and worktrees used
- final commit hash and local run command

Do not restate the full prompt.

## 12. Maintaining This File

Keep `AGENTS.md` short, accurate, and durable—a map of project rules, not an implementation manual. Add rules only after a repeated failure pattern or deliberate project-wide contract change. Put task-specific acceptance criteria, transient layouts/copy, and detailed workflows in the current prompt or focused documentation. Edit this file only when the user explicitly requests it or a durable contract intentionally changes.
