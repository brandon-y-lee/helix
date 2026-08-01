# Catalog Data Contract

Source file for audit tooling:

```text
scripts/catalog/canonical-catalog-manifest.ts
```

This manifest is not a runtime product fallback. It exists so scripts and tests can detect duplicate/outdated Supabase rows and verify the current commerce catalog contract.

## Active Commerce Products

| product | slug | group | label |
| --- | --- | --- | --- |
| CLEANSE | `cleanse-01-calming-gel-cleanser` | `core` | `01 - The Core` |
| TREAT | `treat-03-pdrn-5-ampoule` | `core` | `02 - The Core` |
| SEAL | `seal-05-green-collagen-cream` | `core` | `03 - The Core` |
| REFINE | `refine-02-pore-treatment-pads` | `beyond_core` | `Beyond The Core` |
| FRAME | `frame-04-pdrn-eye-cream` | `beyond_core` | `Beyond The Core` |
| LIFT | `lift-06-pdrn-mask-system` | `beyond_core` | `Beyond The Core` |

PROTECT is editorial-only and must not be inserted as an active commerce product unless a future task explicitly creates a verified catalog item.

## Routine classifications

The storefront groups products by the canonical `products.routine_group`
values:

- `core`
- `beyond_core`

Display labels and collection-shaped cache tags are derived from that
classification. There is no standalone `collections` table in the final
catalog schema.

## Catalog Editor Contract

The protected admin editor uses `ProductEditorDocumentV3`, a complete typed
aggregate of `products`, `product_pdp_content`, active `product_variants`,
active `product_media`, active `product_relationships`, and the optional
`product_sources` row. `lib/catalog/field-ownership.ts` is the canonical field
matrix. Draft, revision, and audit rows appear separately as read-only System
Metadata; Algolia and Next.js cache records are derived and never editable.

Normal editorial/PDP/media-association/relationship changes are available to
catalog editors. Variants, supplier facts, safe source corrections, catalog
state, routine classification/order, and swatches require `admin`. UUIDs,
parent foreign keys, timestamps, provider identity, hashes, raw source,
revision/audit fields, slug, and USD currency remain visible but immutable.
Publishing is a service-role-only atomic RPC with membership-role,
optimistic-version, and base-revision checks.

## Relationship Contract

For `complete_the_routine`, the current active shape is:

```text
6 active commerce products x 5 related products = 30 rows
```

No relationship should involve inactive old product IDs or PROTECT as commerce.

## Legacy Seed Cleanup Targets

The original development seed catalog rows are cleanup candidates only when archived and unreferenced by protected tables:

- `groundwork-gel-cleanser`
- `meridian-daily-moisturizer`
- `northpoint-renewal-serum`
- `summit-mineral-spf`
- `lowtide-recovery-cream`
- `clearview-eye-concentrate`

If any of these slugs ever has cart/order references, do not hard-delete it.

## Adding a Product

1. Add verified source facts to the controlled catalog source or a reviewed migration.
2. Upsert by stable slug and variant natural keys.
3. Add canonical routine classification and ordering deliberately.
4. Update `scripts/catalog/canonical-catalog-manifest.ts` if the active commerce set changes.
5. Run `pnpm run db:verify`.
6. Run `pnpm run search:reindex`.

## Removing or Archiving a Product

1. Archive first with `catalog_status = 'archived'`.
2. Check cart/order/history references.
3. Leave historical snapshots untouched.
4. Hard-delete only if the row is proven seed/generated, archived, backed up, and unreferenced by protected tables.
5. Reindex search after cleanup.
