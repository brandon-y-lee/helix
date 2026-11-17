import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  decodeSupportPhoto,
  validatePhotoContainer,
  PhotoError,
  type CleanSupportPhoto,
  type PhotoExecution,
} from "@/lib/support/photos";
import {
  assertStoredContract,
  ProductionSupportError,
  UUID,
  type ProductionConfig,
  type StoredContract,
} from "./config";
import { photoPath, materializeMedia } from "./media";
import { object } from "./request";
export type PhotoWorkerDependencies = {
  contract(c: ProductionConfig): Promise<unknown>;
  rpc(
    c: ProductionConfig,
    n: string,
    i: Record<string, unknown>,
  ): Promise<unknown>;
  storage(
    c: ProductionConfig,
    contract: StoredContract,
  ): {
    readRaw(p: string, s: AbortSignal): Promise<Buffer>;
    readClean(p: string, s: AbortSignal): Promise<Buffer>;
    writeClean(p: string, b: Buffer, s: AbortSignal): Promise<void>;
  };
  decode?(b: Buffer, e: PhotoExecution): Promise<CleanSupportPhoto>;
  now(): number;
  leaseId?(): string;
};
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
/** One photo OR one media preparation per call; no provider send and no deletion. */
export async function processProductionPhoto(
  config: ProductionConfig,
  d: PhotoWorkerDependencies,
) {
  const empty = { processed: 0, deferred: 0, prepared: 0 };
  if (
    !config.workerEnabled ||
    !config.fullMediaQualified ||
    !config.isolationQualified ||
    !config.operationsQualified
  )
    return empty;
  const contract = await d.contract(config);
  assertStoredContract(contract, config);
  if (
    !contract.workerEnabled ||
    !contract.fullMediaQualified ||
    !contract.isolationQualified ||
    !contract.operationsQualified
  )
    return empty;
  const storage = d.storage(config, contract);
  const leaseId = (d.leaseId ?? randomUUID)();
  if (!UUID.test(leaseId)) throw new ProductionSupportError();
  const identity = {
    projectRef: config.projectRef,
    contractId: config.contractId,
  };
  const rpc = (n: string, i: Record<string, unknown>) =>
    d.rpc(config, n, { ...identity, ...i });
  const deadline = d.now() + 35000;
  const signal = AbortSignal.timeout(35000);
  const job = await rpc("claim_support_prod_photo", { leaseId });
  if (job === null) {
    const batch = await rpc("prepare_support_prod_media", { leaseId });
    if (batch === null) return empty;
    if (
      !object(batch) ||
      typeof batch.outboxId !== "string" ||
      !UUID.test(batch.outboxId) ||
      batch.leaseId !== leaseId
    )
      throw new ProductionSupportError();
    try {
      const frozen = await materializeMedia(
        batch.recipe,
        batch.outboxId,
        config.contractId,
        storage.readClean,
        signal,
      );
      const done = await rpc("finalize_support_prod_media", {
        outboxId: batch.outboxId,
        leaseId,
        requestHash: frozen.requestHash,
        requestBytes: frozen.requestBytes,
      });
      return {
        ...empty,
        prepared: done === true ? 1 : 0,
        deferred: done === true ? 0 : 1,
      };
    } catch {
      return { ...empty, deferred: 1 };
    }
  }
  if (
    !object(job) ||
    typeof job.photoId !== "string" ||
    !UUID.test(job.photoId) ||
    typeof job.inquiryId !== "string" ||
    !UUID.test(job.inquiryId) ||
    typeof job.uploadId !== "string" ||
    !UUID.test(job.uploadId) ||
    job.leaseId !== leaseId ||
    typeof job.leaseUntil !== "string" ||
    !Number.isFinite(Date.parse(job.leaseUntil)) ||
    Date.parse(job.leaseUntil) <= d.now() + 30000 ||
    job.rawPath !== `raw/${job.inquiryId}/${job.uploadId}` ||
    job.cleanPath !== `clean/${job.inquiryId}/${job.uploadId}.webp` ||
    !Number.isSafeInteger(job.declaredBytes) ||
    Number(job.declaredBytes) < 1 ||
    Number(job.declaredBytes) > 10485760 ||
    !["image/jpeg", "image/png", "image/webp"].includes(String(job.contentType))
  )
    throw new ProductionSupportError();
  photoPath(job.rawPath, "raw");
  photoPath(job.cleanPath, "clean");
  const claim = { photoId: job.photoId, leaseId };
  try {
    const bytes = await storage.readRaw(job.rawPath as string, signal);
    if (!bytes.length || bytes.length > 10485760)
      throw new ProductionSupportError();
    let contentType = "application/octet-stream";
    try {
      const kind = validatePhotoContainer(bytes);
      contentType = `image/${kind === "jpeg" ? "jpeg" : kind}`;
    } catch {
      /* Preserve actual original evidence even for an invalid container. */
    }
    const admitted = await rpc("record_support_prod_photo_raw", {
      ...claim,
      rawBytes: bytes.length,
      rawHash: digest(bytes),
      contentType,
    });
    if (admitted !== true) return { ...empty, processed: 1 };
    const clean = await (d.decode ?? decodeSupportPhoto)(bytes, {
      deadline: deadline - 5000,
      signal,
    });
    if (signal.aborted || d.now() >= deadline - 5000)
      throw new PhotoError("processing_timeout");
    await storage.writeClean(job.cleanPath as string, clean.bytes, signal);
    const done = await rpc("finish_support_prod_photo", {
      ...claim,
      outcome: "ready",
      cleanBytes: clean.bytes.length,
      cleanHash: digest(clean.bytes),
      width: clean.width,
      height: clean.height,
    });
    return {
      ...empty,
      processed: done === true ? 1 : 0,
      deferred: done === true ? 0 : 1,
    };
  } catch (error) {
    const permanent =
      error instanceof PhotoError &&
      ["invalid_image", "too_large"].includes(error.code);
    try {
      await rpc("finish_support_prod_photo", {
        ...claim,
        outcome: permanent ? "rejected" : "retry",
      });
    } catch {
      /* Lease expiry retains ownership and recovers work. */
    }
    return { ...empty, deferred: 1 };
  }
}
