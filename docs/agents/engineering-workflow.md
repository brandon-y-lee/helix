# Engineering workflow

This is the canonical delivery lifecycle for helix. Git mechanics live in [`docs/git-workflow.md`](../git-workflow.md); tracker commands live in [`docs/agents/issue-tracker.md`](./issue-tracker.md).

## Select the path

Substantial planned work uses:

```text
grill-with-docs | wayfinder → to-spec → to-tickets → Spec Branch → implement → Ticket Review → ticket-gate → Combined Spec Review → integration-gate → dev
```

The user owns three planning gates: shared understanding, the specification, and the tracer-bullet Ticket breakdown. Work after an approved Ticket may proceed autonomously within its stated scope.

`grill-with-docs` fits a coherent idea that can reach shared understanding in one session. Wayfinder fits multi-session fog that needs decisions, research, or prototypes. Planning and domain-documentation changes still enter `dev` through planning PRs before `to-spec`.

## Planning and domain documentation

Start `codex/plan-<slug>` before a `grill-with-docs` session that may edit the repository. Capture resolved, project-specific platform domain language in the applicable `CONTEXT.md`, including customer-facing, operational, editorial, service, and governance concepts. Exclude generic technical vocabulary, specifications, and implementation decisions. Future tasks may append justified terms as the platform language develops. Record only qualifying durable decisions in ADRs. After shared understanding is confirmed, review and merge those documents into `dev` through a planning PR before `to-spec`. An empty planning branch is discarded.

Wayfinder decisions use the same planning-PR rule when they change repository documentation. Close a completed map after its frontier and fog are empty and link the resulting Spec.

## Establish the Spec delivery boundary

`to-spec` publishes the approved specification as a `type:spec` issue. `to-tickets` publishes the user-approved Tickets as native sub-issues with native dependencies, but does not add `ready-for-agent` yet. Move the Spec to `workflow:planned`, then run:

```bash
scripts/git/codex-task.sh spec-start <spec-number>-<slug>
```

The repeat-safe setup creates `codex/spec-<spec-number>-<slug>` from the exact current remote `dev`, pushes it, opens its draft Spec PR to `dev`, and only then exposes the approved child Tickets. A partial setup fails closed; do not reset, retarget, or recreate uncertain state.

A Spec Branch is the visible delivery boundary for one approved multi-Ticket Spec. Adding or removing required Tickets needs user approval and returns the Spec PR to draft.

| Artifact | Ready | Claimed | Review | Complete |
| --- | --- | --- | --- | --- |
| Spec | `type:spec` + `workflow:planned`, draft Spec PR | `workflow:in-progress` after the first Ticket claim | Combined Spec Review by the sole Spec Closer | Regular-merged Spec PR into `dev`, then closed |
| Ticket | `type:ticket` + `ready-for-agent`, open native blockers = 0 | One assignee + `workflow:in-progress` | Ticket Review from its Ticket Snapshot | Squash-merged into the Spec Branch, then closed |

Assignment is the claim. Labels are queue views; native issue state, dependencies, assignee, PR base, draft state, commits, and checks are authoritative.

## Implement one frontier Ticket

An eligible Ticket is open, unblocked, unassigned, `type:ticket`, and `ready-for-agent`.

1. Assign the Ticket; replace `ready-for-agent` with `workflow:in-progress`.
2. Start from its parent Spec Branch: `scripts/git/codex-task.sh start <ticket-number>-<slug> --spec <spec-number>-<spec-slug>`. The recorded branch name and exact remote commit are the immutable Ticket Snapshot.
3. Implement with TDD at the approved seams and commit with `Refs #<ticket>` and `Spec #<parent>` footers.
4. Do not synchronize for an ordinary sibling advance. Synchronization is allowed only for a merge conflict, newly approved blocker, consumed-interface break, or combined-test failure. Merge the recorded Spec Branch additively and include exactly one `Ticket-Sync-Reason` trailer: `merge-conflict`, `newly-approved-blocker`, `consumed-interface`, or `combined-test`. Never rebase, force-push, cherry-pick siblings, merge `dev` directly, or silently retarget.
5. Run `prepare`, then Ticket Review on Standards and Spec against the immutable Ticket Snapshot. Repeat affected checks and delta review after justified synchronization.
6. Replace `workflow:in-progress` with `workflow:review`, push, and open a ready Ticket PR into the recorded Spec Branch.
7. Require `ticket-gate`: one frozen install, lint, typecheck, and complete Vitest suite. It has no production build, browser run, provider secrets, preview wait, or remote mutation.
8. After Ticket Review and `ticket-gate` pass, squash-merge into the Spec Branch, record bounded evidence, close the Ticket, and run target-aware cleanup.

In short: squash-merge Ticket PRs into the Spec Branch; never merge them directly into `dev`.

Missing, renamed, or cancelled recorded targets are recovery events. Preserve additive history and the Ticket branch, reconcile current tracker/PR state, and obtain direction rather than guessing a replacement.

## Close one completed Spec

After every required Ticket is integrated and closed, the queue-head Spec receives exactly one assignee as Spec Closer.

1. Keep the Spec PR draft while Ticket delivery continues.
2. The Spec Closer records the pre-merge Spec head, merges current `dev` additively into the Spec Branch, and resolves only conflicts necessary for that merge. The narrow administrator bypass is authorized only for this final merge and its necessary conflict fixes.
3. Run affected verification and Combined Spec Review on Standards and Spec against the exact incorporated `dev` commit. Every later source commit receives delta review.
4. Mark the Spec PR ready. The `ready_for_review` event runs the full `integration-gate` on its current commit: frozen install, lint, typecheck, complete Vitest, one retained production build, and complete Chromium verification.
5. After Combined Spec Review and `integration-gate` pass, regular-merge the Spec PR into `dev`, record bounded evidence, close the Spec, and clean up the Spec Branch.

If `dev` advances, incorporate it again and repeat affected verification and review. Strict `integration-gate` protection has no bypass.

## Cancellation and recovery

For cancellation or failure, a failed Spec PR returns to draft. Ticket-specific defects use repair Ticket PRs; cross-Ticket conflicts belong to the Spec Closer; scope expansion requires user approval. A sound abandoned Spec keeps its draft PR and history but loses stale assignment. A cancelled or untrustworthy Spec closes without entering `dev`; reuse requires newly approved Tickets from current `dev` or a valid replacement Spec Branch. Never reset, rebase, force-push, or silently salvage it.

Cancelled or superseded issues retain their history: comment with the reason and replacement link, apply `wontfix`, and close them. GitHub treats closed native blockers as resolved, so reconcile every dependent Ticket before cancelling a blocker.

## Direct-to-`dev` paths and authority

Urgent, standalone, trivial, and planning work remain direct-to-`dev` through `integration-gate`.

- **Trivial non-behavioral work** may skip GitHub planning artifacts. It still uses `codex/trivial-<slug>`, proportional verification, `code-review`, a PR into `dev`, and `integration-gate`.
- **Urgent production or security fixes** may skip exploration, specification, and decomposition. Create one abbreviated GitHub Ticket, use `codex/<ticket>-urgent-<slug>`, and commit with only the `Refs #<ticket>` footer. The normal review, PR, and Integration Gate still apply. Record deferred context immediately afterward.

Invoking `implement` for an approved Ticket authorizes Ticket-scoped tracker updates, branch push, PR creation, and the applicable merge after review and CI pass. It does not authorize production promotion, live configuration apply, destructive operations, unrelated fixes, or scope expansion.

When implementation exposes new work:

- Required work that changes the Ticket or Spec pauses for user approval.
- Independent follow-up becomes a new child Ticket with explicit dependencies.
- A discovery that invalidates the solution returns to `grill-with-docs` or Wayfinder.

## GitHub configuration and release boundary

`pnpm github:workflow:plan` is read-only. It describes overlapping Spec Branch and `dev` ruleset activation, compatibility cleanup, rollback, and the deferred `main` transition. Apply is a separately approved remote mutation with exact repository, remote-`dev`, CI-verified SHA, phase, and GitHub Actions app confirmations. Activation keeps classic `ci` protection; cleanup is allowed only after real `ticket-gate` and `integration-gate` evidence is verified.

Production promotion remains a separate `dev → main` PR with green `integration-gate`, staging inspection, and explicit user authorization. Because `main` protection is deferred, a main-only `ci` reporter remains until that separate transition; it is not part of the active `dev` delivery contract. The solo maintainer does not self-approve through GitHub.
