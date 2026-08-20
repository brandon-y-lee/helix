# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

Internal delivery PRs are still required. Each approved `type:ticket` maps to one `codex/<issue-number>-<slug>` branch and one PR targeting its recorded Spec Branch. The final draft Spec PR targets `dev`. Direct urgent, standalone, planning, and trivial paths target `dev`; this does not make unsolicited PRs part of the triage queue. See `docs/agents/engineering-workflow.md`.

## Delivery operations

- **Claim a ticket**: `gh issue edit <number> --add-assignee @me --remove-label ready-for-agent --add-label workflow:in-progress`
- **Mark review-ready**: `gh issue edit <number> --remove-label workflow:in-progress --add-label workflow:review`
- **Establish a Spec Branch**: `scripts/git/codex-task.sh spec-start <spec-number>-<slug>` creates the exact remote-`dev` branch and draft Spec PR before exposing child Tickets.
- **Open the Ticket PR**: `gh pr create --base codex/spec-<spec-number>-<slug> --head codex/<number>-<slug> --title "..." --body-file <path>`
- **Inspect checks**: `gh pr checks <number> --watch`
- **Complete the Ticket**: after Ticket Review and `ticket-gate`, squash-merge into its Spec Branch; comment with the PR, integrated commit, checks, and review result; remove workflow labels and close the Ticket.
- **Complete the Spec**: the sole Spec Closer performs Combined Spec Review, waits for `integration-gate`, then regular-merges the ready Spec PR into `dev`; record evidence and close the Spec.

Specs use `type:spec`. Tickets use `type:ticket`. After `to-tickets` publishes approved children without readiness labels, replace the Spec's `ready-for-agent` label with `workflow:planned`; successful Spec setup exposes the Tickets, and the first Ticket claim moves the Spec to `workflow:in-progress`. Close the Spec only after every required Ticket is closed and its Spec PR is integrated into `dev`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue with `gh api -H "X-GitHub-Api-Version: 2026-03-10"` on the sub-issues endpoint. Where sub-issues aren't available, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api -H "X-GitHub-Api-Version: 2026-03-10" --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
