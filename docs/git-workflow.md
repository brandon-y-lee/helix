# Git workflow

This document owns branch, worktree, PR, integration, and release mechanics. The delivery lifecycle that selects and authorizes work lives in [`docs/agents/engineering-workflow.md`](./agents/engineering-workflow.md).

## Branch topology

- `main` is the default and production branch.
- `dev` is the staging and integration branch.
- `codex/spec-<spec-number>-<slug>` is one approved multi-Ticket Spec Branch and owns a draft Spec PR to `dev`.
- `codex/<issue-number>-<slug>` implements one approved Ticket from an immutable Ticket Snapshot and targets its Spec Branch.
- `codex/<issue-number>-urgent-<slug>` is the abbreviated production/security path without a parent spec.
- `codex/plan-<slug>` carries domain documentation resolved during planning.
- `codex/trivial-<slug>` is the bounded non-behavioral fast path.

Ticket PRs squash-merge into their Spec Branch. The final Spec PR regular-merges into `dev`, preserving the Ticket commits and visible Spec boundary. Urgent, standalone, planning, and trivial branches remain direct-to-`dev`. The human-approved `dev → main` promotion uses a regular merge commit. Force-pushes and history rewriting are outside the workflow.

## Establish a Spec Branch and draft Spec PR

After the approved Ticket set is published without `ready-for-agent`, run from a clean checkout:

```bash
scripts/git/codex-task.sh spec-start <spec-number>-<slug>
```

The helper validates the planned Spec, fetches the exact current remote `dev`, creates `codex/spec-<spec-number>-<slug>` at that commit, pushes it, and opens a draft Spec PR to `dev`. Only after both remote artifacts exist does it add `ready-for-agent` to the approved child Tickets. Rerunning is safe when the same branch and draft PR already exist. A missing branch, non-draft PR, or stale partial setup fails with preservation-oriented recovery output.

## Start an isolated task

Run from a clean checkout before the first repository edit:

```bash
scripts/git/codex-task.sh start <issue-number>-<slug>
scripts/git/codex-task.sh start <issue-number>-<slug> --spec <spec-number>-<spec-slug>
scripts/git/codex-task.sh start <issue-number>-urgent-<slug>
scripts/git/codex-task.sh start plan-<slug>
scripts/git/codex-task.sh start trivial-<slug>
```

Normal multi-Ticket work uses `--spec`. The helper validates that the Ticket is open, claimed by exactly one assignee, `workflow:in-progress`, a child of the named Spec, and free of open native blockers. It fetches the remote Spec Branch and records the Ticket Snapshot as:

- `refs/codex/review-base/<slug>` — the immutable starting SHA;
- `refs/codex/review-target/<slug>` — the recorded remote Spec Branch name.

Direct urgent, standalone, planning, and trivial work continues to start from local `dev`.

- In the shared Local checkout, it creates a temporary worktree and prints its path. Use that path for every task command.
- In an app-managed Worktree, it creates the branch in place.

The command fails on dirty state, missing or uncertain GitHub facts, a missing target, an existing task branch or recorded ref, or a slug outside the workflow classes.

## Prepare for review and PR

Commit the implementation before `code-review`. Ticket Review compares committed Ticket work against the immutable Ticket Snapshot. Spec Ticket commits include both footers:

```text
Refs #<ticket-number>
Spec #<parent-spec-number>
```

Urgent and standalone branches use only `Refs #<ticket-number>` because they intentionally have no parent Spec.

From the shared checkout, pass the temporary task path printed by `start`; an app-managed Worktree omits it:

```bash
scripts/git/codex-task.sh prepare <task-worktree>
scripts/git/codex-task.sh prepare
```

For a Spec Ticket, `prepare` requires clean state, additive ancestry from the Ticket Snapshot, commits ahead of that snapshot, an available recorded target, traceability footers, and an approved `Ticket-Sync-Reason` on every synchronization merge. Ordinary sibling advances do not invalidate the snapshot. Direct paths retain current-`dev` ancestry checks. `prepare` never merges, pushes, or retargets.

Allowed synchronization reasons are `merge-conflict`, `newly-approved-blocker`, `consumed-interface`, and `combined-test`. Synchronize only on the concrete condition named by the trailer, by additively merging the recorded Spec Branch. Do not rebase, force-push, cherry-pick siblings, merge `dev` directly, or synchronize merely because the Spec Branch advanced.

Run Ticket Review on the Standards and Spec axes against the printed Ticket Snapshot. Resolve every confirmed actionable finding or obtain explicit human acceptance; P0/P1 findings always block. If fixes or justified synchronization add commits, rerun affected checks and delta review.

After review passes, push and open a ready PR targeting the printed Spec Branch. The PR body follows `.github/PULL_REQUEST_TEMPLATE.md`. `ticket-gate` is the executable merge gate. An approved Ticket authorizes its assigned agent to squash-merge after Ticket Review and the gate pass.

## Clean up after merge

After GitHub reports the Ticket PR merged into its recorded target, run:

```bash
scripts/git/codex-task.sh cleanup <task-worktree>
scripts/git/codex-task.sh cleanup
```

The helper queries the PR through `gh`, requires the recorded base, and verifies that the merged PR head is the exact current task commit. It does not require the remote Ticket head to remain present, so automatic branch deletion is safe. GitHub failures and missing/renamed/cancelled targets remain visible. It then deletes both recorded refs and the local task branch, and removes the linked worktree whether helper-created or app-managed.

Before cleanup, the merging agent comments on the Ticket with the PR, squash commit, `ticket-gate`, and Ticket Review outcome, then closes it. The parent Spec closes only after every required Ticket is closed and the ready Spec PR passes Combined Spec Review plus `integration-gate` and regular-merges into `dev`.

### Reconcile accumulated task state

Audit the complete repository before removing accumulated worktrees or refs:

```bash
scripts/git/codex-task.sh reconcile
```

The default is read-only. It inventories linked worktrees, local branches, `refs/codex/review-base/*`, tracked `origin/*` branches, open issues, and pull requests. GitHub issue and PR inventory is fully paginated; an unavailable or malformed page stops classification. Each item is reported as protected, active, dirty, safely removable, or unproven together with its evidence. `main`, `dev`, the primary and invoking worktrees, dirty state, open issues or PRs, changed commits, non-`codex/*` branches, and unavailable or ambiguous GitHub facts are never inferred safe.

Apply only the proven local actions after reviewing that plan:

```bash
scripts/git/codex-task.sh reconcile --apply
```

Remote branch deletion is a separate opt-in and uses an exact-SHA force-with-lease:

```bash
scripts/git/codex-task.sh reconcile --apply --remote
```

Clean detached worktrees and branch-backed direct-to-`dev` state are removable only when their exact commit is the recorded head of a merged PR into `dev`. Any state with a recorded Spec target remains unproven in generic reconciliation and must use the target-aware `cleanup` path. Ordinary ancestry is not enough automatic evidence. Research, prototype, legacy worktree, and other non-task branches remain unproven regardless of age or naming.

### Retire assessed unique state

Use explicit retirement only after deciding that a unique branch or worktree should not be preserved:

```bash
scripts/git/codex-task.sh retire <branch-or-worktree> --expect-head <full-40-character-sha>
scripts/git/codex-task.sh retire <branch-or-worktree> --expect-head <full-40-character-sha> --remote
```

Retirement checks the expected SHA, worktree cleanliness, protected locations and branches, open issue and PR state, and the remote head before changing anything. A missing target or a branch owned by more than one worktree is ambiguous and refused. Without `--remote`, any remote branch is preserved. With `--remote`, deletion is lease-protected against a concurrent head change and completes before local retirement, so a rejected remote lease leaves the local artifact intact. A mismatch or unavailable GitHub/remote fact stops the operation without treating the artifact as disposable.

## Concurrent Tickets and Spec closure

Only open, unblocked, unassigned `type:ticket` issues on the frontier are claimable. Independent Tickets may run concurrently from immutable snapshots. A sibling merge does not require synchronization. When concrete evidence requires it, merge only the recorded Spec Branch and record the approved reason.

After every required Ticket closes, the sole Spec Closer records the pre-merge head and incorporates current `dev` additively:

```bash
git merge dev
```

Resolve only necessary composition conflicts. Run focused verification and Combined Spec Review against the incorporated `dev` commit, then mark the draft Spec PR ready. The `ready_for_review` event runs `integration-gate`. If `dev` advances, incorporate it again and repeat affected proof. The final Spec PR regular-merges into `dev`.

## Staging and production

Each merge into `dev` receives the Integration Gate and staging deployment configured for that branch. Production promotion requires:

1. the complete intended spec set integrated into `dev`;
2. full CI-equivalent verification and staging inspection;
3. a `dev → main` PR;
4. green required checks; and
5. explicit user authorization to promote the inspected commit.

The solo maintainer does not self-approve the PR through GitHub; branch protection requires zero approving reviews. Merge the authorized promotion with a regular merge commit. Production authority, live-mode changes, and destructive remote operations remain human-controlled.

## GitHub workflow configuration

The repository configuration tool is read-only by default:

```bash
pnpm github:workflow:plan
```

The plan names two phases. `activate` adds the loose Spec Branch `ticket-gate` ruleset with its narrow repository-administrator bypass and strict no-bypass `dev` `integration-gate` ruleset while classic `ci` remains required. `cleanup` becomes available only after both replacement rules are exact and real gate evidence has been verified; it removes classic `dev` protection and the named retired rulesets and labels. `main` is explicitly deferred.

Apply remains a separate, exact user authorization. It requires the remote `dev` SHA as both audited source and CI attestation, plus the GitHub Actions app and one phase:

```bash
pnpm github:workflow:apply -- \
  --confirm-repo brandon-y-lee/helix \
  --confirm-dev-sha <audited-dev-sha> \
  --confirm-ci-sha <same-CI-verified-sha> \
  --confirm-phase <activate-or-cleanup> \
  --confirm-github-actions-app-id <audited-id>
```

The tool never pushes `dev`. It fails closed on missing authentication, the wrong repository, stale or divergent ancestry, unavailable repository, issue, check, ruleset, protection, or label facts, mismatched confirmations, or cleanup before exact replacement activation. Before cleanup, rollback is deletion of the new rules while classic `ci` remains. After cleanup, rollback must restore classic `integration-gate` protection before disabling replacements.
