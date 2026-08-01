# Catalog Field Ownership

`lib/catalog/field-ownership.ts` is the complete ownership and editor metadata
contract for catalog writers and editor integrations. It is data-only, has no
React dependency, and is compile-time checked against generated Supabase row
types. Every current normalized product and system-history column has explicit
visibility, input, role, validation, diff, preview, publish, import, and
read-only metadata.

Supabase remains the canonical runtime catalog. This manifest governs writers;
it is not a product-data fallback.

## Writer Matrix

| Table | Field or field group | Current writer | Intended owner | Default supplier import | Explicit editorial overwrite |
| --- | --- | --- | --- | --- | --- |
| `products` | `display_name`, `formal_title`, `card_tagline`, `editorial_description`, `editorial_how_to_use`, benefits/signals/badge, product facts, `formula_notes`, search/SEO presentation | Presentation refresh; optional recovery from Leaders source; published editor | Editorial | Preserve existing values | Update only exact changed fields |
| `products` | sellable status | Leaders import / admin editor | Commerce | Update | Same as default |
| `products` | catalog status, canonical routine classification/order, merchandising order, and swatches | Admin editor / controlled catalog operations | System | Insert only; never rewrite existing values | Still insert only |
| `products` | ID, slug, USD currency, and timestamps | Database/architecture | System | Insert only | Immutable in editor |
| `product_variants` | variant key, label, price, availability, inventory status, SKU, options and size | Leaders import / published editor | Commerce | Upsert by product and variant key | Same as default |
| `product_variants` | `supplier_variant_id` | Leaders import | Supplier | Upsert by product and variant key | Same as default |
| `product_sources` | title, URL, original source price, and formulation notes | Leaders import / admin editor | Supplier | Upsert | Same as default |
| `product_sources` | supplier/provider identity, inspected timestamp/hash, raw verified source, and timestamps | Leaders import / database | Supplier/system | Upsert | Immutable in editor |
| `product_media` | associations, roles, order, alt text and presentation palette | Dedicated media syncs; presentation seed; optional Leaders recovery | Editorial | New-product seed only; preserve existing associations | Targeted Leaders upsert or explicitly requested presentation replacement |
| `product_media` | original supplier URL and filename | Leaders import | Supplier | Stored with a new association only | Updated with the explicitly overwritten association |
| `product_pdp_content` | structured PDP copy and steps | Published editor/migrations | Editorial | Never | Never; supplier and presentation scripts do not write it |
| `product_relationships` | related product, relationship type, and ordering | Published editor / controlled catalog operations | Editorial | Preserve | Preserve |
| Algolia records, cache entries and search documents | all projected fields | Search backfill/webhook and cache invalidation | Derived | Never | Never |

The browser-safe role manifest in `lib/catalog/media-roles.ts` defines the two
dedicated Core routine slots. Both remain editorial-owned. The editor fixes
their roles instead of exposing them as arbitrary row values; the
`core_routine_editorial` shape and Core eligibility are also enforced by the
trusted server validation and database boundary.

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

The legacy product shadows and `product_details` no longer exist in the final
schema. Supplier facts that should not own storefront presentation remain in
`product_sources.raw_source`; they do not silently replace editorial values.
See `docs/catalog/catalog-schema-cleanup.md` for the audit evidence and applied
removal.

The protected catalog editor uses this same manifest in both layers:

- React controls and read-only System Metadata displays read the role-aware
  `editor` metadata.
- The server compares every saved, validated, and published V3 document with
  the current canonical aggregate and rejects unauthorized, immutable,
  retired, or unknown fields.
- `catalog_editor` and `catalog_publisher` may edit normal editorial, PDP,
  media-association, and relationship fields. `admin` additionally owns all
  semantically mutable supplier, source, commerce, and classification fields.
- Provider IDs, hashes, raw snapshots, identities, timestamps, revisions,
  audit events, Algolia projections, and cache entries have no edit path.
- UI treatment is advisory; the server check remains authoritative.

Admin edits do not change canonical writer ownership. Supplier-owned values
retain `supplierImport.default = write` and display an overwrite warning, so
future import dry runs continue to report exactly what the supplier writer
would replace. Editorial fields remain preserve-by-default unless the explicit
overwrite recovery flags are supplied.

Placeholder reviews in `lib/catalog/product-reviews.ts` are outside this
contract and are not read or written by catalog scripts.
