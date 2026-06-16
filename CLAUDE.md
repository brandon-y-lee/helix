# Ecommerce Platform Agent Rules

Current phase: agent/team setup only. Do not scaffold or implement the ecommerce application unless explicitly instructed.

Workflow:
- Explore first, then plan, then implement.
- For every implementation task, define a verification command before editing.
- Show evidence: command run, exit result, failing/passing test output, or reason verification is not available.
- Use project skills in `.claude/skills/` only when relevant.
- Use specialized agents for architecture, frontend, backend, QA, DevOps, security, accessibility, and review work.
- Do not let two agents edit the same file set at the same time.
- Prefer git worktrees for parallel implementation lanes.
- Security-sensitive areas such as auth, checkout, payment, sessions, PII, secrets, and admin permissions require independent security and code review before merge.
- Keep context clean. Use `/clear` between unrelated tasks.
