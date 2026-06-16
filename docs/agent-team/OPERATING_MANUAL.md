# Ecommerce Platform — Engineering Team Operating Manual

> **Status:** Team/process setup only. The ecommerce application is **not** scaffolded or
> implemented. This manual defines how the agent team operates so that when implementation
> is greenlit, the gates below are already binding.
>
> **Authority:** This manual operationalizes `CLAUDE.md`. Where this manual is more specific,
> follow it; where it conflicts with `CLAUDE.md`, `CLAUDE.md` wins.
>
> Synthesized by the lead from the planning/review reports of all nine teammates
> (architect, backend, frontend, fullstack, qa, security, devops, reviewer, a11y).

---

## 1. Agent Roles

Nine agents, in two classes. The class split is the backbone of the operating model:
**implementers produce diffs in isolated lanes; advisors gate them before merge.**

| Agent | Class | Tools | Worktree | Responsibility |
|-------|-------|-------|----------|----------------|
| `architect` | Implementer (docs) | R/G/G/Bash, Write, Edit | yes | Architecture, system boundaries, ADRs, sequencing, tradeoffs, **path-ownership map**, contract format decision |
| `backend` | Implementer | R/G/G/Bash, Write, Edit | yes | API, domain logic, data/persistence, auth/authz, inventory/cart/checkout/order/admin backends |
| `frontend` | Implementer | R/G/G/Bash, Write, Edit | yes | Storefront UI, admin UI, design system, frontend performance, accessible-by-default UI |
| `fullstack` | Implementer | R/G/G/Bash, Write, Edit | yes | Cross-layer integration, the API contract seam, frontend/backend handoffs, integration/E2E wiring |
| `qa` | Implementer (tests) | R/G/G/Bash, Write, Edit | run after integrate | Test strategy, acceptance criteria, unit/integration/e2e coverage, verification gates |
| `devops` | Implementer (config) | R/G/G/Bash, Write, Edit | yes | Local dev, CI/CD, release gates, deployment-neutral ops |
| `security` | **Advisor / gatekeeper** | R/G/G/Bash (read-only) | no | Threat modeling, auth/session/secrets review, PII, dependency risk, logging, security signoff |
| `reviewer` | **Advisor / gatekeeper** | R/G/G/Bash (read-only) | no | Independent adversarial review, correctness, regression risk, final pre-merge signoff |
| `a11y` | **Advisor / gatekeeper** | R/G/G/Bash (read-only) | no | Accessibility audit, WCAG 2.2 A/AA signoff for product/cart/checkout/account/admin flows |

**Why the split is enforced structurally:** `security`, `reviewer`, and `a11y` hold **no Write/Edit
tools**. They cannot edit the code they gate, which is what makes "independent review" structural
rather than aspirational (resolves reviewer finding **H1**). No agent reviews or signs off on its own
implementation.

---

## 2. Project-Local Skills Per Agent

Skills are loaded **explicitly from `.claude/skills/<name>/SKILL.md`** at the start of each task.
**Do not rely on subagent frontmatter for skill loading** — read the skill file directly and apply
its lens. Several skills ship runnable tools under `scripts/`; use them as the verification commands.

| Agent | Skills (read from `.claude/skills/`) |
|-------|--------------------------------------|
| `architect` | `senior-architect`, `tech-stack-evaluator` |
| `backend` | `senior-backend`, `tdd-guide` |
| `frontend` | `senior-frontend`, `a11y-audit` |
| `fullstack` | `senior-fullstack`, `tdd-guide` |
| `qa` | `senior-qa`, `tdd-guide` |
| `security` | `senior-security`, `senior-secops` |
| `devops` | `senior-devops` |
| `reviewer` | `code-reviewer`, `adversarial-reviewer` |
| `a11y` | `a11y-audit` |

---

## 3. When To Use Each Agent

| Use this agent when… | Agent |
|----------------------|-------|
| Designing system boundaries, choosing stack, writing an ADR, cutting the path-ownership map | `architect` |
| Building/changing APIs, domain logic, data model, auth, cart/checkout/order/inventory/admin backends | `backend` |
| Building/changing storefront or admin UI, design system, frontend perf, accessible components | `frontend` |
| Defining/changing the frontend↔backend contract, wiring layers end-to-end, resolving integration drift | `fullstack` |
| Defining test strategy, writing acceptance criteria, building tests, setting coverage/quality gates | `qa` |
| Any auth/checkout/payment/PII/secrets/session/admin surface; dependency review; threat model | `security` |
| Local dev setup, CI pipeline, release gates, build/artifact concerns (cloud-neutral) | `devops` |
| Final independent review of any code-touching diff before merge | `reviewer` |
| Any customer/admin UI flow, new interactive widget, forms/error/focus/live-region changes | `a11y` |

---

## 4. Operating Model & Handoff Flow

### 4.1 Per-feature lifecycle (single direction, explicit gates)

```
PLAN ─▶ CONTRACT ─▶ IMPLEMENT (parallel lanes) ─▶ INTEGRATE ─▶ VERIFY ─▶ GATE ─▶ MERGE
arch    arch+back    backend / frontend            fullstack    qa        rev/sec/  lead
        (+qa+sec)     (+devops infra)                                      a11y
```

1. **PLAN** — `architect` produces the implementation plan: boundaries, data model, sequencing,
   risks, the **path-ownership map**, and the verification gate for each lane. Output: plan + ADR(s).
2. **CONTRACT** — Before any code, the API/data contract is fixed. `architect` owns the format
   decision; `backend` co-authors; `qa` derives acceptance criteria; `security` flags sensitive
   surfaces. This seam is what lets frontend and backend build in parallel without colliding.
3. **IMPLEMENT** — Write-capable lanes work in **separate git worktrees** against the frozen
   contract. Each lane declares its files-to-touch and its verification command **before editing**.
4. **INTEGRATE** — `fullstack` wires lanes end-to-end against the real contract and resolves drift.
5. **VERIFY** — `qa` runs the acceptance gate (deterministic, automated, evidence attached).
6. **GATE** — `reviewer` always; `security` for any sensitive surface; `a11y` for any UI surface.
   These run **in parallel** on the same diff (all read-only, so no file contention).
7. **MERGE** — Lead merges only after all **required** gates report a passing verdict with evidence.

### 4.2 Ordered handoffs (artifact passed at each)

| # | From → To | Artifact |
|---|-----------|----------|
| 1 | `architect` → backend/frontend/devops | Plan + ADR(s) + bounded file-set assignment + per-lane verification command |
| 2 | `architect`/`backend` → `frontend` | **Frozen** API/data contract (endpoints, schemas, error shapes) |
| 3 | `qa` → all implementers | Acceptance criteria + test plan derived from the contract |
| 4 | `backend` → `fullstack` | Backend diff + passing backend tests (evidence) |
| 5 | `frontend` → `fullstack` | Frontend diff + UI/component tests (evidence) |
| 6 | `devops` → `fullstack`/`qa` | Runnable local env / CI pipeline + build evidence |
| 7 | `fullstack` → `qa` | Integrated branch + wiring notes |
| 8 | `qa` → reviewer/security/a11y | Verified branch + test-run output + coverage/risk notes + AC→test map |
| 9–11 | security / a11y / reviewer → lead | Verdict (BLOCK / CONCERNS / CLEAN) + findings + evidence |
| 12 | lead | Merge decision once required gates are green |

Rework loops route **back to the owning lane** (e.g. a security finding → `backend`), then
**re-enter at the gate** (step 8+). Fixes never bypass re-verification.

### 4.3 Decision ownership

| Decision | Owner | Required co-signers |
|----------|-------|---------------------|
| Architecture, boundaries, ADRs, stack | `architect` | `security` for security-relevant designs |
| API/data contract format & shape | `architect` (final) | `backend` (author), `qa` (testability) |
| Backend domain/persistence design | `backend` | within architect boundaries |
| Frontend/UI architecture, design system | `frontend` | `a11y` for critical flows |
| Test strategy, acceptance criteria, quality gates | `qa` | — |
| Security signoff (sensitive domains) | `security` | **blocking; cannot be waived by implementers** |
| Accessibility signoff (UI flows) | `a11y` | **blocking for customer/admin UI** |
| Release gates, CI, build | `devops` | `security` on secrets/supply chain |
| Final pre-merge correctness review | `reviewer` | **blocking** |
| Adding a new dependency | proposing lane proposes; **`security` approves before merge** | reviewer confirms in diff (closes finding **N2**) |

### 4.4 ADR / decision-record flow

- **Location:** `docs/adr/NNNN-title.md` (sequential). To be created by `architect` at the start of
  the implementation phase, with a `0000` template — **not now** (setup phase).
- **Format:** Context → Options considered → Decision & rationale → Tradeoffs accepted → Status.
- **Authoring:** `architect` writes; security-relevant ADRs need `security` co-sign before status
  flips to "accepted."
- **Triggers:** any stack choice, datastore selection, contract shape, monolith-vs-service boundary,
  or cross-cutting concern (auth, sessions, payments).

---

## 5. Handoff Rules

1. A contract change is its **own PR/worktree**: it edits only the contract source-of-truth + a
   one-paragraph rationale, with **no implementation in the same PR**.
2. A contract change requires sign-off from **both** a backend owner and a frontend owner (two
   consumers), plus `architect` for any new resource/scope/breaking change.
3. Implementers build only against a contract version that is **merged to the shared branch** —
   never against a draft in someone's local branch (that guarantees drift).
4. Every handoff carries **evidence**, not assertions: the command run, its exit result, and the
   pass/fail output (see §8).
5. Breaking contract changes (removed/renamed field, tightened type, changed status/required-ness)
   require a new major version or an explicit deprecation window, plus `security` review when the
   endpoint is sensitive.
6. Sensitive-area work cannot merge on consumer/lane sign-off alone — it additionally requires the
   security + reviewer (+ a11y for UI) gate (§9, §10).

---

## 6. File-Conflict Rules

Git worktrees isolate **working copies** but do **not** prevent two lanes from editing the same files
and colliding at merge (reviewer finding **H3**). Therefore:

1. **`architect` produces a written path-ownership map before any implementation lane starts.**
   Overlapping edits to the same path by two lanes is a **reviewer-blockable** condition.
2. **One worktree per lane; one branch per worktree.** No agent edits inside another lane's worktree.
3. **Default ownership boundaries** (refined per feature in the path-ownership map):
   - `backend` → `server/`, `api/`, `db/`, `migrations/`, backend tests
   - `frontend` → `web/`, `app/**` (excluding `app/api/**`), `components/`, `styles/`, UI tests
   - `devops` → `.github/`, `docker/`, `infra/`, `scripts/`, CI config
   - `fullstack` → integration/wiring layer + shared **contract source-of-truth**, edited **only**
     during the CONTRACT/INTEGRATE phases
   - `qa` → `tests/`, `e2e/`, `specs/` — runs **after** integrate (qa has no parallel write worktree;
     give it a checkout of the integration branch to avoid colliding with implementers writing tests)
   - `architect` → `docs/adr/`, `docs/agent-team/` (lead owns `OPERATING_MANUAL.md` to avoid collision — finding **N4**)
4. **The contract source-of-truth is a single-writer, serialized resource.** Authored by
   `architect`/`backend` during CONTRACT, then **frozen**; `frontend` *consumes* it (generated types
   are read-only output, never hand-edited) but does not edit it.
5. **Shared root config** (`package.json`, tsconfig, lint config, CI workflow) is changed via PR,
   never co-edited by two lanes simultaneously.
6. Prefer **worktrees + dependency-ordered merge** (contracts → backend → frontend → devops),
   `fullstack` resolves, then a single reviewed merge to `main`.
7. **Soft gate, real check:** "Require plan approval before any teammate makes file changes" is not
   technically enforced (six agents hold Write/Edit). The `reviewer` therefore explicitly checks the
   diff for **unapproved or out-of-bounds edits** (findings **N3**, **N1**).

---

## 7. Small-Team Activation Rules (when *not* to use the whole team)

Use **all nine** agents only for **team/process setup planning** (this phase). For implementation,
activate the **minimum relevant 3–5 agents** to keep context clean (`/clear` between unrelated tasks).

| Feature type | Active agents |
|--------------|---------------|
| Standard UI + API feature | `architect` (plan+contract) → `backend` + `frontend` → `reviewer` (≈4) |
| Security-sensitive (auth, checkout, payment, PII, sessions, admin) | add `security` + `qa` → 5–6; **security signoff mandatory** |
| Customer-facing UI flow | add `a11y` alongside `reviewer` |
| Heavy cross-layer integration | add `fullstack` as integrator |
| Infra / pipeline / release | `devops` + `reviewer` (+ `security` if secrets/supply chain) |

- **Always-on for any code-touching feature:** `reviewer`.
- **Conditionally mandatory, non-waivable:** `security` for sensitive surfaces; `a11y` for
  customer/admin UI.
- Do **not** activate idle agents — idle write-capable agents risk racing on files, and extra
  context dilutes focus.

---

## 8. Verification Gates (required for all future implementation work)

Every implementation task **defines its verification command before editing** and **shows evidence**.
A gate has three parts (resolves "self-attestable verification" finding **W3**):

```
VERIFICATION GATE
- Command:  <exact, copy-pasteable command>
- Expected: <exit code + concrete pass signal: test names/counts, coverage %, status>
- Sufficient because: <why this command proves the acceptance criteria, not just that code runs>
```

**Evidence rules:**
- "It compiles" is **not** evidence. Acceptable evidence = exact command + exit status + pass/fail
  counts/output.
- The `reviewer`/`qa` gate **re-runs** the verification command rather than trusting pasted output.
- "Verification not available" is **not** a unilateral escape — it requires **explicit lead
  approval** and a recorded reason. A silently absent check is treated as a **failure**, not a pass.

**Standard CI gate sequence** (each is a hard pass/fail gate; cheapest first so expensive stages only
run on clean code). Stack-specific commands are placeholders pending the architect's stack pick:

| # | Gate | Example command | Sufficient because |
|---|------|-----------------|--------------------|
| 1 | Lint | `eslint .` / `ruff check .` | Catches footguns + enforces uniform style |
| 2 | Type-check | `tsc --noEmit` / `mypy .` | Catches contract drift / shape errors pre-runtime |
| 3 | Unit tests + coverage | `npm test -- --coverage` then `coverage_analyzer.py --threshold 80 --strict` | Proves domain logic per spec; floor 80% global, **P0 ≥90% branch** |
| 4 | Integration tests | `npm run test:integration` | Proves API+DB+auth wired against a real datastore |
| 5 | Contract test | regenerate spec, `git diff --exit-code`; `oasdiff breaking` | Proves implementation matches the published contract; blocks breaking drift |
| 6 | Build | build/produce artifact tagged with commit SHA | Proves the artifact is producible (push/deploy out of scope) |
| 7 | Security / dependency scan | `npm audit --audit-level=high` / `pip-audit`; secret scan | Blocks high/critical CVEs and committed secrets |
| 8 | E2E (revenue/auth paths) | `npx playwright test e2e/checkout.spec.ts` | Validates the full revenue path in a real browser on seeded data |

**Test pyramid:** ~70% unit / ~20% integration / ~10% e2e. Push business-rule permutations down to
unit; keep e2e thin (happy paths + auth). For money/state-machine code (pricing, inventory, orders),
add a **mutation gate** (`stryker` / `mutmut`, target ≥85% on P0 modules) — coverage alone doesn't
prove assertion strength.

**Acceptance-criteria template** (required before implementation starts — no AC, no implementation):

```
## Feature: <name>
Context: As a <role>, I want <capability>, so that <value>.
### Acceptance Criteria
AC-1: Given <state>  When <action>  Then <observable, deterministic outcome>
### Negative / edge criteria (mandatory for cart/checkout/inventory/payment)
AC-N1: Given <invalid/boundary> When <action> Then <specific error + no side effect>
### Non-functional (as applicable): authz | idempotency | data-integrity invariants
```
Each AC maps to ≥1 named test whose docstring references the AC number (`// AC-3: oversell rejected`).

**A merge is BLOCKED if** any of: no AC doc / unmapped AC; any test fails or is skipped without
justification; coverage below floor or new P0 gap; bug fix without a regression test (RED proof);
verification gate missing or evidence not attached; new flaky test introduced; or a required signoff
is absent (§9, §10).

---

## 9. Security Review Gates

**Security-sensitive domains** (per `CLAUDE.md`): **auth, authz/admin permissions, checkout, payment,
PII, secrets, sessions, dependency/supply-chain, logging.**

**The gate:** Security signoff is **mandatory** whenever a diff or design touches any sensitive domain.
It **pairs with — does not replace —** independent `reviewer` signoff: for sensitive areas **both
`security` and `reviewer` must approve** before merge, and **neither substitutes for the other**
(resolves finding **W2**). A reviewer's incidental security note is supplementary, not a security
signoff. The security reviewer must **not** be the diff author.

**Verdict rule:** any **critical** finding = BLOCK; **high** = BLOCK for payment/auth/secrets,
CONCERNS-with-named-owner elsewhere; clean = signoff. Gates emit a machine-checkable
**BLOCK / CONCERNS / CLEAN** verdict; a BLOCK halts merge until resolved or explicitly,
**logged-justification** overridden by the lead (resolves findings **H1/H2** — gates are enforceable,
not advisory).

**Required evidence before signoff:**
- Threat model (STRIDE per DFD element; DREAD ≥7 threats have a named owner + mitigation), re-run
  after mitigations land.
- Secret scan clean (`security_scanner.py --severity high` exit 0); any finding blocks until rotated
  and moved to a secret manager.
- Dependency scan clean (`vulnerability_assessor.py --severity high`; `npm audit`/`pip-audit`);
  lockfile committed and installed frozen (`npm ci`).
- For payment/PII: `compliance_checker.py --framework pci-dss` / `gdpr` with no critical gaps.

**Per-domain must-pass checklist (condensed):**
- **Auth (OWASP A07):** argon2id/bcrypt(≥12); rate-limit + lockout; MFA for admin/step-up; generic
  errors (no user enumeration); single-use expiring reset tokens.
- **Authz/admin (A01):** server-side check on every endpoint; object-level/IDOR tests; deny-by-default
  least privilege; no privilege fields via mass-assignment; admin MFA-gated.
- **Checkout (A04/A08):** price/tax/discount/totals recomputed server-side; coupon rules server-validated;
  quantity bounds; **idempotency keys** to prevent duplicate charges; non-skippable order-state transitions.
- **Payment (PCI-DSS):** **no PAN/CVV stored, logged, or transiting app servers** — tokenization/hosted
  fields; TLS 1.2+; verify webhook signatures + replay protection; server-authoritative amounts.
- **PII (A02/GDPR):** data minimization; encryption at rest + TLS in transit; retention + erasure (Art 17)
  + export (Art 20) paths; access logged; no PII in URLs/analytics/third-party without consent.
- **Secrets (A02):** zero secrets in source or git history; secret manager/env injection; rotation
  procedure; distinct creds per environment; pre-commit secret hook.
- **Sessions (A07):** CSPRNG IDs regenerated on login + privilege change; HttpOnly/Secure/SameSite
  cookies; idle (~15min sensitive) + absolute timeout; CSRF on state-changing requests; no token in URL/logs.
- **Logging (A09):** never log secrets/PAN/CVV/passwords/tokens/PII (redact at logger layer); no stack
  traces to users; tamper-evident **audit log** for login/MFA/role/admin/payment/PII events; logs are a
  sensitive store (access-controlled, encrypted, retention-bounded).

---

## 10. Accessibility Review Gates

**Target:** WCAG 2.2 **Level A + AA**. Tooling: `a11y-audit` skill —
`scripts/a11y_scanner.py` (CI), `scripts/contrast_checker.py`, manual passes from
`references/testing-checklist.md`.

**Boundary (resolves finding W1):** `frontend` **builds accessible-by-default UI** (semantic elements,
labels, `autocomplete`, `focus-visible`, `aria-live`, reduced-motion guards) and runs the scanner +
contrast checker locally before opening a PR. `a11y` is the **gating auditor** (read-only): it runs the
full gate, classifies findings by severity, and returns a remediation list; `frontend` implements fixes.
On disagreement, **`a11y` is authoritative** for conformance on critical flows.

**The gate:**
- **Automated (blocking on Critical, every PR):**
  - `python .claude/skills/a11y-audit/scripts/a11y_scanner.py ./src --ci` — non-zero exit on any
    Critical (the merge-blocking gate). *Catches the structural Critical class deterministically.*
  - `python .claude/skills/a11y-audit/scripts/contrast_checker.py --tailwind ./src --level aa` —
    *mathematically verifies 1.4.3/1.4.11 ratios humans/scanners can't reliably judge.*
- **Manual (required for checkout, account, admin + first release of product/cart):** keyboard-only
  pass (tab order, visible focus, modal trap+return, Esc, no traps); screen-reader pass (VoiceOver/NVDA)
  including a deliberately failed form submit; 200% zoom + 320px reflow.
- **Gate rule:** automated Critical = 0 **AND** manual checklist signed for the flow → pass. Major =
  ticket + current-sprint SLA; Minor = within 2 sprints; **Critical blocks release.**

**`a11y` signoff is MANDATORY for:** checkout, account/auth, admin, and any new interactive widget
(modal, combobox, menu, tabs, carousel, drag-reorder), and any change touching forms, error handling,
focus management, or live regions. For static/content-only copy tweaks, the CI automated gate alone
suffices.

**Per-flow priority criteria:** product (alt text 1.1.1, keyboard 2.1.1, contrast 1.4.3, target size
2.5.8); cart (status messages 4.1.3, color-not-alone 1.4.1, error ID 3.3.1); checkout (labels 3.3.2,
error suggestion/prevention 3.3.3/3.3.4, autocomplete 1.3.5, status 4.1.3, no keyboard trap in payment
iframe 2.1.2, focus not obscured 2.4.11); account (accessible auth 3.3.8 — allow paste/password
managers, no cognitive CAPTCHA; titled pages 2.4.2); admin (table relationships 1.3.1, custom-widget
name/role/value 4.1.2, dragging alternative 2.5.7).

**Composition with security/reviewer:** for checkout/account/admin, **reviewer ✔ + security ✔ +
a11y ✔ are all independently required**, run **in parallel** on the same diff (all read-only). Where a
security control conflicts with an a11y criterion — CAPTCHA needs an accessible alternative (3.3.8),
password fields must allow paste/managers, session-timeout warnings must be announced (`aria-live`)
with enough time to act — **security + a11y resolve jointly** before `reviewer` approves.

---

## 11. tmux Startup & Recovery

**Startup** (`scripts/start-agent-team.sh`, default session `ai-team`, override via `$1`):
1. Requires `tmux`, `git`, `claude` on PATH; resolves repo root via `git rev-parse --show-toplevel`.
2. Validates all nine agent definitions exist (greps `name: <agent>` in `.claude/agents/`); a missing
   agent aborts startup.
3. (Re)generates `docs/agent-team/control-start-prompt.txt` (the lead's starter prompt).
4. Launches a detached `control` window running the lead:
   `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --teammate-mode tmux`, plus a `prompt` helper window.
5. Selects `control` and attaches.

```bash
./scripts/start-agent-team.sh            # start or re-attach the default 'ai-team' session
./scripts/start-agent-team.sh my-team    # use a custom session name
```

**Recovery / re-attach:**
- **Idempotent re-entry:** re-running the script detects an existing session (`tmux has-session`) and
  **re-attaches** instead of duplicating. The session is persistent — agents keep running across client
  disconnects.
- **Context-aware attach:** inside tmux it uses `tmux switch-client -t ai-team`; otherwise
  `tmux attach-session -t ai-team`.
- **Manual:** `tmux ls` to confirm the session is alive; `tmux attach -t ai-team` to reconnect.

**Known recovery gaps (operational runbook — flagged by reviewer W4/W5/W6, devops):**
- **Dead/half-initialized control pane:** re-running the script re-attaches to the *broken* session and
  exits 0. If the lead's `claude` process has died, **rebuild it:**
  ```bash
  tmux kill-session -t ai-team && ./scripts/start-agent-team.sh
  ```
- **Clobbered prompt:** the launcher overwrites `control-start-prompt.txt` on each fresh launch — keep
  local edits elsewhere or expect them to be regenerated.
- **Experimental mode unpinned:** the team depends on `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` /
  `--teammate-mode tmux`. If the installed `claude` lacks this mode, the team silently fails to form
  while the script still exits 0 — confirm the team actually formed in the `control` window after attach.

---

## 12. Open Items For The Architect (implementation-phase, not now)

These were surfaced during planning and are deliberately **deferred** until implementation is greenlit:
- Create `docs/adr/` with a `0000` template (§4.4).
- Resolve the stack and **contract format** decision (OpenAPI spec-first vs. schema-first TS vs.
  GraphQL) — drives the contract source-of-truth path. Run the backend/frontend/fullstack decision
  engines once the forcing-question inputs (QPS, tenancy, data tier, RPO/RTO, SLO, device/network,
  LCP target, rendering model) are answered.
- Produce the concrete **path-ownership map** before the first implementation lane starts.
- Confirm/clean any stale `agent-<hash>` worktrees so they don't drift from `main`.
- Decide whether `qa` gets its own worktree or a dedicated post-integrate checkout.

---

*End of manual. This document governs process only; no application code or scaffolding has been
created. Update it via the `architect`/lead lane; the lead owns this file to avoid edit collisions.*
