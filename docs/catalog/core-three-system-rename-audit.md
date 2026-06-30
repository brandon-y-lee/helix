# Core Three System Rename Audit

## Scope

This audit covers the customer-facing rename from `RESET` to `CLEANSE`, `RECODE`
to `TREAT`, and `The Method` to `The System`. Supabase remains the canonical
catalog source; Algolia remains a derived search index; repository catalog data
is used for imports, presentation refreshes, tests, and operational tooling.

## Canonical Customer-Facing Values

Products:

- `CLEANSE` — `cleanse-01-calming-gel-cleanser`
- `REFINE` — `refine-02-pore-treatment-pads`
- `TREAT` — `treat-03-pdrn-5-ampoule`
- `FRAME` — `frame-04-pdrn-eye-cream`
- `SEAL` — `seal-05-green-collagen-cream`
- `LIFT` — `lift-06-pdrn-mask-system`

System order:

- `01 CLEANSE`
- `02 REFINE`
- `03 TREAT`
- `04 FRAME`
- `05 SEAL`
- `06 PROTECT`
- `07 LIFT`

`PROTECT` remains an editorial System step only. It has no product row, PDP,
variant, inventory, price, cart action, or Algolia product record.

## Data Sources And Field Authority

Supabase `public.products` is canonical for runtime catalog reads. The migration
`202606290001_core_three_system_rename.sql` updates visible product identifiers:
`slug`, `name`, `display_name`, `action_name`, `formal_title`, `seo_title`,
`editorial_how_to_use`, `search_keywords`, and affected media `alt`/`palette_id`
values.

The migration `202606290002_lift_intensive_copy.sql` removes visible lower-case
`reset` language from LIFT merchandising copy by changing it to weekly
`intensive` language.

`data/catalog/mei-pelle-presentation.ts` is the local presentation refresh
source. It now uses canonical slugs and visible names so
`pnpm run catalog:refresh:presentation` cannot reintroduce old visible product
identities.

`data/catalog/leaders-mei-pelle-source.ts` is the supplier-backed import source.
It now uses canonical slugs and names, with `legacySlugs` for the two renamed
products so imports preserve existing product UUIDs.

Algolia records are derived by `lib/algolia/record.ts` from Supabase rows.
`objectID` remains the stable Supabase product UUID, so slug/name changes update
the same search records instead of creating new objects.

## Routing And Compatibility

Canonical customer routes:

- System page: `/system`
- CLEANSE PDP: `/products/cleanse-01-calming-gel-cleanser`
- TREAT PDP: `/products/treat-03-pdrn-5-ampoule`

Compatibility redirects:

- `/method` -> `/system`
- `/products/reset-01-calming-gel-cleanser` -> `/products/cleanse-01-calming-gel-cleanser`
- `/products/recode-03-pdrn-5-ampoule` -> `/products/treat-03-pdrn-5-ampoule`

Canonical System anchors use `system-*`, for example `#system-cleanse` and
`#system-treat`. Legacy invisible anchors such as `#step-reset`,
`#step-recode`, `#method-reset`, and `#method-recode` remain inside the System
page for old links where the browser can preserve the hash.

## Residual Technical Identifiers

The implementation still has internal names containing `method` in component,
CSS, and helper identifiers, such as `MethodExperience`, `.method-hero`, and
`lib/content/method.ts`. These are treated as legacy technical identifiers
because renaming them would create broad layout/test churn without changing the
customer-facing contract. `lib/content/system.ts` re-exports the content module
for new canonical imports.

Old product names remain in hidden `search_keywords` only:

- `reset` helps legacy searches resolve to `CLEANSE`.
- `recode` helps legacy searches resolve to `TREAT`.

Historical migration filenames, historical documentation, password-reset copy,
and route redirect sources may contain `reset`, `recode`, or `method` for
technical accuracy. They are not active customer-facing product names or
canonical route labels.

## Verification Targets

After the migration is applied to the non-production Supabase project
`erasogmsqpgiirovubjh`, verify:

- Supabase product rows expose `CLEANSE` and `TREAT` with canonical slugs.
- Product media alt text does not expose `RESET` or `RECODE`.
- `/system` is included in the sitemap and `/method` is not.
- `/method` and old product slugs redirect to canonical destinations.
- Algolia reindex replaces visible product fields with `CLEANSE` and `TREAT`.
- Homepage, header, footer, About, FAQ, Contact, System, search, PDPs, and tests
  use System terminology.
