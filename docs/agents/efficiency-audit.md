# Verification efficiency audit

The audit window begins with the first successful Integration Line record after
the repository cutover is active and runs for 30 calendar days. Record that
first artifact's completion time as the start and evaluate the complete window
at the same UTC time 30 days later. A pending repository cutover does not start
the clock and does not make the proposed ADRs accepted.

## Evidence sources

- `integration-efficiency-<run>-<attempt>` records one immutable Integration
  Slot result for 30 days. Its schema records implementation-to-integration
  time, preflight time, queue wait, test duration, complete-plan runs, and
  failure classification. The latest ready-for-review, reopen, or deliberate
  review-handoff release is implementation completion; the actual
  `workflow:integration-queued` label event is preflight completion. Queue wait
  begins at that label event and ends at the successful Integration Slot claim;
  implementation-to-integration ends at release. Unknown execution facts remain
  `null` and complete-plan runs remain zero until the verification workflow
  returns observed evidence.
- Integration browser artifacts retain Playwright's structured per-test
  duration, retries, and browser-case executions. Join them to the Integration
  Slot record by pull request and its recorded `workflowRunId`. Successful evidence remains 30
  days and failed evidence remains 90 days.
- Each supported affected check emits one `[affected-verification-result]` JSON
  record with selected capabilities, build reuse, browser-case executions,
  projects, retries, build and test duration, outcome, and failure
  classification. Preserve that record with the ticket's local evidence.
- Staged Production artifacts retain the complete Chromium and WebKit telemetry
  for the exact deployment. Count that pair as one Production complete-plan
  run, separate from Integration Line work.

The records contain timings, hashes, public workflow identities, and outcome
classes only. They exclude secrets, Customer information, raw Catalog facts,
private deployment identifiers, and raw provider payloads.

## Outcome classification

Keep `failed`, `changed`, `timed-out`, `cancelled`, and `unstable` outcomes
distinct. A retry-pass is unstable and is not a reusable successful result.
Only a clean successful run repeated for equivalent inputs is an avoidable
duplicate success. Setup, Catalog, candidate, base, and provider failures remain
failures rather than being removed from the denominator.

## Evaluation

At the evaluation point, report the median and worst implementation-to-
integration, preflight, queue-wait, build, and test duration; total retries and
browser-case executions; capability-selection frequency; local build-reuse
rate; complete-plan runs per integrated pull request; and every failure
classification. Compare the observed steady state with
[`browser-verification.md`](./browser-verification.md).

No sharding or additional workers are authorized during this window. Propose a
change only if the complete 30-day evidence shows lower total cost after browser
installation, production build, Catalog setup, and retained evidence.
