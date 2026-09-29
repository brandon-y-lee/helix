// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSupportRetentionRequest, type SupportRetentionDependencies } from "@/lib/support/retention";

const secret = "synthetic-retention-secret-more-than-32-characters";
const counts = { inquiriesRedacted: 1, draftsRedacted: 2, photosExpired: 3, auditDeleted: 4,
  emailsRedacted: 5, heldInquiries: 1, oldestOverdueAt: "2026-08-01T00:00:00Z" };
function setup() {
  return { env: { HELIX_SUPPORT_RETENTION_SECRET: secret, HELIX_SUPPORT_RETENTION_ENABLED: "true",
    HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_DISPATCH_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co" },
  now: () => Date.now(), redact: vi.fn().mockResolvedValue(counts),
  clean: vi.fn().mockResolvedValue({ cleaned: 1, deferred: 0 }) } satisfies SupportRetentionDependencies;
}
const request = (token = secret) => new Request("https://helixskin.vercel.app/api/internal/support-retention", {
  method: "POST", headers: { authorization: `Bearer ${token}` },
});
afterEach(() => vi.useRealTimers());

describe("bounded support retention", () => {
  it("requires its own credential and explicit restricted configuration before any cleanup", async () => {
    const deps = setup();
    expect((await handleSupportRetentionRequest(request("wrong"), deps)).status).toBe(401);
    expect(deps.redact).not.toHaveBeenCalled();
    expect(deps.clean).not.toHaveBeenCalled();
    deps.env.HELIX_SUPPORT_RETENTION_ENABLED = "false";
    expect((await handleSupportRetentionRequest(request(), deps)).status).toBe(503);
    deps.env.HELIX_SUPPORT_RETENTION_ENABLED = "true";
    deps.env.NEXT_PUBLIC_SUPABASE_URL = "https://other.supabase.co";
    expect((await handleSupportRetentionRequest(request(), deps)).status).toBe(503);
    expect(deps.redact).not.toHaveBeenCalled();
  });

  it("redacts bounded content and reserves independent photo cleanup even when sends are disabled", async () => {
    const deps = setup();
    const response = await handleSupportRetentionRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, ...counts, objectsCleaned: 3, objectsDeferred: 0 });
    expect(deps.redact).toHaveBeenCalledOnce();
    expect(deps.clean).toHaveBeenCalledTimes(3);
  });

  it("stops at an empty cleanup queue and preserves a deferred deletion for the durable lease retry", async () => {
    const deps = setup();
    deps.clean.mockResolvedValueOnce({ cleaned: 0, deferred: 1 }).mockResolvedValueOnce({ cleaned: 0, deferred: 0 });
    const result = await (await handleSupportRetentionRequest(request(), deps)).json();
    expect(result).toMatchObject({ objectsCleaned: 0, objectsDeferred: 1 });
    expect(deps.clean).toHaveBeenCalledTimes(2);
  });

  it("does not start another storage deletion when the invocation has no cleanup budget", async () => {
    vi.useFakeTimers();
    const deps = setup();
    deps.clean.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(36_000);
      return { cleaned: 1, deferred: 0 };
    });
    const response = await handleSupportRetentionRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(deps.clean).toHaveBeenCalledOnce();
  });

  it("never returns private provider errors or unexpected database fields", async () => {
    const deps = setup();
    deps.redact.mockRejectedValueOnce(new Error("private address and storage credential"));
    const failure = await handleSupportRetentionRequest(request(), deps);
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private address");
    expect(deps.clean).not.toHaveBeenCalled();
    deps.redact.mockResolvedValueOnce({ ...counts, privatePayload: "private address" });
    const response = await handleSupportRetentionRequest(request(), deps);
    expect(await response.text()).not.toContain("private address");
  });
});
