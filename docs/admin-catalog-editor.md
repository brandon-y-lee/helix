# Admin Catalog Editor

The catalog editor is a protected, server-authorized workflow over the
canonical Supabase catalog. Browser clients use the `/api/admin/catalog/*`
routes; those routes perform membership checks and use the service role only on
the server. Draft preview calls the same server service directly and never
fetches the application’s own API over HTTP.

## Access

`lib/admin/capabilities.ts` is the only capability vocabulary and membership
resolver:

| Role | Capabilities |
| --- | --- |
| `catalog_editor` | `admin.access`, `catalog.read`, `catalog.edit` |
| `catalog_publisher` | all editor capabilities plus `catalog.publish` and `catalog.delivery` |
| `admin` | all capabilities |

An anonymous request follows the normal sign-in redirect. An authenticated user
without an active matching membership receives a forbidden response. A failed
identity or membership lookup fails closed. Supabase RLS blocks direct browser
access to memberships, drafts, revisions, and audit records.

## Editing and publication

The editor loads one canonical `ProductEditorDocumentV3` aggregate and at most
one active draft. V3 contains complete rows for `products`,
`product_pdp_content`, `product_variants`, `product_media`,
`product_relationships`, and the product's `product_sources` row. Draft,
revision, and audit rows are loaded separately into the read-only System
Metadata section; customer, cart, review, cache, and Algolia data never enter
the editable document. The product grid keeps its narrow list projection.

The shared metadata in `lib/catalog/field-ownership.ts` drives controls,
role-aware server ownership validation, table-grouped diffs, read-only reasons,
preview relevance, publish mapping, and documentation tests. Save uses an
expected version, so stale concurrent writes return a conflict without
replacing local browser edits. Save accepts incomplete work; Validate and Ready
report structural, ownership, relationship, and staged-media issues.

| Role | Editable fields | Publication |
| --- | --- | --- |
| `catalog_editor` | Editorial product/PDP fields, media presentation associations, and relationships | Save, validate, and mark ready only |
| `catalog_publisher` | Same normal fields | May publish validated ready drafts |
| `admin` | Normal fields plus supplier facts, safe source corrections, variants/commerce, publication state, routine classification/order, and swatches | May publish validated ready drafts |

The API passes the verified membership role into the server service. The
service compares every candidate field with the current canonical aggregate,
and the service-role-only RPC independently verifies the active membership role
before saving or publishing. Unknown fields and immutable changes are rejected.
Publish updates only changed normalized rows, creates one immutable revision,
records advanced before/after values in the audit event, and transitions the
draft in one transaction. Price remains integer cents at the server boundary;
cart and checkout still re-read canonical commerce data.

### Advanced and immutable fields

Admins may correct supplier-owned product facts and the safe
`product_sources` fields `supplier_title`, `supplier_url`,
`original_source_price_cents`, and `formulation_version_notes`. The editor warns
that a later supplier import may overwrite them. Reconciliation identity,
provider IDs, inspection timestamps, source hashes, raw source snapshots,
database IDs/foreign keys, lifecycle timestamps, revision/audit identity, and
derived search/cache data remain visible but immutable.

`slug` remains visible and immutable because the repository has no durable
route-alias or redirect ledger; changing it would silently break inbound URLs.
`currency` remains visible and fixed to USD because cart, Stripe, orders,
Afterpay, and database constraints are USD-only. These are concrete
architecture constraints, not hidden editor omissions.

Disruptive publication review is required for routine/catalog classification,
variant archival or deactivating every sellable variant, and primary media
archival. Ordinary saves do not require typed confirmation.

### Document compatibility

V3 was required because V2 intentionally omitted immutable row metadata and
the source row. Migration
`20260801052736_catalog_editor_v3_complete_field_coverage.sql` upgrades only
active V1/V2 drafts to V3. Historical V1/V2 revisions and discarded drafts are
never rewritten. Restore deterministically applies the retained V1-to-V2 and
new V2-to-V3 adapters, restores current immutable row metadata, and creates a
new V3 draft. Unsupported or ambiguous documents fail honestly. Optimistic
draft versions and base-revision publication checks are unchanged.

Preview is dynamic, no-store, and noindex. It renders the draft through the
storefront PDP composition without the standard admin sidebar. Header cart,
PDP purchase controls, drawer mutations, Afterpay purchase behavior, and
purchase analytics are disabled. Draft product copy, status, routine fields,
offers, availability, media, and structured PDP content use editor precedence.
SEO, search, badge, formula, concerns, and merchandising values that do not
have a truthful PDP-body representation appear in a Preview Metadata band.
Source-only values do not pretend to affect the storefront. Public PDP routes
never read draft tables.

### Core routine media

Core products expose two dedicated image slots instead of offering these roles
in the free-form media-role menu. `Core Routine Texture` owns the ingredient
swatch in the left routine panel. `Core Routine Editorial Image` owns the large
supporting image shared across CLEANSE, TREAT, and SEAL PDPs. The editorial role
is image-only, has no variant, uses fixed sort order `1`, requires positive
intrinsic dimensions, alt text, and the approved catalog Storage origin, and is
limited to one active association.

Replacement uploads use immutable draft paths and change only the draft
document until Publish. Draft preview projects the staged editorial image into
the right routine panel while preserving the texture slot. When no editorial
association exists, that product retains its own canonical hue; public PDPs
remain canonical-only. Validation is repeated in the server upload and publish
paths, and database constraints guard direct publication attempts.

Publishing updates only Supabase. Search and cache delivery stays on the
existing signed webhook route. The four managed Database Webhooks target the
stable non-production deployment and continue covering products, variants,
media, and PDP content.

The canonical fields and completed Phase 2 removal are documented in
`docs/catalog/catalog-schema-cleanup.md`.

## Membership bootstrap

No membership is created automatically. Select one already verified user in
the approved non-production project and set exactly one identity:

```bash
MEI_PELLE_ADMIN_USER_ID=<verified-user-uuid> \
MEI_PELLE_ADMIN_ROLE=catalog_editor \
pnpm admin:bootstrap
```

`MEI_PELLE_ADMIN_EMAIL` may be used instead of the ID; never set both. The
command refuses another project, an unverified user, an ambiguous email, or an
unsupported role. It writes and audits the membership immediately, so inspect
the identity and role before running it. Never place operator credentials in
source control or command output.
