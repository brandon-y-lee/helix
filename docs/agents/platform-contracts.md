# Platform contracts

These are Helix engineering constraints, not deployment authorization or proof of implemented behavior. Read only sections relevant to the change and ADRs that govern the affected area. Delivery and verification gates belong to [Engineering workflow](engineering-workflow.md); vocabulary belongs to the [context map's glossaries](../../CONTEXT-MAP.md).

## Architecture

- Follow the installed Next.js conventions and Vercel architecture.
- Supabase is canonical for catalog and application data; Algolia powers interactive search, not canonical PDP data.
- Follow existing public catalog cache/revalidation boundaries. Never publicly cache customer-specific data.
- Do not introduce a static runtime product fallback. Fixtures are for tests, seeds, imports, and controlled tooling only.
- Product media must be project-controlled.
- Prefer server components and server-side data for initial rendering. Add client components only where interaction requires them; do not make whole routes dynamic for small islands.
- Keep client bundles proportional; avoid N+1 queries and duplicate requests. Handle provider latency and outages honestly.

## Security and privacy

Preserve Supabase SSR/cookie authentication. Keep browser and server clients separate; authorize protected data server-side. Never trust browser-submitted ownership, user IDs, eligibility, monetary values, availability, or state.

Orders, addresses, payment references, support messages, feedback, and fulfillment state are private. Enforce RLS and ownership checks, preserve historical order facts, and avoid logging PII or raw provider payloads. Privileged credentials remain server-only.

Apply least privilege, server-side validation, CSRF/origin protection, safe redirects, bounded abuse controls where supported, retry-safe webhooks, and auditable state. Fail closed when authorization, security, or provider checks fail.

## Commerce

Preserve the server-backed cart and server-authoritative pricing. Stripe remains sandbox/test only until explicit live-mode approval; reject live keys, objects, and webhook events outside an approved live environment.

Use integer minor units, immutable order snapshots, raw-body webhook verification, and idempotent event handling that tolerates retries and out-of-order delivery. Do not store card data, finalize solely from a redirect, clear carts, award rewards, or claim payment before server verification. Browser-submitted prices, totals, discounts, balances, order/payment state, and referral eligibility are untrusted.

Rewards and referrals require an immutable auditable ledger, transactional/idempotent changes, protection against concurrent overspending, and trusted server-side writes.

## Database and remote operations

Approved non-production Supabase project: `erasogmsqpgiirovubjh`. Verify the exact project/environment and current remote state before any authorized database, search-index, payment, catalog, or configuration mutation. Consult provider documentation for version-specific, uncertain, or security-sensitive behavior.

Every exposed application table requires appropriate RLS; public catalog writes are forbidden. Security-definer functions require a fixed safe `search_path` and narrow grants. Never reset the linked database, weaken RLS, truncate broadly, delete real users or catalog history, force migration history, or run destructive drops without explicit approval. Reconcile Supabase, cache state, and Algolia after bulk catalog changes.

## Brand and UI

Helix should feel editorial, modern, visually led, sparse, confident, ingredient-literate, and masculine without tactical or hyper-macho styling. Use Marcellus selectively for display and wordmark treatment; use Manrope for functional UI and body text. The [Brand & Platform glossary](../domain/brand-platform/CONTEXT.md) owns Brand Voice and surface names.

Own shared behavior in shared components or the application shell. Use semantic HTML and native controls; avoid nested interactive elements. Preserve affected focus trapping/restoration, Escape handling, body-scroll locking, keyboard and touch operation, reduced motion, visible focus, and truthful loading/error states.

Target WCAG 2.2 AA. Prevent layout shift and horizontal overflow. Public support, legal, order, rewards, and service-status content must be factual.
