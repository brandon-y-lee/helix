import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailEnvironment } from "@/lib/email/config";
import { supportPhotoOrigin } from "@/lib/support/photo-request";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportUuid } from "@/lib/support/request";

export type SupportPhotoAccessDependencies = {
  env: EmailEnvironment;
  now(): number;
  requireAccess(capability: "support.read"): Promise<{ userId: string }>;
  getPhoto(actorId: string, inquiryId: string, photoId: string): Promise<{ path: string; mediaType: "image/webp" } | null>;
  readClean(path: string, signal: AbortSignal): Promise<Buffer>;
};
const lifetimeMs = 60_000;
function secret(env: EmailEnvironment): string {
  const value = env.HELIX_SUPPORT_PHOTO_ACCESS_SECRET;
  if (!value || Buffer.byteLength(value.trim()) < 32 || value.length > 4096) throw new SupportError("support_unavailable");
  return value;
}
function privateAccessResponse(response: Response): Response {
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  return response;
}
function sign(payload: string, key: string): string { return createHmac("sha256", key).update(payload).digest("base64url"); }

export async function handleSupportPhotoAccessRequest(request: Request, inquiryId: string, photoId: string, dependencies: SupportPhotoAccessDependencies): Promise<Response> {
  try {
    const actor = await dependencies.requireAccess("support.read");
    if (request.method !== "GET" && request.method !== "POST") throw new SupportError("invalid_support_input");
    const origin = supportPhotoOrigin(dependencies.env, false);
    const key = secret(dependencies.env);
    inquiryId = supportUuid(inquiryId);
    photoId = supportUuid(photoId);
    const path = `/api/admin/support/${inquiryId}/photos/${photoId}`;
    const url = new URL(request.url);
    if (url.origin !== origin || url.pathname !== path) throw new SupportError("same_origin_required");
    const now = dependencies.now();
    if (!Number.isSafeInteger(now)) throw new SupportError("support_unavailable");
    if (request.method === "POST") {
      assertSupportOrigin(request, origin);
      if (url.search || (request.body && Object.keys(await readSupportJson(request)).length)) throw new SupportError("invalid_support_input");
      const photo = await dependencies.getPhoto(actor.userId, inquiryId, photoId);
      if (!photo || photo.mediaType !== "image/webp") throw new SupportError("not_found");
      const expiresAt = now + lifetimeMs;
      const payload = Buffer.from(JSON.stringify({ v: 1, purpose: "support-photo", actorId: actor.userId, inquiryId, photoId, expiresAt })).toString("base64url");
      return privateAccessResponse(supportResponse({ url: `${path}?capability=${payload}.${sign(payload, key)}`, expiresAt: new Date(expiresAt).toISOString() }));
    }
    const tokens = url.searchParams.getAll("capability");
    if (tokens.length !== 1 || [...url.searchParams.keys()].some((name) => name !== "capability")) throw new SupportError("not_found");
    const token = tokens[0];
    if (!/^[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new SupportError("not_found");
    const [payload, signature] = token.split(".");
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload, key)))) throw new SupportError("not_found");
    let claim: unknown;
    try {
      const bytes = Buffer.from(payload, "base64url");
      if (bytes.toString("base64url") !== payload) throw new Error();
      claim = JSON.parse(bytes.toString("utf8"));
    } catch { throw new SupportError("not_found"); }
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) throw new SupportError("not_found");
    const value = claim as Record<string, unknown>;
    if (Object.keys(value).some((name) => !["v", "purpose", "actorId", "inquiryId", "photoId", "expiresAt"].includes(name))
      || value.v !== 1 || value.purpose !== "support-photo" || value.actorId !== actor.userId || value.inquiryId !== inquiryId || value.photoId !== photoId
      || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + lifetimeMs) throw new SupportError("not_found");
    const photo = await dependencies.getPhoto(actor.userId, inquiryId, photoId);
    if (!photo || photo.mediaType !== "image/webp") throw new SupportError("not_found");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
    if (signal.aborted) throw new SupportError("support_unavailable");
    const bytes = await dependencies.readClean(photo.path, signal);
    if (signal.aborted || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 4 * 1024 * 1024) throw new SupportError("support_unavailable");
    if (dependencies.now() >= value.expiresAt) throw new SupportError("not_found");
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp", "cache-control": "private, no-store",
      "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "referrer-policy": "no-referrer", "content-disposition": 'inline; filename="support-photo.webp"' } });
  } catch (error) { return privateAccessResponse(supportFailure(error)); }
}
