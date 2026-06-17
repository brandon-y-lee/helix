# Ecommerce Platform Agent Rules

Current phase: active development.

We are building a development ecommerce platform for a prestige men's skincare brand. The goal is to make fast, meaningful implementation progress and keep the app locally runnable.

## Product Direction

- Build an original prestige men's skincare ecommerce platform.
- Use https://www.rhodeskin.com/collections/shop and https://www.rhodeskin.com/products/pocket-bronze-bake as UX/functionality references only.
- Do not copy Rhode's brand name, product names, imagery, logos, exact copy, claims, or trade dress.
- Borrow general ecommerce patterns only:
  - shop / collection page
  - product grid
  - product cards
  - product detail page
  - variant selector
  - cart interaction
  - polished but original storefront layout
- Placeholder products and placeholder copy are acceptable during development.

## Development Mode

- Optimize for progress over process.
- Do not activate the whole agent team by default.
- Use one primary implementing agent per task when possible.
- Use additional agents only when clearly useful.
- Agents may edit files directly in the active checkout.
- Agents may commit completed work after running verification.
- Worktrees are optional, not required.
- Reviewer, security, and a11y reviews are optional unless explicitly requested.

## Minimal Required Safety Rules

- Do not use production data.
- Do not commit secrets, tokens, access keys, or personal credentials.
- Use `.env.example` for documented environment variables.
- Do not run destructive database/Supabase commands without explicit user approval.
- Do not implement real payments without explicit approval.
- Do not copy protected third-party brand assets, exact copy, or product identity.

## Supabase Rules

- Use only a development Supabase project.
- MCP may be used for development tasks.
- Schema changes are allowed only after the agent shows the proposed migration or SQL.
- Destructive operations require explicit approval.
- RLS should be enabled for real tables unless there is a clear development-only reason not to.

## Default Implementation Loop

For each task:
1. Briefly state the plan.
2. Implement the change.
3. Run the fastest relevant verification.
4. Fix obvious failures.
5. Commit the completed work.

Default verification:
- `pnpm run lint` if available
- `pnpm run typecheck` if available
- `pnpm run test` if available
- `pnpm run build` for meaningful app changes
- e2e smoke tests when routes or user flows change

## Agent Routing

Use agents pragmatically:

- `frontend`: storefront UI, pages, components, styling, cart UI.
- `backend`: catalog data model, Supabase schema, server/data access.
- `fullstack`: end-to-end feature wiring.
- `devops`: tooling, scripts, MCP, CI, local environment.
- `architect`: major structure or stack decisions.
- `qa`: tests when behavior becomes non-trivial.
- `a11y`: optional accessibility review for important UI flows.
- `security`: Supabase policies, secrets, auth, payments, or destructive operations.
- `reviewer`: optional review for larger changes.

Do not spend tokens producing large routing plans unless the task is complex.