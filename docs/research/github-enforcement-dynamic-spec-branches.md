# Native GitHub enforcement for dynamic Spec Branches

Research date: 2026-08-09. Scope: GitHub.com behavior and the current `brandon-y-lee/mei-pelle` repository. This note answers which controls can enforce a **Ticket Gate** on pull requests into a dynamic **Spec Branch**, and an **Integration Gate** on pull requests into `dev` or `main`, without a custom service or a new repository-state system.

## Decision summary

GitHub can enforce the two CI boundaries with native repository rulesets and GitHub Actions:

- Use one active branch ruleset for `refs/heads/codex/spec-*`. Require a pull request and one uniquely named `ticket-gate` status check. Repository rulesets can target branch-name patterns with `fnmatch`, so the rule also applies to matching Spec Branches created later. Rulesets are available for this public repository. [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
- Use a second active branch ruleset for the exact `dev` and `main` refs. Require a pull request and one uniquely named `integration-gate` status check. Required checks block a merge until they pass, and multiple rulesets layer instead of selecting only one rule. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- Trigger Actions with `pull_request` branch filters. For that event, `branches` matches the pull request's **base** branch, so `codex/spec-*` selects Ticket PRs while `dev` and `main` select Spec PRs and production-promotion PRs. [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#running-your-pull_request-workflow-based-on-the-head-or-base-branch-of-a-pull-request)

This is sufficient to make each named gate a hard merge condition. It is not sufficient to hard-enforce Ticket Snapshot ancestry, one-ready-Spec-PR queueing, or sub-issue completion. Those facts are not native inputs to branch rules. CI can inspect some of them, but that is custom policy logic rather than native branch enforcement.

## Current repository facts

The current [CI workflow](../../.github/workflows/ci.yml) runs on pushes and pull requests only for `dev` and `main`. Its required-looking job is named `ci`; it always runs install, lint, typecheck, and unit tests, and adds the production build and Chromium verification for every pull request. A Ticket PR whose base is `codex/spec-*` therefore does not run this workflow today.

The GitHub repository is public and [owned by a personal account](https://api.github.com/users/brandon-y-lee). The current remote classic protections require the GitHub Actions `ci` check on [`dev`](https://api.github.com/repos/brandon-y-lee/mei-pelle/branches/dev/protection) and [`main`](https://api.github.com/repos/brandon-y-lee/mei-pelle/branches/main/protection); `dev` uses a loose status policy and `main` uses a strict policy. Two repository rulesets already exist for [`dev`](https://api.github.com/repos/brandon-y-lee/mei-pelle/rulesets/20600548) and [`codex/spec-*`](https://api.github.com/repos/brandon-y-lee/mei-pelle/rulesets/20600549), but both have `disabled` enforcement. GitHub states that disabled rulesets are not enforced. [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#using-ruleset-enforcement-statuses)

Do not activate the existing draft rulesets unchanged. They require check names that the current workflow does not report. A required check that is not reported leaves the pull request blocked. The draft Spec Branch ruleset is also strict and restricts deletion, which conflicts with Ticket Snapshot isolation and temporary-branch cleanup. [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks), [current Spec Branch ruleset](https://api.github.com/repos/brandon-y-lee/mei-pelle/rulesets/20600549)

Classic branch protection and rulesets layer. If classic protection continues to require `ci` while a new ruleset requires `integration-gate`, both requirements apply. The migration must therefore change the existing required context deliberately instead of only adding a new ruleset. [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)

## Actions trigger and check design

One workflow file can host both gates. Its `pull_request` trigger can include `dev`, `main`, and `codex/spec-*`, and jobs can select the gate from `github.base_ref`. GitHub documents that branch filters on `pull_request` select the target branch and accept glob patterns. [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#using-filters)

Use distinct final job names, such as `ticket-gate` and `integration-gate`. GitHub identifies a workflow status check by its job name, and required checks do not distinguish the workflow, matrix, or event that produced a matching name. Reusing `ci` for both boundaries would make the source of the proof ambiguous. [Troubleshooting rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules#troubleshooting-required-status-checks)

Pin each required check to the GitHub Actions app where the rule configuration permits it, and do not configure a ruleset bypass actor if these are intended to be hard merge conditions. GitHub allows a required status check to specify its expected GitHub App; a matching result from another source then cannot satisfy the rule. Ruleset bypasses are explicit configuration. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging), [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository#granting-bypass-permissions-for-your-branch-or-tag-ruleset)

Do not put a `paths`, incompatible branch filter, or commit-message skip in front of a required gate. If the whole workflow is skipped for one of those reasons, its checks stay pending and block the pull request. A job skipped by a job-level `if` condition instead reports success. If a required final job depends on other jobs, give it `if: always()` and make it explicitly fail when a dependency failed; otherwise a skipped dependent job can accidentally satisfy the rule. [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)

A required status check must have completed successfully in the repository during the preceding seven days. Bootstrap the two new job names before replacing the existing `ci` requirement, so enforcement does not begin with checks that cannot yet satisfy the rule. [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## Draft Spec PR behavior

A draft pull request cannot merge until someone marks it ready for review. This is a native hard block and is suitable for an early Spec PR that shows aggregate progress. [Changing the stage of a pull request](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-stage-of-a-pull-request)

Draft status does not by itself defer Actions. `pull_request` runs by default for `opened`, `synchronize`, and `reopened`, and `ready_for_review` is a separate activity type. To avoid the expensive Integration Gate while the Spec PR is draft, include `ready_for_review` in `pull_request.types` and put the draft test on the job. The draft run can skip the job, which reports success, while the draft state still blocks merge; the `ready_for_review` event must then run the real Integration Gate on the same current commit. Omitting `ready_for_review` would leave the earlier skipped-success result able to satisfy the required check after the draft block is removed. [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks#checks)

Draft status cannot enforce “all child Tickets are complete.” Any authorized actor can mark the PR ready. That condition needs a separate CI assertion or remains a documented human step.

## Ruleset details and snapshot isolation

For the Spec Branch ruleset:

- Target `refs/heads/codex/spec-*` and require pull requests, `ticket-gate`, conversation resolution, squash merge, and blocked force pushes. A ruleset pattern applies to future matching branches. [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository#choosing-which-branches-or-tags-to-target)
- Select **Do not require status checks on creation** so the initial Spec Branch can be created from the approved `dev` commit before a Ticket Gate exists for that ref. GitHub exposes this option specifically to allow branch creation regardless of the check result. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
- Do not add a deletion restriction if automatic cleanup must delete the temporary Spec Branch after its Spec PR merges. Restrict-deletion is a separate native rule; omitting it leaves deletion outside this ruleset. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#restrict-deletions)
- Use a **loose** Ticket Gate if Ticket Snapshot isolation means a Ticket branch must not synchronize merely because sibling work advanced the Spec Branch. GitHub's strict policy requires the topic branch to be current with its base and causes additional builds; loose policy accepts the last successful result without requiring that synchronization. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)

The loose policy is an explicit tradeoff, not complete snapshot enforcement. GitHub requires the latest Ticket-branch or test-merge SHA to pass, but a loose rule does not prove compatibility with Spec Branch commits merged afterward. A strict rule supplies that compatibility proof only by requiring an update and another check. Native required-check policy cannot provide both “never refresh independent Ticket Snapshots” and “prove every Ticket against the latest Spec Branch” at the same time. [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#required-check-needs-to-succeed-against-the-latest-commit-sha), [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)

For the `dev` and `main` ruleset, use a **strict** Integration Gate. Strict checks require the Spec PR or promotion PR to be current with its base before merge. If another PR advances `dev` after the Spec Closer's synchronization and Integration Gate, GitHub will block the stale Spec PR until it is updated and checked again. [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)

Rulesets are a better fit than two overlapping classic branch-protection patterns. Only one classic branch-protection rule applies at a time, while all matching rulesets are evaluated and the most restrictive result applies. [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)

## Merge queue

Merge queue is not available to this repository in its current ownership shape. GitHub limits queues to public repositories owned by an organization and private organization repositories on GitHub Enterprise Cloud; `brandon-y-lee/mei-pelle` is a public personal-account repository. [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue#who-can-use-this-feature)

Therefore GitHub cannot natively provide the proposed FIFO queue of ready Spec PRs here. “Only one completed Spec PR is ready at a time” remains a human workflow rule. A strict Integration Gate prevents a stale PR from merging, but it does not control which actor marks which draft ready first.

If the repository later moves to eligible organization ownership, a merge queue can test each queued PR against the latest base and earlier queued changes without asking authors to update their branches. Required Actions workflows must also trigger on `merge_group`; otherwise the required check is never reported and the queued merge fails. A wildcard classic branch-protection rule cannot enable merge queue, so exact rules or rulesets would still be required. [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue#configuring-continuous-integration-ci-workflows-for-merge-queues)

## Sub-issues and issue dependencies

Native sub-issues provide hierarchy, links, and completion progress. Native issue dependencies show which issues are blocked by other issues. GitHub documents both as planning and tracking relationships. [Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues), [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)

Neither relationship is an available branch-ruleset condition. The documented branch rules govern refs, pull requests, reviews, checks, deployments, commit properties, and related code-policy results; they do not include parent-issue progress, child-issue state, or issue dependencies. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

Consequently, native GitHub cannot hard-enforce these lifecycle rules under the stated constraints:

- every Ticket sub-issue is closed before a Spec PR becomes ready or merges;
- a Ticket closes only after its Ticket PR merges;
- the parent Spec closes only after its Spec PR merges; or
- an issue dependency prevents a PR merge.

Closing keywords do not bridge this gap in the proposed topology. GitHub interprets `Closes`, `Fixes`, and `Resolves` in a pull request description only when that pull request targets the repository's default branch. This repository's default branch is `main`, so a Ticket PR into a Spec Branch and a Spec PR into `dev` neither create the keyword link nor auto-close their issues. Ticket and Spec closure must remain explicit workflow steps or be performed by custom automation. [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue#about-linked-issues-and-pull-requests)

CI could query GitHub's live issue hierarchy and fail `integration-gate` when children remain open. That would use GitHub Issues as the existing tracker state, but it still needs custom workflow logic and a deterministic PR-to-Spec link. Sub-issues alone only expose the facts; they do not enforce them. GitHub's CLI and API expose parent, sub-issue, and dependency data for such a check. [Browsing sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/browsing-sub-issues#browsing-issue-hierarchy-with-github-cli), [Editing an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/editing-an-issue#editing-dependencies)

## Enforcement boundary

| Contract | Native hard enforcement | CI can assert | Not hard-enforceable here |
| --- | --- | --- | --- |
| Ticket PR uses a Spec Branch as base | Actions branch filter and Spec Branch ruleset apply when that base matches | CI can reject unexpected base or branch naming | GitHub cannot prove that the base commit is the Ticket Snapshot recorded at claim time without a recorded value and custom comparison |
| Ticket Gate passes before merge | Required `ticket-gate` check on `codex/spec-*` | Gate selects install, lint, typecheck, and unit work | Loose snapshot isolation cannot also prove compatibility with later sibling merges |
| Integration Gate passes before `dev`/`main` merge | Required strict `integration-gate` check on exact refs | Gate selects production build and Chromium verification | Explicit authorization from a Codex conversation is not a GitHub branch-rule condition |
| Draft Spec PR does not merge | Draft PR state | Job condition can defer expensive Integration Gate until `ready_for_review` | “Stay draft until all Tickets close” is not native |
| Ready Spec PRs serialize | Strict checks block stale PRs | CI can reject stale ancestry | FIFO/one-ready-at-a-time queueing is unavailable without eligible organization ownership or an external coordinator |
| Spec completion follows Ticket completion | None from sub-issue hierarchy | Integration Gate can query live child state if custom logic and a Spec link are accepted | Sub-issue progress and issue dependencies do not gate merges or issue closure by themselves |

The smallest enforceable design is therefore two uniquely named jobs, two non-overlapping active repository rulesets, loose Ticket checks, strict Integration checks, and native draft blocking. Queue discipline and issue-lifecycle transitions remain documented human/agent operations unless the project explicitly accepts custom CI assertions or changes repository ownership to gain merge queue.
