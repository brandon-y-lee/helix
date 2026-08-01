# Catalog Schema Cleanup

Status: Phase 2 complete against approved non-production project
`erasogmsqpgiirovubjh` on 2026-07-30. Migration
`20260730125644_prune_legacy_catalog_schema.sql` removed only the audited
legacy schema after the Phase 1 application was deployed and verified. No
product UUID or immutable revision was changed.

## Decision summary

Supabase remains the catalog authority. The final product model separates:

- `products`: canonical identity, merchandising copy, product facts, routine
  placement, SEO, and stable product-level status.
- `product_variants`: current sellable offers, prices, SKU/options,
  availability, inventory state, and supplier variant identity.
- `product_media`: product-controlled media associations, roles, ordering,
  dimensions, placeholder palettes, and source provenance.
- `product_pdp_content`: structured, product-specific PDP narratives.
- `product_relationships`: explicit discovery relationships.
- `product_sources`: supplier identity, inspection metadata, and raw source
  provenance. This is not a storefront fallback.
- `product_content_drafts`, `catalog_product_revisions`, and
  `catalog_editor_audit_log`: private editor workflow and immutable history.

The final routine model is only `routine_group`, `routine_step_number`,
`routine_step_name`, and `routine_sort`. Labels such as “The Core” are derived
at presentation boundaries. `sort_order` remains the general merchandising
order. Routine-group presentation is derived from canonical product fields;
the unreferenced standalone `collections` table was removed in Phase 2.

Consumer codes used below:

| Code | Consumer |
| --- | --- |
| SF | Storefront projections, metadata, PDP, cards, `/products`, `/system`, Core and discovery |
| ED | Admin aggregate, V3 draft/validation/diff/publish, and preview |
| AL | Algolia source/record/sync |
| CA | Cache projections, tags, and signed webhook invalidation |
| CO | Authoritative cart/checkout validation or immutable order snapshot input |
| IM | Leaders import, presentation refresh, seed, or media synchronization |
| PR | Supplier provenance only |
| DB | Database identity, constraints, lifecycle, RLS, or audit |

Counts are exact before applying the Phase 1 migration and are shown as
`non-null rows / distinct non-null values`. There are six products and six
variants. Counts that change in Phase 1 are called out explicitly.

## `products` inventory and disposition

This table preserves the pre-prune audit evidence. Phase 1 made canonical
fields required and stopped active readers/writers from using the candidates;
Phase 2 removed every row marked for removal.

| Column | Type; pre-Phase-1 null/default | Count | Consumers / duplication evidence | Disposition |
| --- | --- | ---: | --- | --- |
| `id` | uuid; NN; `gen_random_uuid()` | 6/6 | SF ED AL CA CO IM DB; PK and referenced by every child table | keep |
| `slug` | text; NN | 6/6 | SF ED AL CA CO IM; unique route/search identity | keep |
| `name` | text; NN→nullable | 6/6 | Equals `display_name` for 6/6; removed from runtime/editor/import writes | removed in Phase 2 |
| `tagline` | text; NN→nullable | 6/6 | Equals `card_tagline` for 6/6 | removed in Phase 2 |
| `collection` | text; NN→nullable | 6/2 | Duplicates `routine_group`; labels are derived | removed in Phase 2 |
| `blurb` | text; NN→nullable | 6/6 | Equals `card_tagline` for 6/6 | removed in Phase 2 |
| `description` | text; NN→nullable | 6/6 | Equals `editorial_description` for 6/6 | removed in Phase 2 |
| `benefits` | text[]; NN; `{}` | 6/6 | SF ED AL IM | keep |
| `how_to_use` | text; NN→nullable | 6/6 | Equals `editorial_how_to_use` for 6/6 | removed in Phase 2 |
| `swatch_from` | text; NN | 6/6 | SF ED IM, visual token | keep |
| `swatch_to` | text; NN | 6/6 | SF ED IM, visual token | keep |
| `position` | integer; NN→nullable; `0` | 6/6 | Equals `sort_order`; removed from queries and writers | removed in Phase 2 |
| `created_at` | timestamptz; NN; `now()` | 6/6 | DB | keep |
| `status` | text; NN; `available` | 6/1 | SF ED AL CA CO IM; product-level sellable status | keep |
| `made_for` | text; nullable | 6/6 | SF ED AL IM; not equivalent to skin types | keep |
| `good_for` | text; nullable | 6/6 | SF ED AL IM; concise benefit statement, not `concerns` | keep |
| `texture` | text; nullable | 6/6 | SF ED AL IM | keep |
| `action_name` | text; nullable | 6/6 | Equals `display_name`; no canonical consumer | removed in Phase 2 |
| `routine_number` | text; nullable | 3/3 | Padded duplicate of `routine_step_number` | removed in Phase 2 |
| `subtitle` | text; nullable | 6/6 | Equals `card_tagline` | removed in Phase 2 |
| `descriptor` | text; nullable | 6/6 | Equals `editorial_description` | removed in Phase 2 |
| `product_type` | text; nullable→NN | 6/6 | SF ED AL IM | keep |
| `catalog_status` | text; NN; `active` | 6/1 | SF ED AL CA CO IM DB; publication lifecycle | keep |
| `badge` | text; nullable | 0/0 | SF ED AL IM; valid optional merchandising field | keep |
| `currency` | text; NN; `USD` | 6/1 | SF ED AL CO IM; constrained to USD | keep |
| `featured_rank` | integer; nullable | 6/6 | Equals current `sort_order`; removed from query ordering | removed in Phase 2 |
| `sort_order` | integer; nullable→NN | 6/6 | SF ED AL IM; general merchandising order | keep |
| `published_at` | timestamptz; NN; `now()` | 6/6 | SF ED AL CA DB | keep |
| `updated_at` | timestamptz; NN; `now()` | 6/6 | SF ED AL CA DB; trigger maintained | keep |
| `key_ingredients` | text[]; NN; `{}` | 6/6 | SF ED AL IM | keep |
| `ingredients` | text; nullable | 4/4 | SF ED IM; only canonical full INCI; legacy “unavailable” notices are not data | keep |
| `product_details` | jsonb; NN; `{}` | 6/6 | Legacy mixed bag; all source facts are snapshotted in `product_sources.raw_source.catalogProduct` | removed in Phase 2 after snapshot verification |
| `cautions` | text[]; NN; `{}` | 6/1 | SF ED IM | keep |
| `finish` | text; nullable | 6/6 | SF ED AL IM | keep |
| `volume` | text; nullable | 6/6 | SF ED AL IM; product display volume | defer relationship with variant `volume` |
| `skin_types` | text[]; NN; `{}` | 6/1 | SF ED AL IM | keep |
| `concerns` | text[]; NN; `{}` | 6/6 | SF ED AL IM; GIN indexed | keep |
| `routine_step` | text; nullable | 3/3 | Equals `routine_step_name` | removed in Phase 2 |
| `routine_order` | integer; nullable | 6/6 | Superseded by `routine_sort` | removed in Phase 2 |
| `usage_time` | text[]; NN; `{}` | 6/4 | SF ED AL IM | keep |
| `seo_title` | text; nullable | 6/6 | SF ED AL IM; metadata projection | keep |
| `seo_description` | text; nullable | 6/6 | SF ED AL IM; metadata projection | keep |
| `search_keywords` | text[]; NN; `{}` | 6/6 | ED AL IM | keep |
| `display_name` | text; nullable→NN | 6/6 | SF ED AL CA CO IM; canonical customer-facing short name | keep |
| `formal_title` | text; nullable→NN | 6/6 | SF ED AL CO IM; canonical product title | keep |
| `card_tagline` | text; nullable→NN | 6/6 | SF ED AL IM; canonical short merchandising copy | keep |
| `editorial_description` | text; nullable→NN | 6/6 | SF ED AL IM; canonical description | keep |
| `editorial_how_to_use` | text; nullable→NN | 6/6 | SF ED AL IM; canonical prose instructions | keep |
| `formula_notes` | text[]; NN; `{}` | 6/6 | SF ED IM | keep |
| `routine_group` | text; nullable→NN | 6/2 | SF ED AL CA IM; `core` or `beyond_core` | keep |
| `routine_group_label` | text; nullable | 6/2 | Derivable from `routine_group` | removed in Phase 2 |
| `routine_step_number` | integer; nullable | 3/3 | SF ED AL IM; Core-only sequence 1–3 | keep |
| `routine_step_name` | text; nullable | 3/3 | SF ED AL IM; Core-only Cleanse/Treat/Seal | keep |
| `routine_display_label` | text; nullable | 6/4 | Derivable from canonical routine fields | removed in Phase 2 |
| `routine_sort` | integer; nullable→NN | 6/6 | SF ED AL IM; 10/20/30 and 110/120/130 | keep |
| `legacy_routine_group_label` | text; nullable | 6/2 | Explicit legacy duplicate | removed in Phase 2 |
| `legacy_routine_display_label` | text; nullable | 6/6 | Explicit legacy duplicate | removed in Phase 2 |

### `product_details` JSON inventory

| Key | Rows | Finding | Disposition |
| --- | ---: | --- | --- |
| `feelsLike` | 6 | Duplicates first-class `texture` | preserve in source snapshot; remove with JSON column |
| `finish` | 6 | Duplicates first-class `finish` | preserve in source snapshot; remove |
| `goodFor` | 6 | Duplicates first-class `good_for` | preserve in source snapshot; remove |
| `volume` | 6 | Duplicates first-class `volume` | preserve in source snapshot; remove |
| `whenToUse` | 6 | Supplier phrasing represented canonically by `usage_time` | preserve in source snapshot; remove |
| `whereItFits` | 6 | Supplier routine prose; no storefront reader | preserve in source snapshot; remove |
| `packCount` | 2 | Duplicates applicable variant `pack_count` | preserve in source snapshot; remove |
| `pdrn` | 2 | Supplier formulation fact already retained in source provenance and canonical PDP/formula content | preserve in source snapshot; remove |
| `positioning` | 1 | Supplier positioning copy; not storefront authority | preserve in source snapshot; remove |
| `sourceFullInci` | 3 | TREAT is a complete list and matches `ingredients`; CLEANSE and SEAL are explicit unavailable notices | preserve source snapshot; no current backfill; remove |

The migration refuses conflicting populated `ingredients` and
`sourceFullInci`. It only accepts a non-placeholder, comma-delimited source
with at least five ingredients and only fills a blank canonical field. The
linked apply updated zero `ingredients` rows: CLEANSE and SEAL correctly remain
blank instead of turning unavailable notices into fabricated full INCI.

## Other catalog tables

### `product_variants` (6 rows)

| Column | Type; null/default | Count | Use and disposition |
| --- | --- | ---: | --- |
| `id` | uuid; NN; generated | 6/6 | PK; ED CO IM DB — keep |
| `product_id` | uuid; NN | 6/6 | FK products cascade; SF ED AL CA CO IM — keep |
| `variant_key` | text; NN | 6/6 | active natural key; SF ED AL CO IM — keep |
| `label` | text; NN | 6/6 | SF ED AL CO IM — keep |
| `price_cents` | integer; NN | 6/6 | authoritative integer price; SF ED AL CO IM — keep |
| `position` | integer; NN→nullable; `0` | 6/1 | equals `sort_order`; no reader/writer after Phase 1 — removed in Phase 2 |
| `sku` | text; nullable | 3/3 | unique when present; ED CO IM — keep |
| `supplier_variant_id` | text; nullable | 6/6 | supplier identity; ED IM PR — keep |
| `option_values` | jsonb; NN; `{}` | 6/6 | SF ED CO IM — keep |
| `compare_at_price_cents` | integer; nullable | 0/0 | valid optional offer fact; SF ED AL CO IM — keep |
| `available` | boolean; NN; true | 6/1 | volatile commerce authority; SF ED AL CA CO IM — keep |
| `inventory_status` | text; NN; `in_stock` | 6/1 | volatile commerce authority; SF ED AL CA CO IM — keep |
| `volume` | text; nullable | 6/6 | option-specific display size; defer product/variant normalization |
| `pack_count` | integer; nullable | 2/2 | option-specific package count — keep |
| `sort_order` | integer; nullable→NN | 6/1 | canonical variant order, backfilled from `position` — keep |
| `updated_at` | timestamptz; NN; now | 6/6 | trigger/webhook freshness — keep |
| `archived_at` | timestamptz; nullable | 0/0 | lifecycle/history — keep |

### `product_media` (63 rows)

| Column | Type; null/default | Count | Use and disposition |
| --- | --- | ---: | --- |
| `id` | uuid; NN; generated | 63/63 | PK; ED IM DB — keep |
| `product_id` | uuid; NN | 63/6 | FK products cascade; SF ED AL CA IM — keep |
| `variant_id` | uuid; nullable | 0/0 | valid FK for future/current option media; no evidence to remove — defer |
| `media_type` | text; NN; `image` | 63/2 | canonical image/video discriminator; SF ED AL IM — keep |
| `url` | text; nullable | 33/24 | asset payload; SF ED AL IM — keep |
| `alt` | text; NN | 63/54 | accessibility/editorial; SF ED AL IM — keep |
| `width` | integer; nullable | 33/9 | layout and validation; SF ED IM — keep |
| `height` | integer; nullable | 33/9 | layout and validation; SF ED IM — keep |
| `role` | text; NN; `gallery` | 63/13 | purpose-specific projections; SF ED AL CA IM — keep |
| `sort_order` | integer; NN; `0` | 63/12 | canonical association order; SF ED IM — keep |
| `original_source_url` | text; nullable | 0/0 | source provenance supported by import — keep |
| `source_filename` | text; nullable | 33/24 | operational reconciliation used by media sync scripts — keep |
| `created_at` | timestamptz; NN; now | 63/6 | DB — keep |
| `updated_at` | timestamptz; NN; now | 63/6 | trigger/webhook freshness — keep |
| `media_kind` | text; NN→nullable; `image` | 63/2 | duplicates URL/palette payload state, not actual image/video type — removed in Phase 2 |
| `palette_id` | text; nullable | 30/30 | placeholder identity — keep |
| `placeholder_palette` | jsonb; NN; `{}` | 63/28 | placeholder payload; SF ED IM — keep |
| `archived_at` | timestamptz; nullable | 0/0 | lifecycle/history — keep |

Payload and editorial-role checks now use only `media_type`, `url`,
dimensions, and `placeholder_palette`. Phase 2 also removed the unused
`campaign` value from the role constraint.

### `product_pdp_content` (6 rows)

Every column is canonical and retained. `product_id` is the PK/FK (6/6);
`schema_version` is smallint NN default 1 (6/1); optional structured fields are
`profile_title_tokens` (3/3), `routine_overlay` (3/3),
`outcome_heading` (3/3), `outcome_labels` (3/3),
`application_steps` (3/3), `ingredient_story` (3/3), and
`routine_guidance` (3/3). `how_to_use_steps` and `ingredient_cards` are
populated for all six (6/6 each). `created_at` and `updated_at` are NN
timestamps (6/1 each before future writes). SF, ED, CA, and IM use this table;
the signed webhook covers changes.

### `product_relationships` (30 rows)

All columns are retained: `product_id` (30/6) and `related_product_id` (30/6)
form the composite FK identity with `relationship_type` (30/1, currently
`complete_the_routine`); `sort_order` (30/5) controls discovery order;
`created_at` (30/2) and nullable `archived_at` (0/0) preserve lifecycle.
Self-links are forbidden. SF, ED, and IM consume this table. Relationship
changes continue through the existing cache invalidation path.

### `product_sources` (6 rows)

All columns are provenance and retained: PK/FK `product_id` (6/6), `supplier`
(6/1), `supplier_title` (6/6), `supplier_url` (6/6), `supplier_handle` (6/6),
nullable `supplier_product_id` (6/6), `source_inspected_at` (6/1), nullable
`source_content_hash` (6/6), nullable `original_source_price_cents` (6/6),
nullable `formulation_version_notes` (6/2), `raw_source` JSON (6/6), and
created/updated timestamps (6/6 each). IM and PR own this server-only table.
Phase 1 adds `raw_source.catalogProduct` once per product and never replaces an
existing snapshot.

### `collections` (4 rows)

The removed table contained `id`, `slug`, `name`, nullable `description`,
`sort_order`, `is_active`, `created_at`, and `updated_at`. It had a PK, unique
slug, public-active read policy, and updated-at trigger, but no product FK and
no current application, editor, import, Algolia, cache, or commerce reader.
Two rows were active canonical-era labels and two were inactive legacy rows.
Routine group presentation derives these labels. Phase 2 explicitly removed
the policy and trigger before dropping the table.

### Drafts, revisions, and audit

`product_content_drafts` has 15 retained columns: `id`, `product_id`,
`schema_version`, `base_revision`, `version`, `document`, `status`,
`validation_errors`, `created_by`, `updated_by`, `created_at`, `updated_at`,
`ready_at`, `published_at`, and `discarded_at`. At audit time it held two
discarded V1 drafts, no active draft. The unique partial index enforces one
open draft per product.

`catalog_product_revisions` has eight retained columns: `id`, `product_id`,
`revision_number`, `schema_version`, `document`, `source_draft_id`,
`published_by`, and `published_at`. It had zero rows at audit time. Revisions
are append-only and `(product_id, revision_number)` is unique.

`catalog_editor_audit_log` has eight retained columns: `id`, `action`,
nullable `actor_id`, `product_id`, `draft_id`, and `revision_id`, `metadata`,
and `created_at`. It held seven append-only rows (four action values). Its
foreign keys use `SET NULL` so history survives actor/catalog lifecycle.

Phase 1 changes new draft and revision schema defaults to V2 and permits both
V1 and V2 documents. Existing rows and future immutable V1 revisions remain
unchanged.

## Constraints, indexes, RLS, triggers, functions, and views

- RLS is enabled on all audited public tables. Anonymous/authenticated users
  have SELECT-only policies for active products, variants, media, PDP content,
  and relationships. Sources, drafts, revisions, and audit rows
  have no browser policy or browser grant.
- Product, variant, media, and PDP changes retain their existing Database
  Webhook triggers to the shared signed delivery route. Cache invalidation is
  still attempted when conditional Algolia sync fails.
- Updated-at triggers remain on products, variants, media, PDP content, and
  sources. Revision and audit tables retain append-only
  rejection triggers.
- No catalog view exists.
- Public editor RPCs are service-role-only security-definer functions with an
  empty search path. Phase 1 replaces get/create/save/restore/publish with V2
  implementations and leaves transition semantics intact.
- `private.catalog_editor_document_v1(uuid)` was removed in Phase 2.
  `private.catalog_editor_upgrade_v1_to_v2(jsonb)` is retained long-term
  because immutable V1 revision documents may need restoration.
- Phase 2 removed `products_routine_order_idx` and
  `product_media_kind_role_idx`; it rebuilt
  `products_catalog_status_sort_idx`, `products_routine_sort_idx`, and
  `product_variants_active_product_idx` from canonical fields. Canonical PK,
  unique, GIN, offer, relationship, editor-history, and media-role indexes
  remain.

## Runtime, editor, and writer changes

Storefront query constants in `lib/catalog/storefront.ts` and
`lib/catalog.ts` now select canonical fields only. PDP content reads
`product_pdp_content`; full INCI reads only `products.ingredients`; routine
labels derive from the four canonical routine fields. Purpose-specific stable
content, card, offer, metadata, route, Core, discovery, and `/system`
projections remain separate. There is no `select("*")`, TypeScript product
fallback, or legacy precedence fallback in a public runtime path.

Algolia reads a narrow canonical source and maps only current searchable
concepts. Cart and checkout still re-read product/variant price, status, and
availability directly from Supabase; historical cart/order snapshot labels
are derived at the server boundary. Cache lifetimes and granular tags are
unchanged.

The editor wire contract is `ProductEditorDocumentV3`. Retired fields do not
appear in controls, API documents, validation, diffs, preview props, or publish
SQL. Unknown/custom-client keys and retired keys are rejected server-side.
Historical V1/V2 revisions are upgraded deterministically inside
`restore_catalog_product_revision`; the current application accepts only V3
active drafts. The retained database adapters:

- canonical values win; a blank canonical value may use its exact V1 shadow;
- `sourceFullInci` may fill blank `ingredients`, but conflicting values abort;
- variant `sort_order` may use V1 `position`;
- media removes `media_kind` and preserves canonical `media_type`;
- the unsupported legacy `campaign` role aborts;
- meaningful canonical fields are preserved, while retired shadows disappear.

Restoring a V1 or V2 revision creates a new V3 draft and does not rewrite the
revision. Discarded older drafts remain audit history and are not loaded as
editable documents. Optimistic draft versions and base-revision conflicts
remain enforced.

Complete field coverage was added after Phase 2 by migrations
`20260801052736_catalog_editor_v3_complete_field_coverage.sql` and
`20260801054856_catalog_editor_v3_upgrade_volatility.sql`. The V3 aggregate
retains every final normalized row field plus `product_sources`, while
workflow/revision/audit rows remain separate read-only metadata. Only active
V1/V2 drafts were upgraded; immutable historical revisions were untouched.

Leaders import now writes canonical product fields, canonical variant
`sort_order`, canonical media payloads, and supplier facts in
`product_sources`; the raw source snapshot keeps source provenance.
Presentation and media sync scripts no longer write `media_kind` or any
retired product/variant field. All broad writers remain dry-run by default and
retain explicit editorial overwrite safeguards.

## Phase 1 migration and rollback

Migration `20260730110308_catalog_canonicalization_phase_one.sql`:

1. Aborts if required canonical fields, routine values, or source rows are
   missing, or if populated full-INCI values conflict.
2. Adds a one-time canonical product snapshot under each source row.
3. Contains an idempotent verified-INCI backfill guard. It updated zero current
   rows: TREAT already matches, CLEANSE and SEAL contain unavailable notices,
   and the other products have no legacy source-full-INCI key.
4. Normalizes variant `sort_order`.
5. Makes canonical fields required and legacy shadows nullable.
6. Replaces media payload constraints without relying on `media_kind`.
7. Enables V1/V2 editor documents and installs the V2 aggregate/RPC workflow.

Follow-up migration `20260730113500_catalog_editor_v2_lint.sql` marks the
deterministic V1 adapter `STABLE`, matching PostgreSQL's volatility
classification for the JSON/text normalization expressions it calls.

Phase 1 alone supported an application-first rollback because its legacy
columns remained populated. After Phase 2, rollback requires the reviewed
operator backup and a new forward restore migration; never edit migration
history, rewrite immutable revisions, or redeploy an application that selects
the removed fields.

## Phase 2 result

Migration `20260730125644_prune_legacy_catalog_schema.sql`:

1. Aborts unless canonical product fields and variant order are complete,
   source snapshots exist, media is canonical, active drafts are V2, V2
   documents contain no retired keys, expected dependencies exist, and the
   publish function remains service-role-only.
2. Removes the `collections` public policy and updated-at trigger, then drops
   the unreferenced table.
3. Removes `product_media_kind_role_idx`, the unused `campaign` role value,
   and `product_media.media_kind`.
4. Rebuilds `product_variants_active_product_idx` from
   `(product_id, sort_order)` and removes `product_variants.position`.
5. Removes `products_routine_order_idx`; rebuilds
   `products_catalog_status_sort_idx` as `(catalog_status, sort_order)` and
   `products_routine_sort_idx` as `(routine_sort, sort_order)`.
6. Removes `private.catalog_editor_document_v1(uuid)` and these `products`
   columns: `name`, `tagline`, `collection`, `blurb`, `description`,
   `how_to_use`, `position`, `action_name`, `routine_number`, `subtitle`,
   `descriptor`, `featured_rank`, `product_details`, `routine_step`,
   `routine_order`, `routine_group_label`, `routine_display_label`,
   `legacy_routine_group_label`, and `legacy_routine_display_label`.
7. Rebuilds the V2 document aggregate from final table shapes and reasserts
   the publish function's fixed search path and service-role-only execution.

The migration uses explicit schema-qualified drops and no cascading drop.
Generated database types and the explicit editor contract now expose only the
final schema.

Post-migration verification saved and previewed a TREAT V2 draft, published it
as revision 3, restored revision 2 into a new V2 draft, and published the exact
restored document as revision 4. The final canonical document hash matches
revision 2; all four revisions are V2 and contain no retired keys. The project
now has eight historical draft rows, four immutable revision rows, and zero
active drafts. The pre-migration row counts for products, variants, media, PDP
content, relationships, and sources remain unchanged.

Deferred, not Phase 2: deciding whether product- and variant-level `volume`
should be normalized, and whether currently unused `product_media.variant_id`
will be used or retired. Lack of current data alone is not removal evidence.

## Remote verification queries

Run against project `erasogmsqpgiirovubjh` before and after each phase:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;

select
  count(*) as products,
  count(*) filter (where ingredients is not null) as full_inci,
  count(*) filter (
    where display_name is null
       or formal_title is null
       or card_tagline is null
       or editorial_description is null
       or editorial_how_to_use is null
       or product_type is null
       or sort_order is null
       or routine_group is null
       or routine_sort is null
  ) as incomplete_canonical
from public.products;

select slug, routine_group, routine_step_number, routine_step_name, routine_sort
from public.products
order by routine_sort;

select p.slug
from public.products p
left join public.product_sources s on s.product_id = p.id
where s.product_id is null
   or not (s.raw_source ? 'catalogProduct');

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'products' and column_name in (
      'name', 'tagline', 'collection', 'blurb', 'description', 'how_to_use',
      'position', 'action_name', 'routine_number', 'subtitle', 'descriptor',
      'featured_rank', 'product_details', 'routine_step', 'routine_order',
      'routine_group_label', 'routine_display_label',
      'legacy_routine_group_label', 'legacy_routine_display_label'
    ))
    or (table_name = 'product_variants' and column_name = 'position')
    or (table_name = 'product_media' and column_name = 'media_kind')
  );

select to_regclass('public.collections') as removed_collections,
       to_regprocedure(
         'private.catalog_editor_document_v1(uuid)'
       ) as removed_v1_builder,
       to_regprocedure(
         'private.catalog_editor_upgrade_v1_to_v2(jsonb)'
       ) as retained_v1_revision_adapter;

select count(*) filter (where sort_order is null) as missing_sort
from public.product_variants;

select media_type,
       count(*) filter (where url is not null) as url_rows,
       count(*) filter (where url is null and placeholder_palette <> '{}'::jsonb)
         as placeholder_rows
from public.product_media
group by media_type;

select status, schema_version, count(*)
from public.product_content_drafts
group by status, schema_version
order by status, schema_version;

select schema_version, count(*)
from public.catalog_product_revisions
group by schema_version
order by schema_version;

select count(*) as relationships,
       count(distinct (product_id, related_product_id, relationship_type))
         as distinct_relationships
from public.product_relationships
where archived_at is null;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where tablename in (
  'products', 'product_variants', 'product_media', 'product_pdp_content',
  'product_relationships', 'product_sources', 'product_content_drafts',
  'catalog_product_revisions', 'catalog_editor_audit_log'
)
order by tablename, policyname;
```

Also run `supabase migration list`, `supabase db push --dry-run --linked`,
database lint/advisors, generated-type diff, the repository canonical-contract
test, and `git diff --check`.
