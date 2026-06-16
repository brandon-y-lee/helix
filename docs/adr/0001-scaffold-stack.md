# ADR 0001: Baseline Scaffold Stack

## Status

Accepted — 2026-06-16

## Context

We are moving from team/process setup into baseline application scaffolding for a
prestige men's skincare ecommerce platform. The goal of this phase is a
production-oriented technical scaffold only: a runnable, testable, CI-gated
skeleton with no ecommerce business logic, no auth, no payments, no database, and
no external services. Polished design and branding are explicitly out of scope.

The scaffold must establish the toolchain that all later implementation lanes
(frontend, backend, QA, DevOps, security) will build on, so the choices here are
high-leverage and hard to reverse cheaply. We need a framework, a package
manager, a unit/smoke test runner, an end-to-end test runner, and a lint/type
gate. These choices must favor production maturity, deterministic CI, and broad
team familiarity over novelty.

This ADR records decisions that are already approved by the architecture lead.
It documents the rationale and tradeoffs; it does not re-litigate the choices.

## Options considered

### Framework

- **Next.js (App Router) + TypeScript, React Server Components default** (chosen)
- Plain React SPA (Vite) — rejected: no first-class SSR/RSC, more glue to reach
  production routing, data fetching, and SEO that an ecommerce storefront needs.
- Remix — viable, but smaller hiring pool and ecosystem; Next.js App Router
  covers the same SSR/streaming needs with deeper community support.

### Package manager: pnpm vs npm

- **pnpm** (chosen)
- npm (main alternative) — rejected as default. npm is ubiquitous and needs no
  extra install step, but pnpm wins on a content-addressed store (faster, less
  disk), strict non-flat `node_modules` that prevents phantom dependencies, and
  first-class workspaces for the monorepo growth we expect. The cost is one
  toolchain bootstrap step in CI and on developer machines.

### Unit / smoke test runner: Vitest vs Jest

- **Vitest + React Testing Library** (chosen)
- Jest (main alternative) — rejected as default. Jest is the long-standing
  incumbent with the largest install base, but Vitest gives native ESM and
  TypeScript handling without a Babel/ts-jest transform layer, shares Vite's
  config and transform pipeline, and runs noticeably faster in watch mode. RTL
  is the shared assertion/interaction layer regardless of runner, so the
  ecosystem cost of choosing Vitest is low.

### End-to-end testing

- **Playwright** (chosen)
- Cypress — viable, but Playwright offers multi-browser (Chromium/Firefox/WebKit)
  coverage out of the box, better parallelism, and a stronger fit for CI-driven
  cross-browser gates on a customer-facing storefront.

### Lint and types

- **ESLint (Next config) + `tsc --noEmit` for types** (chosen)
- ESLint alone — rejected: lint rules do not fully replace the type checker.
  Running `tsc --noEmit` as a separate gate keeps type safety enforced
  independently of lint, and the Next ESLint config ships sane defaults for
  App Router and React Server Components.

## Decision & rationale

Adopt the following stack for the baseline scaffold:

- **Next.js (App Router) + TypeScript**, React Server Components as the default
  component model. Production-grade SSR/streaming, routing, and a large hiring
  pool fit a customer-facing storefront.
- **pnpm** as the package manager, with **frozen-lockfile installs in CI**
  (`pnpm install --frozen-lockfile`) for deterministic, reproducible builds.
- **Vitest + React Testing Library** for unit and smoke tests — fast,
  ESM/TS-native, shares the Vite transform pipeline.
- **Playwright** for end-to-end tests — multi-browser, parallel, CI-friendly.
- **ESLint (Next config)** for linting and **`tsc --noEmit`** as a separate type
  gate. Both are required CI checks.

Rationale: every choice optimizes for production maturity, deterministic CI, and
team familiarity. The combination is cohesive (Vite-based transform shared by
Next tooling and Vitest) and each tool is independently replaceable behind a
stable interface (test files, lint config, lockfile) if a decision needs revisiting.

## Tradeoffs accepted

- **pnpm bootstrap step**: contributors and CI must install/enable pnpm (e.g. via
  Corepack) before installing dependencies. Accepted for the disk, speed, and
  strictness benefits and to prevent phantom dependencies.
- **Vitest over Jest**: a smaller (though large and growing) ecosystem and fewer
  legacy Stack Overflow answers than Jest. Accepted for native ESM/TS support and
  speed; RTL keeps test-authoring knowledge transferable.
- **Two test runners (Vitest + Playwright)**: separate configs and mental models
  for unit/smoke vs E2E. Accepted because each is best-in-class for its layer and
  the test pyramid benefits from the separation.
- **Separate `tsc --noEmit` gate**: an extra CI step and slightly longer pipeline.
  Accepted because type checking must not depend on lint configuration.
- **Next.js App Router + RSC**: a steeper mental model (server vs client
  components, caching semantics) than a plain SPA. Accepted for production SSR,
  streaming, and storefront SEO needs.
