// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyColdCanonicalProduct } from "@/test-support/storefront-cold-canonical";

const current = {
  id: "family-member-id",
  slug: "current-family-member",
  path: "/products/current-family-member",
  displayName: "Current Member",
  productType: "Serum",
  catalogStatus: "active" as const,
  publishedAt: "2026-09-01T00:00:00.000Z",
  familyId: "family-id",
  familyIsEntry: false,
};
const canonicalURL = `https://helixskin.vercel.app${current.path}`;
const manifest = {
  version: 4,
  routes: { "/": {} },
  dynamicRoutes: {},
  notFoundRoutes: [],
};

function html({
  name = current.displayName,
  canonical = canonicalURL,
  openGraph = canonicalURL,
  structuredName = "Current Member — Serum",
  structuredURL = canonicalURL,
  structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: structuredName,
    url: structuredURL,
  }),
} = {}) {
  return `<!doctype html><html><head>
    <link rel="canonical" href="${canonical}">
    <meta property="og:url" content="${openGraph}">
    </head><body><h1>${name}</h1>
    <script type="application/ld+json">${structuredData}</script>
    </body></html>`;
}

function htmlResponse(body = html()) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

let directory: string;
let buildDirectory: string;
let outputDirectory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "helix-cold-canonical-"));
  buildDirectory = join(directory, ".next");
  outputDirectory = join(directory, "test-results");
  await mkdir(buildDirectory);
  await writeFile(join(buildDirectory, "BUILD_ID"), "retained-build-id\n");
  await writeFile(join(buildDirectory, "prerender-manifest.json"), JSON.stringify(manifest));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

function options(request = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse())) {
  return {
    baseURL: "http://127.0.0.1:34123",
    buildDirectory,
    outputDirectory,
    fetch: request,
  };
}

describe("retained production cold canonical Product proof", () => {
  it("requests an unprerendered published Family member once and records bounded build evidence", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse());
    const result = await verifyColdCanonicalProduct({ products: [current] }, options(request));

    expect(request).toHaveBeenCalledExactlyOnceWith(
      new URL(current.path, "http://127.0.0.1:34123"),
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
    const evidence = JSON.parse(await readFile(result, "utf8"));
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      buildId: "retained-build-id",
      prerenderManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      productId: current.id,
      path: current.path,
      familyId: current.familyId,
      absentFromPrerenderedRoutes: true,
      status: 200,
      mediaType: "text/html",
      location: null,
      displayName: current.displayName,
      canonicalURL,
      structuredDataURL: canonicalURL,
      responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(evidence)).not.toContain("<html>");
  });

  it("skips entries, standalone, unpublished, inactive, prerendered and known-not-found Products", async () => {
    await writeFile(join(buildDirectory, "prerender-manifest.json"), JSON.stringify({
      ...manifest,
      routes: { "/products/built-member": {} },
      notFoundRoutes: ["/products/not-found-member"],
    }));
    const request = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse());
    await verifyColdCanonicalProduct({ products: [
      { ...current, familyIsEntry: true },
      { ...current, familyId: null, familyIsEntry: null },
      { ...current, publishedAt: null },
      { ...current, catalogStatus: "archived" },
      { ...current, slug: "built-member", path: "/products/built-member" },
      { ...current, slug: "not-found-member", path: "/products/not-found-member" },
      current,
    ] }, options(request));
    expect(new URL(String(request.mock.calls[0][0])).pathname).toBe(current.path);
  });

  it("fails before requesting when no eligible cold Family member exists", async () => {
    const opts = options();
    await expect(verifyColdCanonicalProduct({ products: [{ ...current, familyIsEntry: true }] }, opts))
      .rejects.toThrow("no published non-entry Family Product absent from the retained prerender manifest");
    expect(opts.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing manifest", null],
    ["invalid JSON", "{"],
    ["missing routes", JSON.stringify({ version: 4 })],
    ["array routes", JSON.stringify({ ...manifest, routes: [] })],
    ["invalid route value", JSON.stringify({ ...manifest, routes: { "/": null } })],
    ["unsupported version", JSON.stringify({ ...manifest, version: 3 })],
    ["malformed not-found routes", JSON.stringify({ ...manifest, notFoundRoutes: {} })],
  ])("rejects %s instead of silently treating it as an unbuilt path", async (_label, contents) => {
    const path = join(buildDirectory, "prerender-manifest.json");
    if (contents === null) await rm(path);
    else await writeFile(path, contents);
    const opts = options();
    await expect(verifyColdCanonicalProduct({ products: [current] }, opts)).rejects.toThrow("prerender manifest");
    expect(opts.fetch).not.toHaveBeenCalled();
  });

  it.each([null, "", "bad\nbuild-id"])("rejects missing or malformed BUILD_ID %s", async (contents) => {
    const path = join(buildDirectory, "BUILD_ID");
    if (contents === null) await rm(path);
    else await writeFile(path, contents);
    const opts = options();
    await expect(verifyColdCanonicalProduct({ products: [current] }, opts)).rejects.toThrow("BUILD_ID");
    expect(opts.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["retired path", 404, undefined],
    ["redirect", 308, "/products/other"],
    ["location on HTTP 200", 200, "/products/other"],
  ])("rejects a %s response without following it", async (_label, status, location) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(html(), {
      status,
      headers: location ? { Location: location } : {},
    }));
    await expect(verifyColdCanonicalProduct({ products: [current] }, options(request)))
      .rejects.toThrow("HTTP 200 without a redirect or Location");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["display name", { name: "Retired Member" }],
    ["canonical URL", { canonical: "https://helixskin.vercel.app/products/retired-member" }],
    ["canonical origin", { canonical: `https://wrong.example${current.path}` }],
    ["OpenGraph URL", { openGraph: "https://helixskin.vercel.app/products/retired-member" }],
    ["structured name", { structuredName: "Retired Member — Serum" }],
    ["structured slug", { structuredURL: "https://helixskin.vercel.app/products/retired-member" }],
    ["malformed structured data", { structuredData: "{" }],
    ["missing Product structured data", { structuredData: JSON.stringify({ "@type": "Organization" }) }],
  ])("rejects a mismatched %s", async (_label, changes) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(html(changes)));
    await expect(verifyColdCanonicalProduct({ products: [current] }, options(request)))
      .rejects.toThrow("current Product identity");
  });

  it("bounds a stalled response and does not retry or claim evidence", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
    const proof = verifyColdCanonicalProduct({ products: [current] }, { ...options(request), timeoutMs: 20 });
    const assertion = expect(proof).rejects.toThrow("within 20ms");
    // Artifact reads use real asynchronous filesystem I/O before the request.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    await expect(readFile(join(outputDirectory, "storefront-cold-canonical.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an oversized streamed body instead of saving full HTML evidence", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse("x".repeat(8 * 1024 * 1024 + 1)));
    await expect(verifyColdCanonicalProduct({ products: [current] }, options(request)))
      .rejects.toThrow("exceeds the 8388608-byte evidence limit");
  });

  it("does not accept a followed response hidden behind HTTP 200", async () => {
    const response = htmlResponse();
    Object.defineProperty(response, "redirected", { value: true });
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(verifyColdCanonicalProduct({ products: [current] }, options(request)))
      .rejects.toThrow("HTTP 200 without a redirect or Location");
  });

  it.each(["text/plain", "application/json", null])("rejects non-HTML media type %s even when markup matches", async (mediaType) => {
    const response = new Response(html());
    if (mediaType) response.headers.set("content-type", mediaType);
    else response.headers.delete("content-type");
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(verifyColdCanonicalProduct({ products: [current] }, options(request)))
      .rejects.toThrow("HTML Content-Type");
  });

  it("also bounds a response that sends headers but stalls its HTML body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, {
      headers: { "Content-Type": "text/html" },
    }));
    const proof = verifyColdCanonicalProduct({ products: [current] }, { ...options(request), timeoutMs: 20 });
    const assertion = expect(proof).rejects.toThrow("within 20ms");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
