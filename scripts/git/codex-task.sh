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
  scripts/git/codex-task.sh reconcile [--apply [--remote]]
  scripts/git/codex-task.sh retire <branch-or-worktree> --expect-head <sha> [--remote]

spec-start  Create the remote Spec Branch and draft Spec PR, then expose its
            approved child Tickets.
start    Create an isolated codex/* worktree from dev or an explicit remote
         Spec Branch and record its immutable review base.
prepare  Validate a clean, traceable branch before code-review, push, and PR.
cleanup  Remove the local task branch/worktree after its PR merges into dev.
reconcile  Plan safe cleanup across linked worktrees and Git refs.
retire     Explicitly remove assessed state at one immutable expected SHA.
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
  spec_suffix=${spec_slug#*-}
  case "$spec_number" in
    ''|*[!0-9]*) fail "spec slug must be <spec-number>-<slug>" ;;
  esac
  case "$spec_suffix" in
    ''|*[!a-z0-9._-]*|[.-]*|*.) fail "spec slug must be <spec-number>-<slug>" ;;
  esac
}

require_gh() {
  gh_bin=${GH_BIN:-gh}
  if [ ! -x "$gh_bin" ] && ! command -v "$gh_bin" >/dev/null 2>&1; then
    fail "GitHub CLI is required for Spec delivery"
  fi
}

validate_ticket_sync_reasons() {
  sync_repository=$1
  sync_base=$2
  sync_target=$3
  merge_commits=$(git -C "$sync_repository" rev-list --merges "$sync_base"..HEAD)
  for merge_commit in $merge_commits; do
    sync_reasons=$(
      git -C "$sync_repository" show -s --format=%B "$merge_commit" |
        sed -n 's/^Ticket-Sync-Reason:[[:space:]]*//p'
    )
    case "$sync_reasons" in
      merge-conflict|newly-approved-blocker|consumed-interface|combined-test) ;;
      *)
        fail "Ticket synchronization requires one approved concrete reason: merge-conflict, newly-approved-blocker, consumed-interface, or combined-test"
        ;;
    esac
    set -- $(git -C "$sync_repository" rev-list --parents -n 1 "$merge_commit")
    [ "$#" -eq 3 ] ||
      fail "Ticket synchronization must be one ordinary merge from the recorded Spec Branch"
    sync_source_parent=$3
    git -C "$sync_repository" rev-list --first-parent "$sync_target" |
      grep -Fxq "$sync_source_parent" ||
      fail "Ticket synchronization source is not on the recorded Spec Branch first-parent history"
  done
}

resolve_github_repository() {
  repository=$(
    "$gh_bin" repo view --json nameWithOwner --jq .nameWithOwner
  ) || fail "could not resolve the GitHub repository"
  [ -n "$repository" ] || fail "GitHub repository identity is empty"
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
  linked_task_worktree=0
  if [ "$task_repository" != "$task_primary_checkout" ]; then
    linked_task_worktree=1
  fi
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
  task_marker="$task_parent/.helix-codex-task"
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
  spec_branch="codex/spec-$1"
  git check-ref-format --branch "$spec_branch" >/dev/null 2>&1 ||
    fail "spec slug does not produce a valid Git branch name"

  spec_repository=$(git rev-parse --show-toplevel)
  require_clean_worktree "$spec_repository"
  require_gh
  resolve_github_repository

  spec_status=$(
    "$gh_bin" api "repos/$repository/issues/$spec_number" --jq \
      '[.state, ([.labels[].name] | (index("type:spec") != null and index("workflow:planned") != null))] | @tsv'
  ) || fail "could not validate Spec #$spec_number"
  tab=$(printf '\t')
  previous_ifs=$IFS
  IFS=$tab
  set -- $spec_status
  IFS=$previous_ifs
  spec_state=${1:-}
  spec_planned=${2:-false}
  case "$spec_state" in open|OPEN) ;; *) fail "Spec #$spec_number is not open" ;; esac
  [ "$spec_planned" = true ] || fail "Spec #$spec_number is not workflow:planned"

  git -C "$spec_repository" fetch --quiet origin \
    refs/heads/dev:refs/remotes/origin/dev ||
    fail "remote dev is missing or unavailable"
  remote_dev=$(git -C "$spec_repository" rev-parse refs/remotes/origin/dev)
  remote_spec=$(
    git -C "$spec_repository" ls-remote --heads origin "refs/heads/$spec_branch" |
      awk 'NR == 1 { print $1 }'
  )
  pr_status=$(
    "$gh_bin" pr list --state all --head "$spec_branch" --base dev --limit 1 \
      --json state,isDraft,url --jq '.[0] | [.state, .isDraft, .url] | @tsv'
  ) || fail "could not inspect the Spec PR for '$spec_branch'"

  setup_complete=0
  if [ -n "$remote_spec" ]; then
    if [ -z "$pr_status" ]; then
      [ "$remote_spec" = "$remote_dev" ] ||
        fail "partial Spec setup is stale: '$spec_branch' exists without a PR and dev advanced; preserve it and obtain recovery direction"
    else
      setup_complete=1
    fi
  elif [ -n "$pr_status" ]; then
    fail "Spec PR exists but target '$spec_branch' is missing; do not recreate or retarget it automatically"
  fi

  if [ -z "$remote_spec" ]; then
    current_remote_dev=$(
      git -C "$spec_repository" ls-remote --heads origin refs/heads/dev |
        awk 'NR == 1 { print $1 }'
    )
    [ "$current_remote_dev" = "$remote_dev" ] ||
      fail "remote dev advanced during Spec setup; retry from the new exact commit"
    git -C "$spec_repository" push origin "$remote_dev:refs/heads/$spec_branch" ||
      fail "could not create remote Spec Branch '$spec_branch'"
    remote_spec=$remote_dev
  fi

  if git -C "$spec_repository" show-ref --verify --quiet "refs/heads/$spec_branch"; then
    local_spec=$(git -C "$spec_repository" rev-parse "refs/heads/$spec_branch")
    [ "$local_spec" = "$remote_spec" ] ||
      fail "local '$spec_branch' differs from its remote; preserve both and obtain recovery direction"
  else
    git -C "$spec_repository" branch "$spec_branch" "$remote_spec"
  fi

  if [ -z "$pr_status" ]; then
    pr_url=$(
      "$gh_bin" pr create --draft --base dev --head "$spec_branch" \
        --title "Spec #$spec_number: $spec_suffix" \
        --body "Implements the approved delivery boundary in Spec #$spec_number."
    ) || fail "Spec Branch exists, but draft Spec PR creation failed; rerun spec-start to recover"
  else
    previous_ifs=$IFS
    IFS=$tab
    set -- $pr_status
    IFS=$previous_ifs
    pr_state=${1:-}
    pr_draft=${2:-false}
    pr_url=${3:-}
    case "$pr_state" in open|OPEN) ;; *) fail "existing Spec PR is not open" ;; esac
    [ "$pr_draft" = true ] || fail "existing Spec PR must remain draft during Ticket delivery"
  fi

  child_tickets=$(
    "$gh_bin" api "repos/$repository/issues/$spec_number/sub_issues" --paginate --jq \
      '.[] | [.number, .state, ([.labels[].name] | index("type:ticket") != null)] | @tsv'
  ) || fail "Spec setup succeeded, but child Ticket readiness could not be reconciled"
  if [ -n "$child_tickets" ]; then
    printf '%s\n' "$child_tickets" | while IFS="$tab" read -r child_number child_state child_is_ticket; do
      case "$child_state" in open|OPEN) ;; *) continue ;; esac
      [ "$child_is_ticket" = true ] || continue
      "$gh_bin" issue edit "$child_number" --add-label ready-for-agent >/dev/null ||
        fail "Spec setup succeeded, but Ticket #$child_number could not be exposed"
    done
  fi

  printf 'Spec Branch: %s @ %s\n' "$spec_branch" "$remote_spec"
  printf 'Draft Spec PR: %s\n' "$pr_url"
  if [ "$setup_complete" -eq 1 ]; then
    printf 'Spec setup already complete; child Ticket readiness reconciled.\n'
  else
    printf 'Spec setup complete; child Tickets may now enter the native frontier.\n'
  fi
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
    [ "$task_kind" = ticket ] || fail "only normal Tickets may target a Spec Branch"
    classify_spec_slug "$3"
    spec_branch="codex/spec-$3"
    start_base="refs/remotes/origin/$spec_branch"
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

  if [ -n "$spec_branch" ]; then
    require_gh
    resolve_github_repository
    ticket_status=$(
      "$gh_bin" api "repos/$repository/issues/$ticket_number" --jq \
        '[.state, (.issue_dependencies_summary.blocked_by // -1), (.parent_issue_url | split("/") | last), (.assignees | length), ([.labels[].name] | (index("type:ticket") != null and index("workflow:in-progress") != null))] | @tsv'
    ) || fail "could not validate Ticket #$ticket_number before snapshot creation"
    tab=$(printf '\t')
    previous_ifs=$IFS
    IFS=$tab
    set -- $ticket_status
    IFS=$previous_ifs
    ticket_state=${1:-}
    open_blockers=${2:--1}
    parent_spec=${3:-}
    assignee_count=${4:-0}
    ticket_claimed=${5:-false}
    case "$ticket_state" in open|OPEN) ;; *) fail "Ticket #$ticket_number is not open" ;; esac
    [ "$open_blockers" = 0 ] || fail "Ticket #$ticket_number has open native blockers"
    [ "$parent_spec" = "$spec_number" ] ||
      fail "Ticket #$ticket_number does not belong to Spec #$spec_number"
    [ "$assignee_count" = 1 ] && [ "$ticket_claimed" = true ] ||
      fail "Ticket #$ticket_number must have exactly one assignee and workflow:in-progress"

    git -C "$start_repository" fetch --quiet origin \
      "refs/heads/$spec_branch:refs/remotes/origin/$spec_branch" ||
      fail "recorded target '$spec_branch' is missing or unavailable; do not retarget the Ticket"

    blocker_statuses=$(
      "$gh_bin" api "repos/$repository/issues/$ticket_number/dependencies/blocked_by" \
        --paginate --jq '.[] | [.number, .state] | @tsv'
    ) || fail "could not inspect native blockers for Ticket #$ticket_number"
    if [ -n "$blocker_statuses" ]; then
      printf '%s\n' "$blocker_statuses" |
        while IFS="$tab" read -r blocker_number blocker_state; do
          case "$blocker_state" in closed|CLOSED) ;; *) fail "Ticket #$ticket_number has an unresolved native blocker #$blocker_number" ;; esac
          git -C "$start_repository" log --format=%B "$start_base" |
            grep -Eq "^Refs #${blocker_number}[[:space:]]*$" ||
            fail "Ticket Snapshot does not contain closed blocker #$blocker_number"
        done
    fi
  fi

  git -C "$start_repository" show-ref --verify --quiet "refs/heads/$task_branch" &&
    fail "branch '$task_branch' already exists"
  git -C "$start_repository" show-ref --verify --quiet "$review_ref" &&
    fail "review base '$review_ref' already exists"
  git -C "$start_repository" show-ref --verify --quiet "$review_target_ref" &&
    fail "review target '$review_target_ref' already exists"

  review_base=$(git -C "$start_repository" rev-parse "$start_base")
  git -C "$start_repository" update-ref "$review_ref" "$review_base"
  if [ -n "$spec_branch" ]; then
    git -C "$start_repository" symbolic-ref "$review_target_ref" "$start_base"
  fi

  if [ "$start_repository" = "$start_primary_checkout" ]; then
    primary_branch=$(git -C "$start_repository" branch --show-current)
    case "$primary_branch" in
      ''|dev)
        git -C "$start_repository" switch --detach dev
        ;;
    esac

    task_parent=$(mktemp -d "${TMPDIR:-/tmp}/helix-task-${task_slug}.XXXXXX")
    task_worktree="$task_parent/worktree"
    task_marker="$task_parent/.helix-codex-task"

    if ! git -C "$start_repository" worktree add -b "$task_branch" "$task_worktree" "$review_base"; then
      git -C "$start_repository" update-ref -d "$review_ref"
      git -C "$start_repository" symbolic-ref -d "$review_target_ref" >/dev/null 2>&1 || true
      rmdir "$task_parent" >/dev/null 2>&1 || true
      fail "could not create the isolated task worktree"
    fi

    printf '%s\n' "$task_branch" > "$task_marker"
    printf 'Started %s at dev commit %s\n' "$task_branch" "$(git -C "$task_worktree" rev-parse --short HEAD)"
    printf 'Review base: %s\n' "$review_base"
    if [ -n "$spec_branch" ]; then
      printf 'Ticket Snapshot: %s @ %s\n' "$spec_branch" "$review_base"
    fi
    printf 'Task worktree: %s\n' "$task_worktree"
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

  if ! git -C "$start_repository" switch --detach "$review_base" ||
     ! git -C "$start_repository" switch -c "$task_branch"; then
    git -C "$start_repository" update-ref -d "$review_ref"
    git -C "$start_repository" symbolic-ref -d "$review_target_ref" >/dev/null 2>&1 || true
    fail "could not create '$task_branch' in the managed worktree"
  fi
  printf 'Started %s at dev commit %s\n' "$task_branch" "$(git -C "$start_repository" rev-parse --short HEAD)"
  printf 'Review base: %s\n' "$review_base"
  if [ -n "$spec_branch" ]; then
    printf 'Ticket Snapshot: %s @ %s\n' "$spec_branch" "$review_base"
  fi
}

prepare_task() {
  resolve_task_repository "$@"
  require_dev_branch "$task_repository"
  require_clean_worktree "$task_repository"

  git -C "$task_repository" show-ref --verify --quiet "$task_review_ref" ||
    fail "recorded review base '$task_review_ref' is missing"

  recorded_base=$(git -C "$task_repository" rev-parse "$task_review_ref")
  review_target=dev
  comparison_base=dev
  snapshot_target=0
  if git -C "$task_repository" symbolic-ref -q "$task_review_target_ref" >/dev/null 2>&1; then
    target_remote_ref=$(git -C "$task_repository" symbolic-ref "$task_review_target_ref")
    review_target=${target_remote_ref#refs/remotes/origin/}
    [ "$review_target" != "$target_remote_ref" ] ||
      fail "recorded Ticket target is malformed; preserve the branch and obtain recovery direction"
    git -C "$task_repository" fetch --quiet origin \
      "refs/heads/$review_target:$target_remote_ref" ||
      fail "recorded target '$review_target' is missing, renamed, or cancelled; do not retarget automatically—preserve the Ticket branch and reconcile the Spec"
    current_target=$(git -C "$task_repository" rev-parse "$target_remote_ref")
    comparison_base=$recorded_base
    review_base=$recorded_base
    snapshot_target=1
  else
    if ! git -C "$task_repository" merge-base --is-ancestor dev HEAD; then
      fail "dev advanced; merge dev into '$task_branch', reverify, and retry"
    fi
    review_base=$(git -C "$task_repository" rev-parse dev)
  fi

  if ! git -C "$task_repository" merge-base --is-ancestor "$recorded_base" HEAD; then
    fail "recorded review base is not an ancestor; preserve additive history and obtain recovery direction"
  fi
  ahead_count=$(git -C "$task_repository" rev-list --count "$comparison_base"..HEAD)
  [ "$ahead_count" -gt 0 ] || fail "task branch has no commits ahead of its review base"
  if [ "$snapshot_target" -eq 1 ]; then
    validate_ticket_sync_reasons "$task_repository" "$recorded_base" "$target_remote_ref"
  fi

  if [ "$task_kind" = ticket ] || [ "$task_kind" = urgent ]; then
    commit_messages=$(git -C "$task_repository" log --format=%B "$comparison_base"..HEAD)
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

  if [ "$snapshot_target" -eq 1 ]; then
    printf 'Ticket Review base: %s @ %s\n' "$review_target" "$recorded_base"
    printf 'Current target head: %s\n' "$current_target"
    printf 'Sibling advances do not invalidate the Ticket Snapshot.\n'
  else
    printf 'Recorded start base: %s\n' "$recorded_base"
    printf 'Ready for code-review against dev at %s\n' "$review_base"
  fi
  printf 'After review passes, push %s and open a ready PR targeting %s.\n' "$task_branch" "$review_target"
}

cleanup_task() {
  resolve_task_repository "$@"
  require_clean_worktree "$task_repository"

  cleanup_target=dev
  if git -C "$task_repository" symbolic-ref -q "$task_review_target_ref" >/dev/null 2>&1; then
    cleanup_target_ref=$(git -C "$task_repository" symbolic-ref "$task_review_target_ref")
    cleanup_target=${cleanup_target_ref#refs/remotes/origin/}
    [ "$cleanup_target" != "$cleanup_target_ref" ] ||
      fail "recorded cleanup target is malformed; preserve the task state"
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
      --jq '.[0] | [.state, .baseRefName, .mergedAt, .headRefOid] | @tsv'
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
    if [ "$cleanup_target" = dev ]; then
      fail "PR must be merged into dev before cleanup"
    fi
    fail "PR must be merged into recorded target '$cleanup_target' before cleanup"
  fi
  task_head=$(git -C "$task_repository" rev-parse HEAD)
  [ "$pr_head" = "$task_head" ] ||
    fail "merged PR head does not match current task commit"

  if [ "$generated_task_worktree" -eq 1 ] && [ "$invocation_root" = "$task_repository" ]; then
    fail "clean up this Local task from the shared checkout: scripts/git/codex-task.sh cleanup $task_repository"
  fi

  git -C "$task_primary_checkout" update-ref -d "$task_review_ref"
  git -C "$task_primary_checkout" symbolic-ref -d "$task_review_target_ref" >/dev/null 2>&1 || true
  printf 'Verified integration into recorded target %s.\n' "$cleanup_target"

  if [ "$linked_task_worktree" -eq 1 ]; then
    git -C "$task_primary_checkout" worktree remove "$task_repository"
    git -C "$task_primary_checkout" branch -D "$task_branch"
    if [ "$generated_task_worktree" -eq 1 ]; then
      rm -f "$task_marker"
      rmdir "$task_parent"
    fi
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
  reconcile) exec node "$(dirname "$0")/codex-task-state.mjs" reconcile "$@" ;;
  retire) exec node "$(dirname "$0")/codex-task-state.mjs" retire "$@" ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
