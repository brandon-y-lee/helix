#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/git/codex-task.sh spec-start <spec-number>-<slug>
  scripts/git/codex-task.sh start <issue-number>-<slug>
  scripts/git/codex-task.sh start <issue-number>-<slug> --spec <spec-number>-<slug>
  scripts/git/codex-task.sh start plan-<slug>
  scripts/git/codex-task.sh start trivial-<slug>
  scripts/git/codex-task.sh prepare [task-worktree]
  scripts/git/codex-task.sh cleanup [task-worktree]

spec-start  Create one local codex/spec-* integration branch from current dev.
start       Create an isolated codex/* worktree from dev or a declared spec
            branch and record its review base.
prepare  Validate a clean, traceable branch before code-review, push, and PR.
cleanup  Remove the local task branch/worktree after its PR merges into dev.
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

classify_slug() {
  task_slug=$1
  case "$task_slug" in
    ''|*[!a-z0-9._-]*|[.-]*|*.)
      fail "slug must use lowercase letters, digits, dots, underscores, or hyphens"
      ;;
  esac

  task_kind=
  ticket_number=
  case "$task_slug" in
    plan-?*) task_kind=plan ;;
    trivial-?*) task_kind=trivial ;;
    [0-9]*-?*)
      ticket_number=${task_slug%%-*}
      case "$ticket_number" in
        ''|*[!0-9]*)
          fail "slug must start with an issue number, 'plan-', or 'trivial-'"
          ;;
      esac
      ticket_suffix=${task_slug#*-}
      case "$ticket_suffix" in
        urgent-?*) task_kind=urgent ;;
        *) task_kind=ticket ;;
      esac
      ;;
    *) fail "slug must start with an issue number, 'plan-', or 'trivial-'" ;;
  esac
}

review_ref_for_slug() {
  printf 'refs/codex/review-base/%s\n' "$1"
}

review_target_ref_for_slug() {
  printf 'refs/codex/review-target/%s\n' "$1"
}

classify_spec_slug() {
  spec_slug=$1
  case "$spec_slug" in
    [0-9]*-?*) ;;
    *) fail "spec slug must be <spec-number>-<slug>" ;;
  esac
  spec_number=${spec_slug%%-*}
  case "$spec_number" in
    ''|*[!0-9]*) fail "spec slug must be <spec-number>-<slug>" ;;
  esac
  spec_suffix=${spec_slug#*-}
  case "$spec_suffix" in
    ''|*[!a-z0-9._-]*|[.-]*|*.) fail "spec slug must be <spec-number>-<slug>" ;;
  esac
}

resolve_task_repository() {
  [ "$#" -le 1 ] || {
    usage >&2
    exit 2
  }

  invocation_root=$(git rev-parse --show-toplevel)
  invocation_common=$(git rev-parse --path-format=absolute --git-common-dir)

  if [ "$#" -eq 1 ]; then
    [ -d "$1" ] || fail "task worktree '$1' does not exist"
    task_repository=$(cd "$1" && pwd -P)
  else
    task_repository=$invocation_root
  fi

  task_common_dir=$(git -C "$task_repository" rev-parse --path-format=absolute --git-common-dir)
  [ "$task_common_dir" = "$invocation_common" ] ||
    fail "task worktree belongs to a different Git repository"

  task_primary_checkout=$(dirname "$task_common_dir")
  task_branch=$(git -C "$task_repository" branch --show-current)
  case "$task_branch" in
    codex/*) ;;
    *) fail "the command must target a codex/* task branch" ;;
  esac

  task_slug=${task_branch#codex/}
  classify_slug "$task_slug"
  task_review_ref=$(review_ref_for_slug "$task_slug")
  task_review_target_ref=$(review_target_ref_for_slug "$task_slug")

  task_parent=$(dirname "$task_repository")
  task_marker="$task_parent/.mei-pelle-codex-task"
  generated_task_worktree=0
  if [ "$(basename "$task_repository")" = "worktree" ] && [ -f "$task_marker" ]; then
    IFS= read -r marker_branch < "$task_marker" || true
    if [ "$marker_branch" = "$task_branch" ]; then
      generated_task_worktree=1
    fi
  fi
}

start_spec() {
  [ "$#" -eq 1 ] || {
    usage >&2
    exit 2
  }
  classify_spec_slug "$1"
  [ "$spec_number" != 50 ] ||
    fail "spec #50 remains on the previously executable workflow"
  spec_branch="codex/spec-$1"
  git check-ref-format --branch "$spec_branch" >/dev/null 2>&1 ||
    fail "spec slug does not produce a valid Git branch name"

  spec_repository=$(git rev-parse --show-toplevel)
  require_dev_branch "$spec_repository"
  require_clean_worktree "$spec_repository"
  git -C "$spec_repository" show-ref --verify --quiet "refs/heads/$spec_branch" &&
    fail "branch '$spec_branch' already exists"
  git -C "$spec_repository" branch "$spec_branch" dev
  printf 'Created %s at current dev commit %s\n' \
    "$spec_branch" "$(git -C "$spec_repository" rev-parse --short dev)"
  printf 'Publish and protect it through the spec lifecycle orchestrator; direct pushes are forbidden.\n'
}

start_task() {
  [ "$#" -eq 1 ] || [ "$#" -eq 3 ] || {
    usage >&2
    exit 2
  }

  task_slug=$1
  classify_slug "$task_slug"
  start_base=dev
  spec_branch=
  if [ "$#" -eq 3 ]; then
    [ "$2" = "--spec" ] || {
      usage >&2
      exit 2
    }
    [ "$task_kind" != urgent ] || fail "urgent tickets cannot target a spec branch"
    classify_spec_slug "$3"
    [ "$spec_number" != 50 ] ||
      fail "spec #50 remains on the previously executable workflow"
    spec_branch="codex/spec-$3"
    case "$spec_branch" in
      codex/spec-[0-9]*-?*) ;;
      *) fail "spec base must be codex/spec-<number>-<slug>" ;;
    esac
    git show-ref --verify --quiet "refs/heads/$spec_branch" ||
      fail "spec base must be codex/spec-<number>-<slug> and exist locally"
    start_base=$spec_branch
  fi
  if [ -n "$spec_branch" ] && [ "$task_kind" != ticket ]; then
    fail "only normal ticket branches may start from a spec branch"
  fi
  task_branch="codex/$task_slug"
  review_ref=$(review_ref_for_slug "$task_slug")
  review_target_ref=$(review_target_ref_for_slug "$task_slug")

  git check-ref-format --branch "$task_branch" >/dev/null 2>&1 ||
    fail "slug does not produce a valid Git branch name"

  start_repository=$(git rev-parse --show-toplevel)
  start_common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
  start_primary_checkout=$(dirname "$start_common_dir")

  require_dev_branch "$start_repository"
  require_clean_worktree "$start_repository"

  git -C "$start_repository" show-ref --verify --quiet "refs/heads/$task_branch" &&
    fail "branch '$task_branch' already exists"
  git -C "$start_repository" show-ref --verify --quiet "$review_ref" &&
    fail "review base '$review_ref' already exists"

  review_base=$(git -C "$start_repository" rev-parse "$start_base")
  git -C "$start_repository" update-ref "$review_ref" "$review_base"
  if [ -n "$spec_branch" ]; then
    git -C "$start_repository" symbolic-ref "$review_target_ref" "refs/heads/$spec_branch"
  fi

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

    if ! git -C "$start_repository" worktree add -b "$task_branch" "$task_worktree" "$start_base"; then
      git -C "$start_repository" update-ref -d "$review_ref"
      git -C "$start_repository" symbolic-ref -d "$review_target_ref" >/dev/null 2>&1 || true
      rmdir "$task_parent" >/dev/null 2>&1 || true
      fail "could not create the isolated task worktree"
    fi

    printf '%s\n' "$task_branch" > "$task_marker"
    printf 'Started %s at dev commit %s\n' "$task_branch" "$(git -C "$task_worktree" rev-parse --short HEAD)"
    printf 'Review base: %s\n' "$review_base"
    printf 'Task worktree: %s\n' "$task_worktree"
    printf 'Pull request base: %s\n' "$start_base"
    printf 'Continue all task work in that directory.\n'
    printf 'Before push, run from the shared checkout:\n'
    printf '  scripts/git/codex-task.sh prepare %s\n' "$task_worktree"
    return
  fi

  current_branch=$(git -C "$start_repository" branch --show-current)
  if [ -n "$current_branch" ]; then
    git -C "$start_repository" update-ref -d "$review_ref"
    git -C "$start_repository" symbolic-ref -d "$review_target_ref" >/dev/null 2>&1 || true
    fail "this linked worktree already owns branch '$current_branch'"
  fi

  if ! git -C "$start_repository" switch --detach "$start_base" ||
     ! git -C "$start_repository" switch -c "$task_branch"; then
    git -C "$start_repository" update-ref -d "$review_ref"
    git -C "$start_repository" symbolic-ref -d "$review_target_ref" >/dev/null 2>&1 || true
    fail "could not create '$task_branch' in the managed worktree"
  fi
  printf 'Started %s at dev commit %s\n' "$task_branch" "$(git -C "$start_repository" rev-parse --short HEAD)"
  printf 'Review base: %s\n' "$review_base"
  printf 'Pull request base: %s\n' "$start_base"
}

prepare_task() {
  resolve_task_repository "$@"
  require_dev_branch "$task_repository"
  require_clean_worktree "$task_repository"

  git -C "$task_repository" show-ref --verify --quiet "$task_review_ref" ||
    fail "recorded review base '$task_review_ref' is missing"

  review_target=dev
  if git -C "$task_repository" symbolic-ref -q "$task_review_target_ref" >/dev/null 2>&1; then
    review_target=$(git -C "$task_repository" symbolic-ref --short "$task_review_target_ref")
  fi

  if ! git -C "$task_repository" merge-base --is-ancestor "$review_target" HEAD; then
    fail "$review_target advanced; merge it into '$task_branch', reverify, and retry"
  fi

  ahead_count=$(git -C "$task_repository" rev-list --count "$review_target"..HEAD)
  [ "$ahead_count" -gt 0 ] || fail "task branch has no commits ahead of $review_target"

  review_base=$(git -C "$task_repository" rev-parse "$review_target")
  recorded_base=$(git -C "$task_repository" rev-parse "$task_review_ref")
  if [ "$task_kind" = ticket ] || [ "$task_kind" = urgent ]; then
    commit_messages=$(git -C "$task_repository" log --format=%B "$review_target"..HEAD)
    printf '%s\n' "$commit_messages" | grep -Eq "^Refs #${ticket_number}[[:space:]]*$" ||
      fail "ticket commits must include a 'Refs #$ticket_number' footer"
    if [ "$task_kind" = urgent ]; then
      printf 'Urgent fast path: Refs #%s; no parent spec\n' "$ticket_number"
    else
      spec_number=$(printf '%s\n' "$commit_messages" |
        sed -n 's/^Spec #\([0-9][0-9]*\)[[:space:]]*$/\1/p' |
        tail -n 1)
      [ -n "$spec_number" ] || fail "ticket commits must include a 'Spec #<number>' footer"
      printf 'Traceability: Refs #%s; Spec #%s\n' "$ticket_number" "$spec_number"
    fi
  fi

  printf 'Recorded start base: %s\n' "$recorded_base"
  printf 'Ready for code-review against %s at %s\n' "$review_target" "$review_base"
  printf 'After review passes, push %s and open a ready PR targeting %s.\n' "$task_branch" "$review_target"
}

cleanup_task() {
  resolve_task_repository "$@"
  require_clean_worktree "$task_repository"

  cleanup_target=dev
  if git -C "$task_repository" symbolic-ref -q "$task_review_target_ref" >/dev/null 2>&1; then
    cleanup_target=$(git -C "$task_repository" symbolic-ref --short "$task_review_target_ref")
  fi

  gh_bin=${GH_BIN:-gh}
  if [ ! -x "$gh_bin" ] && ! command -v "$gh_bin" >/dev/null 2>&1; then
    fail "GitHub CLI is required to verify the merged PR"
  fi

  pr_status=$(
    "$gh_bin" pr list \
      --state merged \
      --head "$task_branch" \
      --base "$cleanup_target" \
      --limit 1 \
      --json state,baseRefName,mergedAt,headRefOid \
      --jq '.[0] | [.state, .baseRefName, .mergedAt, .headRefOid] | @tsv' 2>/dev/null
  ) || fail "could not verify a GitHub PR for '$task_branch'"

  tab=$(printf '\t')
  previous_ifs=$IFS
  IFS=$tab
  set -- $pr_status
  IFS=$previous_ifs
  pr_state=${1:-}
  pr_base=${2:-}
  pr_merged_at=${3:-}
  pr_head=${4:-}
  if [ "$pr_state" != MERGED ] || [ "$pr_base" != "$cleanup_target" ] || [ -z "$pr_merged_at" ]; then
    fail "PR must be merged into $cleanup_target before cleanup"
  fi
  task_head=$(git -C "$task_repository" rev-parse HEAD)
  [ "$pr_head" = "$task_head" ] ||
    fail "merged PR head does not match current task commit"

  if [ "$generated_task_worktree" -eq 1 ] && [ "$invocation_root" = "$task_repository" ]; then
    fail "clean up this Local task from the shared checkout: scripts/git/codex-task.sh cleanup $task_repository"
  fi

  git -C "$task_primary_checkout" update-ref -d "$task_review_ref"
  git -C "$task_primary_checkout" symbolic-ref -d "$task_review_target_ref" >/dev/null 2>&1 || true

  if [ "$generated_task_worktree" -eq 1 ]; then
    git -C "$task_primary_checkout" worktree remove "$task_repository"
    git -C "$task_primary_checkout" branch -D "$task_branch"
    rm -f "$task_marker"
    rmdir "$task_parent"
    printf 'Removed task worktree %s\n' "$task_repository"
    return
  fi

  detach_target=dev
  git -C "$task_repository" show-ref --verify --quiet refs/remotes/origin/dev &&
    detach_target=origin/dev
  git -C "$task_repository" switch --detach "$detach_target"
  git -C "$task_primary_checkout" branch -D "$task_branch"
  printf 'Detached cleaned task worktree at %s\n' "$detach_target"
}

[ "$#" -ge 1 ] || {
  usage >&2
  exit 2
}

command_name=$1
shift

case "$command_name" in
  spec-start) start_spec "$@" ;;
  start) start_task "$@" ;;
  prepare) prepare_task "$@" ;;
  cleanup) cleanup_task "$@" ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
