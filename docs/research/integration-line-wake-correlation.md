# Integration Line wake and correlation contract

Research date: 2026-08-08

Wayfinder ticket: [Research one reliable Integration Line wake and correlation contract](https://github.com/brandon-y-lee/mei-pelle/issues/95)

## Answer

Use one `workflow_run: completed` event from one consolidated, read-only pull-request Preflight workflow to wake the Dev Integration Line. Run admission, Integration Verification, and finalization as permission-separated jobs in one caller workflow. Integration Verification can remain a reusable workflow, but it must be called as a job rather than started with `workflow_dispatch`.

The exact supported guarantee is:

> One durable logical admission and one effective coordinator for each immutable `(pull request, head SHA, dev base SHA, gate)` key, with at most one Integration Verification job for that key. Extra or repeated wake runs are safe no-ops.

GitHub does not document an exactly-once event or workflow-run primitive. Workflow reruns are supported, and concurrency serializes runs but does not deduplicate events. Therefore, “exactly one physical wake run” is not a valid GitHub Actions guarantee. The recovery specification should require idempotent logical admission instead.

## Recommended contract

### 1. One normal wake source

- Consolidate the required pull-request checks behind one read-only Preflight workflow. Its jobs may run in parallel or call reusable workflows.
- Let only `workflow_run` with `types: [completed]` for that one Preflight workflow wake the Dev Integration Line. Do not subscribe the coordinator to `pull_request_target` label activity or to several independently completing workflow names.
- Treat the event as a hint. Proceed only when the triggering run concluded `success`, then query GitHub again and verify the open pull request, target branch, current head SHA, required-check state, work class, and current `dev` SHA.
- Verify the triggering workflow by its stable workflow identity/path from the API, not only by a display name. The coordinator workflow must already exist on the default branch because GitHub only starts `workflow_run` workflows whose definition is on that branch.

GitHub documents that `workflow_run` can separate an unprivileged workflow from a later workflow with write authority, that the event exposes the triggering conclusion, and that the receiving workflow must exist on the default branch. GitHub also warns that a privileged `workflow_run` must not execute untrusted code or consume untrusted artifacts unsafely. [Events that trigger workflows: `workflow_run`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run) [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout)

### 2. Serialize wakes, but own queue order in repository state

- Use one repository-wide concurrency group, `dev-integration`, with `cancel-in-progress: false` and `queue: max`.
- Do not use Actions run order as Integration Line order. Each admitted coordinator reads eligible pull requests again and selects by the repository's declared priority and ready time.
- Retain a manual `workflow_dispatch` only as an Operator recovery/sweep command. It is not a normal handoff and does not create urgency.

GitHub concurrency permits one running member of a group. With the default `queue: single`, a newer pending run replaces an older pending run even when `cancel-in-progress` is false. `queue: max` retains up to 100 pending runs, but GitHub says start order is not guaranteed. Thus concurrency is a mutual-exclusion and liveness buffer, not the canonical queue. [Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

### 3. Reserve an immutable attempt before verification

- Define the attempt key as `(pull request number, candidate head SHA, frozen dev base SHA, selected gate)`.
- In the trusted admission job, create or find one durable machine record for that key before scheduling Integration Verification. A GitHub check run on the candidate head is suitable: store the full attempt key in `external_id` and link the current workflow run from `details_url`.
- Under the global concurrency lock, an existing record for the key makes later wakes and workflow reruns no-ops. Labels such as `workflow:integration-queued` and `workflow:integration-active` are projections for Operators; they are not the identity or lock.
- If admission is ambiguous or interrupted after reservation, fail closed. Do not automatically create another verification attempt for the same key. Recovery must reconcile the recorded coordinator run or require a new eligible key.

The Checks API supports a caller-supplied `external_id` and `details_url`. Checks writes require a GitHub App token; GitHub documents that each job's `GITHUB_TOKEN` is an installation token for the GitHub Actions App. [REST check runs](https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10#create-a-check-run) [`GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token#about-the-github_token)

### 4. Keep verification inside the caller run

- The admission job uses only the write permissions needed to read state and claim one candidate. It checks out trusted integrated code only.
- The Integration Verification job receives the frozen inputs from admission and has `contents: read` only. It gets no merge, pull-request, issue, Actions-write, or privileged secret authority. It may call a reusable workflow with permissions explicitly downgraded at the calling job.
- The finalization job receives the frozen trusted inputs and the GitHub-controlled verification job result. It must re-query the pull request and `dev`, require unchanged head/base facts, and then either merge or return the candidate to review.
- The finalization job must not trust candidate-authored outputs as authorization. Candidate-produced receipts can remain audit evidence, but merge authority depends on the frozen inputs, GitHub's job result, and a fresh unchanged-input comparison.

GitHub creates a separate `GITHUB_TOKEN` for each job and permits job-level least-privilege settings. A reusable workflow can receive only the caller's permissions or a downgrade, and GitHub exposes a called job's result as `success`, `failure`, `cancelled`, or `skipped`. [Use `GITHUB_TOKEN` for authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token#modifying-the-permissions-for-the-github_token) [Reusable workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#supported-keywords-for-jobs-that-call-a-reusable-workflow) [Contexts: job results](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context)

### 5. Make failure visible in the same run

- Do not use `continue-on-error` for Integration Verification.
- Merge only when the verification job result is `success` and the fresh comparison still matches.
- On verification failure, timeout, changed input, adapter failure, or an uncertain write, the same workflow run records the outcome and fails. It does not report a successful handoff and dispatch another coordinator.
- End with one result-sentinel job using `if: ${{ always() }}`. It must inspect every required `needs.<job>.result` and exit nonzero unless the run took an explicitly valid no-candidate path or completed the expected verified path.
- A bounded finalization/cleanup job can run after failure, but it must preserve a failed overall conclusion. A cancellation is reconciled from the durable attempt record by the manual recovery/sweep path.

GitHub propagates job results through `needs`, and its status functions distinguish success, failure, and cancellation. A dependent job is otherwise skipped after its dependency fails, so the sentinel is the explicit truthful conclusion boundary. [Contexts: `needs.<job_id>.result`](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context) [Status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions) [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## If a separate dispatched verification workflow must remain

The current GitHub REST API has removed the need for display-title polling. With API version `2026-03-10`, `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` returns HTTP `200` with `workflow_run_id`, `run_url`, and `html_url`. The coordinator should call this endpoint directly, persist the returned numeric run ID, and use only that ID for wait, cancellation, artifact download, and evidence. It must send the `X-GitHub-Api-Version: 2026-03-10` header instead of relying on GitHub's older default API version. `run-name` is display text, not an identity contract. [Create a workflow dispatch event](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10#create-a-workflow-dispatch-event) [REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions) [Workflow syntax: `run-name`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name)

This fallback still costs more authority and failure handling:

- Dispatch requires `Actions: write`.
- `workflow_dispatch` always creates a run even when called with `GITHUB_TOKEN`.
- The coordinator must reserve the immutable attempt before the POST and must not automatically retry an ambiguous network result, because the endpoint has no documented idempotency key.
- A dispatch acceptance is not verification success. The parent coordinator must remain failed or in progress until the returned run ID reaches a terminal result.

These constraints make direct dispatch viable, but not the smallest contract. [Create a workflow dispatch event permissions and response](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10#create-a-workflow-dispatch-event) [When `GITHUB_TOKEN` triggers workflow runs](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)

## Rejected options

| Option | Reason |
| --- | --- |
| Label-triggered `pull_request_target` | Labels are mutable display state. Operator or App label changes can create another event, while `GITHUB_TOKEN` suppression is actor-specific. Remove the trigger instead of depending on recursion suppression. |
| `workflow_run` for several required workflows | GitHub starts the subscriber when any named workflow completes. Independent required checks therefore fan out into several wakes. Use one Preflight workflow as the completion boundary. |
| Default Actions concurrency | `queue: single` replaces an older pending run with the newer pending run. It can lose the only useful wake for another ready candidate. |
| Display-title or `run-name` correlation | It is presentation text. The current dispatch REST response supplies the stable numeric workflow run ID directly. |
| GitHub native merge queue | This repository is user-owned. GitHub documents merge queues for organization-owned public repositories and organization-owned private repositories on GitHub Enterprise Cloud. [Merge queue availability](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue#who-can-use-this-feature) |
| Automatic coordinator handoff | It adds a second dispatch whose acceptance can be mistaken for successful work. Retained pending wakes plus a manual recovery sweep provide liveness without hiding the failed attempt. |

## Consequences for the recovery specification

The recovery should plan toward one consolidated Preflight workflow and one caller-shaped Integration Line workflow. It can retain the existing verification steps behind a reusable-workflow boundary, but it should remove normal child dispatch, title/nonce polling, label event triggers, automatic handoff dispatch, and repository-wide `actions: write` from the coordinator.

The implementation acceptance tests should prove:

1. one Preflight completion admits its exact successful PR head at most once;
2. repeated completion events and workflow reruns are no-ops for an existing immutable attempt key;
3. two simultaneous candidates never run Integration Verification at the same time;
4. every admitted key schedules no more than one Integration Verification job;
5. candidate code has no write token and no privileged secrets;
6. verification failure, timeout, cancellation, and changed inputs cannot produce a green Integration Line result or a merge;
7. label changes never wake the Integration Line;
8. an unexpected skipped verification or finalization job produces a failed result sentinel;
9. manual recovery reports the attempt it reconciled and never silently creates urgency or a second verification for the same key.
