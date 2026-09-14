// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogDocument } from "./fixtures/catalog-editor";
import {
  parseMediaIdentityArgs,
  runMediaIdentityCommand,
  createMediaIdentityGateway,
  type MediaIdentityGateway,
} from "../scripts/catalog/media-identity";
import {
  buildMediaIdentityManifest,
  verifyAndCopyMedia,
  type MediaIdentityManifest,
} from "../scripts/catalog/product-media-identity";

vi.mock("../scripts/catalog/product-media-identity", async () => ({
  ...await vi.importActual("../scripts/catalog/product-media-identity"),
  buildMediaIdentityManifest: vi.fn(),
  verifyAndCopyMedia: vi.fn(),
}));

const operationId = "123e4567-e89b-42d3-a456-426614174006";
const actorId = "123e4567-e89b-42d3-a456-426614174005";
const prefix = "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/";
const sourceUrl = `${prefix}products/old-product/primary/${"a".repeat(64)}.webp`;
const targetUrl = `${prefix}products/${catalogDocument.productId}/primary/${"a".repeat(64)}.webp`;

function fixture() {
  const document = structuredClone(catalogDocument);
  document.media = [{ ...document.media[0], url: sourceUrl }];
  const manifest: MediaIdentityManifest = {
    version: 1, projectRef: "erasogmsqpgiirovubjh", operationId, actorId,
    products: [{ productId: document.productId, expectedRevision: 3, expectedDocument: document,
      media: [{ mediaId: document.media[0].id, sourceUrl, targetUrl,
        sha256: "a".repeat(64), byteSize: 128, mimeType: "image/webp", width: 800, height: 1000 }] }],
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const afterDocument = structuredClone(document);
  afterDocument.media[0].url = targetUrl;
  let snapshots = [{ document, revision: 3, activeDrafts: 0 }];
  let operation: Record<string, unknown> | null = null;
  const policy = { enabled: false, operationId: null, activatedAt: null };
  const result = { ok: true, outcome: "published", operationId, products: [{ productId: document.productId, revision: 4, revisionId: actorId }], associationCount: 1 };
  const gateway = {
    readSnapshots: vi.fn(async () => snapshots),
    readAdmin: vi.fn(async () => actorId),
    readOperation: vi.fn(async () => ({ operation, policy })),
    readObjectVersion: vi.fn(async () => ({ id: actorId, version: "version-one" })),
    copyObject: vi.fn(async () => {}),
    cutover: vi.fn<MediaIdentityGateway["cutover"]>(async () => {
      snapshots = [{ document: afterDocument, revision: 4, activeDrafts: 0 }];
      operation = result;
      return result;
    }),
    activate: vi.fn(async () => ({ ok: true, outcome: "activated", operationId })),
  } satisfies MediaIdentityGateway;
  const flags = ["--manifest", "/private/tmp/reviewed-media.json",
    "--expect-project", manifest.projectRef,
    "--expect-operation", operationId,
    "--expect-manifest-sha256", createHash("sha256").update(text).digest("hex")];
  return { manifest, text, flags, gateway, afterDocument };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyAndCopyMedia).mockResolvedValue({
    operationId, manifestSha256: "b".repeat(64), distinctAssets: 1, associations: 1, copied: 0, assets: [],
  });
});

describe("media identity command confirmations", () => {
  it.each([
    [], ["apply"], ["copy"],
    ["plan", "--operation-id", operationId, "--operation-id", operationId],
    ["plan", "--unknown", "value"],
  ].map((args) => ({ args })))("rejects absent, implicit, duplicate, or unknown arguments: $args", ({ args }) => {
    expect(() => parseMediaIdentityArgs(args)).toThrow();
  });

  it("requires the exact project and absolute manifest path", () => {
    const { flags } = fixture();
    expect(() => parseMediaIdentityArgs(["copy", ...flags.map((value) => value === "erasogmsqpgiirovubjh" ? "another-project" : value)])).toThrow();
    expect(() => parseMediaIdentityArgs(["copy", ...flags.map((value) => value === "/private/tmp/reviewed-media.json" ? "relative.json" : value)])).toThrow();
  });

  it("requires both deployment evidence confirmations only for activation", () => {
    const { flags } = fixture();
    expect(() => parseMediaIdentityArgs(["activate", ...flags])).toThrow(/Activation requires/);
    expect(() => parseMediaIdentityArgs(["activate", ...flags, "--deployment-sha", "c".repeat(40)])).toThrow(/Activation requires/);
    expect(() => parseMediaIdentityArgs(["cutover", ...flags, "--current-writers-verified"])).toThrow(/Unsupported/);
    expect(parseMediaIdentityArgs(["activate", ...flags, "--deployment-sha", "c".repeat(40), "--current-writers-verified"]).command).toBe("activate");
  });

  it("rejects changed file bytes before any provider call", async () => {
    const { flags, gateway, text } = fixture();
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => `${text} `)).rejects.toThrow(/file SHA256/);
    for (const call of Object.values(gateway)) expect(call).not.toHaveBeenCalled();
  });

  it("rejects a different operation before any provider call", async () => {
    const { flags, gateway, text } = fixture();
    const args = flags.map((value) => value === operationId ? "123e4567-e89b-42d3-a456-426614174007" : value);
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...args]), gateway, async () => text)).rejects.toThrow(/operation or project/);
    for (const call of Object.values(gateway)) expect(call).not.toHaveBeenCalled();
  });
});

describe("media identity operation ordering", () => {
  it("reads Active and Draft Products while leaving Archived Products outside the operation", async () => {
    const documents = (["active", "draft", "archived"] as const).map((status, index) => {
      const document = structuredClone(catalogDocument);
      const id = `123e4567-e89b-42d3-a456-42661417400${index}`;
      document.productId = id;
      document.product.id = id;
      document.product.catalog_status = status;
      document.media = document.media.map((media) => ({ ...media, product_id: id }));
      document.variants = document.variants.map((variant) => ({ ...variant, product_id: id }));
      if (document.productSource) document.productSource.product_id = id;
      return document;
    });
    const rpc = vi.fn(async (_name: string, args: { p_product_id: string }) => ({
      data: documents.find((document) => document.productId === args.p_product_id), error: null,
    }));
    const client = {
      rpc,
      from(table: string) {
        const filters: { key: string; value: string; equal: boolean }[] = [];
        const query: Record<string, unknown> = {};
        Object.assign(query, {
          select: () => query,
          eq: (key: string, value: string) => { filters.push({ key, value, equal: true }); return query; },
          neq: (key: string, value: string) => { filters.push({ key, value, equal: false }); return query; },
          order: () => query,
          limit: () => query,
          range: async () => {
            if (table !== "products") throw new Error("Unexpected paginated table.");
            return { error: null, data: documents.filter((document) => filters.every(({ key, value, equal }) =>
              (document.product[key as keyof typeof document.product] === value) === equal,
            )).map((document) => ({ id: document.productId })) };
          },
          maybeSingle: async () => ({ error: null, data: { revision_number: 3 } }),
          in: async () => ({ error: null, data: null, count: 0 }),
        });
        return query;
      },
    } as unknown as SupabaseClient;
    const snapshots = await createMediaIdentityGateway(client).readSnapshots();
    expect(snapshots.map(({ document }) => document.product.catalog_status)).toEqual(["active", "draft"]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(snapshots.some(({ document }) => document.productId === documents[2].productId)).toBe(false);
  });

  it("plans through read-only boundaries and returns only the manifest", async () => {
    const { manifest, gateway } = fixture();
    vi.mocked(buildMediaIdentityManifest).mockResolvedValue(manifest);
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["plan", "--operation-id", operationId]), gateway)).resolves.toEqual(manifest);
    expect(gateway.readSnapshots).toHaveBeenCalledOnce();
    expect(gateway.readAdmin).toHaveBeenCalledOnce();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
    expect(verifyAndCopyMedia).not.toHaveBeenCalled();
  });

  it.each(["revision", "document", "draft"])("rejects changed %s before media verification or mutation", async (changed) => {
    const { manifest, flags, gateway, text } = fixture();
    const document = structuredClone(manifest.products[0].expectedDocument);
    if (changed === "document") document.product.display_name = "An intervening edit";
    gateway.readSnapshots.mockResolvedValue([{ document, revision: changed === "revision" ? 4 : 3, activeDrafts: changed === "draft" ? 1 : 0 }]);
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => text)).rejects.toThrow();
    expect(verifyAndCopyMedia).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it.each(["copy", "verify"])("keeps %s separate from cutover and activation", async (command) => {
    const { flags, gateway, text } = fixture();
    await runMediaIdentityCommand(parseMediaIdentityArgs([command, ...flags]), gateway, async () => text);
    expect(verifyAndCopyMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: command }));
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("rejects an inactive administrator before media verification", async () => {
    const { flags, gateway, text } = fixture();
    gateway.readAdmin.mockRejectedValue(new Error("Administrator is inactive."));
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text)).rejects.toThrow(/inactive/);
    expect(verifyAndCopyMedia).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it("does not recreate Storage objects after a recorded cutover", async () => {
    const { manifest, flags, gateway, text } = fixture();
    await gateway.cutover(manifest);
    gateway.cutover.mockClear();
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => text)).rejects.toThrow(/already recorded/);
    expect(verifyAndCopyMedia).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it("rejects an object-version race before pointer cutover", async () => {
    const { flags, gateway, text } = fixture();
    gateway.readObjectVersion.mockResolvedValueOnce({ id: actorId, version: "version-one" });
    gateway.readObjectVersion.mockResolvedValueOnce({ id: actorId, version: "version-one" });
    gateway.readObjectVersion.mockResolvedValue({ id: actorId, version: "version-two" });
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text)).rejects.toThrow(/changed during full-byte/);
    expect(verifyAndCopyMedia).toHaveBeenCalledOnce();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("binds verified object versions to cutover and leaves activation separate", async () => {
    const { flags, gateway, text } = fixture();
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text);
    expect(gateway.cutover).toHaveBeenCalledWith(expect.objectContaining({
      products: [expect.objectContaining({ media: [expect.objectContaining({
        sourceObject: { id: actorId, version: "version-one" },
        targetObject: { id: actorId, version: "version-one" },
      })] })],
    }));
    expect(verifyAndCopyMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: "verify" }));
    expect(gateway.cutover.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(verifyAndCopyMedia).mock.invocationCallOrder[0]);
    expect(gateway.activate).not.toHaveBeenCalled();
    expect(output).toEqual(expect.objectContaining({ downstreamVerificationRequired: expect.arrayContaining(["Product Search reconciliation", "Catalog cache reconciliation"]) }));
  });

  it.each(["verify", "activate"])("requires a recorded cutover for post-cutover %s", async (command) => {
    const { flags, gateway, text, afterDocument } = fixture();
    gateway.readSnapshots.mockResolvedValue([{ document: afterDocument, revision: 4, activeDrafts: 0 }]);
    const extra = command === "verify" ? ["--state", "after"] : ["--deployment-sha", "c".repeat(40), "--current-writers-verified"];
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs([command, ...flags, ...extra]), gateway, async () => text)).rejects.toThrow(/completed media cutover/);
    expect(verifyAndCopyMedia).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("activates only after full media verification and reports the external deployment attestation", async () => {
    const { manifest, flags, gateway, text } = fixture();
    await gateway.cutover(manifest);
    gateway.cutover.mockClear();
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs([
      "activate", ...flags, "--deployment-sha", "c".repeat(40), "--current-writers-verified",
    ]), gateway, async () => text);
    expect(gateway.activate).toHaveBeenCalledWith(operationId, actorId);
    expect(gateway.activate.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(verifyAndCopyMedia).mock.invocationCallOrder[0]);
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(output).toEqual(expect.objectContaining({
      deploymentSha: "c".repeat(40),
      deploymentEvidence: expect.stringContaining("does not inspect the deployment"),
      recordedOperation: expect.objectContaining({ operationId, outcome: "published" }),
    }));
  });
});
