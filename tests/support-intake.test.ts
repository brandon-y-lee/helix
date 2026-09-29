import { describe, expect, it, vi } from "vitest";
import { handleSupportIntakeRequest, type SupportIntakeDependencies } from "@/lib/support/intake";
import { SupportError } from "@/lib/support/request";
import { createHash } from "node:crypto";

const env = { HELIX_SUPPORT_INTAKE_ENABLED: "true", HELIX_EMAIL_ENVIRONMENT: "sandbox",
  HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app" };
const input = { submissionId: "5728e722-cc81-43be-b446-0695c7dc3aef", name: "Demo Visitor",
  email: "visitor@example.test", inquiryType: "product", subject: "A product question", body: "Is this fragrance free?" };
function request(body: unknown = input, origin = env.HELIX_EMAIL_SITE_ORIGIN) {
  return new Request(`${env.HELIX_EMAIL_SITE_ORIGIN}/api/support/intake`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function setup() {
  const dependencies = { env, available: vi.fn().mockResolvedValue(true),
    abuseKeys: vi.fn().mockReturnValue({ source: "a".repeat(64), email: "b".repeat(64) }),
    authorizeOrder: vi.fn().mockResolvedValue(null), submit: vi.fn().mockResolvedValue({ inquiryId: "private-id" }),
  } satisfies SupportIntakeDependencies;
  return dependencies;
}

describe("support intake", () => {
  it("accepts a durable inquiry without provider credentials or a promised email delivery", async () => {
    const dependencies = setup();
    const response = await handleSupportIntakeRequest(request(), dependencies);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(dependencies.submit).toHaveBeenCalledWith({ ...input, abuseKey: "a".repeat(64), emailAbuseKey: "b".repeat(64), orderId: null });
    expect(dependencies.authorizeOrder).not.toHaveBeenCalled();
  });

  it("rejects cross-origin submissions and invalid input before persistence", async () => {
    const dependencies = setup();
    expect((await handleSupportIntakeRequest(request(input, "https://evil.example"), dependencies)).status).toBe(403);
    for (const body of [{ ...input, actorId: "forged" }, { ...input, email: "person@example.test\r\nBcc: attacker@example.test" },
      { ...input, body: "a".repeat(10_001) }, { ...input, inquiryType: "refund_approved" }]) {
      expect((await handleSupportIntakeRequest(request(body), dependencies)).status).toBe(400);
    }
    expect(dependencies.submit).not.toHaveBeenCalled();
  });

  it("fails closed when intake or trusted abuse protection is unavailable", async () => {
    const dependencies = setup();
    dependencies.available.mockResolvedValue(false);
    expect((await handleSupportIntakeRequest(request(), dependencies)).status).toBe(503);
    dependencies.available.mockResolvedValue(true);
    dependencies.abuseKeys.mockImplementation(() => { throw new Error("private infrastructure diagnostic"); });
    const response = await handleSupportIntakeRequest(request(), dependencies);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("infrastructure");
    expect(dependencies.submit).not.toHaveBeenCalled();
  });

  it("does not acknowledge storage failure or disclose whether an unowned Order exists", async () => {
    const dependencies = setup();
    const denied = await handleSupportIntakeRequest(request({ ...input, orderSessionId: "cs_test_unowned" }), dependencies);
    expect(denied.status).toBe(400);
    expect(dependencies.submit).not.toHaveBeenCalled();
    dependencies.authorizeOrder.mockResolvedValue("owned-order");
    dependencies.submit.mockRejectedValue(new SupportError("rate_limited"));
    const limited = await handleSupportIntakeRequest(request({ ...input, orderSessionId: "cs_test_owned" }), dependencies);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(dependencies.submit).toHaveBeenCalledWith(expect.objectContaining({ orderId: "owned-order" }));
  });

  it("reports disabled development intake without touching storage or exposing configuration", async () => {
    const dependencies = setup();
    dependencies.env = { ...env, HELIX_SUPPORT_INTAKE_ENABLED: "false" };
    const response = await handleSupportIntakeRequest(new Request(`${env.HELIX_EMAIL_SITE_ORIGIN}/api/support/intake`), dependencies);
    expect(await response.json()).toEqual({ available: false, photosAvailable: false });
    expect(dependencies.available).not.toHaveBeenCalled();
  });

  it("only advertises availability on the exact configured intake origin", async () => {
    const dependencies = setup();
    for (const origin of ["https://helix-preview.vercel.app", "https://alias.example"]) {
      const get = await handleSupportIntakeRequest(new Request(`${origin}/api/support/intake`), dependencies);
      expect(await get.json()).toEqual({ available: false, photosAvailable: false });
      const post = await handleSupportIntakeRequest(new Request(`${origin}/api/support/intake`, {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input),
      }), dependencies);
      expect(post.status).toBe(403);
    }
    expect(dependencies.available).not.toHaveBeenCalled();
    expect(dependencies.submit).not.toHaveBeenCalled();
    const canonical = await handleSupportIntakeRequest(new Request(`${env.HELIX_EMAIL_SITE_ORIGIN}/api/support/intake`), dependencies);
    expect(await canonical.json()).toEqual({ available: true, photosAvailable: false });
  });

  it("bounds streamed request bytes even when content-length is omitted", async () => {
    const dependencies = setup();
    const response = await handleSupportIntakeRequest(request({ ...input, body: "𐀀".repeat(20_000) }), dependencies);
    expect(response.status).toBe(413);
    expect(dependencies.submit).not.toHaveBeenCalled();
  });

  it("binds photo admission to a private capability and the original message before accepting it", async () => {
    const dependencies = setup();
    dependencies.env = { ...env, HELIX_SUPPORT_PHOTOS_ENABLED: "true", HELIX_SUPPORT_PHOTO_BUCKET: "helix-support-private", NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", HELIX_SUPPORT_PHOTO_ACCESS_SECRET: "synthetic-photo-access-secret-32-characters" } as typeof env;
    const uploadCapability = Buffer.alloc(32, 7).toString("base64url");
    const photos = [{ uploadId: "c4f6ea1a-ac10-41e9-b924-8fbc634b5bdb", byteSize: 1024, contentType: "image/jpeg" }];
    const response = await handleSupportIntakeRequest(request({ ...input, uploadCapability, photos }), dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(dependencies.submit).toHaveBeenCalledWith(expect.objectContaining({
      photoManifest: photos, uploadCapabilityHash: createHash("sha256").update(uploadCapability).digest("hex"),
    }));
    expect(JSON.stringify(dependencies.submit.mock.calls)).not.toContain(uploadCapability);
  });

  it("rejects excessive or ambiguous photo reservations without accepting the message", async () => {
    const dependencies = setup();
    dependencies.env = { ...env, HELIX_SUPPORT_PHOTOS_ENABLED: "true", HELIX_SUPPORT_PHOTO_BUCKET: "helix-support-private", NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", HELIX_SUPPORT_PHOTO_ACCESS_SECRET: "synthetic-photo-access-secret-32-characters" } as typeof env;
    const uploadCapability = Buffer.alloc(32, 7).toString("base64url");
    const photo = { uploadId: "c4f6ea1a-ac10-41e9-b924-8fbc634b5bdb", byteSize: 10 * 1024 * 1024, contentType: "image/png" };
    for (const extra of [
      { photos: [photo] }, { photos: [photo], uploadCapability: input.submissionId },
      { photos: [photo, photo], uploadCapability },
      { photos: [{ ...photo, byteSize: photo.byteSize + 1 }], uploadCapability },
      { photos: [{ ...photo, contentType: "image/svg+xml" }], uploadCapability },
      { photos: [photo, { ...photo, uploadId: "77774444-aaaa-4bbb-8ccc-111122223333" }, { ...photo, uploadId: "99994444-aaaa-4bbb-8ccc-111122223333" }], uploadCapability },
    ]) expect((await handleSupportIntakeRequest(request({ ...input, ...extra }), dependencies)).status).toBe(400);
    expect(dependencies.submit).not.toHaveBeenCalled();
  });

  it("offers text-only intake while private photo admission is disabled", async () => {
    const dependencies = setup();
    const response = await handleSupportIntakeRequest(new Request(`${env.HELIX_EMAIL_SITE_ORIGIN}/api/support/intake`), dependencies);
    expect(await response.json()).toEqual({ available: true, photosAvailable: false });
    expect((await handleSupportIntakeRequest(request({ ...input,
      uploadCapability: Buffer.alloc(32, 7).toString("base64url"),
      photos: [{ uploadId: "c4f6ea1a-ac10-41e9-b924-8fbc634b5bdb", byteSize: 1024, contentType: "image/jpeg" }],
    }), dependencies)).status).toBe(503);
    expect(dependencies.submit).not.toHaveBeenCalled();
    expect((await handleSupportIntakeRequest(request(), dependencies)).status).toBe(200);
  });
});
