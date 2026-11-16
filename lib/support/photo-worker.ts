import "server-only";
import { randomUUID } from "node:crypto";
import { decodeSupportPhoto, PhotoError, PHOTO_ORIGINAL_LIMIT, type CleanSupportPhoto, type PhotoExecution } from "@/lib/support/photos";
import { photoStorage, type PhotoJob, type PhotoCleanup } from "@/lib/support/photo-storage";

export type PhotoWorkerDependencies = {
  storage: Pick<typeof photoStorage, "claim" | "readRaw" | "admitSize" | "writeClean" | "finish">;
  decode(bytes: Buffer, execution: PhotoExecution): Promise<CleanSupportPhoto>;
  now(): number;
};
export type PhotoWorkerExecution = { deadline: number; signal: AbortSignal; allowReceived?: boolean;
  downloadResendPhoto(emailId: string, attachmentId: string, signal: AbortSignal): Promise<Buffer> };
export type PhotoWorkerResult = { processed: number; rejected: number; deferred: number };
const defaults: PhotoWorkerDependencies = { storage: photoStorage, decode: decodeSupportPhoto, now: Date.now };

/** One claimed photo per call; the caller owns the total worker deadline and repetition. */
export async function processSupportPhotos(execution: PhotoWorkerExecution, dependencies: PhotoWorkerDependencies = defaults): Promise<PhotoWorkerResult> {
  const result: PhotoWorkerResult = { processed: 0, rejected: 0, deferred: 0 };
  if (execution.signal.aborted || execution.deadline - dependencies.now() < 15_000) return result;
  const invocationSignal = AbortSignal.any([execution.signal, AbortSignal.timeout(execution.deadline - dependencies.now())]);
  let job: PhotoJob | null = null;
  try {
    job = await dependencies.storage.claim(randomUUID(), invocationSignal, execution.allowReceived ?? true);
    if (!job) return result;
    const deadline = Math.min(execution.deadline - 5_000, Date.parse(job.deadlineAt) - 5_000);
    const remaining = deadline - dependencies.now();
    if (remaining <= 0) throw new PhotoError("processing_timeout");
    const signal = AbortSignal.any([execution.signal, AbortSignal.timeout(remaining)]);
    const bytes = job.source.kind === "upload" ? await dependencies.storage.readRaw(job.source.path, signal)
      : await execution.downloadResendPhoto(job.source.emailId, job.source.attachmentId, signal);
    if (!bytes.length || bytes.length > PHOTO_ORIGINAL_LIMIT) throw new PhotoError("too_large");
    if (signal.aborted) throw new PhotoError("processing_timeout");
    const admission = await dependencies.storage.admitSize(job, bytes.length, signal);
    if (admission !== "accepted") {
      // Byte-budget rejection and its context revision are committed in the admission RPC.
      if (admission === "rejected") result.rejected++; else result.deferred++;
      return result;
    }
    const clean = await dependencies.decode(bytes, { deadline, signal });
    if (signal.aborted || dependencies.now() >= deadline) throw new PhotoError("processing_timeout");
    await dependencies.storage.writeClean(job.cleanPath, clean.bytes, signal);
    const finished = await dependencies.storage.finish(job, "ready", { bytes: clean.bytes.length, width: clean.width, height: clean.height }, null, invocationSignal);
    if (finished) result.processed++; else result.deferred++;
  } catch (error) {
    if (!job || invocationSignal.aborted) return { ...result, deferred: 1 };
    const permanent = error instanceof PhotoError && (error.code === "invalid_image" || error.code === "too_large");
    const code = error instanceof PhotoError && ["invalid_image", "too_large", "processing_timeout"].includes(error.code)
      ? error.code : "storage_unavailable";
    try {
      const finished = await dependencies.storage.finish(job, permanent ? "rejected" : "retry", undefined,
        code, invocationSignal);
      if (permanent && finished) result.rejected++; else result.deferred++;
    } catch { result.deferred++; } // The expired lease recovers an interrupted terminal write.
  }
  return result;
}

/** Separate repair path: does not delete a raw object before its persisted token ceiling. */
export async function cleanupSupportPhotos(execution: { deadline: number; signal: AbortSignal },
  dependencies = { storage: photoStorage, now: Date.now }): Promise<{ cleaned: number; deferred: number }> {
  if (execution.signal.aborted || execution.deadline - dependencies.now() < 10_000) return { cleaned: 0, deferred: 0 };
  const invocationSignal = AbortSignal.any([execution.signal, AbortSignal.timeout(execution.deadline - dependencies.now())]);
  let job: PhotoCleanup | null = null;
  try {
    job = await dependencies.storage.claimCleanup(randomUUID(), invocationSignal);
    if (!job) return { cleaned: 0, deferred: 0 };
    const signal = AbortSignal.any([execution.signal, AbortSignal.timeout(Math.max(1, execution.deadline - dependencies.now() - 5000))]);
    await dependencies.storage.removeExpiredObjects(job, signal);
    if (await dependencies.storage.finishCleanup(job, "done", invocationSignal)) return { cleaned: 1, deferred: 0 };
  } catch {
    if (job && !invocationSignal.aborted) { try { await dependencies.storage.finishCleanup(job, "retry", invocationSignal); } catch { /* Lease recovery retains the tombstone. */ } }
  }
  return { cleaned: 0, deferred: 1 };
}
