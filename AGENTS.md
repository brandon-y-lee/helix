# Mei Pelle — Codex Agent Rules

Mei Pelle is a mens skincare ecommerce platform deployed on Vercel. Build durable software that serves real customers at scale. 

## 2. Proportional Preflight

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

- Preserve uncommitted user work.
- Reproduce current runtime or UI behavior when the task changes it.
- Consult provider documentation only for version-specific, uncertain, or security-sensitive behavior.
- Verify remote state only before a database, search-index, payment, catalog, or other remote mutation.

## 3 Brand, References, and Product Contracts

Mei Pelle should feel editorial, modern, visually led, sparse, confident, ingredient-literate, and masculine without tactical or hyper-macho styling. Use Marcellus selectively for display and wordmark treatment; use Manrope for functional UI and body text.

Public support, legal, order, rewards, and service-status content must be factual.

## 4. Architecture and Data Authority

- Use the installed Next.js conventions and deploy to Vercel.
- Supabase is canonical for catalog and application data. Approved non-production project: `erasogmsqpgiirovubjh`.
- Algolia powers interactive search; it is not the canonical PDP source.
- Public catalog reads follow the repository’s cache and revalidation architecture.
- Customer-specific data must never be publicly cached.
- Do not introduce a static runtime product fallback. Fixtures are for tests, seeds, imports, and controlled tooling only.
- Product media must be project-controlled.
- Prefer server components and server-side data for initial rendering. Add client components only where interaction requires them; do not make whole routes dynamic for small islands.

## 5. Authentication, Commerce, and Security

Preserve the established Supabase SSR/cookie authentication and server-backed cart architecture. Keep browser and server clients separate and authorize protected data server-side. Never trust browser-submitted prices, totals, discounts, balances, availability, ownership, user IDs, order state, referral eligibility, or payment state.

Stripe remains sandbox/test only until explicit live-mode approval. Reject live keys, objects, and webhook events outside an approved live environment. Use server-authoritative cart and pricing data, integer minor units, immutable order snapshots, raw-body webhook verification, and idempotent event handling that tolerates retries and out-of-order delivery. Do not store card data, expose secrets, finalize solely from a redirect, clear carts, award rewards, or claim payment before server verification.

Orders, addresses, payment references, support messages, feedback, and fulfillment state are private. Enforce strict RLS and ownership checks, preserve historical order facts, and avoid logging PII or raw provider payloads.

Rewards and referrals require an immutable auditable ledger, transactional/idempotent changes, protection against concurrent overspending, and trusted server-side writes.

Apply least privilege, server-side validation, CSRF/origin protection, safe redirects, bounded abuse controls where supported, retry-safe webhooks, and auditable state. Fail closed when authorization, security, or provider checks fail. Keep secrets out of source, logs, browser bundles, screenshots, and errors.

## 6. Supabase and Remote-Mutation Safety

Use only the verified project project.

Every exposed application table requires appropriate RLS; public catalog writes are forbidden; privileged credentials remain server-only; security-definer functions require a fixed safe `search_path` and narrow grants. Never reset the linked database, weaken RLS, truncate broadly, delete real users or catalog history, force migration history, run destructive drops without explicit approval, or expose privileged credentials. Reconcile Supabase, cache state, and Algolia after bulk catalog changes.

## 7. UI, Accessibility, Reliability, and Performance

Own shared behavior in shared components or the application shell. Use semantic HTML and native controls; avoid nested interactive elements. Preserve affected focus trapping/restoration, Escape handling, body-scroll locking, keyboard and touch operation, reduced motion, visible focus, and truthful loading/error states.

Target WCAG 2.2 AA. Prevent layout shift and horizontal overflow, keep client bundles proportional, avoid N+1 queries and duplicate requests, preserve cache boundaries, and handle relevant provider latency or outage states honestly.

## 8. Git and Integration

Preserve uncommitted user work, review the final diff for scope drift and unnecessary complexity, and commit only completed task-related work. Do not push unless requested. Do not amend, reset, force-push, or rewrite unrelated history. Remove completed temporary worktrees.

## 9. Reporting

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