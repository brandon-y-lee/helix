import "server-only";
import { ProductionSupportError } from "./config";

export function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff" } });
}
export function failure(error: unknown): Response {
  const safe = error instanceof ProductionSupportError ? error : new ProductionSupportError();
  return response({ ok: false, error: safe.code }, safe.status);
}
type IncomingBody = { body: ReadableStream<Uint8Array> | null; headers: Headers };

export async function boundedText(input: IncomingBody, maxBytes: number, timeoutMs = 5_000): Promise<string> {
  return (await boundedTextWithSize(input, maxBytes, timeoutMs)).text;
}

/** A byte cap plus wall-clock deadline covers missing/false Content-Length and stalled streams. */
export async function boundedTextWithSize(input: IncomingBody, maxBytes: number, timeoutMs: number) {
  const declared = input.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new ProductionSupportError(413, "payload_too_large");
  if (!input.body) throw new ProductionSupportError(400, "invalid_input");
  const reader = input.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let total = 0;
  const chunks: Uint8Array[] = [];
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProductionSupportError(408, "request_timeout")), timeoutMs); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) throw new ProductionSupportError(413, "payload_too_large");
      chunks.push(part.value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(joined), byteLength: total }; }
    catch { throw new ProductionSupportError(400, "invalid_input"); }
  } finally {
    if (timer) clearTimeout(timer);
    // Cancellation of a hostile stream can itself hang. Never await that cleanup.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function strictKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new ProductionSupportError(400, "invalid_input");
}
export function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || !value.trim() || value.length > max
    || (multiline ? /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/ : /[\u0000-\u001f\u007f-\u009f]/).test(value)) {
    throw new ProductionSupportError(400, "invalid_input");
  }
  return value.trim();
}
export function email(value: unknown): string {
  const address = text(value, 254).toLowerCase();
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(address)) {
    throw new ProductionSupportError(400, "invalid_input");
  }
  return address;
}
