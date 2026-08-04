# Catalog Field Ownership

`lib/catalog/field-ownership.ts` is the complete ownership and editor metadata
contract for catalog writers and editor integrations. It is data-only,
compile-time checked against generated Supabase row types, and is not a product
fallback.

## Writer matrix

| Table | Field group | Current writer | Authority |
| --- | --- | --- | --- |
| `products` | display, description, benefits, formula, search and SEO presentation | Published editor | Editorial |
| `products` | sellable and catalog status, routine classification/order, merchandising and swatches | Published editor or reviewed migration | Admin/system |
| `products` | ID, slug, USD currency and timestamps | Database | Immutable |
| `product_variants` | key, label, price, availability, inventory, SKU, options and size | Published editor | Admin/commerce |
| `product_sources` | safe source corrections and formulation notes | Published editor | Admin/supplier |
| `product_sources` | provider identity, hashes, raw verified source and timestamps | Database or reviewed migration | Immutable |
| `product_media` | associations, roles, order, alt text and palette | Published editor | Editorial |
| `product_pdp_content` | structured PDP copy and steps | Published editor | Editorial |
| `product_relationships` | related product, relationship type and ordering | Published editor | Editorial |
| Algolia records and cache entries | all projected fields | Search backfill/webhook and cache invalidation | Derived |

The retired supplier import, presentation refresh, and dedicated media
migration scripts are no longer catalog writers. Supplier or editorial changes
must use the protected editor or a reviewed one-time migration. Search recovery
remains separate and supports `pnpm run search:backfill -- --dry-run`.

The browser-safe role manifest in `lib/catalog/media-roles.ts` owns current
media-role constraints. The editor presents controlled choices, while trusted
server validation and the database boundary enforce product eligibility and
row shape.

## Canonical-only runtime

Runtime and editor writers use one field per visible concept:

```text
display_name
formal_title
card_tagline
editorial_description
editorial_how_to_use
product_pdp_content.how_to_use_steps
products.ingredients
routine_group + routine_step_number + routine_step_name + routine_sort
```

The protected editor uses the ownership manifest in both layers:

- React controls and read-only System Metadata use the role-aware editor
  metadata.
- The server compares every saved, validated and published V3 document with the
  current canonical aggregate and rejects unauthorized, immutable, retired or
  unknown fields.
- `catalog_editor` and `catalog_publisher` may edit normal editorial, PDP,
  media-association and relationship fields. `admin` additionally owns mutable
  supplier, commerce and classification fields.
- Provider IDs, hashes, raw snapshots, identities, timestamps, revisions,
  audit events, Algolia projections and cache entries have no edit path.
- UI treatment is advisory; the server check remains authoritative.

Placeholder reviews in `lib/catalog/product-reviews.ts` are outside this
contract and are not read or written by catalog operations.
