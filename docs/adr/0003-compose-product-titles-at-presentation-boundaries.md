# Compose Product titles at presentation boundaries

The Catalog stores Product Display Name and Product Type as separate canonical facts and does not retain a Formal Product Title or card-specific tagline. Customer-facing surfaces may compose those facts when a combined label is useful, while System Step Name and Product Number remain separate; this avoids divergent names across cards, PDPs, search, and administration while allowing richer Product Education to evolve independently.

## Consequences

- Product URLs use Display Name slugs without System Step or order tokens, and replaced public slugs receive permanent redirects.
- Cards and PDPs render the canonical Product Type directly instead of maintaining separate subtitle copy.
