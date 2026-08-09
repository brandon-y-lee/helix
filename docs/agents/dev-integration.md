# Dev Integration Line

Every ready pull request targeting `dev` enters one repository-owned, non-preemptive Integration Line. The Verification Orchestrator in `scripts/github/verification-orchestrator.ts` owns queue selection, the atomic claim, candidate and base freezing, gate selection, verification handoff, unchanged-input comparison, merge authorization, release, and failure handoff.

## Pull-request contract

The pull-request template declares one path: `standalone ticket`, `completed spec`, `urgent ticket`, `planning`, `documentation`, or `trivial`. Missing or unknown declarations fail closed to verification-system work. Automation never creates urgency. `urgent ticket` moves ahead of normal waiting work only when the user has also approved `workflow:urgent`; it never replaces `workflow:integration-active`.

Planning and documentation work receives `fast-non-runtime` only when every changed path is reviewed as non-runtime. Trivial work additionally requires the pull request's `Fast-path proof` to list every changed path exactly; missing, partial, or extra proof returns it to `workflow:review`. Security, payment, data, provider, cross-cutting, and verification-system work retains the complete behavioral gate.

## Execution

`.github/workflows/dev-integration.yml` is the only automated Dev Integration Line coordinator. It is the only workflow authorized to write Integration Line labels, merge candidate pull requests, or dispatch verification state. The separate Spec Lifecycle Orchestrator may write spec-integration branches and their pull requests, but it does not own the Dev Integration Line. GitHub does not accept its global Actions App as a bypass actor for a personal repository. Repository rules therefore cannot make the coordinator the exclusive merge actor. An Operator with write access can merge a green pull request, but operational policy requires the Integration Line unless the user explicitly approves a manual exception. The coordinator's repository-wide `dev-integration` concurrency group has cancellation disabled and serializes coordinator processes. Within a process, the GitHub adapter also serializes claim requests, rereads the repository after label mutation, and accepts a claim only when exactly one active owner matches the frozen candidate; otherwise it compensates by releasing the attempted owner. It runs trusted `dev` code with the write token, adds `workflow:integration-queued`, claims at most one `workflow:integration-active`, and never executes candidate code.

The coordinator retains the ephemeral repository `GITHUB_TOKEN` for queue labels,
inspection, and verification dispatch. Only the final, unchanged-input merge API
request receives the repository-scoped fine-grained token stored as
`INTEGRATION_MERGE_TOKEN`. That user-token-authored merge emits the protected
`dev` push event, allowing CI to verify the exact integrated SHA and its signed
Verification Receipt. The adapter fails before queue selection when the secret
is absent and never places its value in command arguments or retained telemetry.
The token requires only `Contents: read and write` for this repository and must
be rotated through the Actions secret without committing it to the repository.

The coordinator dispatches `.github/workflows/dev-integration-verification.yml` with the exact pull request, candidate head, `dev` base, gate, and correlation nonce. That separate workflow has read-only repository permission, creates a two-parent candidate from those exact commits, and runs frozen install, lint, typecheck, and unit tests. The complete behavioral gate additionally runs the existing receipted production build and Chromium verification. Fast non-runtime work does not build the Storefront, access the Catalog, or launch browser verification.

The Integration Slot timer starts immediately after a successful claim and is bounded to 20 minutes across candidate preparation, verification, the unchanged-input check, and merge. The coordinator job has a separate 30-minute ceiling so the slot timer can abort controlled adapters and release labels before Actions terminates the job. A job claims at most one candidate: after failure, timeout, adapter failure, or changed inputs, it releases that candidate and dispatches a fresh trusted coordinator run for automatic handoff. This prevents a second full slot from inheriting an expiring job deadline. Cancellation releases the slot without redispatching. Review handoffs are ineligible until `workflow:review` is deliberately removed after correction.

Every attempt retains a 30-day `integration-efficiency-<run>-<attempt>` record
with the public Integration Slot transition, outcome class, actual queue-label
timestamp, verification workflow run ID, and timing fields. The coordinator
writes the attempt before requesting a handoff so a failed dispatch cannot erase
an unsuccessful candidate. Browser and local-build metrics come back through the
verification workflow's compact structured artifact; facts that were not
observed remain `null`. The join and evaluation contract is
[`efficiency-audit.md`](./efficiency-audit.md).

## Configuration cutover

`pnpm github:workflow:plan` audits the labels, classic protections, default Actions token permissions, GitHub Actions integration identity, and the `dev pull request integration` ruleset without changing GitHub. The proposed cutover sets the repository default token to read-only and forbids token-authored review approval. Every workflow except the exactly audited Dev Integration Coordinator and Spec Lifecycle Orchestrator is explicitly read-only, with narrow audited exceptions: scheduled browser verification receives only `issues: write`; Production preauthorization receives `pull-requests: write` only to prepare the checked release PR; the separately authorized Production Promotion job receives `contents` and `pull-requests` write; and Production Rollback receives only `issues: write` after restoring the recorded deployment. The ruleset requires pull requests, conversation resolution, and the independent `ci`, verification-system browser, and Windows lifecycle checks from the observed GitHub Actions App. It prevents deletion and force pushes. It has no bypass actor, exclusive-update rule, or self-referential `dev-integration` check. This is the approved personal-repository policy: the Integration Coordinator is canonical automation, but GitHub does not enforce it as the only merge actor. Integration, release, scheduled-issue, and attestation writers still use exact least-privilege maps, and the trusted integration workflow definitions must already exist on remote `main` before cutover. `dev` does not require an up-to-date head because the coordinator freezes and verifies the exact current base; `main` remains strict.

GitHub dispatches `pull_request_target`, `workflow_run`, and manual lifecycle operations only from workflow definitions present on the default branch. Because `main` is Mei Pelle's default and Production branch, merging this implementation into `dev` does not by itself activate the integration workflows. The workflow files must reach `main` through the separately inspected and explicitly authorized Production promotion before the authority ruleset is applied. Cutover planning fails closed until all three trusted integration workflows exist on remote `main`; never cut over a ruleset whose trusted writer is absent from the default branch.

Do not apply the cutover without separate explicit user approval. After reviewing a clean plan and running the complete CI-equivalent gate at the exact `dev` SHA, the approved command must include all confirmations:

```bash
pnpm github:workflow:apply \
  --confirm-repo brandon-y-lee/mei-pelle \
  --confirm-dev-sha <audited-dev-sha> \
  --confirm-ci-sha <same-CI-verified-sha> \
  --confirm-integration-cutover dev-integration-authority \
  --confirm-spec-branch-cutover protected-spec-branches \
  --confirm-integration-app-id <app-id-printed-by-plan>
```

The cutover is a repository mutation. It is not part of ordinary ticket integration and must never be inferred from an implementation request.
