# Public product reviews (Ticket #487 / Spec #486)

Source implementation only. No migration was applied remotely, no customer review was published, and no hosted controls changed.

## Boundaries and routes

- `/account/reviews`: verified-account purchase selection, explicit publication consent, submission/edit and withdrawal.
- `/admin/reviews`: active admin-only neutral moderation. Catalog roles do not gain `reviews.moderate`.
- `/products/[slug]`: narrow public projection, aggregate over the complete published set, and bounded cursor pages. Outage is not displayed as zero reviews.
- The existing private-feedback rewards feature remains confidential and unchanged. No private response is copied into a public review.

`HELIX_PUBLIC_REVIEWS_ENABLED=true` enables the application surfaces and submission routes only. It defaults off. Independent database `private.product_review_control.publication_enabled` defaults false and has no customer/operator HTTP toggle. Enabling the application alone never enables public publication. Actual activation needs a separately reviewed migration/environment manifest and authorization.

A purchase must belong to the authenticated, email-confirmed account and have immutable checkout verified-payment evidence bound to its stored session. Refunds do not erase a genuine past purchase. One review exists per account/product/immutable purchase provenance. Sandbox rehearsal and genuine purchases by the same account have separate review identities; neither can overwrite or occupy the other. Initial scope does not claim guest purchases by an email typed into the browser.

The current checkout accepts sandbox orders only. Their reviews can exercise private submission/moderation but are permanently excluded from the genuine PDP projection. The projection checks both review provenance and original Order provenance; changing a review field or application flag cannot convert a demo purchase into a public endorsement. This change does not enable live Stripe checkout. Live commerce remains a separate prerequisite.

## Content and moderation

Only chosen public name, integer stars, title/body, publication date, verified-purchase badge and persisted offer notice enter the public projection. Email, ownership/order identifiers and audit notes remain private. Publication consent is separate from email marketing consent.

All ratings use the same queue and neutral reasons: spam, personal data, threats, unrelated content, promotional claims. Criticism and low ratings are not reasons. Moderators cannot rewrite text. Pending edits leave the previous approved text visible until approved; rejection of an edit preserves the prior approved text. Customer withdrawal clears public visibility and increments its revision; stale approval cannot resurrect it. A published review can be rejected for a neutral reason through the moderation API, removing its public projection. Audit history is retained.

No email invitation, discount or delivery event is created here. `offer_notice` starts false and is not client writable. A future approved campaign must persist genuine offer association; it must never be inferred from a rating or timing. The UI supports the factual disclosure “Received a next-purchase offer; no review required.” No reward depends on sentiment or publication.

## Reliability and proof

Submission serializes per account with a database advisory lock and expected revision, then atomically writes revision/audit state. The unique account/product/provenance constraint is a second dedupe guard. Requests are bounded and same-origin; identity and moderation authority are server-derived and rechecked in SQL. Submission is limited to five accepted revisions per minute per account. Read/mutation functions have fixed search paths and service-only grants; private tables are RLS-enabled with no direct client grants.

Run focused proof:

```
pnpm exec vitest run tests/public-reviews-contract.test.ts tests/public-reviews-requests.test.ts tests/public-reviews-ui.test.tsx tests/product-reviews-section.test.tsx
node scripts/db/test-public-product-reviews.mjs helix-spec358-pg
pnpm typecheck
pnpm lint
```

The SQL runner accepts no database URL, refuses an unlabeled container, creates a uniquely owned disposable database and removes only that database. It uses real checkout schema and verified-payment table definitions. Its explicit future-live fixtures exist only in that temporary database; they are not catalog seeds or application fallbacks. Tests cover ownership, stale revision, concurrent dedupe, RLS, sandbox exclusion, publication gate, full aggregates, pagination and withdrawal. Required independent review and CI gates remain separate.

Author and moderation screens show at most 100 eligible products/pending reviews per read. Moderators can reload after processing the current queue. No bulk-publication/import workflow is included. Real campaign/provider integration and public publication activation require their own reviewed work.

## Local candidate verification (2026-11-13)

Passed: 14 focused review/PDP unit and interaction tests; 9 focused admin capability/module tests; disposable PostgreSQL concurrency/projection harness; typecheck; lint; diff whitespace check.

The first complete Vitest run overlapped another worktree's full run and was interrupted at the delivery lead's direction (exit 130). Observed timeout failures were in unchanged `storefront-reconciliation.test.ts` (2) and `catalog-editor-sections.test.tsx` (7); the latter reached 178 seconds under contention. This is NOT a full-suite pass and does not establish those failures are harmless. Rerun serially after review fixes, without relaxing timeouts. The production build and new browser test have not run; they remain required verification.

Approved provenance delta implemented: submission and owned reads scope by server-derived purchase environment; immutable review provenance prevents promotion, and ID-scoped moderation/withdrawal cannot affect the other environment. Synthetic and future-live SQL fixtures verify isolation for the same account/product.
