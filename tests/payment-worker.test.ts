import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentInboxClaim } from "@/lib/payments/inbox";
const edge = vi.hoisted(() => ({ claimRun: vi.fn(), claim: vi.fn(), finish: vi.fn(), finishRun: vi.fn(), facts: vi.fn(), reconcile: vi.fn(), incident: vi.fn() }));
vi.mock("@/lib/payments/inbox", () => ({ claimPaymentWorkerRun: edge.claimRun, claimPaymentEvents: edge.claim,
  finishPaymentEvent: edge.finish, finishPaymentWorkerRun: edge.finishRun, recordPaymentRefundObservations: edge.facts,
  recordPaymentEventIncident: edge.incident }));
vi.mock("@/lib/payments/reconciliation", () => ({ reconcilePaymentEvent: edge.reconcile }));
import { runPaymentWorker } from "@/lib/payments/worker";
import { getPaymentDeadlineRemainingMs, PaymentDeadlineExceededError } from "@/lib/payments/deadline";
import { PaymentProviderReadError } from "@/lib/payments/provider-errors";
import { PaymentLeaseLostError } from "@/lib/payments/lease";

const item = { id: "inbox-1", version: 2, attempts: 1, lifetimeAttempts: 1, leaseToken: "item-token",
  leaseExpiresAt: "2026-09-19T01:01:30Z", envelope: { accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox",
    eventId: "evt_completion", eventType: "checkout.session.completed", apiVersion: "2026-06-24.dahlia",
    createdAt: "2026-09-19T01:00:00Z", objectKind: "checkout.session", objectId: "cs_test_paid", chargeId: null,
    paymentIntentId: null } } satisfies PaymentInboxClaim;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0);
  edge.claimRun.mockResolvedValue({ token: "run-token", expiresAt: "2026-09-19T01:01:30Z" });
  edge.claim.mockResolvedValueOnce([item]).mockResolvedValue([]);
  edge.finish.mockResolvedValue(true); edge.finishRun.mockResolvedValue(true); edge.facts.mockResolvedValue(true);
  edge.incident.mockResolvedValue(true);
  edge.reconcile.mockResolvedValue({ disposition: "processed" });
});
afterEach(() => vi.restoreAllMocks());

describe("hosted durable payment worker", () => {
  it("awaits current reconciliation and durable completion without needing a browser", async () => {
    let release!: () => void;
    edge.reconcile.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ disposition: "processed" }); }));
    const run = runPaymentWorker();
    await vi.waitFor(() => expect(edge.reconcile).toHaveBeenCalledOnce());
    expect(edge.finish).not.toHaveBeenCalled(); expect(edge.finishRun).not.toHaveBeenCalled();
    release();
    await expect(run).resolves.toEqual({ outcome: "completed", processed: 1, ignored: 0, retried: 0, quarantined: 0 });
    expect(edge.finish).toHaveBeenCalledWith({ runToken: "run-token", itemId: item.id,
      leaseToken: item.leaseToken, expectedVersion: item.version, disposition: "processed" });
    expect(edge.finishRun).toHaveBeenCalledWith({ runToken: "run-token", processedCount: 1, failureCount: 0 });
  });
  it("caps run claims at the work deadline and preserves final-write time", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    edge.claimRun.mockImplementation(async () => {
      expect(getPaymentDeadlineRemainingMs()).toBe(35_000);
      return { token: "run-token" };
    });
    edge.claim.mockReset().mockImplementation(async () => {
      expect(getPaymentDeadlineRemainingMs()).toBe(35_000);
      return [item];
    });
    edge.reconcile.mockImplementation(async () => {
      now = 35_000;
      throw new PaymentDeadlineExceededError();
    });
    edge.finish.mockImplementation(async () => {
      expect(getPaymentDeadlineRemainingMs()).toBe(5_000);
      return true;
    });
    await expect(runPaymentWorker()).resolves.toMatchObject({ retried: 1 });
    expect(edge.claim).toHaveBeenCalledOnce();
    expect(edge.finish).toHaveBeenCalledWith(expect.objectContaining({ disposition: "pending", code: "worker_deadline" }));
  });
  it("stops immediately after a stale observation fence, without attempting an event finish", async () => {
    edge.reconcile.mockRejectedValue(new PaymentLeaseLostError());
    await expect(runPaymentWorker()).rejects.toThrow("durable reconciliation");
    expect(edge.finish).not.toHaveBeenCalled();
    expect(edge.claim).toHaveBeenCalledOnce();
    expect(edge.incident).not.toHaveBeenCalled();
  });
  it("retains a failed completion write as a safe incident and leaves recovery to the next lease", async () => {
    edge.finish.mockRejectedValue(new Error("private payment provider payload must not escape"));
    await expect(runPaymentWorker()).rejects.toThrow("Payment worker did not complete durable reconciliation.");
    expect(edge.incident).toHaveBeenCalledWith({ runToken: "run-token", itemId: item.id,
      leaseToken: item.leaseToken, expectedVersion: item.version, code: "storage_unavailable" });
    expect(edge.finish).toHaveBeenCalledOnce();
    expect(edge.claim).toHaveBeenCalledOnce();
    expect(edge.finishRun).toHaveBeenCalledWith({ runToken: "run-token", processedCount: 0, failureCount: 1 });
  });
  it("leaves another active worker alone", async () => {
    edge.claimRun.mockResolvedValue(null);
    await expect(runPaymentWorker()).resolves.toEqual({ outcome: "busy", processed: 0, ignored: 0, retried: 0, quarantined: 0 });
    expect(edge.claim).not.toHaveBeenCalled(); expect(edge.reconcile).not.toHaveBeenCalled();
    expect(edge.finishRun).not.toHaveBeenCalled();
  });
  it("claims no more than twenty items and processes them sequentially", async () => {
    edge.claim.mockReset().mockResolvedValue([item]);
    let active = 0;
    edge.reconcile.mockImplementation(async () => {
      active += 1;
      expect(active).toBe(1);
      await Promise.resolve();
      active -= 1;
      return { disposition: "processed" };
    });
    await expect(runPaymentWorker()).resolves.toMatchObject({ processed: 20 });
    expect(edge.claim).toHaveBeenCalledTimes(20);
    expect(edge.claim).toHaveBeenCalledWith({ runToken: "run-token", limit: 1 });
    expect(edge.finish).toHaveBeenCalledTimes(20);
  });
  it.each([
    [{ disposition: "pending", code: "binding_pending" }, "pending", 1, 0],
    [{ disposition: "quarantined", code: "verification_mismatch" }, "dead_letter", 0, 1],
    [{ disposition: "ignored" }, "ignored", 0, 0],
  ])("retains the reconciler's truthful disposition %j", async (outcome, disposition, retried, quarantined) => {
    edge.reconcile.mockResolvedValue(outcome);
    await expect(runPaymentWorker()).resolves.toMatchObject({ processed: 0, retried, quarantined });
    expect(edge.finish).toHaveBeenCalledWith(expect.objectContaining({ disposition }));
  });
  it("respects a longer provider retry and escalates the twelfth failed attempt", async () => {
    edge.reconcile.mockRejectedValue(new PaymentProviderReadError("provider_unavailable", 7200));
    await expect(runPaymentWorker()).resolves.toMatchObject({ retried: 1 });
    expect(edge.finish).toHaveBeenCalledWith(expect.objectContaining({ disposition: "pending",
      code: "provider_unavailable", retryAfterSeconds: 7200 }));
    edge.claim.mockResolvedValueOnce([{ ...item, attempts: 12 }]);
    await expect(runPaymentWorker()).resolves.toMatchObject({ quarantined: 1 });
    expect(edge.finish).toHaveBeenLastCalledWith(expect.objectContaining({ disposition: "dead_letter", code: "attempts_exhausted" }));
    expect(edge.finish.mock.calls.at(-1)?.[0]).not.toHaveProperty("retryAfterSeconds");
  });
  it("stops if a finish token has been replaced without resetting the later claim", async () => {
    edge.finish.mockResolvedValue(false);
    await expect(runPaymentWorker()).rejects.toThrow("durable reconciliation");
    expect(edge.claim).toHaveBeenCalledOnce(); expect(edge.incident).not.toHaveBeenCalled();
    expect(edge.finishRun).toHaveBeenCalledWith({ runToken: "run-token", processedCount: 0, failureCount: 1 });
  });
  it("reports an outage without leaking its error and leaves a retry due", async () => {
    edge.reconcile.mockRejectedValue(new Error("customer@example.test sensitive storage details"));
    await expect(runPaymentWorker()).resolves.toMatchObject({ retried: 1 });
    expect(edge.finish).toHaveBeenCalledWith(expect.objectContaining({ disposition: "pending", code: "storage_unavailable", retryAfterSeconds: 60 }));
    expect(JSON.stringify(edge.finish.mock.calls)).not.toContain("customer@");
  });
  it("does not acknowledge a failed heartbeat or start new work after a claim failure", async () => {
    edge.claim.mockReset().mockRejectedValue(new Error("storage is down"));
    await expect(runPaymentWorker()).rejects.toThrow("durable reconciliation");
    expect(edge.reconcile).not.toHaveBeenCalled();
    edge.claim.mockResolvedValue([]);
    edge.finishRun.mockResolvedValue(false);
    await expect(runPaymentWorker()).rejects.toThrow("worker lease");
  });
});
