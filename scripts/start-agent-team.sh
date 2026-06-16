#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-ai-team}"
ROOT="$(git rev-parse --show-toplevel)"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found"
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "claude not found"
  exit 1
fi

if ! claude --help 2>/dev/null | grep -q -- '--agent'; then
  echo "Your Claude CLI help output does not show --agent."
  echo "Update Claude Code or start plain 'claude' sessions and invoke agents manually."
  exit 1
fi

required_agents=(
  architect
  backend
  frontend
  reviewer
  security
  qa
  devops
  a11y
)

for agent in "${required_agents[@]}"; do
  if ! grep -R "^name: ${agent}$" "$ROOT/.claude/agents" >/dev/null 2>&1; then
    echo "Missing configured agent: ${agent}"
    echo "Expected a .claude/agents/*.md file with frontmatter line: name: ${agent}"
    exit 1
  fi
done

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session '$SESSION' already exists."
  echo "Attach with: tmux attach -t $SESSION"
  exit 1
fi

tmux new-session -d -s "$SESSION" -n lead -c "$ROOT" \
  'claude'

tmux split-window -h -t "$SESSION:lead" -c "$ROOT" \
  'claude --worktree architect --agent architect'

tmux split-window -v -t "$SESSION:lead.0" -c "$ROOT" \
  'claude --worktree backend --agent backend'

tmux split-window -v -t "$SESSION:lead.1" -c "$ROOT" \
  'claude --worktree frontend --agent frontend'

tmux new-window -t "$SESSION" -n quality -c "$ROOT" \
  'claude --agent reviewer'

tmux split-window -h -t "$SESSION:quality" -c "$ROOT" \
  'claude --agent security'

tmux split-window -v -t "$SESSION:quality.0" -c "$ROOT" \
  'claude --agent qa'

tmux new-window -t "$SESSION" -n ops -c "$ROOT" \
  'claude --worktree devops --agent devops'

tmux split-window -h -t "$SESSION:ops" -c "$ROOT" \
  'claude --agent a11y'

tmux select-window -t "$SESSION:lead"
tmux attach -t "$SESSION"
