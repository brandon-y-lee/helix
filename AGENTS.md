# Mei Pelle — Codex Agent Rules

Mei Pelle is an original, production-quality prestige men’s skincare ecommerce platform. Build durable software that can deploy cleanly to Vercel, serve real customers safely, and fail honestly when an external service is unavailable.

The application may use verified non-production databases, sandboxes, and test credentials during implementation. That must not lower engineering quality or cause public copy to describe Mei Pelle as a demo, prototype, test store, or development platform.

Customer-facing name: `Mei Pelle`  
Customer-facing wordmark: `MEI PELLE`

Stable technical identifiers such as `mei-pelle` may remain where renaming would risk database, cookie, cache, URL, package, webhook, storage, deployment, or integration compatibility.

Task prompts are scoped product deltas. This file contains durable operating rules and high-risk platform contracts.

## 1. Source-of-Truth Order

Follow, in order:

1. The current user request and explicit acceptance criteria.
2. The most specific applicable `AGENTS.md`.
3. This root `AGENTS.md`.
4. Current repository code, tests, migrations, and maintained documentation.
5. Verified linked non-production services and official provider documentation.
6. Historical prompts and third-party references only as supporting context.

Do not assume an earlier prompt completed correctly. Inspect the current repository and reproduce the present behavior before editing. Report material conflicts rather than silently preserving stale requirements.

## 2. Production Execution Standard

For every task:

- Provide a concise plan, then continue without waiting for confirmation.
- Ask a question only when a missing decision would materially affect architecture, security, claims, irreversible data work, external cost, or product direction.
- Implement a complete vertical slice; do not stop at scaffolding, mock UI, disconnected schema, TODOs, or placeholder copy.
- Fix the root ownership layer rather than adding route-by-route patches.
- Preserve established behavior unless the task explicitly changes it.
- Keep scope disciplined and avoid unrelated redesigns, refactors, and dependencies.
- Use existing project conventions before creating parallel systems.
- Treat loading, empty, error, retry, cancellation, and recovery as part of the feature.
- Never fake success, silently substitute data, or present unavailable functionality as operational.
- Never claim a test, command, migration, browser check, or remote mutation passed unless it actually did.

Production quality includes security, accessibility, data integrity, performance, observability, responsive behavior, maintainability, and safe recovery—not only polished visuals.

## 3. Required Preflight

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

- Read all applicable `AGENTS.md` files from the repository root to the target path.
- Confirm the primary checkout, current branch, and active worktrees.
- Preserve all uncommitted user work.
- Inspect `package.json`, scripts, framework versions, environment documentation, relevant migrations, recent commits, and relevant tests.
- Run the application and reproduce relevant UI behavior before changing it.
- Verify current remote state before database, search-index, payment-provider, or catalog mutation.

Never reset, discard, overwrite, or blindly stash unrelated work.

## 4. Brand, Content, and Claims

Mei Pelle should feel editorial, modern, visually led, sparse, confident, ingredient-literate, and masculine without tactical or hyper-macho styling. It is influenced by South Korean formulation discipline and Los Angeles self-invention.

Use Marcellus selectively for display and wordmark treatment. Use Manrope for functional UI and body text.

Avoid:

- shame-based looksmaxxing language
- guaranteed attractiveness or social outcomes
- structural facial-change, hormonal, surgical, or anatomical claims
- medical, disease-treatment, healing, DNA-repair, or unsupported clinical claims
- fabricated studies, percentages, certifications, endorsements, founders, advisors, laboratories, legal entities, addresses, or environmental achievements
- generic black-and-gold luxury
- tactical, supplement, gamer, crypto, or cyberpunk aesthetics
- verbose supplier-style customer copy

Keep PDRN language cosmetic and appearance-focused. Keep peptide claims sequence- and formulation-specific. Do not imply topical plant-derived collagen becomes human dermal collagen. Avoid fear-based “clean” language. Treat sustainability as an ambition unless verified facts support stronger claims.

Public support, legal, order, rewards, and service-status content must be complete and factual. Do not publish fake contact details, unsupported service levels, or placeholder policies.

## 5. Reference Boundaries

### Rhode

Rhode may be studied for structural UX: editorial proportions, navigation, drawers, collections, product cards, PDP hierarchy, campaign media, support-page rhythm, and responsive interaction.

Do not copy Rhode’s assets, footage, branding, exact copy, source code, exact CSS, proprietary typography, campaign identity, or full trade dress.

### Leaders Cosmetics

Leaders may inform verified supplier facts and supplier-aligned operational details: ingredients, percentages, directions, cautions, formats, sizes, prices, variants, provenance, shipping, returns, and related policies.

Customer-facing naming, descriptions, merchandising, rewards language, palette, and presentation must remain Mei Pelle. Do not import supplier reviews, ratings, testimonials, loyalty branding, customer imagery, before-and-after imagery, or transient campaign copy. Do not hotlink supplier or Shopify media at runtime.

For Stripe, Supabase, Algolia, Trustpilot, Vercel, Next.js, and other integrations, use current official documentation for security-sensitive or provider-specific behavior.

## 6. Durable Product and Policy Contracts

Verify these against the repository before changing them. Do not duplicate canonical product facts into static runtime fallbacks.

Current product names:

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
- `06 PROTECT`
- `07 LIFT`

`PROTECT` is an editorial Method step, not a commerce product, unless a future task explicitly creates a verified catalog item. Do not fabricate a product, variant, price, inventory record, PDP, cart action, or Algolia record for it.

The canonical free-standard-shipping threshold is `$50.00`, represented as `5000` integer cents. Use one shared server-safe policy source.

Keep rapidly changing campaign copy, page composition, hero geometry, and merchandising decisions in the repository, tests, focused documentation, or current task prompt—not in this file.

## 7. Platform Architecture and Data Authority

- Framework: Next.js using the installed repository version and conventions.
- Deployment target: Vercel.
- Supabase is canonical for catalog and application data.
- Linked non-production Supabase project reference: `erasogmsqpgiirovubjh`.
- Algolia powers interactive search and is not the canonical PDP source.
- Public catalog reads use the repository’s Next/Vercel caching and revalidation architecture.
- Account, session, profile, cart, order, payment, rewards, referral, feedback, and other customer-specific data must never be publicly cached.
- Do not introduce a static runtime product fallback catalog.
- Static fixtures are for tests, seeds, imports, and controlled tooling only.
- Product media must be project-controlled; do not add runtime supplier-media dependencies.

Prefer server components and server-side data access for initial rendering. Add client components only where interaction requires them. Avoid making whole routes dynamic for small interactive islands.

Before adding infrastructure or dependencies, inspect whether the current stack already solves the need. New dependencies require a clear production benefit and acceptable maintenance cost.

## 8. Authentication, Cart, Checkout, Orders, and Rewards

Preserve the established Supabase SSR/cookie authentication and server-backed cart architecture. Keep browser and server clients separate. Authorize protected data server-side.

Never trust browser-submitted prices, totals, discounts, rewards balances, availability, ownership, user IDs, order status, referral eligibility, or payment state. Resolve canonical values server-side.

### Payments

Any payment implementation must be production-designed but remain Stripe sandbox/test only until separate explicit live-mode approval.

- Reject live keys, live objects, and live webhook events in non-live environments.
- Never expose provider secrets or store payment-card data.
- Use server-authoritative cart, pricing, discount, and shipping data.
- Create immutable order and order-item snapshots using integer minor units.
- Verify webhook signatures against the raw request body.
- Process payment events idempotently and tolerate retries or out-of-order delivery.
- Do not use a success redirect as the sole source of payment finalization.
- Do not clear carts, award rewards, or claim payment before server verification.
- Missing provider configuration must produce an honest unavailable state, not a crash or fake completion.
- Live payments, real fulfillment, and live customer communications require separate approval and launch review.

### Orders and customer data

Orders, addresses, payment references, support messages, feedback, and fulfillment state are private. Enforce strict RLS and server-side ownership checks. Preserve historical order facts independently of future catalog changes. Avoid logging PII or raw provider payloads.

### Rewards and referrals

When rewards or referrals are present:

- Use an immutable, auditable ledger rather than a mutable profile balance as the sole source of truth.
- Award, reserve, capture, release, and reverse value transactionally and idempotently.
- Prevent concurrent overspending and duplicate business events.
- Keep writes behind trusted server boundaries.
- Trustpilot reviews must never earn points, discounts, gifts, or other incentives.
- A private first-party feedback program may be rewarded only when clearly separate from public reviews and independent of sentiment.

## 9. Supabase, RLS, and Remote Data Safety

Use only the verified non-production project. Never modify production data.

Before remote mutation, run:

```bash
pnpm dlx supabase projects list
pnpm dlx supabase migration list
```

Confirm:

```text
erasogmsqpgiirovubjh
```

For migrations:

1. Inspect the current schema and migration history.
2. Prefer additive, non-destructive changes.
3. Read every pending migration.
4. Review RLS, grants, foreign keys, indexes, functions, triggers, and `search_path` safety.
5. Run `pnpm dlx supabase db push --dry-run`.
6. Apply only understood non-production changes.
7. Verify migration history and resulting schema.
8. Run linked database linting when available.
9. Regenerate database types using the repository command.

Never reset the linked database, weaken RLS, truncate broadly, delete real users or catalog history, run destructive drops without explicit approval, manipulate migration history merely to force a push, or expose secrets.

Every exposed application table requires appropriate RLS. Public catalog writes are forbidden. Customers may access only their own protected data. Service-role and privileged credentials remain server-only. Security-definer functions require a fixed safe `search_path`, narrow grants, and explicit validation.

Prefer archiving over hard deletion. Back up relevant non-production data before bulk transformation. After bulk catalog changes, reconcile Supabase, cache state, and Algolia so stale records are removed.

## 10. Security, Privacy, and Reliability

Apply least privilege and server-side validation at every boundary.

- Authenticate and authorize every protected mutation.
- Use framework-appropriate CSRF/origin protection.
- Use idempotency for repeated external-service and money/value operations.
- Bound abuse-prone endpoints where the current architecture supports it.
- Reject open redirects and unsafe destinations.
- Keep secrets out of source, logs, browser bundles, screenshots, and error messages.
- Document environment variables in `.env.example` without values.
- Do not fail open when a security check or provider call fails.
- Make webhook and background processing retry-safe.
- Preserve auditable state for orders, payments, rewards, referrals, refunds, and privileged corrections.

Privacy and legal content must describe actual data flows and providers. Do not claim capabilities, certifications, compliance guarantees, or data practices that are not implemented and verified.

## 11. UI, Accessibility, and Performance

Own shared behavior in shared components or the application shell. Avoid duplicate listeners, state machines, and route-level patches.

For meaningful UI work, handle default, loading, empty, error, success, disabled, pointer, keyboard-focus-visible, touch, overlay, route-transition, reduced-motion, and responsive states where relevant.

Use semantic HTML and native controls. Avoid nested interactive elements. Preserve focus trapping and restoration, Escape handling, body-scroll locking, and keyboard operation. Ensure touch behavior does not depend on hover.

Target WCAG 2.2 AA: logical headings, one meaningful H1, visible focus, labels and errors, live announcements, sufficient contrast, touch targets, reduced motion, 200% zoom, and no information conveyed by color alone.

Build for Vercel and production traffic:

- preserve caching correctness and server/client boundaries
- never publicly cache customer data
- avoid N+1 queries and duplicate external requests
- keep client bundles proportional to the interaction
- optimize and lazy-load media where appropriate
- prevent layout shift and horizontal overflow
- handle provider latency and unavailable states explicitly
- keep builds reproducible without optional external credentials
- avoid runtime requests to supplier storefronts

## 12. Browser Inspection and Testing

Use Codex Chrome for meaningful visual or interaction work.

At minimum inspect:

- desktop around `1440 × 900`
- mobile around `390 × 844`

Also inspect wide desktop, tablet, or additional mobile widths when the change affects wide composition, breakpoints, navigation, forms, sticky elements, tables, or checkout.

Verify the current issue before the change and the result after it. Check keyboard, pointer, touch, route transitions, back/forward behavior, overlays, reduced motion, zoom, overflow, console errors, hydration warnings, failed requests, and exposed regression surfaces.

Inspect `package.json` and use the repository’s actual scripts. Run focused tests while developing, then the complete relevant suite before committing. When available:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm exec playwright test --reporter=list --timeout=30000 --workers=1
```

For database, catalog, search, payment, or provider work, also run the relevant migration, lint, type-generation, reconciliation, sandbox-sync, RLS, security, and opt-in sandbox smoke commands.

Tests must use deterministic non-production data and must not depend on production users, live payments, real email delivery, real Trustpilot activity, or production Algolia records. Test authorization, idempotency, boundary values, duplicate events, cancellation, retries, and failure recovery for high-risk features.

If an external blocker prevents one check, continue independent work, report the exact blocker, and do not report the blocked check as passed.

## 13. Git, Subagents, and Integration

The primary Codex session owns integration into `main`.

- Confirm the primary checkout is on `main` before final integration.
- Preserve uncommitted user work.
- Review every final diff.
- Commit only completed, verified work.
- Do not push remotely unless explicitly requested.
- Do not amend, reset, force-push, or rewrite unrelated history.

Codex may use focused subagents, branches, and temporary worktrees when parallelism reduces risk or time. Keep workstreams narrow, avoid concurrent edits to shared files, require focused commits, and let the primary session own shared migrations, generated types, package scripts, conflict resolution, final browser verification, and final tests. Remove completed temporary worktrees.

## 14. Definition of Done

A task is complete only when:

- the starting state and root cause were verified
- the requested behavior is fully implemented
- shared behavior is owned at the correct layer
- data authority, security, and privacy boundaries are preserved
- relevant loading, failure, responsive, keyboard, touch, reduced-motion, and recovery states are handled
- customer-facing content is complete and truthful
- remote changes were safely verified and applied only to the approved non-production environment
- relevant tests, build, and browser verification passed, or exact blockers are documented
- the final diff contains no secrets, debug output, temporary files, placeholder copy, or unrelated changes
- verified work is committed to `main`
- temporary worktrees are removed

## 15. Completion Report

For meaningful tasks, report:

- verified starting state or root cause
- implemented behavior and key decisions
- files changed
- migrations and non-production data changes, including whether applied
- Supabase, Algolia, cache, Stripe, or other provider results when relevant
- commands run and exact outcomes
- routes, browsers, and viewports inspected
- accessibility and interaction checks
- screenshots or generated media paths when relevant
- skipped checks, external blockers, and remaining launch dependencies
- subagents and worktrees used
- final commit hash
- local run command

Keep the report factual and concise. Do not restate the full task prompt.

## 16. Maintaining This File

Keep `AGENTS.md` high-level and durable. It should contain production engineering standards, security and data-safety rules, architecture and source-of-truth contracts, brand and claims boundaries, high-risk commerce rules, and verification expectations.

Do not add rapidly changing campaign copy, exact page layouts, one-off merchandising decisions, temporary feature specifications, or exhaustive acceptance criteria. Store those in the implementation, tests, focused documentation, or the current task prompt.

Edit this file only when the user explicitly requests an instruction update or a durable project-wide contract intentionally changes.
