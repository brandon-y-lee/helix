// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createPhotoStorage } from "@/lib/support/photo-storage";
import { PHOTO_ORIGINAL_LIMIT } from "@/lib/support/photos";

const id = "4a31099b-9242-42fe-8210-775840277216";
const host = "https://erasogmsqpgiirovubjh.supabase.co";
const env = { HELIX_SUPPORT_PHOTOS_ENABLED: "true", HELIX_SUPPORT_PHOTO_BUCKET: "support-private", HELIX_EMAIL_ENVIRONMENT: "sandbox",
  HELIX_EMAIL_MODE: "restricted", NEXT_PUBLIC_SUPABASE_URL: host, SUPABASE_SERVICE_ROLE_KEY: "test-service-credential" };
const bucket = { public: false, file_size_limit: PHOTO_ORIGINAL_LIMIT, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] };
const raw = `raw/${id}/${id}`;
function fixture(override = {}) {
  const fetcher = vi.fn<typeof fetch>();
  const rpc = vi.fn().mockResolvedValue(true);
  const now = vi.fn(() => 1000);
  return { fetcher, rpc, now, storage: createPhotoStorage({ env: { ...env, ...override }, fetch: fetcher, rpc, now }) };
}
describe("private photo storage boundary", () => {
  it.each([{ HELIX_SUPPORT_PHOTOS_ENABLED: "false" }, { HELIX_SUPPORT_PHOTO_BUCKET: "" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }])(
    "fails closed before calls for incomplete configuration %j", async (override) => {
      const { storage, fetcher } = fixture(override);
      await expect(storage.createUploadUrl(raw, new Date(30000).toISOString())).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
  it.each([{ ...bucket, public: true }, { ...bucket, file_size_limit: 5 * 1024 * 1024 }, { ...bucket, allowed_mime_types: ["image/jpeg"] }])(
    "checks the actual private bucket and full advertised limits before minting", async (value) => {
      const { storage, fetcher } = fixture(); fetcher.mockResolvedValueOnce(Response.json(value));
      await expect(storage.createUploadUrl(raw, new Date(30000).toISOString())).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  it("mints only the reserved exact path without upsert and returns a direct upload URL", async () => {
    const { storage, fetcher } = fixture(); fetcher.mockResolvedValueOnce(Response.json(bucket))
      .mockResolvedValueOnce(Response.json({ url: `/object/upload/sign/support-private/${raw}?token=opaque` }));
    expect(await storage.createUploadUrl(raw, new Date(30000).toISOString())).toBe(`${host}/storage/v1/object/upload/sign/support-private/${raw}?token=opaque`);
    expect(fetcher.mock.calls[1]).toEqual([`${host}/storage/v1/object/upload/sign/support-private/${raw}`, expect.objectContaining({
      method: "POST", body: "{}", redirect: "error", cache: "no-store", headers: expect.objectContaining({ "x-upsert": "false" }),
    })]);
  });
  it("rechecks the persisted mint deadline after bucket inspection", async () => {
    const { storage, fetcher, now } = fixture(); fetcher.mockImplementation(async () => { now.mockReturnValue(40000); return Response.json(bucket); });
    await expect(storage.createUploadUrl(raw, new Date(30000).toISOString())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects provider URLs that do not target the immutable reserved object", async () => {
    const { storage, fetcher } = fixture(); fetcher.mockResolvedValueOnce(Response.json(bucket))
      .mockResolvedValueOnce(Response.json({ url: "/object/upload/sign/support-private/raw/other?token=opaque" }));
    await expect(storage.createUploadUrl(raw, new Date(30000).toISOString())).rejects.toThrow();
  });
  it("downloads private clean bytes through authenticated storage without issuing a signed GET", async () => {
    const { storage, fetcher } = fixture(); fetcher.mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response("clean"));
    const path = `clean/${id}/${id}.webp`;
    expect(await storage.readClean(path, AbortSignal.timeout(1000))).toEqual(Buffer.from("clean"));
    expect(fetcher.mock.calls[1][0]).toBe(`${host}/storage/v1/object/authenticated/support-private/${path}`);
  });
  it("keeps accepted completion, status and private reads available when new photo admission stops", async () => {
    const { storage, fetcher, rpc } = fixture({ HELIX_SUPPORT_PHOTOS_ENABLED: "false" });
    expect(await storage.completeUpload(id, "capability-hash", id)).toBe(true);
    rpc.mockResolvedValueOnce([]);
    expect(await storage.readUploads(id, "capability-hash")).toEqual([]);
    fetcher.mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response("clean"));
    expect(await storage.readClean(`clean/${id}/${id}.webp`, AbortSignal.timeout(1000))).toEqual(Buffer.from("clean"));
  });
  it("recovers an interrupted immutable write only when the existing bytes match", async () => {
    const { storage, fetcher } = fixture(); const path = `clean/${id}/${id}.webp`;
    fetcher.mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response("clean"));
    await expect(storage.writeClean(path, Buffer.from("clean"), AbortSignal.timeout(1000))).resolves.toBeUndefined();
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "x-upsert": "false" });
    fetcher.mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(new Response("different"));
    await expect(storage.writeClean(path, Buffer.from("clean"), AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "storage_unavailable" });
  });
  it("removes only server-claimed expired paths while leaving admission identity in SQL", async () => {
    const { storage, fetcher, rpc } = fixture(); fetcher.mockResolvedValueOnce(Response.json(bucket)).mockResolvedValueOnce(Response.json([]));
    const job = { id, leaseToken: id, rawPath: raw, cleanPath: null };
    await storage.removeExpiredObjects(job, AbortSignal.timeout(1000));
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({ prefixes: [raw] });
    await storage.finishCleanup(job, "done");
    expect(rpc).toHaveBeenCalledWith("finish_support_photo_cleanup", { p_id: id, p_lease_token: id, p_outcome: "done" }, expect.any(AbortSignal));
  });
});
