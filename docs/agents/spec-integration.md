# Future spec integration

This lifecycle applies to multi-ticket specifications created after spec #50. Spec #50 and all of its children continue through the earlier executable direct-to-`dev` workflow.

## Start and topology

Create `codex/spec-<spec>-<slug>` from the exact current `dev` tip with `scripts/git/codex-task.sh spec-start <spec>-<slug>`, then publish it through the controlled spec lifecycle. The audited wildcard ruleset rejects direct and force pushes, requires pull requests, conversation resolution, `ci`, and `affected-browser-verification`, and permits child integration only through the orchestrator's squash operation. Activating that ruleset is a separate repository mutation requiring `--confirm-spec-branch-cutover protected-spec-branches`; ordinary implementation authority does not grant it.

Start each eligible child with `scripts/git/codex-task.sh start <ticket>-<slug> --spec <spec>-<slug>`. Independent children are siblings from the same current spec tip. A child with native blockers stays unassigned and branchless until each blocker is closed with `workflow:spec-integrated`; it then starts from the updated spec tip. Ticket-on-ticket stacking is rejected.

## Child integration

Each child PR targets the spec branch and must be ready, reviewed, conflict-free, and green on `ci` and `affected-browser-verification`. The controlled lifecycle freezes its head, proves its branch parent is the spec branch, squash-merges it, comments exact evidence, closes the ticket with `workflow:spec-integrated`, and updates the final spec checklist. Closing that issue satisfies its native dependencies.

The first integrated child opens one draft PR from the spec branch to `dev`. Its body contains a `mei-pelle-spec-lifecycle:v1` JSON block listing every required child, native blocker, and integrated state. It becomes ready only after every child is integrated and combined Standards/Spec review passes. The parent spec stays open.

Do not merge routine `dev` movement into the spec branch. An early update is allowed only for a declared dependency or an urgent assumption-breaking change and must use a reviewed controlled operation. Otherwise the Integration Line combines the completed spec with its frozen current `dev` base once, verifies that candidate, and regular-merges it. Completion closes the parent only after GitHub reports that regular merge, preserving child ticket commits behind the visible spec boundary.

## Failure and cancellation

A combined failure with a proven child owner reopens that ticket, removes `workflow:spec-integrated`, restores `workflow:review`, and makes the final PR draft. A cross-ticket failure remains owned by spec integration until evidence identifies a child.

Cancellation closes the final PR without merging, records the reason and replacement issue links on the spec and children, applies `wontfix` to superseded work, and deletes the spec branch. Independently valuable remnants require newly approved standalone tickets from current `dev`; never partially merge the cancelled branch.
