import { describe, expect, it, vi } from "vitest";
import { handleSupportIntakeRequest, type SupportIntakeDependencies } from "@/lib/support/intake";
import { SupportError } from "@/lib/support/request";

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
    expect(await response.json()).toEqual({ available: false });
    expect(dependencies.available).not.toHaveBeenCalled();
  });

  it("bounds streamed request bytes even when content-length is omitted", async () => {
    const dependencies = setup();
    const response = await handleSupportIntakeRequest(request({ ...input, body: "𐀀".repeat(20_000) }), dependencies);
    expect(response.status).toBe(413);
    expect(dependencies.submit).not.toHaveBeenCalled();
  });
});
