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

The editor loads one canonical `ProductEditorDocumentV2` aggregate and at most
one active draft. It saves with an expected version, so stale concurrent writes
return a conflict without replacing local browser edits. Save accepts
incomplete work; Validate and Ready report structural, field-ownership, and
staged-media issues. Publish requires `catalog.publish` and performs the
canonical table writes, immutable revision, audit event, and draft transition
in one database transaction.

Supplier provenance remains in `product_sources` and is intentionally absent
from the editable wire document. The shared field-ownership manifest drives
the UI and server comparison; changing a read-only, retired, or unknown field
is rejected even if a custom client bypasses the UI. Price, availability, and
inventory remain integer/server-authoritative commerce fields. Cart and
checkout continue to re-read canonical commerce data.

Active drafts and all new drafts/revisions are V2. The application rejects a
noncanonical active draft instead of carrying a runtime compatibility shim.
The database retains a narrow V1-to-V2 adapter only for restoring immutable
historical V1 revisions; restore rejects conflicting full-INCI values and the
retired campaign media role, creates a new V2 draft, and never rewrites the
source revision. Discarded V1 drafts remain audit history.

Preview is dynamic, no-store, and noindex. It renders the draft through the
storefront PDP composition without the standard admin sidebar. Header cart,
PDP purchase controls, drawer mutations, Afterpay purchase behavior, and
purchase analytics are disabled. Public PDP routes never read draft tables.

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
