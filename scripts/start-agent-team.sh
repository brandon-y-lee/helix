#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-ai-team}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 1
  fi
}

attach_session() {
  if [ -n "${TMUX:-}" ]; then
    tmux switch-client -t "$SESSION"
  else
    tmux attach-session -t "$SESSION"
  fi
}

require_cmd tmux
require_cmd git
require_cmd claude

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# If the session already exists, load it instead of trying to recreate it.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session '$SESSION' already exists. Attaching..."
  attach_session
  exit 0
fi

required_agents=(
  architect
  backend
  frontend
  fullstack
  reviewer
  security
  qa
  devops
  a11y
)

for agent in "${required_agents[@]}"; do
  if ! grep -R "^name: ${agent}$" "$ROOT/.claude/agents" >/dev/null 2>&1; then
    echo "ERROR: missing configured agent: ${agent}" >&2
    echo "Expected a .claude/agents/*.md file with frontmatter line: name: ${agent}" >&2
    exit 1
  fi
done

echo "Creating tmux session '$SESSION'..."

# Window 1: lead / planning / implementation agents
tmux new-session -d -s "$SESSION" -n lead -c "$ROOT" \
  "claude"

tmux split-window -h -t "$SESSION:lead" -c "$ROOT" \
  "claude --worktree architect --agent architect"

tmux split-window -v -t "$SESSION:lead" -c "$ROOT" \
  "claude --worktree backend --agent backend"

tmux split-window -v -t "$SESSION:lead" -c "$ROOT" \
  "claude --worktree frontend --agent frontend"

tmux split-window -v -t "$SESSION:lead" -c "$ROOT" \
  "claude --worktree fullstack --agent fullstack"

tmux select-layout -t "$SESSION:lead" tiled

# Window 2: quality / review / security
tmux new-window -t "$SESSION" -n quality -c "$ROOT" \
  "claude --agent reviewer"

tmux split-window -h -t "$SESSION:quality" -c "$ROOT" \
  "claude --agent security"

tmux split-window -v -t "$SESSION:quality" -c "$ROOT" \
  "claude --agent qa"

tmux split-window -v -t "$SESSION:quality" -c "$ROOT" \
  "claude --agent a11y"

tmux select-layout -t "$SESSION:quality" tiled

# Window 3: operations
tmux new-window -t "$SESSION" -n ops -c "$ROOT" \
  "claude --worktree devops --agent devops"

tmux select-window -t "$SESSION:lead"

echo "Created tmux session '$SESSION'. Attaching..."
attach_session
