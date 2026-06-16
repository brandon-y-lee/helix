# Ecommerce Platform Agent Rules

Current phase: baseline application scaffolding. Build a production-oriented technical scaffold only — no ecommerce business logic, auth, payments, database, or external services.

## Authority

- This file is the highest-priority project operating contract for Claude sessions.
- Detailed process lives in `docs/agent-team/OPERATING_MANUAL.md`.
- Architecture decisions live in `docs/adr/`.
- Historical progress belongs in git history or `docs/status/`, not this file.

## Agent Routing Policy

- The lead must not involve all agents by default.
- Before delegating, the lead must classify the task and list:
  - task_type
  - active_agents
  - idle_agents
  - why each active agent is needed
  - required verification gates
  - expected touched file areas
- Default maximum active agents for implementation is 3–5.
- Use all agents only for team/process setup, major architecture review, release readiness, or explicit user request.
- Idle agents must remain idle.

## Required Gates

- `reviewer` is required for any code-touching task.
- `security` is required for auth, checkout, payment, PII, secrets, sessions, admin permissions, dependency/supply-chain, or logging.
- `a11y` is required for customer/admin UI, forms, checkout, account, interactive widgets, focus, errors, or live regions.
- Security-sensitive areas require security and reviewer signoff before merge.

## Workflow

- Explore first, then plan, then implement.
- Do not let two agents edit the same file set at the same time.
- Prefer git worktrees for parallel implementation lanes.
- Define verification commands before editing.
- Show evidence: command run, exit result, output, or reason verification is unavailable.
- Use `/clear` between unrelated tasks.