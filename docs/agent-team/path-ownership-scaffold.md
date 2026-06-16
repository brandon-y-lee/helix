# Path Ownership Map — Baseline Scaffold Phase

Single writer per file area. No two agents may edit the same file set at the same
time. If a needed change falls in another agent's area, request it through that
agent — do not edit across the boundary.

## Ownership table

| Agent | Owned paths (single writer) |
|-------|-----------------------------|
| **architect** | `CLAUDE.md` (phase line only), `docs/adr/0001-scaffold-stack.md`, `docs/agent-team/path-ownership-scaffold.md` |
| **devops** | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `.eslintrc*` / eslint config, `vitest.config.*`, `playwright.config.*`, `.gitignore`, `.github/workflows/ci.yml`, `.nvmrc` / `.tool-versions`, any test-setup config it owns |
| **frontend** | `app/**` — the 7 routes plus `app/layout.tsx` |
| **qa** | `tests/**` (unit/smoke), `e2e/**` (Playwright specs) |
| **reviewer** | read-only — no writes |
| **security** | read-only — no writes |

## Coordination point

`package.json` is **devops-owned**. The frontend and qa lanes must NOT edit it
directly. To add or change a dependency, frontend/qa file a request to devops,
who makes the edit and updates `pnpm-lock.yaml`. This keeps the dependency
manifest and lockfile under a single writer and avoids merge conflicts on the
most contended file.

## Sequencing

```
architect → devops → (frontend ∥ qa) → (reviewer ∥ security)
```

1. **architect** sets the phase line and lands these scaffold docs.
2. **devops** establishes the toolchain: package.json, lockfile, tsconfig,
   next/eslint/vitest/playwright configs, .gitignore, CI workflow, node version
   pin. Nothing else can build or be verified until this exists.
3. **frontend** and **qa** then proceed in parallel — frontend on `app/**`,
   qa on `tests/**` and `e2e/**`. Their file areas do not overlap.
4. **reviewer** and **security** review in parallel (read-only) before merge.
   Both are required gates per `CLAUDE.md`; security signoff is mandatory for any
   security-sensitive surface (none expected in this phase, but the gate stands).

## Out of scope for this phase

The baseline scaffold establishes a runnable, testable, CI-gated skeleton ONLY.
Explicitly NOT in scope:

- No ecommerce business logic
- No authentication or authorization
- No payments or checkout
- No database or persistence layer
- No real product data model (tiny static placeholder content only if needed for
  smoke tests)
- No admin functionality
- No analytics or tracking
- No external services or third-party integrations
- No secrets or credential handling
- No design system
- No branding or polished UI

Anything in this list is deferred to a later phase and must not be introduced
under cover of "scaffolding."
