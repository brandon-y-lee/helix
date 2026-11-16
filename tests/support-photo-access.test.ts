// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleSupportPhotoAccessRequest, type SupportPhotoAccessDependencies } from "@/lib/support/photo-access";
import { SupportError } from "@/lib/support/request";

const origin = "https://helixskin.vercel.app";
const inquiryId = "5728e722-cc81-43be-b446-0695c7dc3aef";
const photoId = "51787cd8-007e-45ba-8b86-1198c9baaf45";
const otherId = "6dd1d191-1c1b-441b-8f98-87b314e17de6";
const path = `/api/admin/support/${inquiryId}/photos/${photoId}`;
const now = Date.parse("2026-09-29T01:00:00.000Z");
function setup() {
  return { env: { NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private-service-key", HELIX_SUPPORT_PHOTOS_ENABLED: "true", HELIX_SUPPORT_PHOTO_BUCKET: "support-private",
    HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_SITE_ORIGIN: origin,
    HELIX_SUPPORT_PHOTO_ACCESS_SECRET: "a".repeat(32) }, now: vi.fn().mockReturnValue(now),
    requireAccess: vi.fn().mockResolvedValue({ userId: "trusted-operator" }),
    getPhoto: vi.fn().mockResolvedValue({ path: "clean/private/object", mediaType: "image/webp" }),
    readClean: vi.fn().mockResolvedValue(Buffer.from("safe webp bytes")),
  } satisfies SupportPhotoAccessDependencies;
}
const issueRequest = () => new Request(`${origin}${path}`, { method: "POST", headers: { origin } });
async function issue(dependencies: ReturnType<typeof setup>) {
  const response = await handleSupportPhotoAccessRequest(issueRequest(), inquiryId, photoId, dependencies);
  return { response, result: await response.json() as { url: string; expiresAt: string } };
}

describe("private support photo access", () => {
  it("issues a one-minute actor-bound local URL and reauthorizes its download without disclosing the storage path", async () => {
    const dependencies = setup();
    const { response, result } = await issue(dependencies);
    expect(response.status).toBe(200);
    expect(result.expiresAt).toBe("2026-09-29T01:01:00.000Z");
    expect(result.url).toMatch(new RegExp(`^${path}\\?capability=`));
    expect(JSON.stringify(result)).not.toContain("clean/private/object");
    const download = await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies);
    expect(download.status).toBe(200);
    expect(await download.text()).toBe("safe webp bytes");
    expect(dependencies.requireAccess).toHaveBeenCalledTimes(2);
    expect(dependencies.requireAccess).toHaveBeenLastCalledWith("support.read");
    expect(dependencies.getPhoto).toHaveBeenLastCalledWith("trusted-operator", inquiryId, photoId);
    expect(download.headers.get("content-type")).toBe("image/webp");
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(download.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(download.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rejects expired, altered, cross-actor and cross-photo capabilities before loading bytes", async () => {
    const dependencies = setup();
    const { result } = await issue(dependencies);
    const download = (url = result.url, inquiry = inquiryId, photo = photoId) => handleSupportPhotoAccessRequest(new Request(new URL(url, origin)), inquiry, photo, dependencies);
    dependencies.now.mockReturnValue(now + 60_000);
    expect((await download()).status).toBe(404);
    dependencies.now.mockReturnValue(now);
    dependencies.requireAccess.mockResolvedValue({ userId: "another-operator" });
    expect((await download()).status).toBe(404);
    dependencies.requireAccess.mockResolvedValue({ userId: "trusted-operator" });
    expect((await download(result.url.replace(photoId, otherId), inquiryId, otherId)).status).toBe(404);
    expect((await download(result.url.replace(inquiryId, otherId), otherId, photoId)).status).toBe(404);
    expect((await download(`${result.url}suffix`)).status).toBe(404);
    expect((await download(`${result.url}.ignored`)).status).toBe(404);
    expect((await download(`${result.url}&capability=second`)).status).toBe(404);
    expect(dependencies.readClean).not.toHaveBeenCalled();
  });

  it("requires same-origin issuance and current support access for both issuance and download", async () => {
    const dependencies = setup();
    const crossOrigin = new Request(`${origin}${path}`, { method: "POST", headers: { origin: "https://evil.example" } });
    expect((await handleSupportPhotoAccessRequest(crossOrigin, inquiryId, photoId, dependencies)).status).toBe(403);
    expect(dependencies.getPhoto).not.toHaveBeenCalled();
    const { result } = await issue(dependencies);
    dependencies.getPhoto.mockClear();
    dependencies.requireAccess.mockRejectedValue(new SupportError("forbidden"));
    const denied = await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies);
    expect(denied.status).toBe(403);
    expect(dependencies.getPhoto).not.toHaveBeenCalled();
    expect(dependencies.readClean).not.toHaveBeenCalled();
  });

  it("refuses unavailable or deleted photos, weak signing configuration, unexpected bodies and methods", async () => {
    const dependencies = setup();
    const { result } = await issue(dependencies);
    dependencies.getPhoto.mockResolvedValue(null);
    expect((await issue(dependencies)).response.status).toBe(404);
    expect((await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies)).status).toBe(404);
    expect(dependencies.readClean).not.toHaveBeenCalled();
    dependencies.env.HELIX_SUPPORT_PHOTO_ACCESS_SECRET = "too-short";
    expect((await issue(dependencies)).response.status).toBe(503);
    dependencies.env.HELIX_SUPPORT_PHOTO_ACCESS_SECRET = "a".repeat(32);
    dependencies.getPhoto.mockClear();
    expect((await handleSupportPhotoAccessRequest(new Request(`${origin}${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ actorId: "forged" }) }), inquiryId, photoId, dependencies)).status).toBe(400);
    expect((await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin), { method: "HEAD" }), inquiryId, photoId, dependencies)).status).toBe(400);
    expect(dependencies.getPhoto).not.toHaveBeenCalled();
  });

  it("bounds clean downloads and returns only safe failures when private storage fails", async () => {
    const dependencies = setup();
    const { result } = await issue(dependencies);
    const get = () => handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies);
    dependencies.readClean.mockResolvedValue(Buffer.alloc(4 * 1024 * 1024 + 1));
    expect((await get()).status).toBe(503);
    dependencies.readClean.mockRejectedValue(new Error("private storage path and credential"));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credential");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const signal = dependencies.readClean.mock.calls.at(-1)?.[1];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects signed capabilities from another purpose or version and propagates client cancellation", async () => {
    const dependencies = setup();
    const claims = { v: 1, purpose: "support-photo", actorId: "trusted-operator", inquiryId, photoId, expiresAt: now + 60_000 };
    for (const changes of [{ v: 2 }, { purpose: "support-upload" }, { expiresAt: now + 60_001 }]) {
      const payload = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString("base64url");
      const signature = createHmac("sha256", "a".repeat(32)).update(payload).digest("base64url");
      const response = await handleSupportPhotoAccessRequest(new Request(`${origin}${path}?capability=${payload}.${signature}`), inquiryId, photoId, dependencies);
      expect(response.status).toBe(404);
    }
    const { result } = await issue(dependencies);
    const controller = new AbortController();
    controller.abort();
    const response = await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin), { signal: controller.signal }), inquiryId, photoId, dependencies);
    expect(response.status).toBe(503);
    expect(dependencies.readClean).not.toHaveBeenCalled();
  });

  it("withholds bytes if the access capability expires during the private read", async () => {
    const dependencies = setup();
    const { result } = await issue(dependencies);
    dependencies.readClean.mockImplementation(async () => {
      dependencies.now.mockReturnValue(now + 60_000);
      return Buffer.from("safe webp bytes");
    });
    const response = await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("safe webp bytes");
  });

  it("keeps existing private photos available to authorized support after admission is disabled", async () => {
    const dependencies = setup();
    dependencies.env.HELIX_SUPPORT_PHOTOS_ENABLED = "false";
    const { response, result } = await issue(dependencies);
    expect(response.status).toBe(200);
    expect((await handleSupportPhotoAccessRequest(new Request(new URL(result.url, origin)), inquiryId, photoId, dependencies)).status).toBe(200);
  });

});
