---
status: proposed
---

# Attest browser verification and promote tested artifacts

Routine Browser Verification produces a signed GitHub custom attestation over the tested runtime, production build, non-secret configuration, Browser Verification Plan, and Catalog fingerprint. Integration and release automation reuses a result only when those inputs still match; Production is built as a staged Vercel deployment, tested once in Chromium and WebKit, inspected, authorized, and promoted as the same deployment rather than rebuilt. This content-addressed receipt replaces commit-SHA-only confidence because squash merges, non-runtime changes, mutable Catalog facts, and environment-specific builds make a commit alone an unsafe or unnecessarily narrow verification identity.

The proposed receipt and release contracts are defined in [`../agents/browser-verification.md`](../agents/browser-verification.md).

## Consequences

- Receipts contain hashes and identifiers, not secrets, Customer information, or raw Catalog data, and remain available for the repository lifetime.
- A clean pass is required: a retry-pass, Catalog change, candidate change, or mismatched staged deployment cannot produce a reusable receipt.
- Successful reports and timing data remain available for 30 days; failed reports, screenshots, and traces remain available for 90 days.
- Catalog Publish keeps bounded Catalog, cache, search, Product Offer, PDP, and Product Media checks instead of triggering the complete browser suite.
