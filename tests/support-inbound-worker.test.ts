// @vitest-environment node
import { expect, it, vi } from "vitest";
import { runSupportIngestion, type SupportIngestionDependencies } from "@/lib/support/inbound";
import { InboundProviderError } from "@/lib/support/inbound-provider";

const work = { id: "receipt", providerEmailId: "provider", inquiryId: "inquiry", leaseToken: "lease", deadlineAt: "2026-10-01T00:00:00Z" };
const email = { providerEmailId: "provider", rfcMessageId: "<reply@example.test>", from: "customer@example.test",
  to: ["support@example.test"], subject: "A question", body: "A correction", inReplyTo: "<outbound@example.test>",
  references: ["<outbound@example.test>"], quarantineReason: null, attachments: [] };
function dependencies() {
  return { now: () => 0, claim: vi.fn().mockResolvedValueOnce([work]).mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(email), pendingRfc: vi.fn().mockResolvedValue([{ intentId: "intent", providerEmailId: "outbound" }]),
    readRfc: vi.fn().mockResolvedValue("<outbound@example.test>"), recordRfc: vi.fn().mockResolvedValue(true),
    finish: vi.fn().mockResolvedValue(true), nextPhoto: vi.fn().mockResolvedValue("idle"),
    sweep: vi.fn().mockResolvedValue(0),
  } satisfies SupportIngestionDependencies;
}
it("reconciles known outbound history before completing a durable incoming message", async () => {
  const deps = dependencies();
  const result = await runSupportIngestion(deps);
  expect(result.messages).toBe(1);
  expect(deps.recordRfc).toHaveBeenCalledWith("intent", "outbound", "<outbound@example.test>", expect.any(AbortSignal));
  expect(deps.recordRfc.mock.invocationCallOrder[0]).toBeLessThan(deps.finish.mock.invocationCallOrder[0]);
  expect(deps.finish).toHaveBeenCalledWith(work, email, null, false, expect.any(AbortSignal));
});
it("stops taking new work before its elapsed budget is exhausted", async () => {
  const deps = dependencies();
  let elapsed = 0;
  deps.now = () => elapsed;
  deps.read.mockImplementation(async () => { elapsed = 42_000; return email; });
  const result = await runSupportIngestion(deps);
  expect(deps.claim).toHaveBeenCalledTimes(1);
  expect(deps.nextPhoto).not.toHaveBeenCalled();
  expect(deps.sweep).not.toHaveBeenCalled();
  expect(result.messages).toBe(1);
});

it.each([
  [new InboundProviderError("transient", "provider_rate_limited"), true],
  [new InboundProviderError("permanent", "provider_response_too_large"), false],
] as const)("records a bounded retry or review outcome without returning private provider diagnostics", async (error, retryable) => {
  const deps = dependencies();
  deps.read.mockRejectedValue(error);
  expect((await runSupportIngestion(deps)).deferred).toBe(1);
  expect(deps.finish).toHaveBeenCalledWith(work, null, error.code, retryable, expect.any(AbortSignal));
});

it("leaves the lease recoverable when persistence fails after successful content retrieval", async () => {
  const deps = dependencies();
  deps.finish.mockRejectedValue(new Error("storage unavailable"));
  await expect(runSupportIngestion(deps)).rejects.toThrow("storage unavailable");
  expect(deps.read).toHaveBeenCalledOnce();
  expect(deps.nextPhoto).not.toHaveBeenCalled();
});
