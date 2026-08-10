# Compose Product titles at presentation boundaries

The Catalog stores Product Display Name and Product Type as separate canonical facts and does not retain a Formal Product Title or card-specific tagline. Customer-facing surfaces may compose those facts when a combined label is useful, while System Step Name and Product Number remain separate; this avoids divergent names across cards, PDPs, search, and administration while allowing richer Product Education to evolve independently.

## Consequences

- Where a combined Customer-facing label is useful, surfaces compose exactly `Product Display Name — Product Type`; Product Type uses normal sentence case, and Product Number remains secondary rather than appearing in the primary card or PDP heading.
- Product URLs use Product Display Name slugs without System Step Name, System Position, or Product Number tokens, and replaced public slugs receive permanent redirects.
- Cards and PDPs render the same canonical Product Type directly instead of maintaining separate subtitle copy.
