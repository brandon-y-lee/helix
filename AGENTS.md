# Mei-Pelle — Codex Agent Rules

Mei-Pelle is an original, production-oriented prestige men’s skincare ecommerce platform. Optimize for durable implementation quality, a locally runnable application, and clean deployment to Vercel.

This file contains project-wide operating rules. Treat task prompts as scoped deltas, not as replacements for these rules.

## 1. Instruction and Source-of-Truth Order

Follow, in order:

1. The current user request and explicit acceptance criteria.
2. The most specific applicable `AGENTS.md` file for the files being edited.
3. This root `AGENTS.md`.
4. Current repository code, tests, migrations, and documented contracts.
5. Verified linked development services.
6. Historical prompts and external references only as supporting context.

Do not assume an earlier prompt was completed correctly. Inspect the current implementation and reproduce the present behavior before editing.

When instructions conflict materially, follow the higher-priority source and report the conflict. Do not silently preserve stale behavior merely because it appeared in an older prompt.

## 2. Execution Standard

For every task:

- Provide a concise implementation plan, then continue without waiting for confirmation.
- Ask a question only when a missing decision would materially change architecture, security, claims, irreversible data work, or the user-visible product direction.
- Do not stop after planning, diagnosis, or partial implementation while safe independent work remains.
- Fix the root ownership layer rather than applying route-by-route or component-by-component patches.
- Keep the change scoped to the requested outcome. Avoid opportunistic redesigns, dependency additions, and unrelated refactors.
- Preserve working account, cart, search, catalog, navigation, Method, About, PDP, and product-card behavior unless the task explicitly changes them.
- Never claim a command, test, browser check, migration, or remote mutation succeeded unless it actually did.

## 3. Required Repository Preflight

Before editing, run:

```bash
pwd
git branch --show-current
git status --short
git diff --stat
git log --oneline --max-count=10
git worktree list
```

Also:

- Read every applicable `AGENTS.md` from the repository root to the target path.
- Confirm the primary checkout and current branch.
- Preserve all uncommitted user work.
- Inspect `package.json`, project scripts, framework versions, environment documentation, and relevant tests.
- Inspect recent commits affecting the target area.
- Reproduce the current behavior before choosing a solution.
- For UI work, run the app and inspect the relevant routes in Codex Chrome.

Never reset, discard, overwrite, or blindly stash unrelated changes.

## 4. Brand and Claims Discipline

Mei-Pelle should feel:

- editorial
- modern
- visually led
- masculine without tactical or hyper-macho styling
- aspirational without exploiting insecurity
- precise and ingredient-literate
- influenced by South Korean formulation discipline and Los Angeles self-invention
- sparse, confident, and product-led

Use Marcellus selectively for display and wordmark treatment. Use Manrope for functional UI and body text.

Avoid:

- shame-based looksmaxxing language
- guaranteed attractiveness or social outcomes
- structural facial-change, hormonal, surgical, or anatomical claims
- medical, disease-treatment, healing, DNA-repair, or unsupported clinical claims
- fabricated studies, percentages, certifications, endorsements, founders, advisors, laboratories, or environmental achievements
- generic black-and-gold luxury
- tactical, gym-supplement, gamer, crypto, or cyberpunk aesthetics
- verbose supplier-style customer copy

Present self-improvement through consistency, grooming, hydration, texture, controlled shine, a rested appearance, healthy presentation, and self-respect.

For ingredient education:

- Keep PDRN language cosmetic and appearance-focused.
- Keep peptide claims sequence- and formulation-specific.
- Do not imply topical plant-derived collagen becomes human dermal collagen.
- Do not use fear-based “clean” language.
- Treat sustainability as a documented ambition unless verified facts support stronger claims.

## 5. External Reference Boundaries

### Rhode

Rhode may be inspected as a structural UX reference for editorial proportions, navigation behavior, drawers, collection composition, product cards, PDP hierarchy, campaign video, and long-form page rhythm.

Codex may study live behavior, responsive transitions, semantics, focus handling, animation timing, and network behavior.

Do not copy Rhode’s assets, footage, branding, exact copy, source code, exact CSS, proprietary typography, campaign identity, or full trade dress.

### Leaders Cosmetics

Leaders is a supplier and catalog-information source only. It may inform product curation, ingredients, percentages, directions, cautions, formats, sizes, prices, variants, and provenance.

Customer-facing names, taglines, descriptions, merchandising, palette, and presentation must remain Mei-Pelle.

Do not import supplier reviews, ratings, testimonials, customer imagery, loyalty language, before-and-after imagery, or transient campaign copy. Do not hotlink supplier or Shopify media at storefront runtime.

## 6. Current Product and Experience Invariants

Verify these against the repository before changing them. They are high-risk contracts, not permission to duplicate data in new static fallbacks.

### Catalog and Method

Current short product names:

- `RESET`
- `REFINE`
- `RECODE`
- `FRAME`
- `SEAL`
- `LIFT`

Current Method order:

- `01 RESET`
- `02 REFINE`
- `03 RECODE`
- `04 FRAME`
- `05 SEAL`
- `06 PROTECT` — editorial coming-soon step; not a current product
- `07 LIFT`

Do not create a fake Supabase product, variant, price, inventory record, PDP, cart action, or Algolia record for PROTECT.

### Global Header

The desktop header keeps primary navigation left, `MEI-PELLE` at the exact viewport center, and search/account/cart utilities right.

The shared navbar state model applies globally:

- visible and transparent at the top
- hidden after meaningful downward scrolling
- revealed on meaningful upward scrolling
- legible surface treatment when revealed away from the top
- transparent again when returning to the top
- forced visible while a drawer/menu is open or keyboard focus is inside the header

Use one shared state machine. Avoid page-specific duplicate scroll listeners.

Layout modes are explicit:

- Homepage: header overlays the full-viewport hero.
- Non-home routes: initial page content reserves the header row; hero backgrounds and panels begin below it.

Do not reintroduce a global spacer that shortens the homepage hero, and do not let non-home heroes consume the header’s vertical space.

### Product Cards

Maintain explicit states:

1. default
2. pointer or keyboard-focus preview
3. persistent inline quick buy
4. cart drawer after final add

The first BUY action opens quick buy and must not mutate the cart. The final BUY action adds the canonical selected variant. Touch must not depend on hover. Use valid interactive markup and preserve focus restoration.

### Method and About

`/method` is instructional and product-connected. `/about` is narrative and brand-led. They must remain visually and structurally distinct.

Treat current approved copy, hero media, and exact section composition as repository/task-level state. Verify the implementation instead of relying on old prompt text.

## 7. Technical Architecture

- Framework: Next.js using the installed repository version and conventions.
- Deployment target: Vercel.
- Supabase is the canonical source for catalog and application data.
- Linked non-production Supabase project reference: `erasogmsqpgiirovubjh`.
- Algolia powers interactive search and is not the canonical PDP source.
- Supabase webhook synchronization keeps Algolia current.
- Public catalog reads use the repository’s current Next/Vercel caching and revalidation strategy.
- Account, session, profile, and cart data must never be publicly cached.
- Do not introduce a static runtime product fallback catalog.
- Static fixtures are allowed only for tests, seeds, imports, and controlled development tooling.
- Product media uses project-controlled Mei-Pelle media or placeholder-hue records; do not add runtime supplier-media dependencies.
- Add new infrastructure or dependencies only after inspecting whether the current stack already solves the requirement.

Prefer server components and server-side data access for initial rendering. Add client components only where interaction requires them. Avoid turning whole routes dynamic for small client-side behavior.

## 8. Authentication and Cart Invariants

Preserve the existing Supabase SSR/cookie-based authentication architecture:

- sign up
- email confirmation
- sign in
- sign out
- forgot/reset password
- protected account page
- profile editing
- session persistence

Keep browser and server clients separate. Authorize protected data server-side. Never expose service-role or secret keys to client code.

Preserve the server-backed cart:

- high-entropy HttpOnly guest identity
- authenticated carts
- guest-to-user merge
- variant-specific lines
- quantity controls
- removal
- subtotal
- persistence
- right-side drawer

Never trust browser-submitted prices, ownership, user IDs, or availability. Resolve canonical price and availability server-side.

Real checkout, payment, shipping, tax, addresses, fulfillment, order creation, and production PII remain out of scope unless explicitly approved.

## 9. Supabase, RLS, and Data Safety

Use only the verified non-production Mei-Pelle development project. Never modify production data.

Before remote mutation, run:

```bash
pnpm dlx supabase projects list
pnpm dlx supabase migration list
```

Confirm the linked project reference is `erasogmsqpgiirovubjh`.

For migrations:

1. Inspect the existing schema and migration history.
2. Prefer additive, non-destructive changes.
3. Read every pending migration.
4. Check RLS, grants, foreign keys, functions, and `search_path` safety.
5. Run:

```bash
pnpm dlx supabase db push --dry-run
```

6. Apply only understood development changes:

```bash
pnpm dlx supabase db push
```

7. Verify schema and history.
8. Run linked database linting when available.
9. Regenerate database types using the repository command.

Never:

- reset the linked database
- weaken or disable RLS
- truncate broadly
- delete real users or catalog history
- run destructive drops without explicit approval
- manipulate migration history merely to force a push
- expose secrets or credentialed URLs

Every exposed application table requires appropriate RLS. Public catalog writes are forbidden. Authenticated users may access only their own protected data. Guest carts must remain isolated through the intended server boundary.

Prefer archiving over hard deletion. Back up development catalog data before bulk transformation. Keep imports and catalog refreshes idempotent and report inserted, updated, archived, skipped, and failed counts.

After bulk catalog changes, reconcile Supabase, cache state, and Algolia completely so stale records are removed.

## 10. Search Architecture

- Interactive search queries Algolia.
- Public clients may receive only the Algolia app ID, index name, and search-only key.
- Admin/write keys remain server-only.
- Use stable `objectID` values.
- Index only active/published storefront-safe records.
- Do not index secrets, supplier costs, private notes, drafts, or archived products.
- Use webhook synchronization for routine catalog changes.
- Use full replacement rebuilds for initial population, bulk changes, or recovery.
- Verify active counts and slug sets between Supabase and Algolia after bulk operations.

Preserve loading, empty-query, no-results, error, keyboard-close, focus-trap/restoration, and body-scroll-lock behavior in the search drawer.

## 11. UI Implementation Standard

Before changing a shared UI surface, document its observable state model:

- top/default state
- scrolled or transformed state
- pointer state
- keyboard-focus-visible state
- touch behavior
- open overlay state
- loading, empty, error, and success states where relevant
- route-transition behavior
- reduced-motion behavior

Implementation expectations:

- Own shared behavior in the shared shell/component, not in individual routes.
- Use explicit state rather than accidental CSS interactions.
- Avoid unnecessary rerenders on scroll; prefer passive listeners and `requestAnimationFrame` or the repository equivalent.
- Prefer transform/opacity animation and avoid layout thrashing.
- Prevent hydration mismatches and layout shift.
- Preserve semantic HTML, native link/button behavior, and progressive enhancement.
- Avoid nested interactive controls.
- Maintain mobile/touch parity with desktop hover interactions.
- Do not introduce a new animation library for a small interaction.
- Reuse current tokens, type, spacing, media, and component conventions.
- Do not hardcode duplicated layout constants when a shared token is appropriate.

For user-supplied media, inspect the source before choosing crop, focal point, derivative sizes, encoding, and poster frame. Commit optimized project-controlled derivatives rather than unnecessarily large raw sources when appropriate.

## 12. Accessibility

Target WCAG 2.2 AA behavior.

Verify, as relevant:

- semantic landmarks and logical heading order
- one meaningful H1 per page
- visible focus and complete keyboard operation
- valid links, buttons, dialogs, and labels
- focus trap and focus restoration
- Escape handling
- body-scroll locking
- form error association
- ARIA live announcements for cart changes
- sufficient contrast across gradients, hues, and video frames
- touch-friendly targets
- reduced-motion support
- no essential information conveyed by color alone
- product-card operation without hover
- decorative media hidden from assistive technology
- skip-link behavior, including Safari/macOS overscroll
- no page-level horizontal overflow
- readable content at 200% zoom

Accessibility fixes must preserve the intended visual hierarchy rather than hiding functionality from assistive technology.

## 13. Browser Inspection and Visual QA

Use Codex Chrome for meaningful UI work.

At minimum, inspect shared storefront changes at:

- desktop around `1440 × 900`
- mobile around `390 × 844`

Also inspect `1920 × 1080`, tablet, or additional mobile widths when the change affects wide composition, breakpoint transitions, sticky behavior, or mobile navigation.

Verify:

- the requested behavior is reproduced before the fix and resolved after it
- exact layout relationships using computed bounds when relevant
- route transitions and browser back/forward behavior
- keyboard, pointer, and touch interaction
- drawers, menus, and scroll locking
- reduced motion
- no horizontal overflow
- no console errors
- no failed application requests
- no unexpected supplier/Shopify runtime requests
- no regressions in account, cart, search, catalog, filters, sorting, variants, Method, About, PDP, or product cards

Use screenshots as evidence for meaningful visual changes, but do not commit temporary QA artifacts unless the repository expects them.

## 14. Testing and Verification

Inspect `package.json` and use the repository’s actual scripts.

Run focused tests during development, then the complete relevant suite before committing. When available, run:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm exec playwright test --reporter=list --timeout=30000 --workers=1
```

For database, catalog, or search work, also run the relevant repository equivalents of:

```bash
pnpm dlx supabase migration list
pnpm dlx supabase db push --dry-run
pnpm dlx supabase db lint --linked
pnpm run catalog:refresh:presentation
pnpm run search:reindex
```

Add focused automated coverage for durable behavior and regression-prone state transitions. Prefer assertions on observable outcomes over implementation details.

Tests must use deterministic development/test data and must not depend on production users, production catalog data, external email delivery, or production Algolia records.

Do not make media tests depend on exact autoplay or decode timing. Do test fallback behavior and required attributes.

If an external blocker prevents one check, continue independent work, record the exact blocker, and do not report the blocked check as passed.

## 15. Git, Agents, and Integration

The primary Codex session owns integration into `main`.

- Confirm the primary checkout is on `main` before final integration.
- Preserve uncommitted user work.
- Review every final diff.
- Commit only completed, verified work.
- Do not push remotely unless explicitly requested.
- Do not amend, reset, force-push, or rewrite unrelated history.

Codex may use focused subagents, temporary branches, and worktrees when parallelism clearly reduces risk or time.

- Keep workstreams narrowly scoped.
- Avoid concurrent edits to shared files.
- Require focused commits from subagents.
- The primary session owns shared migrations, generated types, package scripts, conflict resolution, and final verification.
- Remove completed temporary worktrees.
- Use the smallest useful agent set; do not activate every specialty by default.

Suggested specialties:

- `frontend` — layout, navigation, media, interactions, storefront pages
- `backend` — Supabase, RLS, server actions, cart/auth data paths
- `fullstack` — end-to-end UI and data wiring
- `qa` — unit, integration, E2E, deterministic fixtures
- `a11y` — keyboard, focus, dialogs, reduced motion, semantics
- `security` — auth, RLS, secrets, privileged functions, ownership
- `reviewer` — final diff and integration review

## 16. Definition of Done

A task is complete only when:

- the current behavior was inspected and the root cause understood
- the requested user-visible behavior is implemented
- shared behavior is owned at the correct architectural layer
- loading, error, empty, responsive, keyboard, touch, and reduced-motion states are handled where relevant
- exposed existing behavior remains intact
- migrations or remote changes, if any, were verified and safely applied only to development
- focused and full relevant checks passed, or exact blockers are documented
- browser behavior was inspected at relevant desktop and mobile sizes for UI work
- the final diff contains no secrets, debug output, temporary files, or unrelated changes
- verified work is committed to `main`
- temporary worktrees are removed

## 17. Completion Report

For meaningful tasks, report:

- root cause or verified starting state
- implemented behavior
- important architecture and design decisions
- files changed
- migrations and development-data changes, including whether applied
- Supabase/Algolia/cache results when relevant
- commands run and exact outcomes
- routes, browsers, and viewports inspected
- accessibility and interaction checks
- screenshots or generated media paths when relevant
- skipped checks and external blockers
- subagents and worktrees used
- remaining limitations
- final commit hash
- local run command

Keep the report factual. Do not restate the entire task prompt.

## 18. Maintaining This File

`AGENTS.md` should contain durable operating rules and high-risk shared contracts. Keep rapidly changing campaign copy, one-off task requirements, and detailed page specifications in the repository implementation, tests, focused project documentation, or the current task prompt.

Do not edit this file during ordinary feature work unless the user explicitly requests an instruction update or a durable project-wide contract has intentionally changed.
