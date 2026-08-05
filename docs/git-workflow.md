# Git workflow

Mei Pelle uses two long-lived branches:

- `main` is the production branch.
- `dev` is the staging and integration branch.

Every Codex task starts from the current local `dev` commit, runs on a short-lived
`codex/<slug>` branch in an isolated worktree, and returns to `dev` only after the
task is complete and its relevant verification passes.

## Start a Codex task

In the Codex worktree picker, select `dev` as the starting branch. Codex creates
managed worktrees in detached HEAD mode. Before editing, run:

```bash
scripts/git/codex-task.sh start <slug>
```

The command requires a clean, detached worktree, moves it to the current local
`dev` head, and creates `codex/<slug>`. This check prevents a task from quietly
starting on `main`, a stale detached commit, or another feature branch.

Use a lowercase, filesystem-safe slug such as `cart-error-state`. Do not commit
directly on `dev` or `main`.

## Complete and integrate a task

Commit only task-related changes. Run the smallest complete verification set for
the affected behavior. Then make sure the task contains the latest `dev`:

```bash
git merge dev
```

If that merge changes the task branch, resolve any conflicts and rerun the
affected checks. After the task is complete, clean, and verified, integrate it:

```bash
scripts/git/codex-task.sh merge
```

The merge command enforces these conditions:

- the current branch is named `codex/*`;
- the worktree is clean and contains commits ahead of `dev`;
- the current `dev` commit is an ancestor of the task;
- `dev` can be checked out in a temporary integration worktree; and
- the integration is a fast-forward, so the verified task commit is exactly the
  commit installed on `dev`.

On success, it removes the temporary integration worktree, detaches the Codex
worktree at the new `dev` head, and deletes the merged task branch. Codex-managed
worktree cleanup remains the desktop app's responsibility.

If another task is integrating, or a long-lived checkout currently owns `dev`,
the command exits without changing `dev`. Wait for the other integration to
finish or switch that checkout away from `dev`, then retry. If `dev` advanced,
merge it into the task branch and reverify before retrying.

## CI, staging, and production

CI runs for pushes and pull requests targeting either `dev` or `main`. Pushing is
not automatic: local task integration advances only the local `dev` branch.

Push `dev` only when explicitly requested and use its Vercel preview deployment as
the staging environment. Promote `dev` to `main` through an explicit reviewed
pull request after staging and CI pass. Never merge a task branch directly to
`main`, force-push either long-lived branch, or promote unverified work.
