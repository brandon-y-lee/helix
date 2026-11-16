# Testing strategy

Choose the smallest set of tests that detects distinct, plausible regressions in the affected contract. Name the failure each test would catch. Prefer observable behavior at a stable boundary over checks of helper wiring or implementation details. Use TDD at the seams approved for implementation Tickets; an existing test can be the red test.

## Select proof

- Check existing Vitest, database, and browser coverage before adding a test. Extend an existing test when it clearly proves the new behavior.
- For a behavior change, select a representative success and the failures needed to prove distinct, consequential boundaries. Add permutations only when they can fail independently.
- Use a disposable local database for RLS, transaction, and concurrency guarantees. Use browser tests for essential user interactions and accessibility. Test the same outcome at multiple layers only when each layer catches a different failure mechanism or integration boundary.
- For copy, styling, and other changes without a plausible behavior regression, use appropriate inspection and required checks without adding a test by default.

## Keep admin coverage proportional

Use a small number of interaction tests for changed Operator screens. Prefer server and database proof for Operator authorization, private reads, privileged writes, external side effects, and idempotency. An infrequently used screen can have thin presentation coverage; the impact of unauthorized access or an accidental send still warrants direct proof.

## Prune with an assertion map

Before consolidating or removing affected tests, list their unique behaviors and failure modes and identify the retained executable proof for each material risk. Remove repeated presentation, mock setup, and same-outcome permutations. Share fixtures and runner setup when that makes the retained tests clearer. Preserve every outcome named by an approved specification unless retained proof covers it equivalently, especially private data, payment-linked facts, idempotency, and recovery.

Run focused checks while editing. If a local database or browser cannot run, report that limit; mocks do not replace their proof. The existing CI `ticket-gate` and `integration-gate` run their complete required suites before merge. Report tests added, updated, consolidated, removed, or intentionally omitted, with the reason. This guide selects tests; it does not change the CI gates in [engineering workflow](./engineering-workflow.md).
