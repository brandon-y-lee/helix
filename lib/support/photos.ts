import "server-only";
import { spawn } from "node:child_process";
import sharp from "sharp";

export const PHOTO_ORIGINAL_LIMIT = 10 * 1024 * 1024;
export const PHOTO_CLEAN_LIMIT = 4 * 1024 * 1024;
export const PHOTO_PIXEL_LIMIT = 25_000_000;
const DECODE_MS = 8_000;
export type PhotoErrorCode = "invalid_image" | "too_large" | "processing_timeout" | "processing_busy" | "storage_unavailable";
export class PhotoError extends Error {
  constructor(readonly code: PhotoErrorCode) { super(code); }
}
export type PhotoExecution = { deadline: number; signal?: AbortSignal };
export type CleanSupportPhoto = { bytes: Buffer; width: number; height: number; mediaType: "image/webp" };

/** Container checks reject trailing payloads/animation; full decoding remains mandatory. */
export function validatePhotoContainer(bytes: Buffer): "jpeg" | "png" | "webp" {
  if (!bytes.length || bytes.length > PHOTO_ORIGINAL_LIMIT) throw new PhotoError("too_large");
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12 || ["acTL", "fcTL", "fdAT"].includes(type)) throw new PhotoError("invalid_image");
      offset += length + 12;
      if (type === "IEND") {
        if (length !== 0 || offset !== bytes.length) throw new PhotoError("invalid_image");
        return "png";
      }
    }
  } else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new PhotoError("invalid_image");
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      if (length > bytes.length - offset - 8 || ["ANIM", "ANMF"].includes(type)
        || (type === "VP8X" && (bytes[offset + 8] & 2) !== 0)) throw new PhotoError("invalid_image");
      offset += 8 + length + (length % 2);
    }
    if (offset === bytes.length) return "webp";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk length-bearing segments and entropy-coded scans, including progressive JPEGs.
    let offset = 2;
    let scan = false;
    while (offset < bytes.length) {
      if (scan && bytes[offset] !== 0xff) { offset++; continue; }
      if (bytes[offset++] !== 0xff) throw new PhotoError("invalid_image");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
      scan = false;
      if (marker === 0xd9) {
        if (offset !== bytes.length) throw new PhotoError("invalid_image");
        return "jpeg";
      }
      if (marker === 0 || marker === undefined || marker === 0xd8 || offset + 2 > bytes.length) throw new PhotoError("invalid_image");
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || length > bytes.length - offset) throw new PhotoError("invalid_image");
      offset += length;
      scan = marker === 0xda;
    }
  }
  throw new PhotoError("invalid_image");
}

export async function readPhotoBytes(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new PhotoError("storage_unavailable"); }
  const reader = response.body.getReader();
  let aborted = signal.aborted;
  const abort = () => { aborted = true; void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    if (aborted) throw new PhotoError("processing_timeout");
    if (Number(response.headers.get("content-length")) > limit) throw new PhotoError("too_large");
    for (;;) {
      const { value, done } = await reader.read();
      if (aborted) throw new PhotoError("processing_timeout");
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new PhotoError("too_large");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Static code only. The isolated decoder receives image bytes, never application secrets.
// Killing and awaiting the process bounds native metadata/decode work as well as queue time.
const DECODER = String.raw`
const sharp = require('sharp');
if (sharp.versions.sharp !== '0.35.5') process.exit(2);
sharp.cache(false); sharp.concurrency(1);
const chunks = []; let size = 0;
process.stdin.on('data', chunk => { size += chunk.length; if (size > 10485760) process.exit(2); chunks.push(chunk); });
process.stdin.on('end', async () => {
  try {
    const input = Buffer.concat(chunks);
    const options = { failOn: 'warning', limitInputPixels: 25000000, limitInputChannels: 4, sequentialRead: true };
    const metadata = await sharp(input, options).metadata();
    if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height
      || metadata.width * metadata.height > 25000000 || metadata.width > 10000 || metadata.height > 10000) process.exit(2);
    const decoded = await sharp(input, options).timeout({seconds: 6}).autoOrient().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    if (decoded.info.channels > 4 || decoded.data.length > 100000000) process.exit(2);
    const clean = await sharp(decoded.data, {raw: {width:decoded.info.width,height:decoded.info.height,channels:decoded.info.channels}})
      .timeout({seconds: 6}).resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true})
      .webp({quality:85,effort:2}).toBuffer({resolveWithObject:true});
    if (!clean.data.length || clean.data.length > 4194304) process.exit(2);
    process.stdout.write(JSON.stringify({width:clean.info.width,height:clean.info.height}) + '\n');
    process.stdout.end(clean.data);
  } catch { process.exit(2); }
});
`;
let decoderActive = false;

export async function decodeSupportPhoto(bytes: Buffer, execution: PhotoExecution): Promise<CleanSupportPhoto> {
  if (!Number.isFinite(execution.deadline) || execution.deadline <= Date.now() || execution.signal?.aborted) throw new PhotoError("processing_timeout");
  validatePhotoContainer(bytes);
  // A static import retains native dependency tracing. Webpack rewrites require.resolve
  // to a module ID, which cannot be passed as a filesystem path to a child process.
  if (sharp.versions.sharp !== "0.35.5") throw new PhotoError("storage_unavailable");
  const remaining = Math.min(DECODE_MS, execution.deadline - Date.now());
  if (remaining <= 0 || execution.signal?.aborted) throw new PhotoError("processing_timeout");
  if (decoderActive) throw new PhotoError("processing_busy");
  decoderActive = true;
  return new Promise<CleanSupportPhoto>((resolve, reject) => {
    const child = spawn(process.execPath, ["--max-old-space-size=192", "-e", DECODER], {
      stdio: ["pipe", "pipe", "ignore"], env: { NODE_ENV: "production", UV_THREADPOOL_SIZE: "1", VIPS_CONCURRENCY: "1" },
    });
    const output: Buffer[] = [];
    let outputSize = 0;
    let failure: PhotoError | null = null;
    const stop = (code: PhotoErrorCode) => { failure ??= new PhotoError(code); child.kill("SIGKILL"); };
    const abort = () => stop("processing_timeout");
    const timer = setTimeout(abort, remaining);
    execution.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () => { failure ??= new PhotoError("storage_unavailable"); });
    child.stdin.on("error", () => { /* Process close owns the single terminal result. */ });
    child.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > PHOTO_CLEAN_LIMIT + 128) { stop("too_large"); return; }
      output.push(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      execution.signal?.removeEventListener("abort", abort);
      if (failure || code !== 0) { reject(failure ?? new PhotoError("invalid_image")); return; }
      try {
        const data = Buffer.concat(output, outputSize);
        const header = data.indexOf(10);
        if (header < 1 || header > 127) throw new Error();
        const dimensions = JSON.parse(data.toString("utf8", 0, header)) as { width: number; height: number };
        const clean = data.subarray(header + 1);
        if (![dimensions.width, dimensions.height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 2560)
          || !clean.length || clean.length > PHOTO_CLEAN_LIMIT || validatePhotoContainer(clean) !== "webp") throw new Error();
        resolve({ bytes: clean, width: dimensions.width, height: dimensions.height, mediaType: "image/webp" });
      } catch { reject(new PhotoError("invalid_image")); }
    });
    if (execution.signal?.aborted) abort();
    child.stdin.end(bytes);
  }).finally(() => { decoderActive = false; });
}
