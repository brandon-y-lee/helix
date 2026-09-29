import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn(), dispatch: vi.fn(), inbound: vi.fn(), rfc: vi.fn(), materialize: vi.fn() }));
vi.mock("@/lib/email/storage", () => ({ recordEmailDeliveryEvent: mocks.record, emailDeliveryStorage: {} }));
vi.mock("@/lib/email/delivery", () => ({ dispatchEmailIntents: mocks.dispatch }));
vi.mock("@/lib/waitlist/storage", () => ({ materializeProductNotifications: mocks.materialize }));
vi.mock("@/lib/support/inbound-storage", () => ({ inboundRpc: mocks.inbound, inboundStorage: { recordRfc: mocks.rfc } }));
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
function enabledDispatcher() {
  vi.stubEnv("HELIX_EMAIL_DISPATCH_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://helixskin.vercel.app");
  vi.stubEnv("HELIX_EMAIL_REPLY_TO", "support@example.test"); vi.stubEnv("HELIX_EMAIL_OWNER_RECIPIENT", "owner@example.test");
  vi.stubEnv("HELIX_EMAIL_PRODUCT_FROM", "Helix <onboarding@resend.dev>");
}
function dispatcherRequest(authorized = true) {
  return new Request("https://helixskin.vercel.app/api/internal/email-dispatch", { headers: authorized ? { Authorization: `Bearer ${secret}` } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HELIX_EMAIL_ENVIRONMENT", "sandbox"); vi.stubEnv("HELIX_EMAIL_MODE", "restricted");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${signing}`); vi.stubEnv("HELIX_EMAIL_DISPATCH_SECRET", secret);
  vi.stubEnv("HELIX_EMAIL_DISPATCH_ENABLED", "false"); vi.stubEnv("RESEND_API_KEY", "");
  mocks.record.mockResolvedValue(undefined); mocks.dispatch.mockResolvedValue({ claimed: 0 });
  mocks.inbound.mockResolvedValue({ status: "queued" }); mocks.rfc.mockResolvedValue(true);
  mocks.materialize.mockResolvedValue(2);
});

it("durably queues signed incoming mail before acknowledgement without a sending key", async () => {
  vi.stubEnv("HELIX_SUPPORT_RECEIVING_ADDRESS", "support@synthetic.resend.app");
  const incoming = { type: "email.received", created_at: event.created_at, data: {
    email_id: event.data.email_id, from: "Visitor <visitor@example.test>", to: ["reply-" + "a".repeat(48) + "@previous.example"],
    subject: "Customer-controlled content", message_id: "<incoming@example.test>",
  } };
  expect((await receive(webhook(incoming))).status).toBe(200);
  expect(mocks.inbound).toHaveBeenCalledWith("record_support_inbound", expect.objectContaining({
    p_event_id: "msg_synthetic", p_provider_email_id: event.data.email_id, p_sender: "visitor@example.test",
    p_recipients: ["reply-" + "a".repeat(48) + "@previous.example"], p_expected_address: "support@synthetic.resend.app",
  }));
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.inbound.mockRejectedValue(new Error("private storage diagnostic"));
  const failure = await receive(webhook(incoming));
  expect(failure.status).toBe(500);
  expect(await failure.text()).not.toContain("diagnostic");
});

it("records the provider RFC Message-ID after signed delivery reconciliation", async () => {
  expect((await receive(webhook({ ...event, data: { ...event.data, message_id: "<actual-provider@example.test>" } }))).status).toBe(200);
  expect(mocks.rfc).toHaveBeenCalledWith(event.data.tags.helix_message_id, event.data.email_id, "<actual-provider@example.test>");
  expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(mocks.rfc.mock.invocationCallOrder[0]);
});

it("preserves later receiving identities and rejects oversized sets without acknowledging truncated routing", async () => {
  vi.stubEnv("HELIX_SUPPORT_RECEIVING_ADDRESS", "support@synthetic.resend.app");
  const to = Array.from({ length: 100 }, (_, index) => `visitor${index}@example.test`);
  to[99] = "reply-" + "a".repeat(48) + "@previous.example";
  const incoming = { type: "email.received", created_at: event.created_at, data: { email_id: event.data.email_id, from: "visitor@example.test", to } };
  expect((await receive(webhook(incoming))).status).toBe(200);
  expect(mocks.inbound).toHaveBeenCalledWith("record_support_inbound", expect.objectContaining({ p_recipients: to }));
  mocks.inbound.mockClear();
  expect((await receive(webhook({ ...incoming, data: { ...incoming.data, to: [...to, "extra@example.test"] } }))).status).toBe(500);
  expect(mocks.inbound).not.toHaveBeenCalled();
});

it("retains copied and forwarded conversation routes for quarantine without granting participant authority", async () => {
  vi.stubEnv("HELIX_SUPPORT_RECEIVING_ADDRESS", "support@synthetic.resend.app");
  const aliases = ["a", "b", "c"].map((letter) => "reply-" + letter.repeat(48) + "@previous.example");
  const incoming = { type: "email.received", created_at: event.created_at, data: {
    email_id: event.data.email_id, from: "untrusted@example.test", to: ["elsewhere@example.test"],
    cc: [aliases[0]], bcc: [aliases[1]], received_for: [aliases[2]],
  } };
  expect((await receive(webhook(incoming))).status).toBe(200);
  expect(mocks.inbound).toHaveBeenCalledWith("record_support_inbound", expect.objectContaining({
    p_sender: "untrusted@example.test", p_recipients: ["elsewhere@example.test", ...aliases],
  }));
});

it("does not acknowledge failed RFC recording and retries it even after delivery was already recorded", async () => {
  const sent = { ...event, data: { ...event.data, message_id: "<actual-provider@example.test>" } };
  mocks.rfc.mockRejectedValueOnce(new Error("private provider metadata"));
  const failed = await receive(webhook(sent));
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain("metadata");
  expect((await receive(webhook(sent))).status).toBe(200);
  expect(mocks.record).toHaveBeenCalledTimes(2);
  expect(mocks.rfc).toHaveBeenCalledTimes(2);
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
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect((await dispatch(new Request("https://helixskin.vercel.app/api/internal/email-dispatch", { headers: { Authorization: `Bearer ${secret}` } }))).status).toBe(200);
});

it("materializes a bounded batch before dispatching and returns only aggregate Product work", async () => {
  enabledDispatcher();
  const response = await dispatch(dispatcherRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, claimed: 0, productNotifications: { status: "complete", created: 2 } });
  expect(mocks.materialize).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.materialize.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
});

it("leaves all email work untouched when dispatch is disabled or the caller is unauthenticated", async () => {
  const disabled = await dispatch(dispatcherRequest());
  expect(disabled.status).toBe(200);
  expect(await disabled.json()).toEqual({ ok: true, claimed: 0, accepted: 0, deferred: 0, blocked: 0,
    productNotifications: { status: "disabled", created: 0 } });
  enabledDispatcher();
  expect((await dispatch(dispatcherRequest(false))).status).toBe(401);
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
});

it("continues ordinary dispatch if Product materialization is unavailable without exposing diagnostics", async () => {
  enabledDispatcher();
  mocks.materialize.mockRejectedValue(new Error("Private address recipient@example.test and private token"));
  mocks.dispatch.mockResolvedValue({ claimed: 1, accepted: 1, deferred: 0, blocked: 0 });
  const response = await dispatch(dispatcherRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, claimed: 1, accepted: 1, deferred: 0, blocked: 0,
    productNotifications: { status: "unavailable", created: 0 } });
  expect(mocks.dispatch).toHaveBeenCalledOnce();
});

it("checks shared configuration before materialization but permits other delivery when only the Product sender is missing", async () => {
  enabledDispatcher();
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await dispatch(dispatcherRequest())).status).toBe(503);
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  vi.stubEnv("HELIX_EMAIL_PRODUCT_FROM", "");
  const response = await dispatch(dispatcherRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ productNotifications: { status: "unavailable", created: 0 } });
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(mocks.dispatch).toHaveBeenCalledOnce();
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
