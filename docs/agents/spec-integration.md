# Future spec integration

This lifecycle applies to multi-ticket specifications created after spec #50. Spec #50 and all of its children continue through the earlier executable direct-to-`dev` workflow.

The trusted entry point is the manually dispatched `spec-lifecycle.yml` workflow with one JSON-encoded `SpecLifecycleCommand`. The workflow checks out the trusted implementation from `dev` and invokes `pnpm github:spec:lifecycle -- --command-file <json>` under the GitHub Actions Integration identity; the local runner refuses mutation outside that context. It delegates all issue, branch, pull-request, review, and verification observations to the controlled GitHub/Git adapters, prints a JSON receipt on success, and fails closed when required facts cannot be observed.

## Start and topology

Create `codex/spec-<spec>-<slug>` from the exact current `dev` tip with `scripts/git/codex-task.sh spec-start <spec>-<slug>`, then publish it through the controlled spec lifecycle. The audited wildcard ruleset rejects direct and force pushes and requires pull requests, conversation resolution, `ci`, and affected verification. It has no GitHub App bypass because the global Actions App cannot be a bypass actor for a personal repository. The Spec Lifecycle Orchestrator is the canonical automation, but an Operator with write access can squash-merge a green child pull request. Operational policy requires the orchestrator unless the user explicitly approves a manual exception. Activating the ruleset is a separate repository mutation requiring `--confirm-spec-branch-cutover protected-spec-branches`; ordinary implementation authority does not grant it.

Start each eligible child with `scripts/git/codex-task.sh start <ticket>-<slug> --spec <spec>-<slug>`. Independent children are siblings from the same current spec tip. A child with native blockers stays unassigned and branchless until each blocker is closed with `workflow:spec-integrated`; it then starts from the updated spec tip. Ticket-on-ticket stacking is rejected.

## Child integration

Each child PR targets the spec branch and must be ready, reviewed, conflict-free, and green on `ci` and `affected-browser-verification`. The controlled lifecycle freezes its head, proves its branch parent is the spec branch, squash-merges it, comments exact evidence, closes the ticket with `workflow:spec-integrated`, and updates the final spec checklist. Closing that issue satisfies its native dependencies.

The first integrated child opens one draft PR from the spec branch to `dev`. Its body contains a `mei-pelle-spec-lifecycle:v1` JSON block listing every required child, native blocker, and integrated state. Record the combined review in its `Code-review outcome` section as `Standards: pass` and `Spec: pass`; the controlled adapter observes that evidence. The PR becomes ready only after every child is integrated, both review axes pass, and GitHub reports it conflict-free. The parent spec stays open.

Do not merge routine `dev` movement into the spec branch. An early update is allowed only for a declared dependency or an urgent assumption-breaking change and must use a reviewed controlled operation. Otherwise the Integration Line combines the completed spec with its frozen current `dev` base once, verifies that candidate, and regular-merges it. Completion closes the parent only after GitHub reports that regular merge, preserving child ticket commits behind the visible spec boundary.

## Failure and cancellation

A combined failure is recorded on the final PR as `<!-- mei-pelle-combined-failure:v1 {"reason":"...","responsibleChildNumber":123} -->`; omit `responsibleChildNumber` when ownership is cross-ticket. The controlled verification adapter reads that evidence. A proven child owner reopens that ticket, removes `workflow:spec-integrated`, restores `workflow:review`, and makes the final PR draft. A cross-ticket failure remains owned by spec integration until evidence identifies a child.

Cancellation closes the final PR without merging when one exists, records the reason and replacement issue links on the spec and children, applies `wontfix` to superseded work, and deletes the spec branch. It also works before the first child creates a draft final PR. Independently valuable remnants require newly approved standalone tickets from current `dev`; never partially merge the cancelled branch.
