import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isValidProductSlug } from "@/lib/catalog/product-slug";
import { composeProductTitle } from "@/lib/products";
import { CANONICAL_PUBLIC_SITE_ORIGIN } from "@/lib/site-url";
import type { StorefrontSnapshotProduct } from "@/test-support/storefront-baseline";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const ARTIFACT_FILENAME = "storefront-cold-canonical.json";

type Candidate = Pick<StorefrontSnapshotProduct,
  | "id" | "slug" | "path" | "displayName" | "productType"
  | "catalogStatus" | "publishedAt" | "familyId" | "familyIsEntry"
>;
type Options = {
  baseURL: string;
  buildDirectory: string;
  outputDirectory: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
type DocumentFactory = new (html?: string) => {
  window: { document: Document; close: () => void };
};

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: DocumentFactory };

function failure(detail: string): Error {
  return new Error(`e2e: unprerendered canonical Product proof failed: ${detail}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function retainedBuild(directory: string) {
  let buildId: string;
  try {
    buildId = (await readFile(join(directory, "BUILD_ID"), "utf8")).trim();
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(buildId)) throw new Error("Invalid build ID.");
  } catch {
    throw failure("the retained BUILD_ID is missing or malformed. Run the production verification adapter.");
  }

  let contents: string;
  let manifest: unknown;
  try {
    contents = await readFile(join(directory, "prerender-manifest.json"), "utf8");
    manifest = JSON.parse(contents);
  } catch {
    throw failure("the retained prerender manifest is missing or malformed.");
  }
  if (
    !record(manifest) || manifest.version !== 4 ||
    !record(manifest.routes) || !record(manifest.dynamicRoutes) ||
    !Object.entries(manifest.routes).every(([path, value]) => path.startsWith("/") && record(value)) ||
    !Array.isArray(manifest.notFoundRoutes) ||
    !manifest.notFoundRoutes.every((path) => typeof path === "string" && path.startsWith("/"))
  ) {
    throw failure("the retained prerender manifest does not match the supported Next.js version-4 shape.");
  }
  return {
    buildId,
    manifestSha256: hash(contents),
    renderedPaths: new Set([...Object.keys(manifest.routes), ...manifest.notFoundRoutes]),
  };
}

async function readBoundedHtml(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw failure("the canonical response has no HTML body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HTML_BYTES) {
        void reader.cancel();
        throw failure(`the canonical HTML exceeds the ${MAX_HTML_BYTES}-byte evidence limit.`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function validateIdentity(html: string, product: Candidate, canonicalURL: string) {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const headings = document.querySelectorAll("h1");
    const canonicals = document.querySelectorAll('link[rel="canonical"]');
    const openGraphURLs = document.querySelectorAll('meta[property="og:url"]');
    const products = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script): unknown => JSON.parse(script.textContent ?? ""))
      .filter((value): value is Record<string, unknown> => record(value) && value["@type"] === "Product");
    if (
      headings.length !== 1 || headings[0].textContent?.trim() !== product.displayName ||
      canonicals.length !== 1 || canonicals[0].getAttribute("href") !== canonicalURL ||
      openGraphURLs.length !== 1 || openGraphURLs[0].getAttribute("content") !== canonicalURL ||
      products.length !== 1 || products[0].url !== canonicalURL ||
      products[0].name !== composeProductTitle(product.displayName, product.productType)
    ) {
      throw new Error("Identity mismatch.");
    }
  } catch {
    throw failure(`${product.path} did not render its current Product identity in the heading, canonical metadata and Product structured data.`);
  } finally {
    dom.window.close();
  }
}

/**
 * The production adapter has already verified this retained build's local server.
 * Call before reconciliation/workers: this proves an unprerendered canonical path,
 * not an empty database/data cache or absence of runtime cache from earlier runs.
 */
export async function verifyColdCanonicalProduct(
  snapshot: { products: readonly Candidate[] },
  options: Options,
): Promise<string> {
  const build = await retainedBuild(options.buildDirectory);
  const product = snapshot.products
    .filter((item) =>
      item.catalogStatus === "active" && item.publishedAt !== null &&
      Number.isFinite(Date.parse(item.publishedAt)) &&
      item.familyId !== null && item.familyIsEntry === false &&
      isValidProductSlug(item.slug) && item.path === `/products/${item.slug}` &&
      !build.renderedPaths.has(item.path),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id))[0];
  if (!product) {
    throw failure("there is no published non-entry Family Product absent from the retained prerender manifest. Verify the live Catalog prerequisite; do not substitute a fixture or an entry Product.");
  }
  const requestURL = new URL(product.path, options.baseURL);
  if (
    requestURL.protocol !== "http:" || requestURL.hostname !== "127.0.0.1" ||
    requestURL.username || requestURL.password
  ) {
    throw failure("the request must use the production adapter's local loopback server.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const response = await (options.fetch ?? globalThis.fetch)(requestURL, {
      redirect: "manual",
      signal: controller.signal,
    });
    if (
      response.status !== 200 || response.headers.has("location") || response.redirected ||
      (response.url !== "" && response.url !== requestURL.href)
    ) {
      throw failure(`${product.path} must return HTTP 200 without a redirect or Location (received ${response.status}).`);
    }
    if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "text/html") {
      throw failure(`${product.path} must return an HTML Content-Type (text/html).`);
    }
    html = await readBoundedHtml(response, controller.signal);
  } catch (cause) {
    if (controller.signal.aborted) throw failure(`${product.path} did not return its HTML within ${timeoutMs}ms.`);
    if (cause instanceof Error && cause.message.startsWith("e2e:")) throw cause;
    throw failure(`${product.path} could not be read from the retained local server.`);
  } finally {
    clearTimeout(timer);
  }
  const canonicalURL = new URL(product.path, CANONICAL_PUBLIC_SITE_ORIGIN).href;
  validateIdentity(html, product, canonicalURL);

  const evidence = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    proof: "Unprerendered canonical path requested before reconciliation and browser workers; prior runtime/data cache is not asserted empty.",
    buildId: build.buildId,
    prerenderManifestSha256: build.manifestSha256,
    productId: product.id,
    familyId: product.familyId,
    publishedAt: product.publishedAt,
    path: product.path,
    absentFromPrerenderedRoutes: true,
    status: 200,
    mediaType: "text/html",
    location: null,
    displayName: product.displayName,
    canonicalURL,
    structuredDataName: composeProductTitle(product.displayName, product.productType),
    structuredDataURL: canonicalURL,
    responseSha256: hash(html),
  };
  await mkdir(options.outputDirectory, { recursive: true });
  const artifactPath = join(options.outputDirectory, ARTIFACT_FILENAME);
  const temporaryPath = `${artifactPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, artifactPath);
  return artifactPath;
}
