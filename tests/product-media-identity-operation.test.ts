import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertCurrentMediaSnapshot, assertMediaIdentityManifest, buildMediaIdentityManifest, manifestDigest, verifyAndCopyMedia } from "../scripts/catalog/product-media-identity";
import type { ProductEditorDocumentV4 } from "../lib/admin/catalog/types";
import { catalogDraft } from "./fixtures/catalog-editor";

const productId = catalogDraft.document.productId;
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfoAAAAASUVORK5CYII=", "base64");
const hash = createHash("sha256").update(bytes).digest("hex");
const origin = "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/";
const sourceUrl = `${origin}products/old-product/primary/${hash}.png`;
const targetUrl = `${origin}products/${productId}/primary/${hash}.png`;
const document = { ...catalogDraft.document, media: [{ ...catalogDraft.document.media[0], url: sourceUrl, width: 1, height: 1 }] };
const snapshot = { document, revision: 3, activeDrafts: 0 };
function response(body: Uint8Array | null, status = 200) {
  return new Response(body as BodyInit | null, { status, headers: {
    "content-type": "image/png", "content-length": String(bytes.length),
    "cache-control": "public, max-age=31536000",
  } });
}
function missingObject(status = 400, error = "not_found") {
  const body = JSON.stringify({ statusCode: "404", code: "NoSuchKey", error, message: "Object not found" });
  return new Response(body, { status, headers: {
    "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(body)),
  } });
}
const missingBody = '{"statusCode":"404","code":"NoSuchKey","error":"not_found","message":"Object not found"}';
function errorResponse(body: string | Uint8Array, overrides: HeadersInit = {}) {
  return new Response(body as BodyInit, { status: 400, headers: {
    "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...overrides,
  } });
}
function canonicalUrl(value: string | URL | Request) {
  const url = new URL(String(value)); url.search = ""; return url.href;
}
const inspect = async () => ({ width: 1, height: 1, mimeType: "image/png" as const });
const head = vi.fn(async () => response(null)) as unknown as typeof fetch;
const makeManifest = () => buildMediaIdentityManifest({
  operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
  snapshots: [snapshot], http: head,
});

async function cutoverFixture() {
  const before: ProductEditorDocumentV4 = structuredClone(document);
  const original = before.media[0];
  before.media.push(
    { ...original, id: "123e4567-e89b-42d3-a456-426614174010", url: targetUrl, sort_order: 1 },
    { ...original, id: "123e4567-e89b-42d3-a456-426614174011", url: null, sort_order: 2 },
    { ...original, id: "123e4567-e89b-42d3-a456-426614174012", archived_at: original.updated_at, sort_order: 3 },
  );
  before.relationships = [{ product_id: productId, related_product_id: "123e4567-e89b-42d3-a456-426614174099",
    relationship_type: "related", sort_order: 0, created_at: original.created_at, archived_at: null }];
  const familyId = "123e4567-e89b-42d3-a456-426614174020";
  before.productFamily = {
    family: { id: familyId, slug: "cleanse", display_name: "CLEANSE", system_step_name: "CLEANSE",
      created_at: original.created_at, updated_at: original.updated_at },
    memberships: [{ family_id: familyId, product_id: productId, option_label: "Daily", is_entry: true,
      sort_order: 0, created_at: original.created_at, updated_at: original.updated_at }],
  };
  const manifest = await buildMediaIdentityManifest({
    operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
    snapshots: [{ document: before, revision: 3, activeDrafts: 0 }], http: head,
  });
  const after = structuredClone(before);
  after.media[0].url = targetUrl;
  after.media[0].updated_at = "2026-09-14T09:10:20.123456+00:00";
  return { manifest, before, after };
}

describe("reviewed Product Media identity operation", () => {
  it("plans shared media from GET delivery headers and cancels the unread body", async () => {
    const cancel = vi.fn();
    const http = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { headers: {
        "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "no-cache",
      } });
      return new Response(new ReadableStream({ cancel }), { headers: {
        "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "public, max-age=31536000",
      } });
    });
    const shared = { ...document, media: [document.media[0], {
      ...document.media[0], id: catalogDraft.document.media[1].id, role: "cart", alt: "Shared image in the Cart", sort_order: 1,
    }] };
    const manifest = await buildMediaIdentityManifest({
      operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
      snapshots: [{ ...snapshot, document: shared }], http,
    });
    expect(http).toHaveBeenCalledExactlyOnceWith(sourceUrl, {
      method: "GET", redirect: "manual", credentials: "omit", signal: expect.any(AbortSignal),
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(manifest.products[0].media).toHaveLength(2);
    expect(manifest.products[0].media[0]).toMatchObject({ byteSize: bytes.length, mimeType: "image/png", sha256: hash });
  });

  it.each([
    ["redirect", 302, {}],
    ["partial content", 206, {}],
    ["wrong MIME", 200, { "content-type": "image/webp" }],
    ["zero length", 200, { "content-length": "0" }],
    ["oversized length", 200, { "content-length": String(16 * 1024 * 1024 + 1) }],
    ["empty length", 200, { "content-length": "" }],
    ["no-cache GET", 200, { "cache-control": "no-cache" }],
    ["private GET", 200, { "cache-control": "private, max-age=31536000" }],
    ["no-store GET", 200, { "cache-control": "no-store, max-age=31536000" }],
  ] as const)("cancels the unread body when planning rejects %s", async (_label, status, overrides) => {
    const cancel = vi.fn();
    const http = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel }), {
      status, headers: {
        "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "public, max-age=31536000",
        ...overrides,
      },
    }));
    await expect(buildMediaIdentityManifest({
      operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
      snapshots: [snapshot], http,
    })).rejects.toThrow();
    expect(http).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 200, pending: true }, { status: 302, pending: true },
    { status: 200, pending: false }, { status: 302, pending: false },
  ])("planning preserves its result when cleanup cannot complete: $status, pending=$pending", async ({ status, pending }) => {
    const cancel = vi.fn(() => pending ? new Promise<void>(() => {}) : Promise.reject(new Error("Cancellation failed")));
    const stream = new ReadableStream({ cancel });
    const http = vi.fn(async () => new Response(stream, { status, headers: {
      "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "public, max-age=3600",
    } })) as typeof fetch;
    let outcome: unknown;
    void buildMediaIdentityManifest({ operationId: "10000000-0000-4000-8000-000000000701",
      actorId: catalogDraft.updated_by, snapshots: [snapshot], http,
    }).then((result) => { outcome = result; }, (error) => { outcome = error; });
    await vi.waitFor(() => expect(outcome).toBeDefined(), { timeout: 200 });
    if (status === 200) expect(outcome).toMatchObject({ products: [{ productId }] });
    else expect(outcome).toMatchObject({ message: "Source Product Media is not directly available." });
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("rejects a PNG-coded AVI advertised as an image before copying", async () => {
    // Synthetic 16×16 PNG frame in an AVI container: codec alone is not MIME evidence.
    const avi = await readFile("tests/fixtures/png-coded-avi.avi");
    const aviHash = createHash("sha256").update(avi).digest("hex");
    const manifest = await makeManifest();
    const copy = manifest.products[0].media[0];
    Object.assign(copy, { sourceUrl: sourceUrl.replace(hash, aviHash), targetUrl: targetUrl.replace(hash, aviHash),
      sha256: aviHash, byteSize: avi.length, width: 16, height: 16 });
    Object.assign(manifest.products[0].expectedDocument.media[0], { url: copy.sourceUrl, width: 16, height: 16 });
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => new Response(avi, { headers: {
      "content-type": "image/png", "content-length": String(avi.length), "cache-control": "public, max-age=31536000",
    } })) as typeof fetch;
    await expect(verifyAndCopyMedia(manifest, { mode: "copy", fetchImpl, copyObject })).rejects.toThrow("byte format is unsupported");
    expect(copyObject).not.toHaveBeenCalled();
  });

  it.each(["declared", "chunked"])("copies one shared asset with a %s missing-object response and verifies delivery", async (length) => {
    let copied = false;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (canonicalUrl(url) === targetUrl && !copied) {
        const reply = missingObject();
        if (length === "chunked") reply.headers.delete("content-length");
        return reply;
      }
      return response(init?.method === "HEAD" ? null : bytes);
    }) as unknown as typeof fetch;
    const manifest = await buildMediaIdentityManifest({
      operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
      snapshots: [snapshot], http: fetchImpl,
    });
    const copyObject = vi.fn(async (source: string, target: string) => {
      expect(source).toBe(`products/old-product/primary/${hash}.png`);
      expect(target).toBe(`products/${productId}/primary/${hash}.png`);
      copied = true;
    });
    const report = await verifyAndCopyMedia(manifest, { mode: "copy", fetchImpl, copyObject,
      inspect: async () => ({ width: 1, height: 1, mimeType: "image/png" }),
    });
    expect(copyObject).toHaveBeenCalledOnce();
    expect(report).toMatchObject({ distinctAssets: 1, associations: 1, copied: 1 });
    expect(report.assets[0]).toMatchObject({ sourceSha256: hash, targetSha256: hash, byteSize: bytes.length });
    expect(manifest.products[0].media[0]).toMatchObject({ sourceUrl, targetUrl });
    expect(document.media[0].url).toBe(sourceUrl);
  });

  it("verifies an already copied object without overwriting or deleting either object", async () => {
    const manifest = await makeManifest();
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => response(bytes)) as unknown as typeof fetch;
    expect(await verifyAndCopyMedia(manifest, { mode: "copy", copyObject, fetchImpl, inspect })).toMatchObject({ copied: 0, distinctAssets: 1 });
    expect(copyObject).not.toHaveBeenCalled();
  });

  it.each([
    ["untyped 404", () => response(null, 404)],
    ["generic 400", () => errorResponse('{"message":"Not found"}')],
    ["missing bucket", () => errorResponse(missingBody.replace("NoSuchKey", "NoSuchBucket"))],
    ["missing tenant", () => errorResponse(missingBody.replace("NoSuchKey", "TenantNotFound"))],
    ["access denied", () => errorResponse(missingBody.replace("NoSuchKey", "AccessDenied"))],
    ["invalid credentials", () => errorResponse(missingBody.replace("NoSuchKey", "InvalidJWT"))],
    ["contradictory status", () => errorResponse(missingBody.replace('"404"', '"403"'))],
    ["numeric status", () => errorResponse(missingBody.replace('"404"', "404"))],
    ["contradictory error", () => errorResponse(missingBody.replace("not_found", "AccessDenied"))],
    ["contradictory message", () => errorResponse(missingBody.replace("Object not found", "Bucket not found"))],
    ["extra field", () => errorResponse(missingBody.replace("{", '{"extra":true,'))],
    ["missing field", () => errorResponse(missingBody.replace('"error":"not_found",', ""))],
    ["duplicate field", () => errorResponse(missingBody.replace("{", '{"code":"AccessDenied",'))],
    ["escaped duplicate field", () => errorResponse(missingBody.replace("{", '{"c\\u006fde":"AccessDenied",'))],
    ["duplicate hiding a nested value", () => errorResponse(missingBody.replace("{", '{"code":{"error":"AccessDenied"},'))],
    ["duplicate replacing a required field", () => errorResponse(missingBody.replace('"error":"not_found"', '"code":"NoSuchKey"'))],
    ["malformed JSON", () => errorResponse(missingBody.slice(0, -1))],
    ["invalid UTF-8", () => errorResponse(Buffer.concat([Buffer.from(missingBody), Buffer.from([0xff])]))],
    ["wrong content type", () => errorResponse(missingBody, { "content-type": "text/plain" })],
    ["partial error response", () => errorResponse(missingBody, { "content-range": "bytes 0-87/88" })],
    ["redirect location", () => errorResponse(missingBody, { location: sourceUrl })],
    ["truncated error body", () => errorResponse(missingBody, { "content-length": "89" })],
    ["extra error bytes", () => errorResponse(missingBody, { "content-length": "87" })],
  ])("refuses %s as evidence for an additive copy", async (_label, reply) => {
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url) => canonicalUrl(url) === sourceUrl ? response(bytes) : reply()) as typeof fetch;
    await expect(verifyAndCopyMedia(await makeManifest(), { mode: "copy", copyObject, fetchImpl, inspect })).rejects.toThrow();
    expect(copyObject).not.toHaveBeenCalled();
  });

  it.each(["source", "verify", "post-copy", "canonical"] as const)("refuses missing-object evidence at the %s boundary", async (boundary) => {
    let copied = false;
    const copyObject = vi.fn(async () => { copied = true; });
    const fetchImpl = vi.fn(async (value) => {
      const url = new URL(String(value));
      if (url.href.startsWith(sourceUrl)) return boundary === "source" ? missingObject() : response(bytes);
      if (boundary === "verify" || boundary === "post-copy" || (boundary === "canonical" && !url.search)) return missingObject();
      return copied ? response(bytes) : missingObject();
    }) as typeof fetch;
    await expect(verifyAndCopyMedia(await makeManifest(), {
      mode: boundary === "verify" ? "verify" : "copy", copyObject, fetchImpl, inspect,
    })).rejects.toThrow("without redirects or partial content");
    expect(copyObject).toHaveBeenCalledTimes(boundary === "post-copy" || boundary === "canonical" ? 1 : 0);
  });

  it.each(["declared", "streamed"])("cancels an oversized %s error body without copying", async (kind) => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); }, cancel });
    const reply = new Response(stream, { status: 400, headers: {
      "content-type": "application/json", ...(kind === "declared" ? { "content-length": "4097" } : {}),
    } });
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url) => canonicalUrl(url) === sourceUrl ? response(bytes) : reply) as typeof fetch;
    await expect(verifyAndCopyMedia(await makeManifest(), { mode: "copy", copyObject, fetchImpl, inspect })).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(copyObject).not.toHaveBeenCalled();
  });

  it.each([false, true])("cancels a stalled missing-object response at its deadline even if cancellation rejects: %s", async (rejectCancellation) => {
    const manifest = await makeManifest();
    const controller = new AbortController();
    const deadline = new Error("Request deadline expired");
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(new AbortController().signal).mockReturnValueOnce(controller.signal);
    const cancel = vi.fn(() => rejectCancellation ? Promise.reject(new Error("Transport cancellation failed")) : undefined);
    const stream = new ReadableStream({ cancel });
    const reply = new Response(stream, { status: 400, headers: { "content-type": "application/json" } });
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url) => canonicalUrl(url) === sourceUrl ? response(bytes) : reply) as typeof fetch;
    try {
      const outcome = verifyAndCopyMedia(manifest, { mode: "copy", copyObject, fetchImpl, inspect }).then(() => null, (error) => error);
      await vi.waitFor(() => expect(stream.locked).toBe(true));
      controller.abort(deadline);
      expect(await outcome).toBe(deadline);
      expect(timeout).toHaveBeenNthCalledWith(2, 30_000);
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(copyObject).not.toHaveBeenCalled();
    } finally { timeout.mockRestore(); }
  });

  it.each(["oversized body", "invalid headers", "bad status", "media headers", "deadline"])("releases a rejected response without waiting for stalled cancellation: %s", async (failure) => {
    const manifest = await makeManifest();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(new AbortController().signal).mockReturnValueOnce(controller.signal);
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream({
      start(reader) { if (failure === "oversized body") reader.enqueue(new Uint8Array(4097)); }, cancel,
    });
    const reply = new Response(stream, { status: failure === "bad status" ? 500 : failure === "media headers" ? 200 : 400, headers: {
      "content-type": failure === "invalid headers" ? "text/plain" : "application/json",
    } });
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url) => canonicalUrl(url) === sourceUrl ? response(bytes) : reply) as typeof fetch;
    let outcome: unknown;
    try {
      void verifyAndCopyMedia(manifest, { mode: "copy", copyObject, fetchImpl, inspect }).then(
        () => { outcome = "unexpected success"; }, (error) => { outcome = error; },
      );
      if (failure === "deadline") {
        await vi.waitFor(() => expect(stream.locked).toBe(true));
        controller.abort(new Error("Request deadline expired"));
      }
      await vi.waitFor(() => expect(outcome).toBeInstanceOf(Error), { timeout: 200 });
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
      expect(copyObject).not.toHaveBeenCalled();
    } finally { controller.abort(); timeout.mockRestore(); }
  });

  it("deduplicates a shared object while retaining both role and alt associations", async () => {
    const two = { ...document, media: [document.media[0], { ...document.media[0], id: catalogDraft.document.media[1].id, role: "cart", alt: "Different meaningful alt", sort_order: 1 }] };
    const manifest = await buildMediaIdentityManifest({ operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
      snapshots: [{ ...snapshot, document: two }], http: head });
    const fetchImpl = vi.fn(async () => response(bytes)) as unknown as typeof fetch;
    const report = await verifyAndCopyMedia(manifest, { mode: "verify", copyObject: vi.fn(), fetchImpl, inspect });
    expect(report).toMatchObject({ associations: 2, distinctAssets: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(manifest.products[0].expectedDocument.media[1]).toMatchObject({ role: "cart", alt: "Different meaningful alt" });
  });

  it("rejects destination corruption after the first 32 bytes even if size and HTTP metadata match", async () => {
    const manifest = await makeManifest();
    const damaged = Buffer.from(bytes);
    damaged[damaged.length - 1] ^= 1;
    const copyObject = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url) => response(canonicalUrl(url) === targetUrl ? damaged : bytes)) as typeof fetch;
    await expect(verifyAndCopyMedia(manifest, { mode: "copy", copyObject, fetchImpl, inspect })).rejects.toThrow("differs from the source");
    expect(copyObject).not.toHaveBeenCalled();
  });

  it("rejects source corruption before copying", async () => {
    const manifest = await makeManifest();
    const damaged = Buffer.from(bytes); damaged[damaged.length - 1] ^= 1;
    const copyObject = vi.fn(async () => {});
    await expect(verifyAndCopyMedia(manifest, { mode: "copy", copyObject,
      fetchImpl: vi.fn(async () => response(damaged)) as typeof fetch, inspect })).rejects.toThrow("immutable digest");
    expect(copyObject).not.toHaveBeenCalled();
  });

  it("bypasses stale CDN bodies with a fresh proof nonce while keeping published URLs unchanged", async () => {
    const manifest = await makeManifest();
    const nonces: string[] = [];
    const fetchImpl = vi.fn(async (value) => {
      const url = new URL(String(value));
      const nonce = url.searchParams.get("cacheNonce");
      if (nonce) { expect(nonce).toMatch(/^[a-f0-9-]{36}$/); nonces.push(nonce); }
      else expect(url.href).toBe(targetUrl);
      return response(bytes);
    }) as typeof fetch;
    await verifyAndCopyMedia(manifest, { mode: "verify", copyObject: vi.fn(), fetchImpl, inspect });
    expect(new Set(nonces).size).toBe(2);
    expect(manifest.products[0].media[0].targetUrl).toBe(targetUrl);
    expect(manifest.products[0].media[0].targetUrl).not.toContain("?");
  });

  it("rejects an overwritten origin even when the bare CDN URL still serves approved old bytes", async () => {
    const damaged = Buffer.from(bytes); damaged[damaged.length - 1] ^= 1;
    const fetchImpl = vi.fn(async (value) => response(
      new URL(String(value)).searchParams.has("cacheNonce") ? damaged : bytes,
    )) as typeof fetch;
    const copyObject = vi.fn(async () => {});
    await expect(verifyAndCopyMedia(await makeManifest(), { mode: "copy", copyObject, fetchImpl, inspect })).rejects.toThrow("immutable digest");
    expect(copyObject).not.toHaveBeenCalled();
  });

  it.each(["stale", "missing"])("requires bare canonical delivery even when origin proof is healthy: %s", async (state) => {
    const damaged = Buffer.from(bytes); damaged[damaged.length - 1] ^= 1;
    const fetchImpl = vi.fn(async (value) => {
      const url = new URL(String(value));
      if (!url.search && url.href === targetUrl) return state === "missing" ? response(null, 404) : response(damaged);
      return response(bytes);
    }) as typeof fetch;
    await expect(verifyAndCopyMedia(await makeManifest(), { mode: "verify", copyObject: vi.fn(), fetchImpl, inspect })).rejects.toThrow();
  });

  it.each([
    ["truncated body", () => response(bytes.subarray(0, bytes.length - 1)), "truncated"],
    ["extra body bytes", () => response(Buffer.concat([bytes, Buffer.from([0])])), "byte budget"],
    ["redirect", () => response(null, 302), "without redirects"],
    ["partial content", () => response(bytes, 206), "without redirects"],
    ["wrong MIME", () => new Response(bytes, { headers: { "content-type": "image/webp", "content-length": String(bytes.length), "cache-control": "max-age=3600" } }), "type, size or public caching"],
  ])("rejects %s before pointer evidence is returned", async (_label, reply, expected) => {
    const manifest = await makeManifest();
    await expect(verifyAndCopyMedia(manifest, { mode: "verify", copyObject: vi.fn(),
      fetchImpl: vi.fn(async () => reply()) as typeof fetch, inspect })).rejects.toThrow(expected);
  });

  it.each([
    { width: 2, height: 1, mimeType: "image/png" as const },
    { width: 1, height: 1, mimeType: "image/webp" as const },
  ])("requires independently inspected dimensions and byte format: %j", async (metadata) => {
    await expect(verifyAndCopyMedia(await makeManifest(), { mode: "verify", copyObject: vi.fn(),
      fetchImpl: vi.fn(async () => response(bytes)) as typeof fetch, inspect: async () => metadata })).rejects.toThrow("dimensions or byte format");
  });

  it("preserves the approved original-delivery suffix in the plan", async () => {
    const original = sourceUrl.replace("/primary/", "/primary/original/").replace(".png", ".webp");
    const manifest = await buildMediaIdentityManifest({ operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
      snapshots: [{ ...snapshot, document: { ...document, media: [{ ...document.media[0], url: original }] } }],
      http: vi.fn(async () => new Response(null, { headers: { "content-type": "image/webp", "content-length": "100", "cache-control": "max-age=3600" } })) as typeof fetch });
    expect(manifest.products[0].media[0].targetUrl).toBe(`${origin}products/${productId}/primary/original/${hash}.webp`);
  });

  it("requires current revision, exact canonical facts and no active draft before any operation", async () => {
    const manifest = await makeManifest();
    expect(() => assertCurrentMediaSnapshot(manifest, [snapshot], "before")).not.toThrow();
    expect(() => assertCurrentMediaSnapshot(manifest, [{ ...snapshot, revision: 4 }], "before")).toThrow("stale revision");
    expect(() => assertCurrentMediaSnapshot(manifest, [{ ...snapshot, activeDrafts: 1 }], "before")).toThrow("active Catalog Draft");
    expect(() => assertCurrentMediaSnapshot(manifest, [{ ...snapshot, document: { ...document, product: { ...document.product, display_name: "Changed" } } }], "before")).toThrow("Catalog changed");
    const after = { ...snapshot, revision: 4, document: { ...document, media: [{ ...document.media[0], url: targetUrl }] } };
    expect(() => assertCurrentMediaSnapshot(manifest, [after], "after")).not.toThrow();
    expect(() => assertCurrentMediaSnapshot(manifest, [{ ...after, document: { ...after.document, media: [{ ...after.document.media[0], alt: "silently replaced" }] } }], "after")).toThrow("pointer-only");
  });

  it("rejects an unrelated Product edit after cutover even without another revision", async () => {
    const manifest = await makeManifest();
    const after = structuredClone(document);
    after.media[0].url = targetUrl;
    after.product.display_name = "An unreviewed Product name";
    expect(() => assertCurrentMediaSnapshot(manifest, [{ document: after, revision: 4, activeDrafts: 0 }], "after"))
      .toThrow("pointer-only");
  });

  it("accepts only reviewed URLs and changed timestamps on the media rows cutover updates", async () => {
    const { manifest, after } = await cutoverFixture();
    const reviewed = structuredClone(manifest);
    const observed = structuredClone(after);
    expect(manifest.products[0].media).toHaveLength(1);
    expect(() => assertCurrentMediaSnapshot(manifest, [{ document: after, revision: 4, activeDrafts: 0 }], "after"))
      .not.toThrow();
    expect(manifest).toEqual(reviewed);
    expect(after).toEqual(observed);
  });

  it.each<[string, (value: ProductEditorDocumentV4) => void]>([
    ["PDP guidance", (value) => { value.productPdpContent!.how_to_use_steps = ["Unreviewed step"]; }],
    ["removed PDP", (value) => { value.productPdpContent = null; }],
    ["Variant offer", (value) => { value.variants[0].price_cents += 100; }],
    ["removed Variant", (value) => { value.variants = []; }],
    ["Source provenance", (value) => { value.productSource!.raw_source = { changed: true }; }],
    ["removed Source", (value) => { value.productSource = null; }],
    ["relationship", (value) => { value.relationships[0].sort_order = 1; }],
    ["removed relationship", (value) => { value.relationships = []; }],
    ["Family", (value) => { value.productFamily!.family.display_name = "Another Family"; }],
    ["Family membership", (value) => { value.productFamily!.memberships[0].option_label = "Unreviewed"; }],
    ["removed Family", (value) => { value.productFamily = null; }],
    ["document schema", (value) => { Object.assign(value, { schemaVersion: 3 }); }],
    ["unexpected document field", (value) => { Object.assign(value, { unexpected: true }); }],
    ["Product timestamp", (value) => { value.product.updated_at = value.media[0].updated_at; }],
    ["PDP timestamp", (value) => { value.productPdpContent!.updated_at = value.media[0].updated_at; }],
    ["Variant timestamp", (value) => { value.variants[0].updated_at = value.media[0].updated_at; }],
    ["Source timestamp", (value) => { value.productSource!.updated_at = value.media[0].updated_at; }],
    ["Family timestamp", (value) => { value.productFamily!.family.updated_at = value.media[0].updated_at; }],
    ["membership timestamp", (value) => { value.productFamily!.memberships[0].updated_at = value.media[0].updated_at; }],
    ["relationship timestamp", (value) => { value.relationships[0].created_at = value.media[0].updated_at; }],
    ["current UUID media timestamp", (value) => { value.media[1].updated_at = value.media[0].updated_at; }],
    ["null-URL swatch timestamp", (value) => { value.media[2].updated_at = value.media[0].updated_at; }],
    ["retained archived media timestamp", (value) => { value.media[3].updated_at = value.media[0].updated_at; }],
    ["untouched media URL", (value) => { value.media[1].url = sourceUrl; }],
    ["missing association", (value) => { value.media.shift(); }],
    ["extra association", (value) => { value.media.push({ ...value.media[0], id: "123e4567-e89b-42d3-a456-426614174013" }); }],
  ])("rejects after-state %s drift without another revision", async (_label, change) => {
    const { manifest, after } = await cutoverFixture();
    change(after);
    expect(() => assertCurrentMediaSnapshot(manifest, [{ document: after, revision: 4, activeDrafts: 0 }], "after"))
      .toThrow("pointer-only");
  });

  it.each([undefined, null, 42, "", "invalid"])("rejects an invalid affected-media timestamp: %s", async (updatedAt) => {
    const { manifest, after } = await cutoverFixture();
    Object.assign(after.media[0], { updated_at: updatedAt });
    expect(() => assertCurrentMediaSnapshot(manifest, [{ document: after, revision: 4, activeDrafts: 0 }], "after"))
      .toThrow("timestamp is invalid");
  });

  it("rejects a missing affected-media timestamp", async () => {
    const { manifest, after } = await cutoverFixture();
    Reflect.deleteProperty(after.media[0], "updated_at");
    expect(() => assertCurrentMediaSnapshot(manifest, [{ document: after, revision: 4, activeDrafts: 0 }], "after"))
      .toThrow("timestamp is invalid");
  });

  it("rejects changed Product ownership, suffix, unknown association and incomplete set", async () => {
    const manifest = await makeManifest();
    for (const mutation of [
      { targetUrl: targetUrl.replace(productId, "10000000-0000-4000-8000-000000000999") },
      { targetUrl: targetUrl.replace("/primary/", "/gallery/") },
      { mediaId: "10000000-0000-4000-8000-000000000999" },
      { targetUrl: `${targetUrl}?download=1` },
    ]) {
      const changed = structuredClone(manifest); Object.assign(changed.products[0].media[0], mutation);
      expect(() => assertMediaIdentityManifest(changed)).toThrow();
    }
    const empty = structuredClone(manifest); empty.products[0].media = [];
    expect(() => assertMediaIdentityManifest(empty)).toThrow();
    expect(manifestDigest(manifest)).toBe(manifestDigest(JSON.parse(JSON.stringify(manifest))));
  });
});
