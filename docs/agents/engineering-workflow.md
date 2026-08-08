# Engineering workflow

This is the canonical delivery lifecycle for Mei Pelle. Git mechanics live in [`docs/git-workflow.md`](../git-workflow.md); tracker commands live in [`docs/agents/issue-tracker.md`](./issue-tracker.md).

## Select the path

Substantial planned work uses:

```text
grill-with-docs | wayfinder → to-spec → to-tickets → implement → code-review → PR → CI → dev
```

- **`grill-with-docs`** fits a coherent idea that can reach shared understanding in one session.
- **Wayfinder** fits multi-session fog that needs decision tickets, research, or prototypes. Delivery-oriented maps culminate in an approved specification; standalone research maps remain outside delivery until converted to one.

The user owns three planning gates: shared understanding, the specification, and the tracer-bullet ticket breakdown. Work after an approved ticket may proceed autonomously within its stated scope.

## Planning and domain documentation

Start `codex/plan-<slug>` before a `grill-with-docs` session that may edit the repository. Capture resolved, project-specific platform domain language in the applicable `CONTEXT.md`, including customer-facing, operational, editorial, service, and governance concepts. Exclude generic technical vocabulary, specifications, and implementation decisions. Future tasks may append justified terms as the platform language develops. Record only qualifying durable decisions in ADRs. After shared understanding is confirmed, review and merge those documents into `dev` through a planning PR before `to-spec`. An empty planning branch is discarded.

Wayfinder decisions use the same planning-PR rule when they change repository documentation. Close a completed map after its frontier and fog are empty and link the resulting spec.

## Spec and ticket artifacts

`to-spec` publishes a GitHub issue after checking the intended testing seam. Apply `type:spec` and `ready-for-agent`. After the user approves the spec, `to-tickets` drafts tracer-bullet vertical slices, quizzes the user on granularity and blocking, then publishes each approved slice as a native sub-issue when supported.

Use native issue dependencies for blockers. The body retains parent and blocker links as readable fallbacks. After ticket publication, the repository workflow—not the generic skill—moves the parent spec from `ready-for-agent` to `workflow:planned`.

| Artifact | Ready | Claimed or decomposed | Review | Complete |
| --- | --- | --- | --- | --- |
| Spec | `type:spec` + `ready-for-agent` | `workflow:planned`, then `workflow:in-progress` after the first child claim | Child tickets carry review state | Close after every child PR merges into `dev` |
| Ticket | `type:ticket` + `ready-for-agent` | Assignee + `workflow:in-progress` | `workflow:review` | Close after its PR merges into `dev` |

Dependencies express structural blocking. `needs-info` and `ready-for-human` express exceptional waiting states. Assignment is the claim; closed is the completed state.

## Implement one frontier ticket

An eligible ticket is open, unblocked, unassigned, `type:ticket`, and `ready-for-agent`.

1. Assign the ticket before work; replace `ready-for-agent` with `workflow:in-progress`.
2. Start `codex/<ticket-number>-<slug>` from `dev` using the task helper.
3. Implement with TDD at the approved seams. Run the smallest complete relevant local verification set; security, payment, data, and cross-cutting changes receive broader checks.
4. Commit with `Refs #<ticket>` and `Spec #<parent>` footers. The urgent fast path uses only `Refs #<ticket>`.
5. Run the helper's `prepare`, then `code-review dev` on the committed diff.
6. Fix and rereview every confirmed actionable finding unless the user explicitly accepts it. P0/P1 findings always block.
7. Replace `workflow:in-progress` with `workflow:review`, push, and open a ready PR into `dev`.
8. Let GitHub CI run the pull-request gate. A ready, green PR receives `workflow:integration-queued`; the [Dev Integration Line](./dev-integration.md) freezes one candidate and current `dev`, then runs the work-class gate in a separate read-only workflow.
9. The coordinator alone merges an unchanged successful candidate. After GitHub reports the merge, comment with the PR, integrated commit, CI and Integration Line evidence, and review result; close the ticket; update the parent spec when one exists; clean up the worktree.

If `dev` advances before integration, merge it into the ticket branch and repeat every affected verification and review step.

## Authority and scope

Invoking `implement` for an approved ticket authorizes ticket-scoped issue updates, branch push, PR creation, and merge into `dev` after its gates pass. It does not authorize production promotion, live-mode changes, destructive operations, unrelated fixes, or expanded scope.

When implementation exposes new work:

- Required work that changes the ticket or spec pauses for user approval.
- Independent follow-up becomes a new child ticket with explicit dependencies.
- A discovery that invalidates the solution returns to `grill-with-docs` or Wayfinder.

Cancelled or superseded issues retain their history: comment with the reason and replacement link, apply `wontfix`, and close them.

## Fast paths

- **Trivial non-behavioral work** may skip GitHub planning artifacts. It still uses `codex/trivial-<slug>`, proportional verification, `code-review`, a PR into `dev`, and CI. The Integration Line grants the fast gate only when every changed path proves non-runtime; uncertainty returns the PR to review.
- **Urgent production or security fixes** may skip exploration, specification, and decomposition. Create one abbreviated GitHub ticket, use `codex/<ticket>-urgent-<slug>`, and commit with only the `Refs #<ticket>` footer. The normal review, PR, and CI gates still apply. Only the user may approve `workflow:urgent`, which selects the next waiting position without preempting an active candidate. Record deferred context immediately afterward.

## Release boundary

Ticket PRs target `dev` and may merge autonomously after their gates pass. `dev → main` is a separate production promotion: inspect staging, require green CI and explicit user authorization, and use a regular merge commit. The solo maintainer does not self-review through GitHub. `main` remains the default branch.

## GitHub configuration

Issues, labels, sub-issues, dependencies, assignees, and PRs are the single workflow state system; no GitHub Project is required. Both `dev` and `main` require PRs and CI with zero GitHub approving reviews. Production promotion remains user-authorized in the agent workflow. Both branches reject force-push and deletion.

Use `pnpm github:workflow:plan` to audit drift. Before the initial remote `dev` creation or Integration Line authority cutover, run the complete CI-equivalent gate at the audited local `dev` commit. `apply` is a separately approved remote mutation and requires exact repository, local-`dev`, CI-verified SHA, cutover phrase, and GitHub App ID confirmations. See [Dev Integration Line](./dev-integration.md).
