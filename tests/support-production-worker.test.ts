// @vitest-environment node
import { syntheticMainContext } from "./helpers/supabase-target";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { dispatchProductionOutbox, type WorkerDependencies } from "@/lib/support/production/worker";
import { sendFrozenRequest } from "@/lib/support/production/provider";
import { productionConfig, SUPPORT_FROM, SUPPORT_TO } from "@/lib/support/production/config";
const id = "00000000-0000-4000-8000-000000000001";
const config = productionConfig({ ...syntheticMainContext, VERCEL: "1", VERCEL_ENV: "production", HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "erasogmsqpgiirovubjh", HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://erasogmsqpgiirovubjh.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id, HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY: "synthetic-service-credential-32-characters",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters", HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true", HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true" });
const payload = { from: SUPPORT_FROM, to: [SUPPORT_TO], reply_to: "visitor@example.invalid", subject: `Helix Website inquiry ${id}`,
  text: "Unverified visitor content: visitor-provided identity and Reply-To are unverified. Do not disclose Account, Order or private information based on them.\n\nSubject: synthetic\nSynthetic body", tags: [
    { name: "helix_support_contract", value: id }, { name: "helix_support_outbox", value: id }, { name: "helix_support_delivery", value: "a".repeat(64) } ] };
const frozen = (text = JSON.stringify(payload)) => ({ outboxId: id, requestText: text, requestHash: createHash("sha256").update(text).digest("hex"),
  idempotencyKey: `helix-support:${id}`, attemptCount: 1, firstAttemptAt: new Date().toISOString() });
const deps = (): WorkerDependencies => ({ contract: vi.fn().mockResolvedValue({ ...config, workerEnabled: true }),
  claim: vi.fn().mockResolvedValue({ outboxId: id, leaseId: id }), start: vi.fn().mockResolvedValue(frozen()),
  complete: vi.fn().mockResolvedValue(true), send: vi.fn().mockResolvedValue({ outcome: "accepted", providerEmailId: id }), now: () => Date.now(), leaseId: () => id });

it("marks the permanent attempt before sending, and fences completion by the claimed lease", async () => {
  const d = deps(); expect(await dispatchProductionOutbox(config, d)).toEqual({ claimed: 1, accepted: 1, unconfirmed: 0 });
  expect(vi.mocked(d.start).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(d.send).mock.invocationCallOrder[0]);
  expect(d.complete).toHaveBeenCalledWith(config, { outboxId: id, leaseId: id }, { outcome: "accepted", providerEmailId: id });
});
it("treats throws and timeouts as unknown, retries only frozen bytes/key and stops before 20 hours", async () => {
  const d = deps(); d.send = vi.fn().mockRejectedValue(new Error("private provider diagnostic"));
  expect(await dispatchProductionOutbox(config, d)).toEqual({ claimed: 1, accepted: 0, unconfirmed: 1 });
  expect(d.complete).toHaveBeenCalledWith(config, { outboxId: id, leaseId: id }, { outcome: "unknown" });
  await dispatchProductionOutbox(config, d);
  expect(vi.mocked(d.send).mock.calls[0][0]).toEqual(vi.mocked(d.send).mock.calls[1][0]);
  d.start = vi.fn().mockResolvedValue({ ...frozen(), firstAttemptAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString() });
  vi.mocked(d.send).mockClear(); await dispatchProductionOutbox(config, d); expect(d.send).not.toHaveBeenCalled();
});
it("does not call send on wrong stored identity, frozen hash tampering, arbitrary recipient or a lost lease", async () => {
  for (const changed of [ { contract: vi.fn().mockResolvedValue({ ...config, contractId: "wrong" }) },
    { start: vi.fn().mockResolvedValue({ ...frozen(), requestHash: "b".repeat(64) }) },
    { start: vi.fn().mockResolvedValue(frozen(JSON.stringify({ ...payload, bcc: ["attacker@example.invalid"] }))) },
    { start: vi.fn().mockResolvedValue(frozen(JSON.stringify({ ...payload, to: ["attacker@example.invalid"] }))) },
    { start: vi.fn().mockResolvedValue(null) } ]) {
    const d = { ...deps(), ...changed };
    await dispatchProductionOutbox(config, d).catch(() => undefined); expect(d.send).not.toHaveBeenCalled();
  }
});
it("sends the exact stored REST text and key; does not fetch full email or use generic key", async () => {
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
  const request = frozen();
  expect(await sendFrozenRequest(request, "re_synthetic_dedicated_sending_access", network)).toEqual({ outcome: "accepted", providerEmailId: id });
  expect(network).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST", body: request.requestText,
    headers: { authorization: "Bearer re_synthetic_dedicated_sending_access", "content-type": "application/json", "idempotency-key": request.idempotencyKey } }));
  expect(network).toHaveBeenCalledTimes(1);
});
it("bounds provider response reading and treats ambiguous status/throw/invalid accepted IDs as unconfirmed", async () => {
  for (const network of [ vi.fn().mockRejectedValue(new Error("secret")),
    vi.fn().mockResolvedValue(new Response("private provider error", { status: 500 })),
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "not-a-uuid" }), { status: 200 })) ]) {
    expect(await sendFrozenRequest(frozen(), "re_synthetic_dedicated_sending_access", network)).toEqual({ outcome: "unknown" });
  }
  const rejected = vi.fn().mockResolvedValue(new Response("private diagnostic", { status: 422 }));
  expect(await sendFrozenRequest(frozen(), "re_synthetic_dedicated_sending_access", rejected)).toEqual({ outcome: "rejected" });
});
it("enforces a wall-clock send deadline even when the transport ignores abort", async () => {
  vi.useFakeTimers();
  try {
    const pending = sendFrozenRequest(frozen(), "re_synthetic_dedicated_sending_access", vi.fn(() => new Promise<Response>(() => undefined)));
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual({ outcome: "unknown" });
  } finally { vi.useRealTimers(); }
});
