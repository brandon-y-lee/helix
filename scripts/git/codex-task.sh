#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/git/codex-task.sh start <slug>
  scripts/git/codex-task.sh merge

start  Create codex/<slug> from the current local dev head in a clean,
       detached Codex worktree.
merge  Fast-forward a clean, verified codex/* task branch into local dev.
EOF
}

fail() {
  printf 'codex-task: %s\n' "$1" >&2
  exit 1
}

require_clean_worktree() {
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    fail "the worktree must be clean"
  fi
}

require_dev_branch() {
  git show-ref --verify --quiet refs/heads/dev ||
    fail "local branch 'dev' does not exist"
}

start_task() {
  [ "$#" -eq 1 ] || {
    usage >&2
    exit 2
  }

  task_slug=$1
  case "$task_slug" in
    ''|*[!a-z0-9._-]*|[.-]*|*.)
      fail "slug must use lowercase letters, digits, dots, underscores, or hyphens"
      ;;
  esac

  task_branch="codex/$task_slug"
  git check-ref-format --branch "$task_branch" >/dev/null 2>&1 ||
    fail "slug does not produce a valid Git branch name"

  require_dev_branch
  require_clean_worktree

  current_branch=$(git branch --show-current)
  [ -z "$current_branch" ] ||
    fail "start must run in a detached Codex worktree, not branch '$current_branch'"

  git show-ref --verify --quiet "refs/heads/$task_branch" &&
    fail "branch '$task_branch' already exists"

  git switch --detach dev
  git switch -c "$task_branch"
  printf 'Started %s at dev commit %s\n' \
    "$task_branch" "$(git rev-parse --short HEAD)"
}

merge_task() {
  [ "$#" -eq 0 ] || {
    usage >&2
    exit 2
  }

  require_dev_branch
  require_clean_worktree

  task_branch=$(git branch --show-current)
  case "$task_branch" in
    codex/*) ;;
    *) fail "merge must run from a codex/* task branch" ;;
  esac

  if ! git merge-base --is-ancestor dev HEAD; then
    fail "dev advanced; merge dev into '$task_branch', reverify, and retry"
  fi

  ahead_count=$(git rev-list --count dev..HEAD)
  [ "$ahead_count" -gt 0 ] || fail "task branch has no commits ahead of dev"

  repository_root=$(git rev-parse --show-toplevel)
  merge_parent=$(mktemp -d "${TMPDIR:-/tmp}/mei-pelle-dev-merge.XXXXXX")
  merge_worktree="$merge_parent/worktree"

  cleanup_merge_worktree() {
    git -C "$repository_root" worktree remove "$merge_worktree" >/dev/null 2>&1 || true
    rmdir "$merge_parent" >/dev/null 2>&1 || true
  }
  trap cleanup_merge_worktree EXIT HUP INT TERM

  if ! git -C "$repository_root" worktree add "$merge_worktree" dev; then
    fail "dev is checked out elsewhere or another integration is running"
  fi

  if ! git -C "$merge_worktree" merge-base --is-ancestor dev "$task_branch"; then
    fail "dev advanced during integration; update and reverify '$task_branch'"
  fi

  git -C "$merge_worktree" merge --ff-only "$task_branch"
  merged_commit=$(git -C "$merge_worktree" rev-parse --short HEAD)

  cleanup_merge_worktree
  trap - EXIT HUP INT TERM

  git switch --detach dev
  git branch -d "$task_branch"
  printf 'Merged %s into dev at %s\n' "$task_branch" "$merged_commit"
}

[ "$#" -ge 1 ] || {
  usage >&2
  exit 2
}

command_name=$1
shift

case "$command_name" in
  start) start_task "$@" ;;
  merge) merge_task "$@" ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
