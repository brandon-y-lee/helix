// @vitest-environment node
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogDocument } from "./fixtures/catalog-editor";
import type { CatalogDraftRecord, CatalogEditorResponse, ProductEditorDocumentV4 } from "../lib/admin/catalog/types";
import { runSuperSerumPublication, SUPER_SERUM, type PublicationInput } from "../scripts/catalog/super-serum-publication";

const calls = vi.hoisted(() => ({
  read: vi.fn(), create: vi.fn(), save: vi.fn(), ready: vi.fn(), publish: vi.fn(),
  member: vi.fn(), project: vi.fn(), eq: vi.fn(),
}));
vi.mock("../lib/admin/catalog/service", () => ({
  getCatalogEditor: calls.read, createCatalogDraft: calls.create, saveCatalogDraft: calls.save,
  transitionCatalogDraft: calls.ready, publishCatalogDraft: calls.publish,
}));
vi.mock("../scripts/db/supabase-ops", () => ({ assertExpectedProjectRef: calls.project }));
vi.mock("../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ select: () => ({
    eq: (...args: unknown[]) => { calls.eq(...args); return { maybeSingle: calls.member }; },
  }) }) }),
}));

const actorId = "123e4567-e89b-42d3-a456-426614174005";
const input: PublicationInput = { mode: "apply", actorId, expectedRevision: 13, target: "available" };
let original: ProductEditorDocumentV4;
let changed: ProductEditorDocumentV4;
let initial: CatalogEditorResponse;
let final: CatalogEditorResponse;

function revision(document: ProductEditorDocumentV4, number: number) {
  return {
    id: `123e4567-e89b-42d3-a456-${String(number).padStart(12, "0")}`,
    product_id: SUPER_SERUM.productId, schema_version: 4, revision_number: number,
    document: JSON.parse(JSON.stringify(document)), source_draft_id: number === 14 ? "our-draft" : null,
    published_by: actorId, published_at: "2026-09-19T12:00:00Z",
  };
}
function editor(document: ProductEditorDocumentV4, number: number): CatalogEditorResponse {
  return {
    canonical: document, draft: null, latestRevision: number, role: "admin", permissions: {},
    relationshipTargets: [], systemMetadata: {
      drafts: [], audit: [], slugRoutes: [], revisions: [revision(document, number)],
    },
  };
}
function draft(document: ProductEditorDocumentV4, version = 1): CatalogDraftRecord {
  return {
    id: "our-draft", product_id: SUPER_SERUM.productId, schema_version: 4, base_revision: 13,
    version, document, status: "draft", validation_errors: [], created_by: actorId, updated_by: actorId,
    created_at: "2026-09-19T12:00:00Z", updated_at: "2026-09-19T12:00:00Z",
    ready_at: null, published_at: null, discarded_at: null,
  };
}
function wireApply() {
  initial = editor(original, 13);
  final = editor(changed, 14);
  final.systemMetadata.revisions.push(revision(original, 13));
  calls.read.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(final);
  calls.create.mockResolvedValue({ created: true, draft: draft(original) });
  calls.save.mockImplementation(async ({ document }) => ({ ok: true, draft: draft(document, 2) }));
  calls.ready.mockImplementation(async () => ({
    ok: true, draft: { ...draft(calls.save.mock.calls[0][0].document, 3), status: "ready" },
  }));
  calls.publish.mockResolvedValue({ revision: final.systemMetadata.revisions[0], mediaVerification: { status: "healthy" } });
}
function expectNoWrites() {
  for (const call of [calls.create, calls.save, calls.ready, calls.publish]) expect(call).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
  original = structuredClone(catalogDocument);
  original.productId = original.product.id = SUPER_SERUM.productId;
  original.product.slug = SUPER_SERUM.slug;
  original.product.status = "coming_soon";
  Object.assign(original.variants[0], {
    id: SUPER_SERUM.variantId, product_id: SUPER_SERUM.productId, variant_key: "30ml", label: "30 mL",
    volume: "30 mL / 1.01 fl. oz.", sku: SUPER_SERUM.sku, price_cents: 2500,
    available: false, inventory_status: "unavailable",
  });
  if (original.productPdpContent) original.productPdpContent.product_id = SUPER_SERUM.productId;
  for (const media of original.media) {
    media.product_id = SUPER_SERUM.productId;
    media.url = `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/${SUPER_SERUM.productId}/drafts/${media.id}.webp`;
  }
  if (original.productSource) original.productSource.product_id = SUPER_SERUM.productId;
  changed = structuredClone(original);
  changed.product.status = "available";
  changed.product.updated_at = "2026-09-19T12:00:00Z";
  changed.product.published_at = "2026-09-19T12:00:00Z";
  Object.assign(changed.variants[0], { available: true, inventory_status: "in_stock", updated_at: "2026-09-19T12:00:00Z" });
  calls.member.mockResolvedValue({ data: { user_id: actorId, active: true, role: "admin" }, error: null });
  wireApply();
});
afterEach(() => vi.unstubAllEnvs());

describe("fixed Super Serum publication", () => {
  it("plans without writes and checks the explicit actor and approved project", async () => {
    const snapshot = structuredClone(original);
    const result = await runSuperSerumPublication({ ...input, mode: "plan" });
    expect(result).toMatchObject({ status: "planned", revision: 13, target: "available" });
    expect(result.changes).toEqual([
      { field: "product.status", from: "coming_soon", to: "available" },
      { field: `variants.${SUPER_SERUM.variantId}.available`, from: false, to: true },
      { field: `variants.${SUPER_SERUM.variantId}.inventory_status`, from: "unavailable", to: "in_stock" },
    ]);
    expect(result.downstreamVerificationRequired).toContain("algolia");
    expect(calls.project).toHaveBeenCalledOnce();
    expect(calls.eq).toHaveBeenCalledWith("user_id", actorId);
    expect(original).toEqual(snapshot);
    expectNoWrites();
  });

  it.each(["catalog_publisher", "catalog_editor", "inactive", "missing"])("refuses an unauthorized %s actor", async (role) => {
    calls.member.mockResolvedValue({ data: role === "missing" ? null : { user_id: actorId, active: role !== "inactive", role }, error: null });
    await expect(runSuperSerumPublication(input)).rejects.toThrow("active admin");
    expect(calls.read).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["price", "sku", "size", "currency", "archived", "variant", "status"])("stops when pinned %s differs", async (field) => {
    if (field === "price") original.variants[0].price_cents = 2600;
    if (field === "sku") original.variants[0].sku = "another-sku";
    if (field === "size") original.variants[0].label = "50 mL";
    if (field === "currency") original.product.currency = "EUR";
    if (field === "archived") original.variants[0].archived_at = "2026-09-19T12:00:00Z";
    if (field === "variant") original.variants[0].id = "different";
    if (field === "status") original.product.catalog_status = "draft";
    await expect(runSuperSerumPublication(input)).rejects.toThrow();
    expectNoWrites();
  });

  it("preserves an existing or raced operator draft", async () => {
    initial.draft = draft(original);
    await expect(runSuperSerumPublication(input)).rejects.toThrow("active draft");
    expectNoWrites();
    initial.draft = null;
    calls.read.mockResolvedValue(initial);
    calls.create.mockResolvedValue({ created: false, draft: draft(original) });
    await expect(runSuperSerumPublication(input)).rejects.toThrow("not modified");
    expect(calls.save).not.toHaveBeenCalled();
    expect(calls.publish).not.toHaveBeenCalled();
  });

  it("refuses a changed base revision without opening a draft", async () => {
    initial.latestRevision = 15;
    await expect(runSuperSerumPublication(input)).rejects.toThrow("revision changed");
    expectNoWrites();
  });

  it("refuses canonical changes outside the audited revision before opening a draft", async () => {
    initial.canonical.product.editorial_description = "Unpublished changed copy";
    await expect(runSuperSerumPublication(input)).rejects.toThrow("audited base revision");
    expectNoWrites();
  });

  it("stops after a concurrent canonical revision wins during draft creation", async () => {
    calls.create.mockResolvedValue({ created: true, draft: { ...draft(original), base_revision: 14 } });
    await expect(runSuperSerumPublication(input)).rejects.toThrow("conflicting state");
    expect(calls.save).not.toHaveBeenCalled();
    expect(calls.publish).not.toHaveBeenCalled();
  });

  it("uses draft/save/validation/publish version fences and preserves every other field", async () => {
    const result = await runSuperSerumPublication(input);
    expect(result).toMatchObject({ status: "published", revision: 14, mediaVerification: "healthy" });
    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: "our-draft", expectedVersion: 1, actorId, role: "admin" }));
    expect(calls.ready).toHaveBeenCalledWith({ draftId: "our-draft", expectedVersion: 2, actorId, role: "admin", action: "ready" });
    expect(calls.publish).toHaveBeenCalledWith({ draftId: "our-draft", expectedVersion: 3, actorId, role: "admin" });
    const saved = structuredClone(calls.save.mock.calls[0][0].document);
    saved.product.status = "coming_soon";
    saved.variants[0].available = false;
    saved.variants[0].inventory_status = "unavailable";
    expect(saved).toEqual(original);
  });

  it("stops on validation failure, leaving the draft for operator inspection", async () => {
    calls.ready.mockResolvedValue({ draft: { ...draft(changed, 3), validation_errors: [{ code: "media_missing" }] } });
    await expect(runSuperSerumPublication(input)).rejects.toThrow("validation failed");
    expect(calls.publish).not.toHaveBeenCalled();
  });

  it("reports a committed publication with a media warning and downstream work still pending", async () => {
    calls.publish.mockResolvedValue({ revision: final.systemMetadata.revisions[0], mediaVerification: { status: "warning" } });
    expect(await runSuperSerumPublication(input)).toMatchObject({ status: "published", mediaVerification: "warning", warnings: [expect.stringContaining("Publication committed")] });
  });

  it.each(["apply", "verify"] as const)("repeated %s verifies the exact audited revision without writing", async (mode) => {
    calls.read.mockReset().mockResolvedValue(final);
    expect(await runSuperSerumPublication({ ...input, mode })).toMatchObject({ status: "verified", revision: 14, mediaVerification: "not_rechecked" });
    expectNoWrites();
  });

  it("rejects an unrelated extra change even when the availability flags and actor match", async () => {
    final.canonical.product.editorial_description = "Unrelated changed copy";
    final.systemMetadata.revisions[0] = revision(final.canonical, 14);
    calls.read.mockReset().mockResolvedValue(final);
    await expect(runSuperSerumPublication({ ...input, mode: "verify" })).rejects.toThrow("beyond the three");
    expectNoWrites();
  });

  it("rollback publishes the same three fields in reverse through the same flow", async () => {
    [original, changed] = [changed, original];
    wireApply();
    expect(await runSuperSerumPublication({ ...input, target: "coming_soon" })).toMatchObject({ status: "published", target: "coming_soon" });
    expect(calls.save.mock.calls[0][0].document.variants[0]).toMatchObject({ available: false, inventory_status: "unavailable", price_cents: 2500 });
  });

  it("imports the actual catalog service in the standalone CLI without a Next request", () => {
    const output = execFileSync(process.execPath, ["scripts/catalog/publish-super-serum.mjs", "--help"], { cwd: process.cwd(), encoding: "utf8" });
    expect(output).toContain("<plan|apply|verify>");
    expect(output).toContain("Cache, webhooks, Algolia");
  });
});
