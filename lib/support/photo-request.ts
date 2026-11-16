import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { EmailEnvironment } from "@/lib/email/config";
import { hashSupportPhotoCapability } from "@/lib/support/photo-capability";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportUuid } from "@/lib/support/request";

export type SupportPhotoUploadStatus = { id: string; uploadId: string; status: string; rejectionReason: string | null };
export type SupportPhotoRequestDependencies = {
  env: EmailEnvironment;
  now(): number;
  sourceHash(request: Request): string;
  reserveUpload(input: { submissionId: string; capabilityHash: string; uploadId: string; contentType: string; byteSize: number; sourceHash: string }): Promise<{ photoId: string; rawPath: string; uploadExpiresAt: string; tokenMintDeadlineAt: string }>;
  createUploadUrl(rawPath: string, tokenMintDeadlineAt: string): Promise<string>;
  completeUpload(submissionId: string, capabilityHash: string, photoId: string): Promise<boolean>;
  readUploads(submissionId: string, capabilityHash: string): Promise<SupportPhotoUploadStatus[]>;
};

export function supportPhotoOrigin(env: EmailEnvironment, requireAdmission = true): string {
  if ((requireAdmission && env.HELIX_SUPPORT_PHOTOS_ENABLED !== "true") || env.HELIX_EMAIL_ENVIRONMENT !== "sandbox" || env.HELIX_EMAIL_MODE !== "restricted"
    || env.NEXT_PUBLIC_SUPABASE_URL !== "https://erasogmsqpgiirovubjh.supabase.co" || !env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || Buffer.byteLength(env.HELIX_SUPPORT_PHOTO_ACCESS_SECRET?.trim() ?? "") < 32 || (env.HELIX_SUPPORT_PHOTO_ACCESS_SECRET?.length ?? 0) > 4096
    || !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(env.HELIX_SUPPORT_PHOTO_BUCKET ?? "")) throw new SupportError("support_unavailable");
  const origin = env.HELIX_EMAIL_SITE_ORIGIN?.trim();
  try {
    if (!origin) throw new Error();
    const url = new URL(origin);
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== origin || url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && local))) throw new Error();
    return origin;
  } catch { throw new SupportError("support_unavailable"); }
}

export function supportPhotosAvailable(env: EmailEnvironment): boolean {
  try { supportPhotoOrigin(env); return true; } catch { return false; }
}

export function supportPhotoSourceHash(request: Request, env: EmailEnvironment): string {
  const address = (request.headers.get("x-vercel-forwarded-for")
    ?? (env.VERCEL === "1" ? null : request.headers.get("x-forwarded-for")))?.split(",", 1)[0]?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!address || !isIP(address) || !key) throw new SupportError("support_unavailable");
  return createHmac("sha256", `${key}:support-source-v1`).update(address).digest("hex");
}

export async function handleSupportPhotoRequest(request: Request, dependencies: SupportPhotoRequestDependencies): Promise<Response> {
  try {
    const origin = supportPhotoOrigin(dependencies.env, false);
    assertSupportOrigin(request, origin);
    if (request.method !== "POST") throw new SupportError("invalid_support_input");
    const body = await readSupportJson(request);
    const commonKeys = ["action", "submissionId", "capability"];
    const allowedKeys = body.action === "admit" ? [...commonKeys, "uploadId", "contentType", "byteSize"]
      : body.action === "complete" ? [...commonKeys, "photoId"] : commonKeys;
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) throw new SupportError("invalid_support_input");
    const submissionId = supportUuid(body.submissionId);
    const capabilityHash = hashSupportPhotoCapability(body.capability);
    if (body.action === "complete") {
      if (!await dependencies.completeUpload(submissionId, capabilityHash, supportUuid(body.photoId))) throw new SupportError("not_found");
      return supportResponse({ ok: true, status: "processing" });
    }
    if (body.action === "status") {
      const photos = await dependencies.readUploads(submissionId, capabilityHash);
      if (!Array.isArray(photos) || photos.length > 5) throw new SupportError("support_unavailable");
      return supportResponse({ ok: true, photos: photos.map((photo) => {
        if (!["pending", "processing", "ready", "rejected"].includes(photo.status)
          || (photo.rejectionReason !== null && !/^[a-z_]{1,64}$/.test(photo.rejectionReason))) throw new SupportError("support_unavailable");
        const publicReasons = ["invalid_image", "too_large", "processing_timeout", "storage_unavailable", "upload_expired", "photo_budget_exceeded", "photo_limit_exceeded"];
        const rejectionReason = photo.rejectionReason === null ? null : publicReasons.includes(photo.rejectionReason) ? photo.rejectionReason : "photo_unavailable";
        return { id: supportUuid(photo.id), uploadId: supportUuid(photo.uploadId), status: photo.status, rejectionReason };
      }) });
    }
    if (body.action !== "admit" || typeof body.contentType !== "string" || typeof body.byteSize !== "number"
      || !["image/jpeg", "image/png", "image/webp"].includes(body.contentType) || !Number.isSafeInteger(body.byteSize)
      || body.byteSize < 1 || body.byteSize > 10 * 1024 * 1024) throw new SupportError("invalid_support_input");
    supportPhotoOrigin(dependencies.env);
    const result = await dependencies.reserveUpload({ submissionId, capabilityHash,
      uploadId: supportUuid(body.uploadId), contentType: body.contentType, byteSize: body.byteSize, sourceHash: dependencies.sourceHash(request) });
    const deadline = Date.parse(result.tokenMintDeadlineAt);
    if (!Number.isFinite(deadline) || deadline <= dependencies.now()) throw new SupportError("support_unavailable");
    return supportResponse({ ok: true, photoId: result.photoId, uploadUrl: await dependencies.createUploadUrl(result.rawPath, result.tokenMintDeadlineAt) });
  } catch (error) { return supportFailure(error); }
}
