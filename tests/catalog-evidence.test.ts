// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCatalogEvidenceCommand } from "@/scripts/catalog/capture-catalog-evidence";
import {
  createCatalogEvidence,
  compareCatalogEvidence,
  parseCatalogEvidenceJson,
  type CatalogEvidenceInput,
  type CatalogEvidenceChange,
  type Json,
} from "@/scripts/catalog/catalog-evidence";

const productId = "10000000-0000-4000-8000-000000000101";
const hash = "a".repeat(64);
const provenance = {
  projectRef: "erasogmsqpgiirovubjh",
  endpoint: "https://erasogmsqpgiirovubjh.supabase.co",
  projectVerifiedAt: "2026-09-14T08:00:00.000Z",
  sourceCommit: "b".repeat(40),
  extractorSha256: "c".repeat(64),
};

function input(): CatalogEvidenceInput {
  return {
    metadata: {
      capturedAt: "2026-09-14T08:01:00.000Z",
      postgresVersion: "17.6",
      transactionReadOnly: "on",
      catalogReadsBypassRls: true,
      isolationLevel: "read committed",
      snapshot: "800:800:",
      timezone: "UTC",
      mediaRelations: [false, false, false],
    },
    state: {
      productStatuses: { [productId]: "active" },
      documents: {
        [productId]: {
          schemaVersion: 4, productId,
          product: { id: productId, slug: "super-serum", display_name: "Super Serum", catalog_status: "active" },
          productPdpContent: { product_id: productId, how_to_use_steps: ["Apply reviewed guidance."] },
          productSource: { product_id: productId, supplier_title: "Reviewed source" },
          variants: [{ id: "variant-1", sku: "ISSUED-SKU", price_cents: 2500 }],
          media: [{ id: "media-1", url: "https://example.test/approved.webp" }],
          relationships: [{ related_product_id: productId, sort_order: 1 }],
          productFamily: { family: null, memberships: [] },
        },
      },
      systemSteps: { TREAT: { name: "TREAT", position: 3 } },
      families: {}, memberships: {}, slugReservations: {},
      archivedVariants: {}, archivedMedia: {}, archivedRelationships: {}, drafts: {},
      currentRevisions: { [productId]: { id: "revision-1", revisionNumber: 1, sha256: hash } },
      history: {
        revisions: { "revision-1": { productId, revisionNumber: 1, schemaVersion: 4, sha256: hash } },
        auditEntries: { "audit-1": { productId, action: "draft.published", revisionId: "revision-1", sha256: hash } },
        mediaOperations: {}, mediaCopies: {},
      },
      mediaBoundary: { present: false, policy: null },
      migrationVersions: ["20260909042518"],
      documentFunctions: Object.fromEntries([
        "public.get_catalog_editor_document(uuid)",
        "private.catalog_editor_document_v4(uuid)",
        "private.catalog_editor_product_family(uuid)",
      ].map((name) => [name, { sha256: hash, volatility: "s" }])),
    },
  };
}

describe("complete Catalog evidence", () => {
  it("refuses transport precision loss instead of hashing rounded Source facts", () => {
    expect(() => parseCatalogEvidenceJson('{"raw_source":{"decimal":0.10000000000000000000001}}')).toThrow(/precision/);
    expect(() => parseCatalogEvidenceJson('{"raw_source":{"integer":9007199254740993}}')).toThrow(/precision/);
    expect(parseCatalogEvidenceJson('{"price":25.00,"scale":1e-3,"negative":-0.0}')).toEqual({ price: 25, scale: 0.001, negative: -0 });
  });
  it("fingerprints every current document section and compares an unchanged capture without approving any changes", () => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const afterInput = input();
    afterInput.metadata.capturedAt = "2026-09-14T08:02:00.000Z";
    const after = createCatalogEvidence(afterInput, provenance, "prepared");
    expect(before.fingerprints.documents[productId].sections).toEqual({
      schemaVersion: expect.any(String), productId: expect.any(String), product: expect.any(String),
      productPdpContent: expect.any(String), productSource: expect.any(String), variants: expect.any(String),
      media: expect.any(String), relationships: expect.any(String), productFamily: expect.any(String),
    });
    expect(before.fingerprints.stateSha256).toBe(after.fingerprints.stateSha256);
    expect(before.captureSha256).not.toBe(after.captureSha256);
    expect(compareCatalogEvidence(before, after, {
      version: 1, beforeCaptureSha256: before.captureSha256, changes: [],
    })).toMatchObject({ ok: true, changedPaths: [], violations: [] });
  });

  it.each([
    ["missing current section", (value: CatalogEvidenceInput) => { delete value.state.documents[productId].media; }],
    ["omitted Product", (value: CatalogEvidenceInput) => { delete value.state.documents[productId]; }],
    ["unknown document shape", (value: CatalogEvidenceInput) => { value.state.documents[productId].schemaVersion = 3; }],
    ["partial media installation", (value: CatalogEvidenceInput) => { value.metadata.mediaRelations = [true, false, false]; }],
    ["writable capture", (value: CatalogEvidenceInput) => { value.metadata.transactionReadOnly = "off"; }],
    ["filtered capture", (value: CatalogEvidenceInput) => { value.metadata.catalogReadsBypassRls = false; }],
    ["unstable document reader", (value: CatalogEvidenceInput) => { value.state.documentFunctions["public.get_catalog_editor_document(uuid)"].volatility = "v"; }],
    ["missing history", (value: CatalogEvidenceInput) => { value.state.history.revisions = {}; }],
    ["unsafe bigint", (value: CatalogEvidenceInput) => { value.state.documents[productId].unsafe = 9007199254740992; }],
  ])("rejects an incomplete or unverifiable capture: %s", (_label, mutate) => {
    const value = input(); mutate(value);
    expect(() => createCatalogEvidence(value, provenance, "before")).toThrow(/Catalog evidence:/);
  });

  it("captures a real current Product document with no Family relation", () => {
    const value = input(); value.state.documents[productId].productFamily = null;
    expect(createCatalogEvidence(value, provenance, "before").state.documents[productId].productFamily).toBeNull();
  });

  it("preserves mixed historical and current migration identifiers in capture and comparison", () => {
    const value = input();
    value.state.migrationVersions = ["20260617094816", "202606180001", "202607130001", "20260909042518"];
    const before = createCatalogEvidence(value, provenance, "before");
    const prepared = structuredClone(value);
    prepared.metadata.capturedAt = "2026-09-14T08:02:00.000Z";
    const after = createCatalogEvidence(prepared, provenance, "prepared");
    expect(before.state.migrationVersions).toEqual(value.state.migrationVersions);
    expect(compareCatalogEvidence(before, after, {
      version: 1, beforeCaptureSha256: before.captureSha256, changes: [],
    })).toMatchObject({ ok: true, changedPaths: [] });
  });

  it.each([
    ["20260618000"], ["2026061800010"], ["202606180001000"],
    ["20260618abcd"], ["202606180001", "202606180001"],
    ["20260909042518", "202606180001"], [20260909042518],
  ])("rejects malformed, duplicate, unordered or non-string migration history: %j", (...versions) => {
    const value = input();
    value.state.migrationVersions = versions as string[];
    expect(() => createCatalogEvidence(value, provenance, "before")).toThrow(/migration boundary/);
  });

  it.each([
    ["product", "seo_title", "Reviewed title"],
    ["productPdpContent", "how_to_use_steps", ["Changed instructions."]],
    ["productSource", "supplier_title", "Changed source"],
    ["variants", "sku", "UNAPPROVED-SKU"],
    ["media", "url", "https://example.test/different.webp"],
    ["relationships", "sort_order", 9],
  ] as const)("requires exact declared changes in the %s section", (section, field, value) => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const afterInput = input();
    const rowOrRows = afterInput.state.documents[productId][section];
    const row = (Array.isArray(rowOrRows) ? rowOrRows[0] : rowOrRows) as Record<string, Json>;
    const old = Object.hasOwn(row, field) ? { exists: true as const, value: row[field] } : { exists: false as const };
    row[field] = (Array.isArray(value) ? [...value] : value) as Json;
    const after = createCatalogEvidence(afterInput, provenance, "postflight");
    const base = { version: 1 as const, beforeCaptureSha256: before.captureSha256 };
    const actualPath = `/documents/${productId}/${section}/${Array.isArray(rowOrRows) ? "0/" : ""}${field}${Array.isArray(value) ? "/0" : ""}`;
    expect(compareCatalogEvidence(before, after, { ...base, changes: [] })).toMatchObject({ ok: false, unexpectedPaths: [actualPath] });
    const expected: CatalogEvidenceChange = {
      path: actualPath,
      before: Array.isArray(value) ? { exists: true, value: "Apply reviewed guidance." } : old,
      after: { exists: true, value: Array.isArray(value) ? value[0] : value as Json },
    };
    expect(compareCatalogEvidence(before, after, { ...base, changes: [expected] })).toMatchObject({ ok: true });
    expect(compareCatalogEvidence(before, after, { ...base, changes: [{ ...expected, after: { exists: true, value: "wrong expected value" } }] })).toMatchObject({ ok: false });
  });

  it("rejects an altered evidence artifact even when its old stored hashes match the plan", () => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const after = createCatalogEvidence(input(), provenance, "postflight");
    (after.state.documents[productId].product as Record<string, Json>).display_name = "Unverified replacement";
    expect(() => compareCatalogEvidence(before, after, {
      version: 1, beforeCaptureSha256: before.captureSha256, changes: [],
    })).toThrow(/integrity/);
  });

  it("forbids rewriting historical rows even through an exact declared change", () => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const candidate = input(); candidate.state.history.auditEntries["audit-1"].sha256 = "d".repeat(64);
    const after = createCatalogEvidence(candidate, provenance, "postflight");
    const report = compareCatalogEvidence(before, after, {
      version: 1, beforeCaptureSha256: before.captureSha256,
      changes: [{ path: "/history/auditEntries/audit-1/sha256", before: { exists: true, value: hash }, after: { exists: true, value: "d".repeat(64) } }],
    });
    expect(report.ok).toBe(false);
    expect(report.violations).toContain("Preserved history/auditEntries row audit-1 changed or disappeared.");
  });

  it("permits only exact appended history while preserving earlier keys regardless of UUID sort order", () => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const candidate = input();
    const revision = { productId, revisionNumber: 2, schemaVersion: 4, sha256: "d".repeat(64) };
    const audit = { productId, action: "draft.published", revisionId: "revision-0", sha256: "e".repeat(64) };
    candidate.state.history.revisions["revision-0"] = revision;
    candidate.state.history.auditEntries["audit-0"] = audit;
    candidate.state.currentRevisions[productId] = { id: "revision-0", revisionNumber: 2, sha256: revision.sha256 };
    const after = createCatalogEvidence(candidate, provenance, "postflight");
    const changes: CatalogEvidenceChange[] = [
      { path: "/history/revisions/revision-0", before: { exists: false }, after: { exists: true, value: revision } },
      { path: "/history/auditEntries/audit-0", before: { exists: false }, after: { exists: true, value: audit } },
      ...[["id", "revision-1", "revision-0"], ["revisionNumber", 1, 2], ["sha256", hash, revision.sha256]].map(([field, old, next]) => ({
        path: `/currentRevisions/${productId}/${field}`,
        before: { exists: true as const, value: old }, after: { exists: true as const, value: next },
      })),
    ];
    const plan = { version: 1 as const, beforeCaptureSha256: before.captureSha256, changes };
    expect(compareCatalogEvidence(before, after, plan)).toMatchObject({ ok: true });
    expect(compareCatalogEvidence(before, after, { ...plan, changes: changes.slice(1) })).toMatchObject({ ok: false });

    candidate.state.history.revisions["revision-0"].revisionNumber = 3;
    candidate.state.currentRevisions[productId]!.revisionNumber = 3;
    const skippedRevision = createCatalogEvidence(candidate, provenance, "postflight");
    const report = compareCatalogEvidence(before, skippedRevision, { ...plan, changes: [] });
    expect(report.violations).toContain(`Product ${productId} appended nonsequential Published Revisions.`);
  });

  it("rejects duplicate or unused declarations and distinguishes missing data from an authored null", () => {
    const before = createCatalogEvidence(input(), provenance, "before");
    const candidate = input();
    (candidate.state.documents[productId].product as Record<string, Json>).seo_title = null;
    const after = createCatalogEvidence(candidate, provenance, "prepared");
    const change: CatalogEvidenceChange = { path: `/documents/${productId}/product/seo_title`, before: { exists: false }, after: { exists: true, value: null } };
    const plan = { version: 1 as const, beforeCaptureSha256: before.captureSha256, changes: [change] };
    expect(compareCatalogEvidence(before, after, plan).ok).toBe(true);
    expect(compareCatalogEvidence(before, after, { ...plan, changes: [{ ...change, before: { exists: true, value: null } }] }).ok).toBe(false);
    expect(() => compareCatalogEvidence(before, after, { ...plan, changes: [change, change] })).toThrow(/unique/);
    expect(compareCatalogEvidence(before, before, plan)).toMatchObject({ ok: false, unobservedPaths: [change.path] });
  });

  it("captures through verified read-only requests into a private exclusive file and prints only bounded evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "helix-catalog-evidence-"));
    const invocationDirectory = process.cwd();
    try {
      // Source provenance belongs to the loaded extractor even when invoked elsewhere.
      process.chdir(directory);
      const output = join(directory, "before.json");
      const request = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ ref: provenance.projectRef, status: "ACTIVE_HEALTHY", database: { host: `db.${provenance.projectRef}.supabase.co` } }))
        .mockResolvedValueOnce(Response.json([{ media_boundary: { catalog_media_policy: false, catalog_media_operations: false, verified_media_copies: false } }]))
        .mockResolvedValueOnce(Response.json([{ evidence: input() }]));
      const report = await runCatalogEvidenceCommand(["capture", "--phase=before", `--output=${output}`], {
        env: { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: provenance.endpoint, SUPABASE_ACCESS_TOKEN: "private-test-token" }, fetchImpl: request,
        now: () => new Date("2026-09-14T08:00:00.000Z"),
      });
      expect(report).toMatchObject({ ok: true, phase: "before", operationalCompletionVerified: false, products: 1 });
      const contents = JSON.parse(await readFile(output, "utf8"));
      expect(contents.state.documents[productId].productSource.supplier_title).toBe("Reviewed source");
      expect((await stat(output)).mode & 0o777).toBe(0o600);
      expect(JSON.stringify(report)).not.toMatch(/private-test-token|Reviewed source|ISSUED-SKU|Apply reviewed guidance/);
      expect(request).toHaveBeenCalledTimes(3);
      for (const [, options] of request.mock.calls.slice(1)) {
        const body = JSON.parse(options!.body as string);
        // The provider's constrained read-only role cannot execute the private
        // Catalog document reader. The actual authorized transaction stays read-only.
        expect(body.read_only).toBe(false);
        expect(body.query).toMatch(/^BEGIN READ ONLY;\nSET LOCAL TIME ZONE 'UTC';\nselect /);
        expect(body.query).toMatch(/;\nROLLBACK;$/);
        expect(body).not.toHaveProperty("parameters");
      }
      await expect(runCatalogEvidenceCommand(["capture", "--phase=before", `--output=${output}`], {
        env: { NODE_ENV: "test" }, fetchImpl: request,
      })).rejects.toThrow(/already exists/);
      expect(request).toHaveBeenCalledTimes(3);
    } finally { process.chdir(invocationDirectory); await rm(directory, { recursive: true, force: true }); }
  });

  it("compares private artifacts offline without provider credentials or requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "helix-catalog-comparison-"));
    try {
      const before = createCatalogEvidence(input(), provenance, "before");
      const after = createCatalogEvidence(input(), provenance, "postflight");
      const files = { before, after, plan: { version: 1, beforeCaptureSha256: before.captureSha256, changes: [] } };
      for (const [name, value] of Object.entries(files)) await writeFile(join(directory, `${name}.json`), JSON.stringify(value), { mode: 0o600 });
      const request = vi.fn<typeof fetch>();
      const report = await runCatalogEvidenceCommand(["compare", ...["before", "after", "plan"].map((name) => `--${name}=${join(directory, `${name}.json`)}`)], {
        env: { NODE_ENV: "test" }, fetchImpl: request,
      });
      expect(report).toMatchObject({ ok: true, operationalCompletionVerified: false, changedPaths: [] });
      expect(request).not.toHaveBeenCalled();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("refuses source or extractor drift during provider reads before writing evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "helix-catalog-provenance-"));
    try {
      const request = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ ref: provenance.projectRef, status: "ACTIVE_HEALTHY", database: { host: `db.${provenance.projectRef}.supabase.co` } }))
        .mockResolvedValueOnce(Response.json([{ media_boundary: { catalog_media_policy: false, catalog_media_operations: false, verified_media_copies: false } }]))
        .mockResolvedValueOnce(Response.json([{ evidence: input() }]));
      const readProvenance = vi.fn()
        .mockResolvedValueOnce({ sourceCommit: provenance.sourceCommit, extractorSha256: provenance.extractorSha256 })
        .mockResolvedValueOnce({ sourceCommit: "d".repeat(40), extractorSha256: "e".repeat(64) });
      const output = join(directory, "refused.json");
      await expect(runCatalogEvidenceCommand(["capture", "--phase=before", `--output=${output}`], {
        env: { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: provenance.endpoint, SUPABASE_ACCESS_TOKEN: "private-test-token" }, fetchImpl: request,
        readProvenance, now: () => new Date("2026-09-14T08:00:00.000Z"),
      })).rejects.toThrow(/source or extractor changed/);
      expect(readProvenance.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
      await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["wrong project", { ref: "other-project", status: "ACTIVE_HEALTHY", database: { host: "db.other-project.supabase.co" } }, 200, /exact healthy approved project/],
    ["provider failure", { error: "PRIVATE PROVIDER TOKEN" }, 403, /HTTP 403/],
  ] as const)("refuses %s without reading Catalog data or exposing provider payloads", async (_label, project, status, expected) => {
    const directory = await mkdtemp(join(tmpdir(), "helix-catalog-refusal-"));
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(project, { status }));
      await expect(runCatalogEvidenceCommand(["capture", "--phase=before", `--output=${join(directory, "refused.json")}`], {
        env: { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: provenance.endpoint, SUPABASE_ACCESS_TOKEN: "private-test-token" }, fetchImpl: request,
      })).rejects.toThrow(expected);
      expect(request).toHaveBeenCalledOnce();
      await expect(stat(join(directory, "refused.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
