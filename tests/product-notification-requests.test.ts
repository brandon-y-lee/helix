import { describe, expect, it, vi } from "vitest";
import { handleProductNotificationRequest } from "@/lib/waitlist/notifications";

const requestId = "010a8b22-d19b-49bf-b04c-ceab5d52b7e5";
const token = "T".repeat(43);
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted",
  HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true" };
function setup() {
  return { env, abuseKey: () => "a".repeat(64), storage: {
    recover: vi.fn().mockResolvedValue({ ok: true }), cancel: vi.fn().mockResolvedValue({ ok: true }),
  } };
}
function request(body: unknown, origin = "https://helix.test") {
  return new Request("https://helix.test/api/product-notifications/recovery", { method: "POST",
    headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
describe("Product notification management requests", () => {
  it("delivers recovery capabilities only through the private mailbox intent, never the requesting browser", async () => {
    const deps = setup();
    const result = await handleProductNotificationRequest(request({ email: " Owner@Example.test ", requestId }), "recovery", deps);
    expect(result.status).toBe(202);
    expect(await result.json()).toEqual({ ok: true });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    const input = deps.storage.recover.mock.calls[0][0];
    expect(input).toMatchObject({ email: "owner@example.test", requestId, abuseKey: "a".repeat(64), deliveryAllowed: true });
    expect(input.tokens).toHaveLength(20);
    expect(new Set(input.tokens).size).toBe(20);
    expect(input.tokens.every((value: string) => /^[A-Za-z0-9_-]{43}$/.test(value))).toBe(true);
  });
  it("still records abuse bounds for forbidden recipients without rerouting or exposing eligibility", async () => {
    const deps = setup();
    const result = await handleProductNotificationRequest(request({ email: "victim@example.test", requestId }), "recovery", deps);
    expect(result.status).toBe(202);
    expect(await result.json()).toEqual({ ok: true });
    expect(deps.storage.recover).toHaveBeenCalledWith(expect.objectContaining({ email: "victim@example.test", deliveryAllowed: false }));
  });
  it("requires a deliberate same-origin cancellation POST and remains available with new sends disabled", async () => {
    const deps = setup();
    deps.env = { ...env, HELIX_EMAIL_ENVIRONMENT: "" };
    const result = await handleProductNotificationRequest(request({ token }), "cancel", deps);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(deps.storage.cancel).toHaveBeenCalledWith(token);
    deps.storage.cancel.mockClear();
    for (const method of ["GET", "HEAD"]) {
      expect((await handleProductNotificationRequest(new Request(`https://helix.test/product-notifications?cancel=${token}`, { method }), "cancel", deps)).status).toBe(405);
    }
    expect((await handleProductNotificationRequest(request({ token }, "https://attacker.test"), "cancel", deps)).status).toBe(403);
    expect(deps.storage.cancel).not.toHaveBeenCalled();
  });
  it("bounds an undeclared streamed request and keeps private failures out of responses", async () => {
    const deps = setup();
    expect((await handleProductNotificationRequest(request({ email: "a".repeat(2_048), requestId }), "recovery", deps)).status).toBe(413);
    expect(deps.storage.recover).not.toHaveBeenCalled();
    deps.storage.recover.mockRejectedValue(new Error(`victim@example.test ${token}`));
    const failed = await handleProductNotificationRequest(request({ email: "owner@example.test", requestId }), "recovery", deps);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(/victim|TTTT/);
  });
  it("fails closed without trusted abuse identity and requires a stable request identity", async () => {
    const deps = setup();
    expect((await handleProductNotificationRequest(request({ email: "owner@example.test" }), "recovery", deps)).status).toBe(400);
    deps.abuseKey = () => { throw new Error("Missing trusted source."); };
    expect((await handleProductNotificationRequest(request({ email: "owner@example.test", requestId }), "recovery", deps)).status).toBe(503);
    expect(deps.storage.recover).not.toHaveBeenCalled();
  });
});
