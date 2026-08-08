# Git workflow

This document owns branch, worktree, PR, integration, and release mechanics. The delivery lifecycle that selects and authorizes work lives in [`docs/agents/engineering-workflow.md`](./agents/engineering-workflow.md).

## Branch topology

- `main` is the default and production branch.
- `dev` is the staging and integration branch.
- `codex/<issue-number>-<slug>` implements one approved ticket.
- `codex/spec-<spec-number>-<slug>` integrates one future multi-ticket spec; its ticket branches are flat siblings created from the current spec tip.
- `codex/<issue-number>-urgent-<slug>` is the abbreviated production/security path without a parent spec.
- `codex/plan-<slug>` carries domain documentation resolved during planning.
- `codex/trivial-<slug>` is the bounded non-behavioral fast path.

Spec #50, standalone, urgent, planning, and trivial branches target `dev`. For later multi-ticket specs, child ticket PRs target the protected spec branch and squash-merge; the completed spec targets `dev` and regular-merges so child commits remain visible. The human-approved `dev → main` promotion also uses a regular merge commit. Force-pushes and direct task merges to integration or long-lived branches are outside the workflow.

## Start an isolated task

Run from a clean checkout before the first repository edit:

```bash
scripts/git/codex-task.sh spec-start <spec-number>-<slug>
scripts/git/codex-task.sh start <issue-number>-<slug>
scripts/git/codex-task.sh start <issue-number>-<slug> --spec <spec-number>-<slug>
scripts/git/codex-task.sh start <issue-number>-urgent-<slug>
scripts/git/codex-task.sh start plan-<slug>
scripts/git/codex-task.sh start trivial-<slug>
```

`spec-start` creates the local spec integration ref at current `dev`; publish and protect it only through the audited lifecycle/configuration path. `start` creates work from local `dev` or the explicitly named current spec branch and records `refs/codex/review-base/<slug>`. Spec-based work also records its pull-request target so `prepare` and `cleanup` cannot silently use `dev`.

- In the shared Local checkout, it creates a temporary worktree and prints its path. Use that path for every task command.
- In an app-managed Worktree, it creates the branch in place.

The command fails on dirty state, a missing local `dev`, an existing task branch or review-base ref, or a slug outside the workflow classes.

## Prepare for review and PR

Commit the implementation before `code-review`; the review compares committed changes against the helper's declared base (`dev` for the prior workflow, or the parent spec branch for a future-spec child). Ticket commits include both footers:

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

`prepare` requires clean state, commits ahead of the declared base, current base ancestry, the recorded review base, and the applicable traceability footers. It never merges or pushes.

Run `code-review` against the base printed by `prepare`. Resolve every confirmed actionable finding or obtain an explicit human acceptance; P0/P1 findings always block. If fixes add commits, rerun affected checks and review.

After review passes, push the branch and open a ready PR targeting the base printed by the helper. The PR body follows `.github/PULL_REQUEST_TEMPLATE.md`. GitHub CI is the preflight gate; the [Dev Integration Line](./agents/dev-integration.md) is the serialized verify-and-merge authority for `dev`. The future-spec lifecycle owns child integration into protected spec branches.

## Clean up after merge

After GitHub reports the PR merged into its declared base, run:

```bash
scripts/git/codex-task.sh cleanup <task-worktree>
scripts/git/codex-task.sh cleanup
```

The helper queries the PR through `gh`, requires its recorded target base, and verifies that the merged PR head is the current task commit. It then deletes the recorded review refs and local task branch and removes helper-created Local worktrees. It leaves the remote branch to GitHub's delete-on-merge setting.

Before cleanup, the merging agent comments on the ticket with the PR, squash commit, verification, and `code-review` outcome; closes the ticket; and advances the parent spec state. In the future-spec lifecycle, a child closes as `workflow:spec-integrated` after its squash merge into the spec branch; the parent spec closes only after the final regular-merge PR enters `dev`.

## Concurrent tickets and an advancing dev

Only open, unblocked, unassigned `type:ticket` issues on the frontier are claimable. For later specs, a native blocker is satisfied only after it closes with `workflow:spec-integrated`; the newly eligible child starts from the updated spec branch. Independent children are sibling branches and may run concurrently. Never start from another ticket branch. Spec #50 retains direct-to-`dev` integration. When an applicable base advances:

```bash
git merge dev
# or, for future-spec work:
git merge codex/spec-<spec-number>-<slug>
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
  --confirm-repo brandon-y-lee/mei-pelle \
  --confirm-dev-sha <audited-dev-sha> \
  --confirm-ci-sha <same-CI-verified-sha> \
  --confirm-integration-cutover dev-integration-authority \
  --confirm-spec-branch-cutover protected-spec-branches \
  --confirm-integration-app-id <app-id-printed-by-plan>
```

The tool pushes the captured commit rather than the mutable branch name and rechecks remote `main`/`dev` immediately before that push. It also proves the GitHub Actions Integration from the existing `ci` check before planning the `dev` authority ruleset. It fails closed on missing authentication, the wrong repository, stale or divergent branch ancestry, unavailable repository, issue, check, or ruleset facts, or mismatched confirmations. Apply remains a separately approved remote mutation.
