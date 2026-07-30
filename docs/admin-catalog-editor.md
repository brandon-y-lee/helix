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

V1 draft/revision documents are compatibility input only. The server upgrades
them deterministically to V2 on load or restore, rejects conflicting full-INCI
values and unsupported campaign media, and creates a new V2 draft without
rewriting immutable revision history. New drafts and revisions are V2.

Preview is dynamic, no-store, and noindex. It renders the draft through the
storefront PDP composition without the standard admin sidebar. Header cart,
PDP purchase controls, drawer mutations, Afterpay purchase behavior, and
purchase analytics are disabled. Public PDP routes never read draft tables.

Publishing updates only Supabase. Search and cache delivery stays on the
existing signed webhook route. Until the four managed Database Webhooks are
provisioned against a stable non-production deployment, automatic delivery is
not active and the editor must not report it as confirmed.

The canonical fields and exact Phase 2 removal plan are documented in
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
