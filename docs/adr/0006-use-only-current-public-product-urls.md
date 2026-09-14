# Use only current public Product URLs

Customer-facing Product pages, metadata and Product Search use each published Product's current identity. Former Product URLs return 404, including after future renames and explicit replacements. Product Search does not add retired names from historical slugs. Meaningful ingredient and education terms remain searchable.

This supersedes the permanent-redirect consequence in [ADR 0003](0003-compose-product-titles-at-presentation-boundaries.md), following approved Spec #358. The Product-title composition decision is unchanged.

## Consequences

- Historical identifiers stay reserved in a service-only ledger. Preserve original Product provenance, deletion protection, replacement history and the replaced-Product reactivation guard. Private history is not a public forwarding API.
- Canonical Product and metadata readers use public Catalog projections directly. Publication evicts both old and current slug caches; newly published canonical Products do not depend on a deployment-time allowlist.
- Catalog Operators see the exact old and new URLs before publication and are told the old public URL becomes unavailable. Restore retains current identity and discovery fields under [ADR 0005](0005-retain-current-product-identity-when-restoring-content.md).
- Deploy current consumers before contracting the public resolver, ledger grants and route-only webhook. Search records, settings and rules/synonyms require explicit reconciliation. Old alias-dependent deployments cannot be used as a standalone rollback after that contraction.
