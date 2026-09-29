import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/email/storage", () => ({ recordEmailDeliveryEvent: mocks.record, emailDeliveryStorage: {} }));
vi.mock("@/lib/email/delivery", () => ({ dispatchEmailIntents: mocks.dispatch }));
import { POST as receive } from "@/app/api/webhooks/resend/route";
import { GET as dispatch } from "@/app/api/internal/email-dispatch/route";
const signing = Buffer.from("synthetic webhook key only").toString("base64");
const secret = "synthetic-dispatch-secret-32-characters";
const event = { type: "email.delivered", created_at: "2026-09-28T12:00:00Z", data: {
  email_id: "4e0fc110-e3e0-40e0-843b-09dc315a3a2d", from: "Helix <onboarding@resend.dev>", to: ["delivered@resend.dev"],
  tags: { helix_environment: "sandbox", helix_message_id: "f83164ef-c327-44ae-bbb4-bbd25d254abc" },
} };
function webhook(input: unknown = event, alter = false) {
  const body = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000)), id = "msg_synthetic";
  const signature = createHmac("sha256", Buffer.from(signing, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("https://helixskin.vercel.app/api/webhooks/resend", { method: "POST", body: body + (alter ? " " : ""),
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HELIX_EMAIL_ENVIRONMENT", "sandbox"); vi.stubEnv("HELIX_EMAIL_MODE", "restricted");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${signing}`); vi.stubEnv("HELIX_EMAIL_DISPATCH_SECRET", secret);
  vi.stubEnv("HELIX_EMAIL_DISPATCH_ENABLED", "false"); vi.stubEnv("RESEND_API_KEY", "");
  mocks.record.mockResolvedValue(undefined); mocks.dispatch.mockResolvedValue({ claimed: 0 });
});
afterEach(() => vi.unstubAllEnvs());
it("reconciles signed delivery while new dispatch and API credentials are disabled", async () => {
  const response = await receive(webhook());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: "msg_synthetic", eventType: "email.delivered", recipient: "delivered@resend.dev" }));
});
it("rejects a tampered raw body before storage", async () => {
  expect((await receive(webhook(event, true))).status).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});
it("requires the scheduler secret before claiming any work", async () => {
  expect((await dispatch(new Request("https://helixskin.vercel.app/api/internal/email-dispatch"))).status).toBe(401);
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect((await dispatch(new Request("https://helixskin.vercel.app/api/internal/email-dispatch", { headers: { Authorization: `Bearer ${secret}` } }))).status).toBe(200);
});
it("ignores signed messages from another environment or without local correlation", async () => {
  const other = { ...event, data: { ...event.data, tags: { ...event.data.tags, helix_environment: "production" } } };
  expect((await receive(webhook(other))).status).toBe(200);
  expect((await receive(webhook({ ...event, data: { ...event.data, tags: {} } }))).status).toBe(200);
  expect(mocks.record).not.toHaveBeenCalled();
});
it("returns a retryable response when verified receipt persistence fails", async () => {
  mocks.record.mockRejectedValue(new Error("recipient@example.test secret"));
  const response = await receive(webhook());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toMatch(/recipient|secret/);
});
it("bounds actual incoming bytes and rejects stale signatures", async () => {
  const oversized = new Request("https://helixskin.vercel.app/api/webhooks/resend", { method: "POST", body: "x".repeat(128 * 1024 + 1) });
  expect((await receive(oversized)).status).toBe(413);
  const request = webhook();
  request.headers.set("svix-timestamp", "1");
  expect((await receive(request)).status).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});
it.each([null, { type: "email.delivered", data: null }])("rejects malformed signed event shapes", async (input) => {
  expect((await receive(webhook(input))).status).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});
