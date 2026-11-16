// @vitest-environment node
// Executed by scripts/db/test-catalog-current-contract.mjs, which owns and removes
// the unique synthetic database. Ordinary Vitest runs need no Docker/provider.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogDraftRecord, ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";

const { rpc, maybeSingle, inQuery } = vi.hoisted(() => ({
  rpc: vi.fn(), maybeSingle: vi.fn(), inQuery: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc, from: () => ({ select: () => ({
    eq: (_field: string, id: string) => ({ maybeSingle: () => maybeSingle(id) }),
    in: inQuery,
  }) }) }),
}));
vi.mock("@/lib/catalog/real-product-media-verification", async (original) => ({
  ...await original<typeof import("@/lib/catalog/real-product-media-verification")>(),
  // Only external HTTP is simulated. Storage provenance and every publication
  // transaction execute the real SQL; byte verification has its own tests.
  verifyRealProductMedia: vi.fn(async () => ({ results: [], summary: { failures: 0 } })),
}));
import { getCatalogDraftForPreview, publishCatalogDraft, restoreCatalogRevision,
  saveCatalogDraft, transitionCatalogDraft } from "@/lib/admin/catalog/service";
import { validateCatalogEditorOwnership } from "@/lib/admin/catalog/ownership";

const container = process.env.HELIX_RESTORE_SQL_CONTAINER;
const database = process.env.HELIX_RESTORE_SQL_DATABASE;
const productId = "10000000-0000-4000-8000-000000000101";
const actorId = "10000000-0000-4000-8000-000000000901";
const literal = (value: unknown): string => value === null ? "null"
  : typeof value === "object" ? `${literal(JSON.stringify(value))}::jsonb`
    : `'${String(value).replaceAll("'", "''")}'`;
function execute(sql: string): string {
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-X", "-U", "postgres",
    "-d", database!, "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", timeout: 15_000,
  }).trim();
}
function query<T>(sql: string): T { return JSON.parse(execute(sql)); }
const canonical = () => query<ProductEditorDocumentV4>(
  `select public.get_catalog_editor_document('${productId}');`);
const input = (draft: CatalogDraftRecord) => ({ draftId: draft.id,
  expectedVersion: draft.version, actorId, role: "admin" as const });

describe.skipIf(!container || !database)("SQL Restore through normal Catalog services", () => {
  beforeAll(() => {
    expect(database).toMatch(/^helix_catalog_current_[a-f0-9]+$/);
    expect(execFileSync("docker", ["inspect", "--format",
      '{{index .Config.Labels "helix.task"}}', container!], { encoding: "utf8" }).trim())
      .toBe("spec358-synthetic-sql");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      expect(name).toMatch(/^(get_catalog_editor_document|restore_catalog_product_revision|save_catalog_product_draft|transition_catalog_product_draft|publish_catalog_product_draft)$/);
      for (const key of Object.keys(args)) expect(key).toMatch(/^p_[a-z_]+$/);
      const argumentsSql = Object.entries(args).map(([key, value]) => `${key} => ${literal(value)}`).join(",");
      return { data: query(`set role service_role; select public.${name}(${argumentsSql});`), error: null };
    });
    maybeSingle.mockImplementation(async (id: string) => ({ data: query(
      `set role service_role; select to_jsonb(d) from public.product_content_drafts d where id=${literal(id)};`), error: null }));
    inQuery.mockImplementation(async (_field: string, ids: string[]) => ({ data: query(
      `select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') from public.products where id in (${ids.map(literal).join(",")});`), error: null }));
  });

  afterEach(async () => {
    const active = query<CatalogDraftRecord[]>(`select coalesce(jsonb_agg(to_jsonb(d)),'[]')
      from public.product_content_drafts d where product_id='${productId}' and status in ('draft','ready');`);
    // Malformed historical identity fixtures deliberately fail document parsing.
    // Cleanup uses the real discard RPC, which does not require parsing them.
    for (const draft of active) execute(`set role service_role;
      select public.transition_catalog_product_draft(${literal(draft.id)},${draft.version},'discard','[]','${actorId}');`);
  });

  function revision(schema: number, mutate = (document: ProductEditorDocumentV4) => document) {
    const historical = mutate(canonical());
    const oldTime = "2020-01-02T03:04:05+00:00";
    for (const row of [historical.product, historical.productPdpContent,
      historical.productSource, ...historical.variants, ...historical.media, ...historical.relationships]) {
      if (!row) continue;
      for (const field of ["created_at", "updated_at", "published_at"]) {
        if (field in row) (row as Record<string, unknown>)[field] = oldTime;
      }
    }
    return query<string>(`${readFileSync("supabase/tests/catalog_identity.fixtures.sql", "utf8")}
      insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
      select '${productId}', max(revision_number)+1, ${schema},
        pg_temp.historical_catalog_identity_document(${literal(historical)},${schema}), '${actorId}'
      from public.catalog_product_revisions where product_id='${productId}' returning to_jsonb(id);`);
  }

  it.each([1, 2, 3, 4])("V%s Restore remains editable and publishes after normal review", async (schema) => {
    const before = canonical();
    const revisionId = revision(schema);
    const original = query(`select document from public.catalog_product_revisions where id=${literal(revisionId)};`);
    const restored = await restoreCatalogRevision(revisionId, actorId);
    expect(validateCatalogEditorOwnership(restored.draft.document, before, "admin")).toEqual([]);
    expect(canonical()).toEqual(before);
    expect(restored.draft.document.productFamily).toEqual(before.productFamily);
    expect(restored.draft.document.product.editorial_description).toBe("Historical editorial content for review.");
    for (const field of restored.retainedFields) {
      expect(restored.draft.document.product[field]).toEqual(before.product[field]);
    }
    await expect(restoreCatalogRevision(revisionId, actorId)).rejects.toMatchObject({ code: "active_draft_exists" });
    const edited = structuredClone(restored.draft.document);
    edited.product.editorial_description = "Reviewed historical editorial content.";
    edited.productPdpContent!.how_to_use_steps = ["Reviewed historical usage step."];
    const saved = await saveCatalogDraft({ ...input(restored.draft), document: edited });
    await expect(saveCatalogDraft({ ...input(restored.draft), document: edited }))
      .rejects.toMatchObject({ code: "version_conflict" });
    const validated = await transitionCatalogDraft({ ...input(saved.draft), action: "validate" });
    expect(validated.draft.validation_errors).toEqual([]);
    const ready = await transitionCatalogDraft({ ...input(validated.draft), action: "ready" });
    expect(ready.draft.status).toBe("ready");
    const published = await publishCatalogDraft(input(ready.draft));
    expect(published.draft.status).toBe("published");
    expect(canonical().product.editorial_description).toBe(edited.product.editorial_description);
    expect(query(`select document from public.catalog_product_revisions where id=${literal(revisionId)};`)).toEqual(original);
  }, 30_000);

  it("retains actionable media/guidance and immutable-field rejections after timestamp refresh", async () => {
    const revisionId = revision(4, (document) => {
      document.media[0].url = document.media[0].url!.replace(/[^/]+$/, "unverified.webp");
      document.productPdpContent!.how_to_use_steps = null;
      return document;
    });
    const { draft } = await restoreCatalogRevision(revisionId, actorId);
    const timestampIssues = validateCatalogEditorOwnership(draft.document, canonical(), "admin")
      .filter((issue) => /(?:created|updated|published)_at$/.test(issue.path));
    expect(timestampIssues).toEqual([]);
    const validated = await transitionCatalogDraft({ ...input(draft), action: "validate" });
    expect(validated.draft.validation_errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "retired_media_reference" }),
      expect.objectContaining({ code: "guidance_review_required" }),
    ]));
    await expect(publishCatalogDraft(input(validated.draft))).rejects.toMatchObject({ code: "validation_failed" });
    for (const change of [
      (doc: ProductEditorDocumentV4) => { doc.product.id = "10000000-0000-4000-8000-000000000102"; },
      (doc: ProductEditorDocumentV4) => { doc.media[0].width = 999; },
    ]) {
      const document = structuredClone(draft.document); change(document);
      await expect(saveCatalogDraft({ ...input(validated.draft), document }))
        .rejects.toMatchObject({ code: "field_ownership_violation" });
    }
    await transitionCatalogDraft({ ...input(validated.draft), action: "discard" });
  });

  it("does not rebase a saved Restore over a later canonical edit", async () => {
    const { draft } = await restoreCatalogRevision(revision(4), actorId);
    execute(`update public.products set editorial_description='Concurrent governed change' where id='${productId}';`);
    await expect(saveCatalogDraft({ ...input(draft), document: draft.document }))
      .rejects.toMatchObject({ code: "field_ownership_violation" });
    const validated = await transitionCatalogDraft({ ...input(draft), action: "validate" });
    expect(validated.draft.validation_errors).toContainEqual(expect.objectContaining({ path: "product.updated_at", code: "field_read_only" }));
    await expect(publishCatalogDraft(input(validated.draft))).rejects.toMatchObject({ code: "validation_failed" });
    expect((await getCatalogDraftForPreview(draft.id)).document).toEqual(draft.document);
    await transitionCatalogDraft({ ...input(validated.draft), action: "discard" });
  });

  it("preserves historical row selection and order, matching metadata by full identity only", async () => {
    const current = canonical();
    const revisionId = revision(4, (document) => {
      document.variants = [];
      document.productPdpContent = null;
      const matchedMedia = document.media[0];
      document.media = [
        { ...matchedMedia, id: "10000000-0000-4000-8000-000000000399", alt: "Historical missing association" },
        // Same ID with a different Product must not borrow this Product's metadata.
        { ...matchedMedia, product_id: "10000000-0000-4000-8000-000000000102" },
        matchedMedia,
      ];
      const matchedRelationship = document.relationships[0];
      document.relationships = [
        { ...matchedRelationship, relationship_type: "related" }, matchedRelationship,
      ];
      return document;
    });
    const original = query<ProductEditorDocumentV4>(`select document from public.catalog_product_revisions where id=${literal(revisionId)};`);
    const { draft } = await restoreCatalogRevision(revisionId, actorId);
    expect(draft.document.variants).toEqual([]);
    expect(draft.document.productPdpContent).toBeNull();
    expect(draft.document.media).toHaveLength(3);
    expect(draft.document.media.slice(0, 2)).toEqual(original.media.slice(0, 2));
    expect(draft.document.media[2]).toEqual({ ...original.media[2],
      created_at: current.media[0].created_at, updated_at: current.media[0].updated_at });
    expect(draft.document.relationships).toEqual([original.relationships[0], {
      ...original.relationships[1], created_at: current.relationships[0].created_at,
    }]);
    expect(canonical()).toEqual(current);
  });

  it("keeps historical Source creation unsupported when no current Source exists", async () => {
    const revisionId = revision(4);
    execute(`delete from public.product_sources where product_id='${productId}';`);
    const { draft } = await restoreCatalogRevision(revisionId, actorId);
    expect(draft.document.productSource).toEqual(query<ProductEditorDocumentV4>(
      `select document from public.catalog_product_revisions where id=${literal(revisionId)};`).productSource);
    await expect(saveCatalogDraft({ ...input(draft), document: draft.document }))
      .rejects.toMatchObject({ code: "field_ownership_violation" });
    expect(canonical().productSource).toBeNull();
  });
});
