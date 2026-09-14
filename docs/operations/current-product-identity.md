# Current Product identity and Restore

Spec #358 / Ticket #360 delivers current identity source code and bounded preparation tools. The source merge does not apply a Catalog change. Production promotion and provider operations remain separate recorded actions.

## Supported state

The installed schema must provide current V4 Catalog documents, family-aware publication/Restore, immutable revisions/audits, and the private slug reservation/history contract. Whole-history empty-database replay is not supported by this procedure: prior operational imports and publications are absent from historical migration files. Do not edit applied migrations or replay historical full Product documents.

The controlled identity operation supports the existing formulation with this governed source:

| Fact | Required value |
| --- | --- |
| Supplier | Leaders Cosmetics USA |
| Supplier Product | PDRN 5% Active Ampoule |
| Handle / supplier ID | `pdrn-5-active-ampoule` / `7465003057234` |
| Source URL | `https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule` |
| Inspected at | `2026-06-18T13:39:04.293Z` |
| Source content hash | `03843cc7f6ab3d184e625c3b14211e3e4667e64644f1a5ee16091382eb61c69b` |
| Classification | TREAT / core / PDRN serum |
| Preserved issued Variant | `30ml`, SKU `8809672285263`, supplier Variant `42072641208402` |

Resolve exactly one Product across the three known slugs and this supplier identity; never use a portable live UUID assumption. Public INCI must match the governed source INCI. The exact current document is the reviewed operation input, preserving current offers, additional Variants, media and relationships.

| Predecessor | Required display name | Required SEO title |
| --- | --- | --- |
| `peptide-bounce` | Peptide Bounce | Peptide Bounce — PDRN serum \| helix |
| `maxxing-serum` | Maxxing Serum | Maxxing Serum — PDRN serum \| helix |

Only the three identity fields become `super-serum`, `Super Serum`, and `Super Serum — PDRN serum | helix`. The Product timestamp advances, the existing slug trigger records its reservation/history, and one Published Revision plus rename audit entry is appended. Product/Variant IDs, issued SKUs, prices, source, content, media, relationships, historical revisions and Orders are not rewritten.

An already-current Product returns `no-op` after identity/provenance/draft checks, even when the supplied preflight predates its completed rename. Current SEO, editorial and media changes are preserved. A predecessor with a stale revision or changed complete document rejects atomically. Active drafts, ambiguous/missing identity, unrecognized source/identity fields, and a reserved target URL also reject. The operation briefly fences Product/source writers after taking the established family/Product locks, then verifies the complete identity candidate set. An independent write already in flight causes immediate refusal rather than a lock-upgrade wait. Keep the transaction short; retry from fresh preflight. Do not discard drafts or remove reservations to force an upgrade.

## Provider preparation and apply record

1. Freshly verify the exact approved project `erasogmsqpgiirovubjh`, installed migration/function/trigger definitions, current deployment, Product provenance, canonical document, latest revision, active drafts, and slug reservations. Read the same data again under the operation's locks. Record only bounded identifiers, counts and hashes in public evidence.
2. Run the read-only `supabase/operations/current_treat_identity_preflight.sql` and save its output privately. It captures the complete current document/revision, identity candidate count, active drafts, administrator count, target reservation and function/media-reference hashes. Resolve an active Catalog Administrator. The reviewed expected diff must contain only the three fields above plus the expected timestamp/history additions. Do not print credentials or full provider payloads to application logs.
3. Verify approved Super Serum imagery separately. The earlier Peptide-to-Maxxing publication changed imagery; matching Product provenance does not certify the old image bytes. This identity-only operation preserves all current media and does not authorize replacement images.
4. Prepare the Restore migration `20260914051153_catalog_restore_current_identity.sql` before deploying an application that requires its `retainedFields` response. This is compatible preparation; do not batch later public resolver/grant contraction migrations into a predeployment push.
5. With exact target/apply authority and the manifest review complete, open a privileged SQL session to the verified project. Start an explicit transaction with `lock_timeout = '5s'`, `statement_timeout = '30s'`, and `idle_in_transaction_session_timeout = '60s'` set locally. Load `supabase/operations/upgrade_current_treat_identity.sql`, then call `pg_temp.upgrade_current_treat_identity(reviewed_document, reviewed_revision, administrator_id)`. Run the already-reviewed postflight assertions and commit promptly; do not pause for human review while the write fence is held. The temporary function is session-local and has no application RPC or browser grants. A failure aborts the transaction; rollback and resolve the changed state instead of weakening a guard.
6. Verify the canonical document differs only as expected; old revisions are unchanged; child IDs/SKUs/offers/media remain equal; exactly one revision/audit exists for a successful change; a repeated call returns `no-op` without writes. For an already-current deployment, record verified no-op status and do not create another publication.
7. Deploy healthy canonical consumers, reconcile affected cache entries and Product Search, and verify current pages/metadata. T2 owns final old-URL/search contraction; T5 owns governed instructions including Biotic Reset's old-name paragraph; T7 owns stable media addresses. Keep the parent Spec's environment checklist pending until each actual operation is recorded.

Read-only preflight on 2026-09-14 found the approved environment already on Super Serum, revision 9, with no active draft and matching source/INCI/issued Variant. This is dated evidence, not future apply authorization. No provider write was performed for this Ticket's source validation.

## Restore contract

Restore creates a new Working Catalog Draft. After supported V1–V4 decoding and the existing Product Family overlay, it retains current `slug`, `display_name`, `seo_title`, `seo_description`, and `search_keywords` from the locked Product. Nulls and empty keyword lists are retained. Remaining historical content is reviewable; original revisions remain immutable. The response and audit disclose retained fields. New drafts stay unreviewed, with the latest base revision; normal server validation and publication conflicts still apply. Later deliberate identity edits remain possible under existing editor ownership rules.

The Restore migration is required before the updated admin interface claims retention. An unexpected old response fails visibly because a draft may already exist; it must not silently claim that old identity was excluded. T5 and T7 add their current guidance/media validation at the restored-document boundary. This Ticket does not fabricate a Publish result or clear returned field issues.

## Isolated SQL proof

The checkpoint `supabase/tests/checkpoints/catalog-current-20260909042518.sql` was captured read-only from PostgreSQL 17.6 at installed migration `20260909042518`. It contains actual definitions of 14 Catalog tables and 31 related functions, constraints/indexes, Catalog triggers, RLS/policies and grants. All 31 function definitions matched the provider definitions exactly after loading into isolated PostgreSQL 17.6. No Catalog or customer rows are copied. Auth user identity is an explicit `auth.users(id)` external boundary; outbound provider webhook triggers are excluded so tests cannot deliver external events. Authentication and provider delivery behavior are not claimed by this harness. The extraction query is retained beside the checkpoint; the runner reports its SHA-256 and hashes of every applied operation/test artifact.

Use the following disposable local Supabase PostgreSQL image. Its initialization supplies the Catalog checkpoint's required `anon`, `authenticated`, and `service_role` roles; stock PostgreSQL alone is insufficient. `anon` and `authenticated` must not have `BYPASSRLS`, while `service_role` must have it. The runner verifies these existing roles before creating any database and does not change cluster roles. The password below is only for this synthetic local container; no host port is exposed.

```bash
docker run --detach --name helix-spec358-pg --label helix.task=spec358-synthetic-sql --env POSTGRES_PASSWORD=helix-local-test-only public.ecr.aws/supabase/postgres:17.6.1.159
node scripts/db/test-catalog-identity.mjs --container=helix-spec358-pg
```

The runner waits up to 30 seconds for the image's final TCP PostgreSQL server, checks the required roles, then creates and drops only its random temporary databases. It refuses a container without the explicit test label, executes the real Restore migration and temporary upgrade function against synthetic IDs, and fails on any SQL assertion. This is actual SQL execution, separate from Vitest's supplemental source assertions and the repository's ticket-gate.
