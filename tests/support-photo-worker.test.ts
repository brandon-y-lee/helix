// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processSupportPhotos, type PhotoWorkerDependencies } from "@/lib/support/photo-worker";
import { PhotoError } from "@/lib/support/photos";
import type { PhotoJob } from "@/lib/support/photo-storage";

const id = "4a31099b-9242-42fe-8210-775840277216";
function fixture() {
  const job: PhotoJob = { id, inquiryId: id, messageId: id, leaseToken: id, cleanPath: `clean/${id}.webp`,
    source: { kind: "upload", path: `raw/${id}` }, deadlineAt: new Date(Date.now() + 300000).toISOString() };
  const deps: PhotoWorkerDependencies = { now: Date.now, storage: {
    claim: vi.fn().mockResolvedValue(job), readRaw: vi.fn().mockResolvedValue(Buffer.from("original")),
    admitSize: vi.fn().mockResolvedValue("accepted"), writeClean: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(true),
  }, decode: vi.fn().mockResolvedValue({ bytes: Buffer.from("clean"), width: 10, height: 10, mediaType: "image/webp" }) };
  const execution = { deadline: Date.now() + 45000, signal: AbortSignal.timeout(45000), downloadResendPhoto: vi.fn().mockResolvedValue(Buffer.from("inbound")) };
  return { job, deps, execution };
}
describe("durable photo processing", () => {
  it("claims one and reserves actual source bytes before decoding, then publishes before marking ready", async () => {
    const { deps, execution, job } = fixture();
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 1, rejected: 0, deferred: 0 });
    expect(deps.storage.admitSize).toHaveBeenCalledWith(job, 8, expect.any(AbortSignal));
    expect(vi.mocked(deps.storage.admitSize).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.decode).mock.invocationCallOrder[0]);
    expect(vi.mocked(deps.storage.writeClean).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.storage.finish).mock.invocationCallOrder[0]);
  });
  it("does not decode or publish when concurrent aggregate admission refuses it", async () => {
    const { deps, execution } = fixture(); vi.mocked(deps.storage.admitSize).mockResolvedValue("rejected");
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 1, deferred: 0 });
    expect(deps.decode).not.toHaveBeenCalled(); expect(deps.storage.writeClean).not.toHaveBeenCalled();
    expect(deps.storage.finish).not.toHaveBeenCalled();
  });
  it("fetches provider originals through the bounded provider seam and rejects malformed images", async () => {
    const { deps, execution, job } = fixture(); job.source = { kind: "resend", emailId: id, attachmentId: id };
    vi.mocked(deps.decode).mockRejectedValue(new PhotoError("invalid_image"));
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 1, deferred: 0 });
    expect(execution.downloadResendPhoto).toHaveBeenCalledWith(id, id, expect.any(AbortSignal));
    expect(deps.storage.finish).toHaveBeenCalledWith(job, "rejected", undefined, "invalid_image", expect.any(AbortSignal));
  });
  it("leaves failed downloads and lost finishes retryable without publishing a second mutable object", async () => {
    const { deps, execution, job } = fixture(); vi.mocked(deps.storage.readRaw).mockRejectedValue(new Error("private provider detail"));
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 0, deferred: 1 });
    expect(deps.storage.finish).toHaveBeenCalledWith(job, "retry", undefined, "storage_unavailable", expect.any(AbortSignal));
    expect(deps.storage.writeClean).not.toHaveBeenCalled();
  });
  it("does not claim work without enough time to finish", async () => {
    const { deps, execution } = fixture(); execution.deadline = Date.now() + 10000;
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 0, deferred: 0 });
    expect(deps.storage.claim).not.toHaveBeenCalled();
  });
  it("excludes provider photos from admission while receiving credentials are unavailable", async () => {
    const { deps, execution } = fixture();
    expect(await processSupportPhotos({ ...execution, allowReceived: false }, deps)).toEqual({ processed: 1, rejected: 0, deferred: 0 });
    expect(deps.storage.claim).toHaveBeenCalledWith(expect.any(String), expect.any(AbortSignal), false);
    expect(execution.downloadResendPhoto).not.toHaveBeenCalled();
  });
  it("reports stale-lease admission failures as deferred and leaves terminal changes fenced", async () => {
    const { deps, execution } = fixture(); vi.mocked(deps.storage.admitSize).mockResolvedValue("stale");
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 0, deferred: 1 });
    expect(deps.decode).not.toHaveBeenCalled();
    expect(deps.storage.finish).not.toHaveBeenCalled();
  });
  it("releases busy decoders with the database-supported retry code", async () => {
    const { deps, execution, job } = fixture(); vi.mocked(deps.decode).mockRejectedValue(new PhotoError("processing_busy"));
    expect(await processSupportPhotos(execution, deps)).toEqual({ processed: 0, rejected: 0, deferred: 1 });
    expect(deps.storage.finish).toHaveBeenCalledWith(job, "retry", undefined, "storage_unavailable", expect.any(AbortSignal));
  });
});
