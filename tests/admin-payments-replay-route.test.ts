import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentOperationsError } from "@/lib/admin/payments/errors";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
const mocks = vi.hoisted(() => ({ access: vi.fn(), replay: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: { paymentsManage: "payments.manage" }, requireAdminCapability: mocks.access,
}));
vi.mock("@/lib/admin/payments/service", () => ({ replayPaymentOperation: mocks.replay }));
import { POST } from "@/app/api/admin/payments/replay/route";

const command = { itemId: "22222222-2222-4222-8222-222222222222", expectedVersion: 3, reason: "Provider connection restored", requestId: "33333333-3333-4333-8333-333333333333", dryRun: true };
function request(body: unknown = command, origin = "https://helixskin.vercel.app") {
  return new Request("https://helixskin.vercel.app/api/admin/payments/replay", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_ORIGIN", "https://helixskin.vercel.app");
  mocks.access.mockResolvedValue({ userId: "server-actor" });
  mocks.replay.mockResolvedValue({ status: "eligible", itemId: command.itemId, version: 3 });
});
afterEach(() => vi.unstubAllEnvs());
describe("private replay route", () => {
  it("requires its own fresh payment capability before invoking the service", async () => {
    mocks.access.mockRejectedValue(new CatalogAdminError("capability_required", "No permission", 403));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith("payments.manage");
    expect(mocks.replay).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("passes one exact inspection request with private response headers", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "eligible", itemId: command.itemId, version: 3 });
    expect(mocks.replay).toHaveBeenCalledWith(command);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["https://attacker.test", "null", "https://helixskin.vercel.app/"])("rejects foreign or noncanonical origin %s before authorization", async (origin) => {
    const response = await POST(request(command, origin));
    expect(response.status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("rejects an absent origin and a broken origin configuration", async () => {
    const noOrigin = request();
    noOrigin.headers.delete("origin");
    expect((await POST(noOrigin)).status).toBe(403);
    vi.stubEnv("CHECKOUT_ORIGIN", "not-an-origin");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it.each([401, 403, 503])("redacts authentication failures with status %s", async (status) => {
    mocks.access.mockRejectedValue(new CatalogAdminError("raw_secret", "Sensitive membership data", status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("Sensitive");
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it.each([null, [], { ...command, actorId: "forged" }, { ...command, dryRun: "false" }])("rejects malformed or authority-bearing input %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("bounds actual streamed bytes despite a false declared length", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ ...command, reason: "x".repeat(4096) }));
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(body.subarray(0, 100)); controller.enqueue(body.subarray(100)); controller.close(); } });
    const oversized = new Request("https://helixskin.vercel.app/api/admin/payments/replay", {
      method: "POST", headers: { origin: "https://helixskin.vercel.app", "content-type": "application/json", "content-length": "1" },
      body: stream, duplex: "half",
    } as RequestInit);
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("reports a stale inspected event as conflict without exposing details", async () => {
    mocks.replay.mockRejectedValue(new PaymentOperationsError("replay_conflict", 409));
    const response = await POST(request({ ...command, dryRun: false }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "replay_conflict" } });
  });

  it("does not expose or log an unexpected failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.replay.mockRejectedValue(new Error("sk_test_secret customer@example.test"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "operations_unavailable", message: "Payment operations are temporarily unavailable." } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

});
