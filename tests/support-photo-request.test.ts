// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleSupportPhotoRequest, supportPhotoSourceHash, type SupportPhotoRequestDependencies } from "@/lib/support/photo-request";

import { hashSupportPhotoCapability } from "@/lib/support/photo-capability";

const origin = "https://helixskin.vercel.app";
const submissionId = "5728e722-cc81-43be-b446-0695c7dc3aef";
const uploadId = "f4bbef15-d01c-4540-8d46-fc7eb83f9a9d";
const photoId = "51787cd8-007e-45ba-8b86-1198c9baaf45";
const capability = "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE";
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private-service-key", HELIX_SUPPORT_PHOTO_ACCESS_SECRET: "a".repeat(32), HELIX_SUPPORT_PHOTOS_ENABLED: "true", HELIX_SUPPORT_PHOTO_BUCKET: "support-private",
  HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_SITE_ORIGIN: origin };
const input = { action: "admit", submissionId, capability, uploadId, contentType: "image/png", byteSize: 1024 };
function request(body: unknown = input, requestOrigin = origin) {
  return new Request(`${origin}/api/support/photos`, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
function setup() {
  return { env, now: () => Date.parse("2026-09-29T00:59:00.000Z"), sourceHash: vi.fn().mockReturnValue("a".repeat(64)),
    reserveUpload: vi.fn().mockResolvedValue({ photoId, rawPath: "private/quarantine/object", uploadExpiresAt: "2026-09-29T03:00:00.000Z", tokenMintDeadlineAt: "2026-09-29T01:00:00.000Z" }),
    createUploadUrl: vi.fn().mockResolvedValue("https://storage.example.test/exact-upload-token"),
    completeUpload: vi.fn().mockResolvedValue(true), readUploads: vi.fn().mockResolvedValue([]),
  } satisfies SupportPhotoRequestDependencies;
}

describe("support photo upload requests", () => {
  it("admits an exact private upload under a hashed submission capability without exposing inquiry or object identifiers", async () => {
    const dependencies = setup();
    const response = await handleSupportPhotoRequest(request(), dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, photoId, uploadUrl: "https://storage.example.test/exact-upload-token" });
    expect(dependencies.reserveUpload).toHaveBeenCalledWith({ submissionId, capabilityHash: hashSupportPhotoCapability(capability), uploadId,
      contentType: "image/png", byteSize: 1024, sourceHash: "a".repeat(64) });
    expect(dependencies.createUploadUrl).toHaveBeenCalledWith("private/quarantine/object", "2026-09-29T01:00:00.000Z");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("refuses disabled, unrestricted, misconfigured and cross-origin admission before touching storage", async () => {
    const dependencies = setup();
    expect((await handleSupportPhotoRequest(request(input, "https://evil.example"), dependencies)).status).toBe(403);
    for (const changes of [{ HELIX_SUPPORT_PHOTOS_ENABLED: "false" }, { HELIX_EMAIL_MODE: "live" },
      { HELIX_EMAIL_ENVIRONMENT: "production" }, { HELIX_SUPPORT_PHOTO_BUCKET: "" }, { SUPABASE_SERVICE_ROLE_KEY: "" }, { NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" }, { HELIX_SUPPORT_PHOTO_ACCESS_SECRET: "short" }, { HELIX_EMAIL_SITE_ORIGIN: `${origin}/path` }]) {
      dependencies.env = { ...env, ...changes };
      expect((await handleSupportPhotoRequest(request(), dependencies)).status).toBe(503);
    }
    expect(dependencies.reserveUpload).not.toHaveBeenCalled();
    expect(dependencies.createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects forged authority, malformed capabilities and unsupported or over-limit declarations", async () => {
    const dependencies = setup();
    for (const body of [{ ...input, inquiryId: submissionId }, { ...input, actorId: submissionId }, { ...input, capability: `${capability}=` },
      { ...input, capability: `${capability.slice(0, -1)}F` }, { ...input, capability: "short" }, { ...input, contentType: "image/svg+xml" },
      { ...input, byteSize: 10 * 1024 * 1024 + 1 }, { ...input, byteSize: 0 }, { ...input, byteSize: 1.5 }, { ...input, uploadId: "bad" },
      { ...input, clientId: uploadId }, { ...input, type: "image/png" }]) {
      expect((await handleSupportPhotoRequest(request(body), dependencies)).status).toBe(400);
    }
    expect(dependencies.reserveUpload).not.toHaveBeenCalled();
  });

  it("completes and reads only the admitted submission, returning bounded public states", async () => {
    const dependencies = setup();
    const base = { submissionId, capability };
    const complete = await handleSupportPhotoRequest(request({ ...base, action: "complete", photoId }), dependencies);
    expect(await complete.json()).toEqual({ ok: true, status: "processing" });
    expect(dependencies.completeUpload).toHaveBeenCalledWith(submissionId, hashSupportPhotoCapability(capability), photoId);
    dependencies.readUploads.mockResolvedValue([{ id: photoId, uploadId, status: "rejected", rejectionReason: "invalid_image", rawPath: "secret-path" }]);
    const status = await handleSupportPhotoRequest(request({ ...base, action: "status" }), dependencies);
    expect(await status.json()).toEqual({ ok: true, photos: [{ id: photoId, uploadId, status: "rejected", rejectionReason: "invalid_image" }] });
    expect(dependencies.readUploads).toHaveBeenCalledWith(submissionId, hashSupportPhotoCapability(capability));
    dependencies.completeUpload.mockResolvedValue(false);
    expect((await handleSupportPhotoRequest(request({ ...base, action: "complete", photoId }), dependencies)).status).toBe(404);
    for (const body of [{ ...base, action: "status", inquiryId: submissionId }, { ...base, action: "complete", photoId, byteSize: 1 }]) {
      expect((await handleSupportPhotoRequest(request(body), dependencies)).status).toBe(400);
    }
  });

  it("does not mint after the persisted deadline or expose provider diagnostics", async () => {
    const dependencies = setup();
    dependencies.reserveUpload.mockResolvedValue({ photoId, rawPath: "private/quarantine/object", uploadExpiresAt: "2026-09-29T03:00:00.000Z", tokenMintDeadlineAt: "2026-09-29T00:58:59.000Z" });
    expect((await handleSupportPhotoRequest(request(), dependencies)).status).toBe(503);
    expect(dependencies.createUploadUrl).not.toHaveBeenCalled();
    dependencies.reserveUpload.mockRejectedValue(new Error("secret storage credential"));
    expect(await (await handleSupportPhotoRequest(request(), dependencies)).text()).not.toContain("credential");
  });

  it("bounds streamed JSON and requires the trusted Vercel source in hosted environments", async () => {
    const dependencies = setup();
    expect((await handleSupportPhotoRequest(request({ ...input, extra: "𐀀".repeat(20_000) }), dependencies)).status).toBe(413);
    expect(dependencies.reserveUpload).not.toHaveBeenCalled();
    const sourceRequest = (headers: Record<string, string>) => new Request(origin, { headers });
    const hosted = { VERCEL: "1", SUPABASE_SERVICE_ROLE_KEY: "a-private-key" };
    expect(() => supportPhotoSourceHash(sourceRequest({ "x-forwarded-for": "192.0.2.1" }), hosted)).toThrow();
    expect(() => supportPhotoSourceHash(sourceRequest({ "x-vercel-forwarded-for": "not-an-ip" }), hosted)).toThrow();
    const digest = supportPhotoSourceHash(sourceRequest({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.2" }), hosted);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(supportPhotoSourceHash(sourceRequest({ "x-vercel-forwarded-for": "192.0.2.1" }), hosted));
    expect(digest).not.toBe(supportPhotoSourceHash(sourceRequest({ "x-vercel-forwarded-for": "198.51.100.2" }), hosted));
  });

  it("never exposes private processing reasons and rejects unbounded or unknown status data", async () => {
    const dependencies = setup();
    const statusRequest = () => request({ action: "status", submissionId, capability });
    dependencies.readUploads.mockResolvedValue([{ id: photoId, uploadId, status: "rejected", rejectionReason: "private_diagnostic" }]);
    const response = await handleSupportPhotoRequest(statusRequest(), dependencies);
    expect(await response.json()).toMatchObject({ photos: [{ rejectionReason: "photo_unavailable" }] });
    dependencies.readUploads.mockResolvedValue(Array.from({ length: 6 }, () => ({ id: photoId, uploadId, status: "ready", rejectionReason: null })));
    expect((await handleSupportPhotoRequest(statusRequest(), dependencies)).status).toBe(503);
    dependencies.readUploads.mockResolvedValue([{ id: photoId, uploadId, status: "unrecognized", rejectionReason: null }]);
    expect((await handleSupportPhotoRequest(statusRequest(), dependencies)).status).toBe(503);
  });

  it("continues completion and status for accepted capabilities after new admission is disabled", async () => {
    const dependencies = setup();
    dependencies.env = { ...env, HELIX_SUPPORT_PHOTOS_ENABLED: "false" };
    expect((await handleSupportPhotoRequest(request({ action: "complete", submissionId, capability, photoId }), dependencies)).status).toBe(200);
    expect((await handleSupportPhotoRequest(request({ action: "status", submissionId, capability }), dependencies)).status).toBe(200);
    expect((await handleSupportPhotoRequest(request(), dependencies)).status).toBe(503);
    expect(dependencies.reserveUpload).not.toHaveBeenCalled();
  });

});
