import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupportError, supportStorageError, supportUuid } from "@/lib/support/request";
import { PHOTO_CLEAN_LIMIT, PHOTO_ORIGINAL_LIMIT, PhotoError, readPhotoBytes } from "@/lib/support/photos";

export type PhotoJob = { id: string; inquiryId: string; messageId: string; leaseToken: string; cleanPath: string; deadlineAt: string;
  source: { kind: "upload"; path: string } | { kind: "resend"; emailId: string; attachmentId: string } };
export type PhotoUploadReservation = { photoId: string; rawPath: string; uploadExpiresAt: string; tokenMintDeadlineAt: string };
export type PhotoUploadStatus = { id: string; uploadId: string; status: "pending" | "processing" | "ready" | "rejected"; rejectionReason: string | null };
export type PhotoCleanup = { id: string; rawPath: string | null; cleanPath: string | null; leaseToken: string };
type Dependencies = { env: Record<string, string | undefined>; fetch: typeof fetch;
  rpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>; now(): number };
const PRIVATE_PROJECT = "https://erasogmsqpgiirovubjh.supabase.co";
const CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupportError("support_unavailable");
  return value as Record<string, unknown>;
}
function storagePath(value: unknown, prefix: "raw" | "clean"): string {
  if (typeof value !== "string" || value.length > 256 || !new RegExp(`^${prefix}/[a-f0-9/-]+(?:\\.webp)?$`).test(value)
    || value.includes("//") || value.includes("..")) throw new SupportError("support_unavailable");
  return value;
}
function validTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new SupportError("support_unavailable");
  return value;
}

export function createPhotoStorage(dependencies: Dependencies) {
  function config(admission = false) {
    const { env } = dependencies;
    const bucket = env.HELIX_SUPPORT_PHOTO_BUCKET;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if ((admission && env.HELIX_SUPPORT_PHOTOS_ENABLED !== "true") || env.HELIX_EMAIL_ENVIRONMENT !== "sandbox" || env.HELIX_EMAIL_MODE !== "restricted"
      || env.NEXT_PUBLIC_SUPABASE_URL !== PRIVATE_PROJECT || !key || !bucket || !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)) throw new SupportError("support_unavailable");
    return { bucket, key, base: `${PRIVATE_PROJECT}/storage/v1` };
  }
  async function call(path: string, signal: AbortSignal, init: RequestInit = {}) {
    const { key, base } = config();
    return dependencies.fetch(`${base}${path}`, { ...init, redirect: "error", cache: "no-store", signal,
      headers: { apikey: key, authorization: `Bearer ${key}`, ...init.headers } });
  }
  async function json(response: Response, signal: AbortSignal) {
    const data = await readPhotoBytes(response, 16 * 1024, signal);
    try { return object(JSON.parse(data.toString("utf8"))); }
    catch { throw new SupportError("support_unavailable"); }
  }
  async function privateBucket(signal: AbortSignal) {
    const { bucket } = config();
    const data = await json(await call(`/bucket/${bucket}`, signal), signal);
    const limit = Number(data.file_size_limit);
    if (data.public !== false || limit !== PHOTO_ORIGINAL_LIMIT || !Array.isArray(data.allowed_mime_types)
      || data.allowed_mime_types.length !== CONTENT_TYPES.length
      || CONTENT_TYPES.some((type) => !(data.allowed_mime_types as unknown[]).includes(type))) throw new SupportError("support_unavailable");
    return bucket;
  }
  const deadlineSignal = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
  const rpc = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => dependencies.rpc(name, args, deadlineSignal(signal));
  async function readObject(path: string, prefix: "raw" | "clean", signal: AbortSignal) {
    const bounded = deadlineSignal(signal);
    const bucket = await privateBucket(bounded);
    return readPhotoBytes(await call(`/object/authenticated/${bucket}/${storagePath(path, prefix)}`, bounded),
      prefix === "raw" ? PHOTO_ORIGINAL_LIMIT : PHOTO_CLEAN_LIMIT, bounded);
  }
  return {
    async reserveUpload(input: { submissionId: string; capabilityHash: string; uploadId: string; contentType: string; byteSize: number; sourceHash: string }): Promise<PhotoUploadReservation> {
      config(true);
      const data = object(await rpc("reserve_support_photo_upload", { p_submission_id: input.submissionId,
        p_capability_hash: input.capabilityHash, p_upload_id: input.uploadId, p_content_type: input.contentType,
        p_byte_size: input.byteSize, p_source_hash: input.sourceHash }));
      return { photoId: supportUuid(data.photoId), rawPath: storagePath(data.rawPath, "raw"),
        uploadExpiresAt: validTime(data.uploadExpiresAt), tokenMintDeadlineAt: validTime(data.tokenMintDeadlineAt) };
    },
    async createUploadUrl(path: string, tokenMintDeadlineAt: string): Promise<string> {
      config(true);
      const raw = storagePath(path, "raw");
      const signal = deadlineSignal();
      const bucket = await privateBucket(signal);
      // The DB persisted an expiry ceiling before this call. Never mint after its window.
      if (Date.parse(tokenMintDeadlineAt) <= dependencies.now()) throw new SupportError("support_unavailable");
      const signed = await json(await call(`/object/upload/sign/${bucket}/${raw}`, signal,
        { method: "POST", headers: { "content-type": "application/json", "x-upsert": "false" }, body: "{}" }), signal);
      if (typeof signed.url !== "string") throw new SupportError("support_unavailable");
      const url = new URL(`${config().base}${signed.url}`);
      if (url.origin !== PRIVATE_PROJECT || url.pathname !== `/storage/v1/object/upload/sign/${bucket}/${raw}`
        || !url.searchParams.get("token") || url.searchParams.getAll("token").length !== 1
        || [...url.searchParams.keys()].some((key) => key !== "token")) throw new SupportError("support_unavailable");
      return url.toString();
    },
    async completeUpload(submissionId: string, capabilityHash: string, photoId: string): Promise<boolean> {
      config();
      return await rpc("complete_support_photo_upload", { p_submission_id: submissionId, p_capability_hash: capabilityHash, p_photo_id: photoId }) === true;
    },
    async readUploads(submissionId: string, capabilityHash: string): Promise<PhotoUploadStatus[]> {
      config();
      const result = await rpc("read_support_photo_uploads", { p_submission_id: submissionId, p_capability_hash: capabilityHash });
      if (!Array.isArray(result) || result.length > 5) throw new SupportError("support_unavailable");
      return result.map((value) => {
        const item = object(value);
        if (!["pending", "processing", "ready", "rejected"].includes(item.status as string)
          || (item.rejectionReason !== null && typeof item.rejectionReason !== "string")) throw new SupportError("support_unavailable");
        return { id: supportUuid(item.id), uploadId: supportUuid(item.uploadId), status: item.status, rejectionReason: item.rejectionReason } as PhotoUploadStatus;
      });
    },
    async claim(leaseToken: string, signal?: AbortSignal, allowReceived = true): Promise<PhotoJob | null> {
      config();
      const rows = await rpc("claim_support_photos", { p_lease_token: leaseToken, p_limit: 1, p_allow_received: allowReceived }, signal);
      if (!Array.isArray(rows) || rows.length > 1) throw new SupportError("support_unavailable");
      if (!rows.length) return null;
      const row = object(rows[0]); const source = object(row.source);
      const result = { id: supportUuid(row.id), inquiryId: supportUuid(row.inquiryId), messageId: supportUuid(row.messageId),
        leaseToken: supportUuid(row.leaseToken), cleanPath: storagePath(row.cleanPath, "clean"), deadlineAt: validTime(row.deadlineAt) };
      if (result.leaseToken !== leaseToken) throw new SupportError("support_unavailable");
      if (source.kind === "upload") return { ...result, source: { kind: "upload", path: storagePath(source.path, "raw") } };
      if (source.kind === "resend") return { ...result, source: { kind: "resend", emailId: supportUuid(source.emailId), attachmentId: supportUuid(source.attachmentId) } };
      throw new SupportError("support_unavailable");
    },
    async admitSize(job: PhotoJob, bytes: number, signal?: AbortSignal): Promise<"accepted" | "rejected" | "stale"> {
      const result = await rpc("admit_support_photo_size", { p_id: job.id, p_lease_token: job.leaseToken, p_actual_bytes: bytes }, signal);
      if (result !== "accepted" && result !== "rejected" && result !== "stale") throw new SupportError("support_unavailable");
      return result;
    },
    async finish(job: PhotoJob, outcome: "ready" | "retry" | "rejected", data?: { bytes: number; width: number; height: number }, errorCode: string | null = null, signal?: AbortSignal): Promise<boolean> {
      return await rpc("finish_support_photo", { p_id: job.id, p_lease_token: job.leaseToken, p_outcome: outcome,
        p_bytes: data?.bytes ?? null, p_width: data?.width ?? null, p_height: data?.height ?? null, p_error_code: errorCode }, signal) === true;
    },
    readRaw: (path: string, signal: AbortSignal) => readObject(path, "raw", signal),
    readClean: (path: string, signal: AbortSignal) => readObject(path, "clean", signal),
    async writeClean(path: string, bytes: Buffer, signal: AbortSignal): Promise<void> {
      if (!bytes.length || bytes.length > PHOTO_CLEAN_LIMIT) throw new PhotoError("too_large");
      const bounded = deadlineSignal(signal); const bucket = await privateBucket(bounded);
      const clean = storagePath(path, "clean");
      const response = await call(`/object/${bucket}/${clean}`, bounded, { method: "POST",
        headers: { "content-type": "image/webp", "cache-control": "max-age=0", "x-upsert": "false" }, body: new Uint8Array(bytes) });
      if (response.status === 409 || response.status === 400) {
        // An interrupted prior finish may have already written this immutable object.
        await response.body?.cancel();
        const existing = await readObject(clean, "clean", bounded);
        if (createHash("sha256").update(existing).digest("hex") !== createHash("sha256").update(bytes).digest("hex")) throw new PhotoError("storage_unavailable");
        return;
      }
      if (!response.ok) { await response.body?.cancel(); throw new PhotoError("storage_unavailable"); }
      await response.body?.cancel();
    },
    async getPhoto(actorId: string, inquiryId: string, photoId: string): Promise<{ path: string; mediaType: "image/webp" } | null> {
      config();
      const result = await rpc("get_support_photo", { p_actor_id: actorId, p_inquiry_id: inquiryId, p_photo_id: photoId });
      if (result === null) return null;
      const row = object(result);
      if (row.mediaType !== "image/webp") throw new SupportError("support_unavailable");
      return { path: storagePath(row.path, "clean"), mediaType: "image/webp" };
    },
    async claimCleanup(leaseToken: string, signal?: AbortSignal): Promise<PhotoCleanup | null> {
      config();
      const rows = await rpc("claim_support_photo_cleanup", { p_lease_token: leaseToken, p_limit: 1 }, signal);
      if (!Array.isArray(rows) || rows.length > 1) throw new SupportError("support_unavailable");
      if (!rows.length) return null;
      const row = object(rows[0]);
      const result = { id: supportUuid(row.id), leaseToken: supportUuid(row.leaseToken),
        rawPath: row.rawPath === null ? null : storagePath(row.rawPath, "raw"),
        cleanPath: row.cleanPath === null ? null : storagePath(row.cleanPath, "clean") };
      if (result.leaseToken !== leaseToken || (!result.rawPath && !result.cleanPath)) throw new SupportError("support_unavailable");
      return result;
    },
    async removeExpiredObjects(job: PhotoCleanup, signal: AbortSignal): Promise<void> {
      const bounded = deadlineSignal(signal); const bucket = await privateBucket(bounded);
      const paths = [job.rawPath && storagePath(job.rawPath, "raw"), job.cleanPath && storagePath(job.cleanPath, "clean")].filter(Boolean);
      const response = await call(`/object/${bucket}`, bounded, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
      await response.body?.cancel();
      if (!response.ok && response.status !== 404) throw new PhotoError("storage_unavailable");
    },
    async finishCleanup(job: PhotoCleanup, outcome: "done" | "retry", signal?: AbortSignal): Promise<boolean> {
      return await rpc("finish_support_photo_cleanup", { p_id: job.id, p_lease_token: job.leaseToken, p_outcome: outcome }, signal) === true;
    },
  };
}

export const photoStorage = createPhotoStorage({ env: process.env, fetch: (...args) => fetch(...args), now: Date.now,
  async rpc(name, args, signal) {
    const query = createSupabaseAdminClient().rpc(name, args);
    const { data, error } = await query.abortSignal(signal ?? AbortSignal.timeout(5000));
    if (error) supportStorageError(error);
    return data;
  },
});
