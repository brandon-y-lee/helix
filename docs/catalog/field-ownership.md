# Catalog Field Ownership

`lib/catalog/field-ownership.ts` is the reusable ownership contract for catalog
writers and editor integrations. It is data-only, has no React dependency, and
exposes the editor annotations needed to identify editable, read-only source,
derived, commerce-sensitive, and publish-capability fields.

Supabase remains the canonical runtime catalog. This manifest governs writers;
it is not a product-data fallback.

## Writer Matrix

| Table | Field or field group | Current writer | Intended owner | Default supplier import | Explicit editorial overwrite |
| --- | --- | --- | --- | --- | --- |
| `products` | `display_name`, `formal_title`, `card_tagline`, `editorial_description`, `editorial_how_to_use`, benefits/signals/badge, product facts, `formula_notes`, search/SEO presentation | Presentation refresh; optional recovery from Leaders source; published editor | Editorial | Preserve existing values | Update only exact changed fields |
| `products` | `currency` and sellable status | Leaders import | Commerce | Update | Same as default |
| `products` | ID, slug, publication/catalog status, canonical routine classification/order, merchandising order, swatches, timestamps | Migrations/controlled catalog operations | System | Insert only; never rewrite existing values | Still insert only |
| `product_variants` | variant key, label, price, availability, inventory status, SKU, options and size | Leaders import / published editor | Commerce | Upsert by product and variant key | Same as default |
| `product_variants` | `supplier_variant_id` | Leaders import | Supplier | Upsert by product and variant key | Same as default |
| `product_sources` | supplier identifiers, inspected timestamp/hash, raw verified source and preserved catalog-source snapshot | Leaders import / Phase 1 migration | Supplier | Upsert | Same as default |
| `product_media` | associations, roles, order, alt text and presentation palette | Dedicated media syncs; presentation seed; optional Leaders recovery | Editorial | New-product seed only; preserve existing associations | Targeted Leaders upsert or explicitly requested presentation replacement |
| `product_media` | original supplier URL and filename | Leaders import | Supplier | Stored with a new association only | Updated with the explicitly overwritten association |
| `product_pdp_content` | structured PDP copy and steps | Published editor/migrations | Editorial | Never | Never; supplier and presentation scripts do not write it |
| `product_relationships` | related product, relationship type, and ordering | Published editor / controlled catalog operations | Editorial | Preserve | Preserve |
| Algolia records, cache entries and search documents | all projected fields | Search backfill/webhook and cache invalidation | Derived | Never | Never |

The Leaders import no longer updates collections, routine relationships,
publication state, or derived outputs. `--archive-missing` is a separate,
explicit catalog-lifecycle operation and is not implied by applying the import.

## Command Safeguards

Both broad canonical writers are dry-run by default:

```bash
pnpm run catalog:import:leaders
pnpm run catalog:refresh:presentation
```

Apply safe source/commerce updates or seed missing presentation fields:

```bash
pnpm run catalog:import:leaders -- --apply
pnpm run catalog:refresh:presentation -- --apply
```

An editorial recovery must use the dedicated flag:

```bash
pnpm run catalog:import:leaders -- --apply --overwrite-editorial
pnpm run catalog:refresh:presentation -- --apply --overwrite-editorial
```

Interactive terminals print every product and field, then require the exact
phrase `OVERWRITE EDITORIAL`. Non-interactive jobs must add the separate
`--confirm-editorial-overwrite` flag:

```bash
pnpm run catalog:refresh:presentation -- \
  --apply \
  --overwrite-editorial \
  --confirm-editorial-overwrite
```

`--overwrite-media` additionally requires `--overwrite-editorial`. `--force`
does not enable either behavior.

Dry-run reports contain only slugs, field names and row counts:

- products matched and missing
- planned product inserts and updates
- source/commerce fields updated
- editorial fields seeded, skipped, or explicitly overwritten
- variants and media affected
- archive candidates and errors

They do not print secrets or full product content, upload files, update rows,
replace media, write backups, reindex Algolia, or invalidate caches.

The separate derived search writer also supports
`pnpm run search:backfill -- --dry-run`; canonical import and presentation
scripts never invoke it directly.

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

There is no storefront fallback to the legacy product shadows or
`product_details`. Supplier facts that should not own storefront presentation
remain in `product_sources.raw_source`; they do not silently replace editorial
values. See `docs/catalog/catalog-schema-cleanup.md` for the audited evidence
and exact removal order.

The protected catalog editor uses this same manifest in both layers:

- React controls read the browser-safe `editor` metadata.
- The server compares every saved, validated, and published V2 document with
  the current canonical aggregate and rejects changed system fields, retired
  or unknown fields, and supplier provenance on newly added rows.
- UI treatment is advisory; the server check remains authoritative.

Placeholder reviews in `lib/catalog/product-reviews.ts` are outside this
contract and are not read or written by catalog scripts.
