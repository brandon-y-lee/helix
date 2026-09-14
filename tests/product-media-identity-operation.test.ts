import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { assertCurrentMediaSnapshot, assertMediaIdentityManifest, buildMediaIdentityManifest, manifestDigest, verifyAndCopyMedia } from "../scripts/catalog/product-media-identity";
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
function canonicalUrl(value: string | URL | Request) {
  const url = new URL(String(value)); url.search = ""; return url.href;
}
const inspect = async () => ({ width: 1, height: 1, mimeType: "image/png" as const });
const head = vi.fn(async () => response(null)) as unknown as typeof fetch;
const makeManifest = () => buildMediaIdentityManifest({
  operationId: "10000000-0000-4000-8000-000000000701", actorId: catalogDraft.updated_by,
  snapshots: [snapshot], http: head,
});

describe("reviewed Product Media identity operation", () => {
  it("copies one shared asset unchanged and verifies the destination before returning evidence", async () => {
    let copied = false;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (canonicalUrl(url) === targetUrl && !copied) return response(null, 404);
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
