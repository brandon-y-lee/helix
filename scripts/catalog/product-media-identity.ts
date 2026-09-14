import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isDeepStrictEqual } from "node:util";
import type { ProductEditorDocumentV4 } from "../../lib/admin/catalog/types";
import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";

const PUBLIC_PREFIX = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/helix-catalog/`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUFFIX = /^(?:primary(?:\/original)?|card-hover|core-routine-editorial|core-routine-texture|gallery|ingredients-texture|outcomes|profile|application|routine|drafts)\/([a-f0-9]{64})\.(jpg|png|webp|mp4)$/;
const MAX_BYTES = 16 * 1024 * 1024;
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" } as const;
type MimeType = typeof MIME[keyof typeof MIME];
type MediaDimensions = { width: number; height: number; mimeType: MimeType };
export type MediaIdentitySnapshot = { document: ProductEditorDocumentV4; revision: number; activeDrafts: number };
export type MediaIdentityCopy = {
  mediaId: string; sourceUrl: string; targetUrl: string; sha256: string;
  byteSize: number; mimeType: MimeType; width: number; height: number;
};
export type MediaIdentityManifest = {
  version: 1; projectRef: string; operationId: string; actorId: string;
  products: { productId: string; expectedRevision: number; expectedDocument: ProductEditorDocumentV4; media: MediaIdentityCopy[] }[];
};

function fail(message: string): never { throw new Error(message); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
export function manifestDigest(manifest: MediaIdentityManifest): string {
  return createHash("sha256").update(JSON.stringify(canonical(manifest))).digest("hex");
}

function sourceParts(value: string) {
  if (!value.startsWith(PUBLIC_PREFIX)) fail("Product Media must use the approved public bucket.");
  if (new URL(value).href !== value) fail("Product Media URLs must not require normalization.");
  const path = value.slice(PUBLIC_PREFIX.length);
  const parts = /^products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(.+)$/.exec(path);
  const suffix = parts && SUFFIX.exec(parts[2]);
  if (!parts || !suffix || (parts[2].startsWith("primary/original/") && suffix[2] !== "webp")) {
    fail("Product Media must retain an approved immutable path without URL modifiers.");
  }
  return { path, folder: parts[1], suffix: parts[2], hash: suffix[1], mimeType: MIME[suffix[2] as keyof typeof MIME] };
}

function currentUrl(url: string, productId: string): boolean {
  try { return sourceParts(url).folder === productId && UUID.test(productId); }
  catch { return false; }
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function assertMediaIdentityManifest(value: unknown): asserts value is MediaIdentityManifest {
  if (!value || typeof value !== "object") fail("Media manifest must be an object.");
  const manifest = value as MediaIdentityManifest;
  if (manifest.version !== 1 || manifest.projectRef !== APPROVED_SUPABASE_PROJECT_REF
    || !UUID.test(manifest.operationId) || !UUID.test(manifest.actorId)
    || !Array.isArray(manifest.products) || manifest.products.length < 1 || manifest.products.length > 100) {
    fail("Media manifest identity or scope is invalid.");
  }
  const products = new Set<string>();
  const associations = new Set<string>();
  const destinations = new Map<string, string>();
  let totalBytes = 0;
  for (const product of manifest.products) {
    if (!UUID.test(product.productId) || products.has(product.productId)
      || !Number.isSafeInteger(product.expectedRevision) || product.expectedRevision < 0
      || product.expectedDocument?.productId !== product.productId
      || product.expectedDocument.schemaVersion !== 4 || !Array.isArray(product.expectedDocument.media)
      || !Array.isArray(product.media) || product.media.length < 1 || product.media.length > 1000) {
      fail("Media manifest has an invalid Product or duplicate Product identity.");
    }
    products.add(product.productId);
    const expected = product.expectedDocument.media.filter((row) => row.archived_at === null && row.url !== null && !currentUrl(row.url, product.productId));
    if (expected.length !== product.media.length) fail("Media manifest does not cover the complete affected Product Media set.");
    for (const copy of product.media) {
      const source = sourceParts(copy.sourceUrl);
      const target = sourceParts(copy.targetUrl);
      const original = expected.find((row) => row.id === copy.mediaId);
      if (!UUID.test(copy.mediaId) || associations.has(copy.mediaId) || !original
        || original.product_id !== product.productId || original.url !== copy.sourceUrl
        || source.folder === product.productId || UUID.test(source.folder)
        || target.folder !== product.productId || target.suffix !== source.suffix
        || copy.sha256 !== source.hash || copy.mimeType !== source.mimeType
        || (original.media_type === "image" ? !copy.mimeType.startsWith("image/") : copy.mimeType !== "video/mp4")
        || !validNumber(copy.byteSize) || copy.byteSize > MAX_BYTES
        || !validNumber(copy.width) || !validNumber(copy.height)
        || original.width !== copy.width || original.height !== copy.height) {
        fail("Media manifest would change content, ownership, dimensions or an unapproved association.");
      }
      associations.add(copy.mediaId);
      const previous = destinations.get(copy.targetUrl);
      const identity = JSON.stringify({ source: copy.sourceUrl, hash: copy.sha256, size: copy.byteSize, mime: copy.mimeType, width: copy.width, height: copy.height });
      if (previous && previous !== identity) fail("Media destination has conflicting source evidence.");
      if (!previous) totalBytes += copy.byteSize;
      destinations.set(copy.targetUrl, identity);
      if (destinations.size > 500 || totalBytes > 512 * 1024 * 1024) fail("Reviewed media copy exceeds its bounded total byte or object budget.");
    }
  }
}

function headers(response: Response, expectedMime?: string) {
  const mimeType = response.headers.get("content-type")?.split(";")[0].trim();
  const byteSize = Number(response.headers.get("content-length"));
  const cache = response.headers.get("cache-control") ?? "";
  if (!mimeType || !Object.values(MIME).includes(mimeType as MimeType) || (expectedMime && mimeType !== expectedMime)
    || !validNumber(byteSize) || byteSize > MAX_BYTES || !/(?:^|[,\s])max-age=([1-9][0-9]*)(?:$|[,\s])/.test(cache)
    || /(?:private|no-store)/i.test(cache)) fail("Product Media response has invalid type, size or public caching.");
  return { mimeType: mimeType as MimeType, byteSize };
}

export async function buildMediaIdentityManifest(input: {
  operationId: string; actorId: string; snapshots: MediaIdentitySnapshot[]; http?: typeof fetch;
}): Promise<MediaIdentityManifest> {
  const manifest: MediaIdentityManifest = { version: 1, projectRef: APPROVED_SUPABASE_PROJECT_REF,
    operationId: input.operationId, actorId: input.actorId, products: [] };
  const sourceMetadata = new Map<string, { mimeType: MimeType; byteSize: number }>();
  for (const snapshot of input.snapshots) {
    const document = snapshot.document;
    const media: MediaIdentityCopy[] = [];
    for (const row of document.media) {
      if (row.archived_at !== null || row.url === null || currentUrl(row.url, document.productId)) continue;
      if (snapshot.activeDrafts !== 0) fail("An affected Product has an active Catalog Draft.");
      const source = sourceParts(row.url);
      let metadata = sourceMetadata.get(row.url);
      if (!metadata) {
        // HEAD metadata can have a different cache policy from public delivery.
        // Inspect GET headers here; complete bytes are verified before copying.
        const response = await (input.http ?? fetch)(row.url, { method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(10_000) });
        try {
          if (response.status !== 200) fail("Source Product Media is not directly available.");
          metadata = headers(response, source.mimeType);
        } finally {
          await response.body?.cancel();
        }
        sourceMetadata.set(row.url, metadata);
      }
      media.push({ mediaId: row.id, sourceUrl: row.url,
        targetUrl: `${PUBLIC_PREFIX}products/${document.productId}/${source.suffix}`,
        sha256: source.hash, ...metadata, width: row.width!, height: row.height! });
    }
    if (media.length) manifest.products.push({ productId: document.productId, expectedRevision: snapshot.revision,
      expectedDocument: structuredClone(document), media });
  }
  assertMediaIdentityManifest(manifest);
  return manifest;
}

/** This verifies the recorded state, not only a revision counter that out-of-band writers can miss. */
export function assertCurrentMediaSnapshot(manifest: MediaIdentityManifest, snapshots: MediaIdentitySnapshot[], state: "before" | "after"): void {
  assertMediaIdentityManifest(manifest);
  for (const expected of manifest.products) {
    const actual = snapshots.find((entry) => entry.document.productId === expected.productId);
    if (!actual || actual.activeDrafts !== 0 || actual.revision !== expected.expectedRevision + (state === "after" ? 1 : 0)) {
      fail("Media operation has a missing Product, stale revision or active Catalog Draft.");
    }
    if (state === "before") {
      if (!isDeepStrictEqual(actual.document, expected.expectedDocument)) fail("Canonical Catalog changed after media review.");
    } else {
      const expectedRows = expected.expectedDocument.media.map((row) => {
        const copy = expected.media.find((entry) => entry.mediaId === row.id);
        if (!copy) return row;
        // The cutover updates only these media IDs. Preserve every other fact,
        // including timestamps on unrelated Catalog rows and untouched media.
        const updatedAt = actual.document.media.find((entry) => entry.id === row.id)?.updated_at;
        if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
          fail("Published media timestamp is invalid for the reviewed pointer-only change.");
        }
        return { ...row, url: copy.targetUrl, updated_at: updatedAt };
      });
      if (!isDeepStrictEqual(actual.document, { ...expected.expectedDocument, media: expectedRows })) {
        fail("Published Catalog differs from the reviewed pointer-only change.");
      }
    }
  }
}

const run = promisify(execFile);
function byteMimeType(bytes: Buffer): MimeType {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
    && bytes.readUInt32LE(4) + 8 === bytes.length) return "image/webp";
  // AVIF/HEIF and QuickTime also use ISO BMFF; ftyp alone does not establish MP4.
  if (bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp"
    && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length && bytes.readUInt32BE(0) % 4 === 0
    && ["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "dash", "msdh", "msix"].includes(bytes.toString("ascii", 8, 12))) return "video/mp4";
  return fail("Product Media byte format is unsupported.");
}

export async function inspectMediaDimensions(bytes: Buffer): Promise<MediaDimensions> {
  const mimeType = byteMimeType(bytes);
  const directory = await mkdtemp(join(tmpdir(), "helix-media-probe-"));
  try {
    const path = join(directory, "approved-asset");
    await writeFile(path, bytes, { mode: 0o600 });
    const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=format_name", "-of", "json", path],
      { timeout: 10_000, maxBuffer: 64 * 1024 });
    const metadata = JSON.parse(stdout) as { streams?: { width?: number; height?: number; codec_name?: string }[]; format?: { format_name?: string } };
    const stream = metadata.streams?.[0];
    if (!stream || !validNumber(stream.width) || !validNumber(stream.height)) fail("Product Media dimensions could not be independently verified.");
    const formats = metadata.format?.format_name?.split(",") ?? [];
    const expected = { "image/png": { codec: "png", formats: ["png_pipe", "image2"] },
      "image/jpeg": { codec: "mjpeg", formats: ["jpeg_pipe", "image2"] },
      "image/webp": { codec: "webp", formats: ["webp_pipe", "image2"] } };
    const agrees = mimeType === "video/mp4" ? formats.includes("mp4")
      : stream.codec_name === expected[mimeType].codec && expected[mimeType].formats.some((format) => formats.includes(format));
    if (!agrees) fail("Product Media byte format is unsupported.");
    return { width: stream.width, height: stream.height, mimeType };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function readBoundedBody(response: Response, signal: AbortSignal, maxBytes: number, expectedBytes?: number): Promise<Buffer> {
  if (!response.body) fail("Full Product Media response has no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const frame = await reader.read();
      if (frame.done) break;
      size += frame.value.byteLength;
      if (size > maxBytes || (expectedBytes !== undefined && size > expectedBytes)) fail("Full Product Media exceeded its reviewed byte budget.");
      chunks.push(frame.value);
    }
    signal.throwIfAborted();
    if (expectedBytes !== undefined && size !== expectedBytes) fail("Full Product Media body is truncated.");
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function requireMissingObject(response: Response, signal: AbortSignal): Promise<void> {
  const limit = 4096;
  const length = response.headers.get("content-length");
  const expectedBytes = length === null ? undefined : Number(length);
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    || response.headers.has("content-range") || response.headers.has("location")
    || (length !== null && (!/^[0-9]+$/.test(length) || !validNumber(expectedBytes) || expectedBytes > limit))) {
    await response.body?.cancel();
    fail("Storage response did not establish a missing Product Media object.");
  }
  const bytes = await readBoundedBody(response, signal, limit, expectedBytes);
  let text: string;
  let value: Record<string, unknown>;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(text);
  } catch { fail("Storage response did not establish a missing Product Media object."); }
  // Require a flat four-string document before accepting parsed keys. This
  // prevents JSON.parse from silently hiding duplicate (even escaped) fields.
  const string = String.raw`"(?:[^"\\]|\\.)*"`;
  const fourFields = new RegExp(String.raw`^\s*\{\s*(?:${string}\s*:\s*${string}\s*,\s*){3}${string}\s*:\s*${string}\s*\}\s*$`);
  if (!fourFields.test(text) || !value || Array.isArray(value) || Object.keys(value).length !== 4
    || value.statusCode !== "404" || value.code !== "NoSuchKey" || value.message !== "Object not found"
    || (value.error !== "not_found" && value.error !== "NoSuchKey")) {
    fail("Storage response did not establish a missing Product Media object.");
  }
}

async function readComplete(url: string, expected: MediaIdentityCopy, fetchImpl: typeof fetch, allowMissing: boolean, freshProof = true): Promise<Buffer | null> {
  sourceParts(url);
  const signal = AbortSignal.timeout(30_000);
  // Smart CDN may serve an older object for up to 60 seconds after a change.
  // A fresh cacheNonce forces an origin proof; canonical stored URLs stay bare.
  const proofUrl = new URL(url);
  if (freshProof) proofUrl.searchParams.set("cacheNonce", randomUUID());
  const response = await fetchImpl(proofUrl.href, { method: "GET", redirect: "manual", credentials: "omit", signal });
  if (allowMissing && (response.status === 400 || response.status === 404)) {
    await requireMissingObject(response, signal);
    return null;
  }
  if (response.status !== 200 || !response.body) { await response.body?.cancel(); fail("Full Product Media must be directly retrievable without redirects or partial content."); }
  try {
    const metadata = headers(response, expected.mimeType);
    if (metadata.byteSize !== expected.byteSize) fail("Product Media byte size changed after review.");
  } catch (error) { await response.body.cancel(); throw error; }
  return readBoundedBody(response, signal, MAX_BYTES, expected.byteSize);
}

export async function verifyAndCopyMedia(manifest: MediaIdentityManifest, input: {
  mode: "copy" | "verify"; copyObject(sourcePath: string, targetPath: string): Promise<void>;
  fetchImpl?: typeof fetch; inspect?: (bytes: Buffer) => Promise<MediaDimensions>;
}) {
  assertMediaIdentityManifest(manifest);
  const unique = new Map(manifest.products.flatMap((product) => product.media.map((copy) => [copy.targetUrl, copy] as const)));
  const assets: { sourceUrl: string; targetUrl: string; sourceSha256: string; targetSha256: string; canonicalSha256: string; byteSize: number; width: number; height: number }[] = [];
  let copied = 0;
  for (const copy of unique.values()) {
    const source = (await readComplete(copy.sourceUrl, copy, input.fetchImpl ?? fetch, false))!;
    const sourceSha256 = createHash("sha256").update(source).digest("hex");
    if (sourceSha256 !== copy.sha256) fail("Source Product Media bytes do not match the approved immutable digest.");
    const sourceDimensions = await (input.inspect ?? inspectMediaDimensions)(source);
    if (sourceDimensions.width !== copy.width || sourceDimensions.height !== copy.height || sourceDimensions.mimeType !== copy.mimeType) fail("Source Product Media dimensions or byte format differ from the reviewed association.");
    let target = await readComplete(copy.targetUrl, copy, input.fetchImpl ?? fetch, input.mode === "copy");
    if (!target) {
      await input.copyObject(sourceParts(copy.sourceUrl).path, sourceParts(copy.targetUrl).path);
      copied++;
      target = await readComplete(copy.targetUrl, copy, input.fetchImpl ?? fetch, false);
    }
    const targetSha256 = createHash("sha256").update(target!).digest("hex");
    if (targetSha256 !== sourceSha256 || !source.equals(target!)) fail("Destination Product Media differs from the source; no pointers may be published.");
    const dimensions = await (input.inspect ?? inspectMediaDimensions)(target!);
    if (!isDeepStrictEqual(sourceDimensions, dimensions)) fail("Destination Product Media dimensions changed.");
    // Customer delivery is a separate fact from the fresh origin proof. A stale
    // negative cache or different bare response must not precede pointer cutover.
    const canonicalBytes = (await readComplete(copy.targetUrl, copy, input.fetchImpl ?? fetch, false, false))!;
    const canonicalSha256 = createHash("sha256").update(canonicalBytes).digest("hex");
    if (canonicalSha256 !== sourceSha256 || !source.equals(canonicalBytes)) fail("Canonical public Product Media is stale or differs from the verified source; retry delivery verification before cutover.");
    assets.push({ sourceUrl: copy.sourceUrl, targetUrl: copy.targetUrl, sourceSha256, targetSha256, canonicalSha256, byteSize: source.length, ...dimensions });
  }
  return { operationId: manifest.operationId, manifestSha256: manifestDigest(manifest), distinctAssets: unique.size,
    associations: manifest.products.reduce((sum, product) => sum + product.media.length, 0), copied, assets };
}
