#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/git/codex-task.sh start <slug>
  scripts/git/codex-task.sh merge [task-worktree]

start  Create codex/<slug> from the current local dev head. A Local thread gets
       a new temporary task worktree; a managed Worktree uses its current path.
merge  Fast-forward a clean, verified codex/* task branch into local dev. Pass
       the task-worktree path when start created one for a Local thread.
EOF
}

fail() {
  printf 'codex-task: %s\n' "$1" >&2
  exit 1
}

require_clean_worktree() {
  clean_worktree_path=$1
  if [ -n "$(git -C "$clean_worktree_path" status --porcelain --untracked-files=normal)" ]; then
    fail "the worktree must be clean"
  fi
}

require_dev_branch() {
  dev_repository_path=$1
  git -C "$dev_repository_path" show-ref --verify --quiet refs/heads/dev ||
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

  start_repository=$(git rev-parse --show-toplevel)
  start_common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
  start_primary_checkout=$(dirname "$start_common_dir")

  require_dev_branch "$start_repository"
  require_clean_worktree "$start_repository"

  git -C "$start_repository" show-ref --verify --quiet "refs/heads/$task_branch" &&
    fail "branch '$task_branch' already exists"

  if [ "$start_repository" = "$start_primary_checkout" ]; then
    primary_branch=$(git -C "$start_repository" branch --show-current)
    case "$primary_branch" in
      ''|dev)
        git -C "$start_repository" switch --detach dev
        ;;
    esac

    task_parent=$(mktemp -d "${TMPDIR:-/tmp}/mei-pelle-task-${task_slug}.XXXXXX")
    task_worktree="$task_parent/worktree"
    task_marker="$task_parent/.mei-pelle-codex-task"

    if ! git -C "$start_repository" worktree add -b "$task_branch" "$task_worktree" dev; then
      rmdir "$task_parent" >/dev/null 2>&1 || true
      fail "could not create the isolated task worktree"
    fi

    printf '%s\n' "$task_branch" > "$task_marker"
    printf 'Started %s at dev commit %s\n' \
      "$task_branch" "$(git -C "$task_worktree" rev-parse --short HEAD)"
    printf 'Task worktree: %s\n' "$task_worktree"
    printf 'Continue all task work in that directory.\n'
    printf 'After verification, finish from the shared checkout with:\n'
    printf '  scripts/git/codex-task.sh merge %s\n' "$task_worktree"
    return
  fi

  current_branch=$(git -C "$start_repository" branch --show-current)
  [ -z "$current_branch" ] ||
    fail "this linked worktree already owns branch '$current_branch'"

  git -C "$start_repository" switch --detach dev
  git -C "$start_repository" switch -c "$task_branch"
  printf 'Started %s at dev commit %s\n' \
    "$task_branch" "$(git -C "$start_repository" rev-parse --short HEAD)"
}

merge_task() {
  [ "$#" -le 1 ] || {
    usage >&2
    exit 2
  }

  merge_invocation_root=$(git rev-parse --show-toplevel)
  merge_invocation_common=$(git rev-parse --path-format=absolute --git-common-dir)

  if [ "$#" -eq 1 ]; then
    [ -d "$1" ] || fail "task worktree '$1' does not exist"
    task_repository=$(cd "$1" && pwd -P)
  else
    task_repository=$merge_invocation_root
  fi

  task_common_dir=$(git -C "$task_repository" rev-parse --path-format=absolute --git-common-dir)
  [ "$task_common_dir" = "$merge_invocation_common" ] ||
    fail "task worktree belongs to a different Git repository"

  task_primary_checkout=$(dirname "$task_common_dir")
  require_dev_branch "$task_repository"
  require_clean_worktree "$task_repository"

  task_branch=$(git -C "$task_repository" branch --show-current)
  case "$task_branch" in
    codex/*) ;;
    *) fail "merge must run from a codex/* task branch" ;;
  esac

  task_parent=$(dirname "$task_repository")
  task_marker="$task_parent/.mei-pelle-codex-task"
  generated_task_worktree=0
  if [ "$(basename "$task_repository")" = "worktree" ] && [ -f "$task_marker" ]; then
    IFS= read -r marker_branch < "$task_marker" || true
    if [ "$marker_branch" = "$task_branch" ]; then
      generated_task_worktree=1
    fi
  fi

  if [ "$generated_task_worktree" -eq 1 ] && [ "$merge_invocation_root" = "$task_repository" ]; then
    fail "finish this Local task from the shared checkout: scripts/git/codex-task.sh merge $task_repository"
  fi

  if ! git -C "$task_repository" merge-base --is-ancestor dev HEAD; then
    fail "dev advanced; merge dev into '$task_branch', reverify, and retry"
  fi

  ahead_count=$(git -C "$task_repository" rev-list --count dev..HEAD)
  [ "$ahead_count" -gt 0 ] || fail "task branch has no commits ahead of dev"

  merge_parent=$(mktemp -d "${TMPDIR:-/tmp}/mei-pelle-dev-merge.XXXXXX")
  merge_worktree="$merge_parent/worktree"

  cleanup_merge_worktree() {
    git -C "$task_primary_checkout" worktree remove "$merge_worktree" >/dev/null 2>&1 || true
    rmdir "$merge_parent" >/dev/null 2>&1 || true
  }
  trap cleanup_merge_worktree EXIT HUP INT TERM

  if ! git -C "$task_primary_checkout" worktree add "$merge_worktree" dev; then
    fail "dev is checked out elsewhere or another integration is running"
  fi

  if ! git -C "$merge_worktree" merge-base --is-ancestor dev "$task_branch"; then
    fail "dev advanced during integration; update and reverify '$task_branch'"
  fi

  git -C "$merge_worktree" merge --ff-only "$task_branch"
  merged_commit=$(git -C "$merge_worktree" rev-parse --short HEAD)

  cleanup_merge_worktree
  trap - EXIT HUP INT TERM

  git -C "$task_repository" switch --detach dev
  git -C "$task_repository" branch -d "$task_branch"

  if [ "$generated_task_worktree" -eq 1 ]; then
    git -C "$task_primary_checkout" worktree remove "$task_repository"
    rm -f "$task_marker"
    rmdir "$task_parent"
    printf 'Removed task worktree %s\n' "$task_repository"
  fi

  if [ "$merge_invocation_root" = "$task_primary_checkout" ] &&
     [ -z "$(git -C "$merge_invocation_root" branch --show-current)" ] &&
     [ -z "$(git -C "$merge_invocation_root" status --porcelain --untracked-files=normal)" ]; then
    git -C "$merge_invocation_root" switch --detach dev
  fi

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
