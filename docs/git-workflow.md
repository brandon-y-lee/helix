# Git workflow

This document owns branch, worktree, PR, integration, and release mechanics. The delivery lifecycle that selects and authorizes work lives in [`docs/agents/engineering-workflow.md`](./agents/engineering-workflow.md).

## Branch topology

- `main` is the default and production branch.
- `dev` is the staging and integration branch.
- `codex/<issue-number>-<slug>` implements one approved ticket.
- `codex/<issue-number>-urgent-<slug>` is the abbreviated production/security path without a parent spec.
- `codex/plan-<slug>` carries domain documentation resolved during planning.
- `codex/trivial-<slug>` is the bounded non-behavioral fast path.

All short-lived branches target `dev` through a PR. Ticket PRs squash-merge; the human-approved `dev → main` promotion uses a regular merge commit. Force-pushes and direct task merges to long-lived branches are outside the workflow.

## Start an isolated task

Run from a clean checkout before the first repository edit:

```bash
scripts/git/codex-task.sh start <issue-number>-<slug>
scripts/git/codex-task.sh start <issue-number>-urgent-<slug>
scripts/git/codex-task.sh start plan-<slug>
scripts/git/codex-task.sh start trivial-<slug>
```

The helper creates the task from local `dev` and records `refs/codex/review-base/<slug>`.

- In the shared Local checkout, it creates a temporary worktree and prints its path. Use that path for every task command.
- In an app-managed Worktree, it creates the branch in place.

The command fails on dirty state, a missing local `dev`, an existing task branch or review-base ref, or a slug outside the workflow classes.

## Prepare for review and PR

Commit the implementation before `code-review`; the review compares committed changes against `dev`. Ticket commits include both footers:

```text
Refs #<ticket-number>
Spec #<parent-spec-number>
```

An urgent branch uses only `Refs #<ticket-number>` because its abbreviated ticket intentionally has no parent spec.

From the shared checkout, pass the temporary task path printed by `start`; an app-managed Worktree omits it:

```bash
scripts/git/codex-task.sh prepare <task-worktree>
scripts/git/codex-task.sh prepare
```

`prepare` requires clean state, commits ahead of `dev`, current `dev` ancestry, the recorded review base, and the applicable traceability footers. It never merges or pushes.

Run `code-review dev`. Resolve every confirmed actionable finding or obtain an explicit human acceptance; P0/P1 findings always block. If fixes add commits, rerun affected checks and review.

After review passes, push the branch and open a ready PR targeting `dev`. The PR body follows `.github/PULL_REQUEST_TEMPLATE.md`. GitHub CI is the executable merge gate. An approved ticket authorizes the implementing agent to squash-merge after CI passes.

## Clean up after merge

After GitHub reports the PR merged into `dev`, run:

```bash
scripts/git/codex-task.sh cleanup <task-worktree>
scripts/git/codex-task.sh cleanup
```

The helper queries the PR through `gh`, requires the merged base to be `dev`, and verifies that the merged PR head is the current task commit. GitHub failures remain visible so unavailable evidence cannot look like an ordinary unmerged PR. It then deletes the recorded review-base ref and local task branch and removes the linked task worktree, whether the worktree was created by the helper or managed by the Codex app. It leaves the remote branch to GitHub's delete-on-merge setting.

Before cleanup, the merging agent comments on the ticket with the PR, squash commit, verification, and `code-review` outcome; closes the ticket; and advances the parent spec state. The parent spec closes after every child ticket PR is integrated into `dev`.

### Reconcile accumulated task state

Audit the complete repository before removing accumulated worktrees or refs:

```bash
scripts/git/codex-task.sh reconcile
```

The default is read-only. It inventories linked worktrees, local branches, `refs/codex/review-base/*`, tracked `origin/*` branches, open issues, and pull requests. Each item is reported as protected, active, dirty, safely removable, or unproven together with its evidence. `main`, `dev`, the primary and invoking worktrees, dirty state, open issues or PRs, changed commits, non-`codex/*` branches, and unavailable or ambiguous GitHub facts are never inferred safe.

Apply only the proven local actions after reviewing that plan:

```bash
scripts/git/codex-task.sh reconcile --apply
```

Remote branch deletion is a separate opt-in and uses an exact-SHA force-with-lease:

```bash
scripts/git/codex-task.sh reconcile --apply --remote
```

Clean detached worktrees and branch-backed `codex/*` state are removable only when their exact commit is the recorded head of a merged PR into `dev`. Ordinary `dev` ancestry is not enough automatic evidence. Research, prototype, legacy worktree, and other non-task branches remain unproven regardless of age or naming.

### Retire assessed unique state

Use explicit retirement only after deciding that a unique branch or worktree should not be preserved:

```bash
scripts/git/codex-task.sh retire <branch-or-worktree> --expect-head <full-40-character-sha>
scripts/git/codex-task.sh retire <branch-or-worktree> --expect-head <full-40-character-sha> --remote
```

Retirement checks the expected SHA, worktree cleanliness, protected locations and branches, open issue and PR state, and the remote head before changing anything. Without `--remote`, any remote branch is preserved. With `--remote`, deletion is lease-protected against a concurrent head change. A mismatch or unavailable GitHub/remote fact stops the operation without treating the artifact as disposable.

## Concurrent tickets and an advancing dev

Only open, unblocked, unassigned `type:ticket` issues on the frontier are claimable. Independent tickets may run concurrently, but PRs integrate sequentially. When `dev` advances:

```bash
git merge dev
```

Resolve conflicts, repeat affected verification and `code-review`, then rerun `prepare`. Preserve the merge in the task branch; the final PR still squash-merges to one ticket commit.

## Staging and production

Each merge into `dev` receives CI and the staging deployment configured for that branch. Production promotion requires:

1. the complete intended spec set integrated into `dev`;
2. full CI-equivalent verification and staging inspection;
3. a `dev → main` PR;
4. green required checks; and
5. explicit user authorization to promote the inspected commit.

The solo maintainer does not self-approve the PR through GitHub; branch protection requires zero approving reviews. Merge the authorized promotion with a regular merge commit. Production authority, live-mode changes, and destructive remote operations remain human-controlled.

## GitHub bootstrap

The repository configuration tool is read-only by default:

```bash
pnpm github:workflow:plan
```

Before the first remote `dev` creation, run the complete gate from `.github/workflows/ci.yml` against one clean local `dev` commit: frozen install, lint, typecheck, unit tests, and production-build Playwright tests. After reviewing the plan, apply requires that same SHA as both the audited source and the explicit CI attestation:

```bash
pnpm github:workflow:apply -- \
  --confirm-repo brandon-y-lee/helix \
  --confirm-dev-sha <audited-dev-sha> \
  --confirm-ci-sha <same-CI-verified-sha>
```

The tool pushes the captured commit rather than the mutable branch name and rechecks remote `main`/`dev` immediately before that push. It fails closed on missing authentication, the wrong repository, stale or divergent branch ancestry, unavailable repository or issue-API facts, or mismatched confirmations. Apply remains a separately approved remote mutation.
