// @vitest-environment node
import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { handleProductionSent, type SentDependencies } from "@/lib/support/production/sent";
import { SUPPORT_FROM, SUPPORT_TO } from "@/lib/support/production/config";
const id = "00000000-0000-4000-8000-000000000001";
const key = Buffer.from("synthetic-only-sent-webhook-secret").toString("base64");
const env = { VERCEL: "1", VERCEL_ENV: "production", HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "abcdefghijklmnopqrst", HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://abcdefghijklmnopqrst.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id, HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY: "synthetic-service-credential-32-characters",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters", HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET: `whsec_${key}` };
const event = { type: "email.sent", created_at: "2026-11-17T12:00:00Z", data: { email_id: id, from: SUPPORT_FROM, to: [SUPPORT_TO],
  message_id: "<actual-synthetic-message@resend.example.invalid>", subject: `Helix Website inquiry ${id}`,
  tags: { helix_support_contract: id, helix_support_outbox: id, helix_support_delivery: "a".repeat(64) } } };
const deps = (): SentDependencies => ({ env, contract: vi.fn().mockResolvedValue({ projectRef: env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF, contractId: id,
  admissionEnabled: false, workerEnabled: false, fullMediaQualified: false, isolationQualified: false, operationsQualified: false }),
  record: vi.fn().mockResolvedValue("matched") });
function signed(value: unknown = event, tamper = false, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(value), eventId = "msg_synthetic";
  const signature = createHmac("sha256", Buffer.from(key, "base64")).update(`${eventId}.${timestamp}.${body}`).digest("base64");
  return new Request("https://www.helixskin.us/api/webhooks/support-production-sent", { method: "POST", body: body + (tamper ? " " : ""),
    headers: { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` } });
}
it("reconciles an owned callback while admission and sending are paused, including early/unknown outcome", async () => {
  const d = deps();
  expect((await handleProductionSent(signed(), d)).status).toBe(200);
  expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outboxId: id, deliveryToken: "a".repeat(64),
    providerEmailId: id, messageId: event.data.message_id, from: SUPPORT_FROM, to: SUPPORT_TO, eventId: "msg_synthetic" }), expect.anything());
  expect(d.record).toHaveBeenCalledOnce();
});
it("rejects raw-body tampering before any contract lookup or recording", async () => {
  const d = deps(); expect((await handleProductionSent(signed(event, true), d)).status).toBe(400);
  expect(d.contract).not.toHaveBeenCalled(); expect(d.record).not.toHaveBeenCalled();
});
it("rejects expired valid signatures and oversized signed payloads before storage", async () => {
  const d = deps();
  expect((await handleProductionSent(signed(event, false, String(Math.floor(Date.now() / 1000) - 600)), d)).status).toBe(400);
  expect((await handleProductionSent(signed({ ...event, irrelevant: "x".repeat(33 * 1024) }), d)).status).toBe(413);
  expect(d.contract).not.toHaveBeenCalled(); expect(d.record).not.toHaveBeenCalled();
});
it("requires the fixed envelope, opaque subject, owned unguessable delivery token, UUID and actual RFC Message-ID", async () => {
  for (const data of [ { ...event.data, from: "Other <contact@helixskin.us>" }, { ...event.data, to: [SUPPORT_TO, "extra@example.invalid"] },
    { ...event.data, cc: ["extra@example.invalid"] }, { ...event.data, subject: "Visitor sensitive subject" },
    { ...event.data, tags: { ...event.data.tags, helix_support_delivery: "" } },
    { ...event.data, tags: { ...event.data.tags, helix_support_contract: id.replace(/1$/, "2") } },
    { ...event.data, email_id: "provider_not_rfc_id" }, { ...event.data, message_id: id },
    { ...event.data, message_id: "<id@example.invalid>\r\nBcc: other@example.invalid" } ]) {
    const d = deps(); expect((await handleProductionSent(signed({ ...event, data }), d)).status).toBe(400);
    expect(d.record).not.toHaveBeenCalled();
  }
});
it("never reads receiving callbacks or uses their sender/body metadata", async () => {
  const d = deps();
  expect((await handleProductionSent(signed({ ...event, type: "email.received" }), d)).status).toBe(400);
  expect(d.contract).not.toHaveBeenCalled(); expect(d.record).not.toHaveBeenCalled();
});
it("delegates immutable duplicate/conflict/unmatched reconciliation to SQL without resending or overwriting", async () => {
  for (const status of ["duplicate", "conflict", "unmatched"]) {
    const d = deps(); d.record = vi.fn().mockResolvedValue(status);
    expect((await handleProductionSent(signed(), d)).status).toBe(200);
    expect(d.record).toHaveBeenCalledOnce();
  }
  const d = deps(); d.contract = vi.fn().mockResolvedValue({ projectRef: "wrong", contractId: id });
  expect((await handleProductionSent(signed(), d)).status).toBe(503); expect(d.record).not.toHaveBeenCalled();
});
