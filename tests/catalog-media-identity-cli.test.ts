// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogDocument } from "./fixtures/catalog-editor";
import {
  parseMediaIdentityArgs,
  runMediaIdentityCommand,
  createMediaIdentityGateway,
  type MediaIdentityGateway,
} from "../scripts/catalog/media-identity";
import type { MediaIdentityManifest } from "../scripts/catalog/product-media-identity";

const operationId = "123e4567-e89b-42d3-a456-426614174006";
const actorId = "123e4567-e89b-42d3-a456-426614174005";
const prefix = "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/";
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfoAAAAASUVORK5CYII=", "base64");
const assetSha256 = "350a03119e021c69694ed8e9b78251fc684f8d2d1683374b24099b5efdb59ff8";
const sourceUrl = `${prefix}products/old-product/primary/${assetSha256}.png`;
const targetUrl = `${prefix}products/${catalogDocument.productId}/primary/${assetSha256}.png`;

function fixture({ targetMissing = false } = {}) {
  const document = structuredClone(catalogDocument);
  document.media = [{ ...document.media[0], url: sourceUrl, width: 1, height: 1 }];
  const manifest: MediaIdentityManifest = {
    version: 1, projectRef: "erasogmsqpgiirovubjh", operationId, actorId,
    products: [{ productId: document.productId, expectedRevision: 3, expectedDocument: document,
      media: [{ mediaId: document.media[0].id, sourceUrl, targetUrl,
        sha256: assetSha256, byteSize: 68, mimeType: "image/png", width: 1, height: 1 }] }],
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const afterDocument = structuredClone(document);
  afterDocument.media[0].url = targetUrl;
  let snapshots = [{ document, revision: 3, activeDrafts: 0 }];
  let operation: Record<string, unknown> | null = null;
  const policy = { enabled: false, operationId: null, activatedAt: null };
  const result = { ok: true, outcome: "published", operationId, products: [{ productId: document.productId, revision: 4, revisionId: actorId }], associationCount: 1 };
  const objects = new Map([[sourceUrl, bytes], ...targetMissing ? [] : [[targetUrl, bytes] as const]]);
  const runtime = {
    fetchImpl: vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      url.search = "";
      const content = objects.get(url.href);
      return content ? new Response(init?.method === "HEAD" ? null : content, {
        headers: { "content-type": "image/png", "content-length": String(content.length), "cache-control": "public, max-age=31536000" },
      }) : new Response(null, { status: 404 });
    }),
    inspect: vi.fn(async (content: Buffer) => {
      expect(content).toEqual(bytes);
      return { width: 1, height: 1, mimeType: "image/png" as const };
    }),
  };
  const gateway = {
    readSnapshots: vi.fn(async () => snapshots),
    readAdmin: vi.fn(async () => actorId),
    readOperation: vi.fn(async () => ({ operation, policy })),
    readObjectVersion: vi.fn(async () => ({ id: actorId, version: "version-one" })),
    copyObject: vi.fn(async (sourcePath: string, targetPath: string) => {
      const content = objects.get(`${prefix}${sourcePath}`);
      if (!content || objects.has(`${prefix}${targetPath}`)) throw new Error("Storage copy refused.");
      objects.set(`${prefix}${targetPath}`, Buffer.from(content));
    }),
    cutover: vi.fn<MediaIdentityGateway["cutover"]>(async () => {
      if (operation !== null) return { ...result, outcome: "no-op" };
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
  return { manifest, text, flags, gateway, afterDocument, runtime, objects };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external network request."); }));
});
afterEach(() => vi.unstubAllGlobals());

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
    const { flags, gateway, text, runtime } = fixture();
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => `${text} `, runtime)).rejects.toThrow(/file SHA256/);
    for (const call of Object.values(gateway)) expect(call).not.toHaveBeenCalled();
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(runtime.inspect).not.toHaveBeenCalled();
  });

  it("rejects a different operation before any provider call", async () => {
    const { flags, gateway, text, runtime } = fixture();
    const args = flags.map((value) => value === operationId ? "123e4567-e89b-42d3-a456-426614174007" : value);
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...args]), gateway, async () => text, runtime)).rejects.toThrow(/operation or project/);
    for (const call of Object.values(gateway)) expect(call).not.toHaveBeenCalled();
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(runtime.inspect).not.toHaveBeenCalled();
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
    const { manifest, gateway, runtime } = fixture();
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["plan", "--operation-id", operationId]), gateway, undefined, runtime)).resolves.toEqual(manifest);
    expect(gateway.readSnapshots).toHaveBeenCalledOnce();
    expect(gateway.readAdmin).toHaveBeenCalledOnce();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
    expect(runtime.fetchImpl).toHaveBeenCalledWith(sourceUrl, expect.objectContaining({ method: "HEAD" }));
    expect(runtime.inspect).not.toHaveBeenCalled();
  });

  it.each(["revision", "document", "draft"])("rejects changed %s before media verification or mutation", async (changed) => {
    const { manifest, flags, gateway, text, runtime } = fixture();
    const document = structuredClone(manifest.products[0].expectedDocument);
    if (changed === "document") document.product.display_name = "An intervening edit";
    gateway.readSnapshots.mockResolvedValue([{ document, revision: changed === "revision" ? 4 : 3, activeDrafts: changed === "draft" ? 1 : 0 }]);
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => text, runtime)).rejects.toThrow();
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it("copies missing bytes without cutting over pointers or activating the policy", async () => {
    const { flags, gateway, text, runtime, objects } = fixture({ targetMissing: true });
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => text, runtime);
    expect(gateway.copyObject).toHaveBeenCalledExactlyOnceWith(
      `products/old-product/primary/${assetSha256}.png`,
      `products/${catalogDocument.productId}/primary/${assetSha256}.png`,
    );
    expect(objects.get(sourceUrl)).toEqual(bytes);
    expect(objects.get(targetUrl)).toEqual(bytes);
    expect(output).toMatchObject({ report: { copied: 1, distinctAssets: 1, associations: 1,
      assets: [{ sourceSha256: assetSha256, targetSha256: assetSha256, canonicalSha256: assetSha256, byteSize: 68, width: 1, height: 1 }] } });
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("verifies complete existing media bytes without any provider write", async () => {
    const { flags, gateway, text, runtime } = fixture();
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs(["verify", ...flags]), gateway, async () => text, runtime);
    expect(output).toMatchObject({ report: { copied: 0, distinctAssets: 1, associations: 1,
      assets: [{ sourceSha256: assetSha256, targetSha256: assetSha256, canonicalSha256: assetSha256, byteSize: 68, width: 1, height: 1 }] } });
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("refuses to create a missing copy during read-only verification", async () => {
    const { flags, gateway, text, runtime, objects } = fixture({ targetMissing: true });
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["verify", ...flags]), gateway, async () => text, runtime)).rejects.toThrow(/retrievable/);
    expect(objects.has(targetUrl)).toBe(false);
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it.each(["cutover", "activate"])("stops %s when the real engine finds different destination bytes", async (command) => {
    const { manifest, flags, gateway, text, runtime, objects } = fixture();
    if (command === "activate") {
      await gateway.cutover(manifest);
      gateway.cutover.mockClear();
    }
    const corrupted = Buffer.from(bytes);
    corrupted[corrupted.length - 1] ^= 1;
    objects.set(targetUrl, corrupted);
    const extra = command === "activate" ? ["--deployment-sha", "c".repeat(40), "--current-writers-verified"] : [];
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs([command, ...flags, ...extra]), gateway, async () => text, runtime)).rejects.toThrow(/differs from the source/);
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it.each([
    { command: "cutover", change: "Catalog revision" },
    { command: "cutover", change: "administrator membership" },
    { command: "activate", change: "Catalog revision" },
    { command: "activate", change: "administrator membership" },
  ])("stops $command when $change changes during byte verification", async ({ command, change }) => {
    const { manifest, flags, gateway, text, runtime, afterDocument } = fixture();
    if (command === "activate") {
      await gateway.cutover(manifest);
      gateway.cutover.mockClear();
    }
    if (change === "Catalog revision") {
      const current = { document: command === "activate" ? afterDocument : manifest.products[0].expectedDocument,
        revision: command === "activate" ? 4 : 3, activeDrafts: 0 };
      gateway.readSnapshots.mockResolvedValueOnce([current]).mockResolvedValue([{ ...current, revision: current.revision + 1 }]);
    } else {
      gateway.readAdmin.mockResolvedValueOnce(actorId).mockRejectedValue(new Error("Administrator is now inactive."));
    }
    const extra = command === "activate" ? ["--deployment-sha", "c".repeat(40), "--current-writers-verified"] : [];
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs([command, ...flags, ...extra]), gateway, async () => text, runtime)).rejects.toThrow(/stale revision|inactive/);
    expect(runtime.inspect).toHaveBeenCalledTimes(2);
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("rejects an inactive administrator before media verification", async () => {
    const { flags, gateway, text, runtime } = fixture();
    gateway.readAdmin.mockRejectedValue(new Error("Administrator is inactive."));
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text, runtime)).rejects.toThrow(/inactive/);
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it("does not recreate Storage objects after a recorded cutover", async () => {
    const { manifest, flags, gateway, text, runtime } = fixture();
    await gateway.cutover(manifest);
    gateway.cutover.mockClear();
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["copy", ...flags]), gateway, async () => text, runtime)).rejects.toThrow(/already recorded/);
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.cutover).not.toHaveBeenCalled();
  });

  it("rejects an object-version race before pointer cutover", async () => {
    const { flags, gateway, text, runtime } = fixture();
    gateway.readObjectVersion.mockResolvedValueOnce({ id: actorId, version: "version-one" });
    gateway.readObjectVersion.mockResolvedValueOnce({ id: actorId, version: "version-one" });
    gateway.readObjectVersion.mockResolvedValue({ id: actorId, version: "version-two" });
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text, runtime)).rejects.toThrow(/changed during full-byte/);
    expect(runtime.inspect).toHaveBeenCalledTimes(2);
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("binds verified object versions to cutover and leaves activation separate", async () => {
    const { flags, gateway, text, runtime } = fixture();
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs(["cutover", ...flags]), gateway, async () => text, runtime);
    expect(gateway.cutover).toHaveBeenCalledWith(expect.objectContaining({
      products: [expect.objectContaining({ media: [expect.objectContaining({
        sourceObject: { id: actorId, version: "version-one" },
        targetObject: { id: actorId, version: "version-one" },
      })] })],
    }));
    expect(runtime.inspect).toHaveBeenCalledTimes(2);
    expect(gateway.cutover.mock.invocationCallOrder[0]).toBeGreaterThan(runtime.fetchImpl.mock.invocationCallOrder.at(-1)!);
    expect(gateway.activate).not.toHaveBeenCalled();
    expect(output).toEqual(expect.objectContaining({ downstreamVerificationRequired: expect.arrayContaining(["Product Search reconciliation", "Catalog cache reconciliation"]) }));
  });

  it("re-verifies the completed operation on a cutover retry without creating another revision", async () => {
    const { flags, gateway, text, runtime } = fixture();
    const options = parseMediaIdentityArgs(["cutover", ...flags]);
    await runMediaIdentityCommand(options, gateway, async () => text, runtime);
    const output = await runMediaIdentityCommand(options, gateway, async () => text, runtime);
    expect(output).toMatchObject({
      result: { operationId, outcome: "no-op", products: [{ revision: 4 }] },
      recordedOperation: { operationId, outcome: "published", products: [{ revision: 4 }] },
      report: { copied: 0, assets: [{ sourceSha256: assetSha256, targetSha256: assetSha256 }] },
    });
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it.each(["verify", "activate"])("requires a recorded cutover for post-cutover %s", async (command) => {
    const { flags, gateway, text, afterDocument, runtime } = fixture();
    gateway.readSnapshots.mockResolvedValue([{ document: afterDocument, revision: 4, activeDrafts: 0 }]);
    const extra = command === "verify" ? ["--state", "after"] : ["--deployment-sha", "c".repeat(40), "--current-writers-verified"];
    await expect(runMediaIdentityCommand(parseMediaIdentityArgs([command, ...flags, ...extra]), gateway, async () => text, runtime)).rejects.toThrow(/completed media cutover/);
    expect(runtime.fetchImpl).not.toHaveBeenCalled();
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("activates only after full media verification and reports the external deployment attestation", async () => {
    const { manifest, flags, gateway, text, runtime } = fixture();
    await gateway.cutover(manifest);
    gateway.cutover.mockClear();
    const output = await runMediaIdentityCommand(parseMediaIdentityArgs([
      "activate", ...flags, "--deployment-sha", "c".repeat(40), "--current-writers-verified",
    ]), gateway, async () => text, runtime);
    expect(gateway.activate).toHaveBeenCalledWith(operationId, actorId);
    expect(gateway.activate.mock.invocationCallOrder[0]).toBeGreaterThan(runtime.fetchImpl.mock.invocationCallOrder.at(-1)!);
    expect(gateway.cutover).not.toHaveBeenCalled();
    expect(gateway.copyObject).not.toHaveBeenCalled();
    expect(output).toEqual(expect.objectContaining({
      deploymentSha: "c".repeat(40),
      deploymentEvidence: expect.stringContaining("does not inspect the deployment"),
      recordedOperation: expect.objectContaining({ operationId, outcome: "published" }),
    }));
  });
});
