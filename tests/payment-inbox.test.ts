import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: storage.rpc }) }));
import { claimPaymentEvents, claimPaymentWorkerRun, finishPaymentEvent, finishPaymentWorkerRun, PaymentInboxStorageError,
  receivePaymentEvent, recordPaymentRefundObservations, replayPaymentEvent, readPaymentOperations,
  recordPaymentEventIncident,
  type PaymentOperations, type PaymentRefundFact } from "@/lib/payments/inbox";
import type { PaymentEventEnvelope } from "@/lib/payments/events";
import { PaymentDeadlineExceededError } from "@/lib/payments/deadline";

const id = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-09-19T02:00:00.000Z";
const lease = { runToken: id, itemId: id, leaseToken: id, expectedVersion: 2 };
const envelope: PaymentEventEnvelope = {
  accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", apiVersion: "2026-06-24.dahlia",
  eventId: "evt_test", eventType: "checkout.session.completed", createdAt: timestamp,
  objectId: "cs_test_example", objectKind: "checkout.session", chargeId: null, paymentIntentId: "pi_test",
};
const refund: PaymentRefundFact = { refundId: "re_test", chargeId: "ch_test", paymentIntentId: "pi_test", orderId: id,
  amountCents: 3000, currency: "usd", status: "succeeded" };
const refundException = { orderId: id, sessionId: "cs_test_example", paymentIntentId: "pi_test", amountCents: 3000,
  paymentStatus: "refunded" as const };
const replay = { actorId: id, itemId: id, expectedVersion: 4, reason: "Reviewed provider recovery", requestId: id, dryRun: true };
const operations: PaymentOperations = {
  accountId: envelope.accountId, environment: "sandbox", observedAt: timestamp,
  heartbeat: { startedAt: timestamp, completedAt: null, processedCount: 0, failureCount: 0 },
  counts: { pending: 1, processing: 0, processed: 0, ignored: 0, dead_letter: 0 }, oldestPendingAt: timestamp,
  items: [{ id, eventId: envelope.eventId, eventType: envelope.eventType, objectId: envelope.objectId,
    state: "pending", attempts: 0, lifetimeAttempts: 0, version: 1, receivedAt: timestamp, nextAttemptAt: timestamp,
    processedAt: null, incidentCode: "overdue", replayEligible: false, provenance: "webhook" }],
  incidents: [{ id, itemId: id, code: "overdue", createdAt: timestamp, resolvedAt: null }],
  refunds: [{ ...refund, observedAt: timestamp, succeededPreviously: true }],
};

beforeEach(() => { vi.resetAllMocks(); storage.rpc.mockResolvedValue({ data: null, error: null }); });

describe("durable payment inbox storage", () => {
  it("reports an occupied worker lease without manufacturing another run", async () => {
    await expect(claimPaymentWorkerRun()).resolves.toBeNull();
  });
  it("returns only the valid worker fencing token and expiry", async () => {
    storage.rpc.mockResolvedValue({ data: { token: id, expiresAt: timestamp, secret: "hidden" }, error: null });
    await expect(claimPaymentWorkerRun()).resolves.toEqual({ token: id, expiresAt: timestamp });
  });
  it.each([
    { token: "not-a-uuid", expiresAt: timestamp }, { token: id, expiresAt: "tomorrow" },
    { token: id }, [], undefined,
  ])("rejects an unusable worker lease", async (data) => {
    storage.rpc.mockResolvedValue({ data, error: null });
    await expect(claimPaymentWorkerRun()).rejects.toBeInstanceOf(PaymentInboxStorageError);
  });
  it("redacts database errors and transport exceptions", async () => {
    storage.rpc.mockResolvedValueOnce({ data: null, error: { message: "private buyer@example.com" } });
    await expect(claimPaymentWorkerRun()).rejects.toThrow("Payment operations are temporarily unavailable.");
    storage.rpc.mockRejectedValueOnce(new Error("secret credential"));
    await expect(claimPaymentWorkerRun()).rejects.toThrow("Payment operations are temporarily unavailable.");
  });
  it("preserves a deadline signal so the worker can stop before starting further work", async () => {
    const deadline = new PaymentDeadlineExceededError();
    storage.rpc.mockRejectedValueOnce(deadline);
    await expect(claimPaymentWorkerRun()).rejects.toBe(deadline);
    storage.rpc.mockResolvedValueOnce({ data: null, error: deadline });
    await expect(claimPaymentWorkerRun()).rejects.toBe(deadline);
  });
  it("preserves a lost lease as false and submits every event fence", async () => {
    storage.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(finishPaymentEvent({ ...lease, disposition: "pending", code: "provider_unavailable", retryAfterSeconds: 3600 })).resolves.toBe(false);
    expect(storage.rpc).toHaveBeenCalledWith("finish_payment_event", {
      p_run_token: id, p_item_id: id, p_lease_token: id, p_expected_version: 2,
      p_disposition: "pending", p_code: "provider_unavailable", p_retry_after_seconds: 3600,
    });
    storage.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(finishPaymentWorkerRun({ runToken: id, processedCount: 2, failureCount: 1 })).resolves.toBe(true);
    expect(storage.rpc).toHaveBeenLastCalledWith("finish_payment_worker_run", { p_run_token: id, p_processed_count: 2, p_failure_count: 1 });
  });
  it("does not treat a malformed completion acknowledgment as success", async () => {
    storage.rpc.mockResolvedValue({ data: "true", error: null });
    await expect(finishPaymentEvent({ ...lease, disposition: "processed" })).rejects.toBeInstanceOf(PaymentInboxStorageError);
  });
  it("records a safe incident against the exact current worker and item lease", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    await expect(recordPaymentEventIncident({ ...lease, code: "storage_unavailable" })).resolves.toBe(true);
    expect(storage.rpc).toHaveBeenCalledWith("record_payment_event_incident", {
      p_run_token: id, p_item_id: id, p_lease_token: id, p_expected_version: 2, p_code: "storage_unavailable",
    });
  });
  it("preserves a rejected incident fence without pretending the incident was stored", async () => {
    storage.rpc.mockResolvedValue({ data: false, error: null });
    await expect(recordPaymentEventIncident({ ...lease, code: "worker_deadline" })).resolves.toBe(false);
  });
  it("redacts incident write failures and rejects raw incident text before storage", async () => {
    storage.rpc.mockRejectedValueOnce(new Error("private provider payload"));
    await expect(recordPaymentEventIncident({ ...lease, code: "storage_unavailable" })).rejects.toThrow("Payment operations are temporarily unavailable.");
    storage.rpc.mockClear();
    await expect(recordPaymentEventIncident({ ...lease, code: "buyer@example.com" as never })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    await expect(recordPaymentEventIncident({ ...lease, expectedVersion: -1, code: "storage_unavailable" })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid fences and unbounded completion values before storage", async () => {
    await expect(finishPaymentEvent({ ...lease, expectedVersion: -1, disposition: "processed" })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    await expect(finishPaymentWorkerRun({ runToken: id, processedCount: 21, failureCount: 0 })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("requires durable receipt and preserves contradictory identity as conflict", async () => {
    storage.rpc.mockResolvedValue({ data: { status: "conflict", itemId: id, payload: "private" }, error: null });
    await expect(receivePaymentEvent({ ...envelope, email: "private@example.com" } as PaymentEventEnvelope)).resolves.toEqual({ status: "conflict", itemId: id });
    expect(storage.rpc).toHaveBeenCalledWith("receive_payment_event", { p_envelope: envelope });
  });
  it("rejects the wrong provider identity without persisting receipt", async () => {
    await expect(receivePaymentEvent({ ...envelope, accountId: "acct_other" } as unknown as PaymentEventEnvelope)).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("returns bounded claims with the exact event and lease identity", async () => {
    const claim = { id, envelope, attempts: 2, lifetimeAttempts: 4, version: 5, leaseToken: id, leaseExpiresAt: timestamp };
    storage.rpc.mockResolvedValue({ data: [{ ...claim, envelope: { ...envelope, createdAt: "2026-09-19T02:00:00+00:00", raw: "private" }, raw: "secret" }], error: null });
    await expect(claimPaymentEvents({ runToken: id, limit: 1 })).resolves.toEqual([claim]);
    expect(storage.rpc).toHaveBeenCalledWith("claim_payment_events", { p_run_token: id, p_limit: 1 });
  });
  it("rejects malformed or oversized claims rather than processing unchecked events", async () => {
    const claim = { id, envelope, attempts: 1, lifetimeAttempts: 1, version: 1, leaseToken: id, leaseExpiresAt: timestamp };
    storage.rpc.mockResolvedValueOnce({ data: [claim, claim], error: null });
    await expect(claimPaymentEvents({ runToken: id, limit: 1 })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    storage.rpc.mockResolvedValueOnce({ data: [{ ...claim, attempts: 13 }], error: null });
    await expect(claimPaymentEvents({ runToken: id, limit: 1 })).rejects.toBeInstanceOf(PaymentInboxStorageError);
  });
  it("persists only allowlisted authoritative refund facts with every worker fence", async () => {
    storage.rpc.mockResolvedValue({ data: false, error: null });
    await expect(recordPaymentRefundObservations({ ...lease, facts: [{ ...refund, raw: "private" } as PaymentRefundFact] })).resolves.toBe(false);
    expect(storage.rpc).toHaveBeenCalledWith("record_payment_refund_observations", { p_run_token: id, p_item_id: id,
      p_lease_token: id, p_expected_version: 2, p_facts: [refund], p_exception: null, p_resolved_exception: null });
  });
  it("sends a refund exception atomically with observations using only allowlisted facts", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    const exception = { ...refundException, raw: "private" };
    await expect(recordPaymentRefundObservations({ ...lease, facts: [refund], exception })).resolves.toBe(true);
    expect(storage.rpc).toHaveBeenCalledWith("record_payment_refund_observations", {
      p_run_token: id, p_item_id: id, p_lease_token: id, p_expected_version: 2,
      p_facts: [refund], p_exception: refundException, p_resolved_exception: null,
    });
  });
  it("submits the exact refund exception binding for verified resolution under the same lease", async () => {
    storage.rpc.mockResolvedValue({ data: false, error: null });
    const binding = { orderId: id, sessionId: "cs_test_example", paymentIntentId: "pi_test" };
    const resolvedException = { ...binding, raw: "private" };
    await expect(recordPaymentRefundObservations({ ...lease, facts: [refund], resolvedException })).resolves.toBe(false);
    expect(storage.rpc).toHaveBeenCalledWith("record_payment_refund_observations", {
      p_run_token: id, p_item_id: id, p_lease_token: id, p_expected_version: 2,
      p_facts: [refund], p_exception: null, p_resolved_exception: binding,
    });
  });
  it("rejects conflicting refund exception changes before storage", async () => {
    await expect(recordPaymentRefundObservations({ ...lease, facts: [refund], exception: refundException,
      resolvedException: refundException })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...refundException, orderId: "not-a-uuid" }, { ...refundException, sessionId: "cs_live_example" },
    { ...refundException, paymentIntentId: "private" }, { ...refundException, amountCents: -1 },
    { ...refundException, amountCents: 0.1 }, { ...refundException, amountCents: 2147483648 },
    { ...refundException, paymentStatus: "paid" as never },
  ])("rejects malformed customer-visible refund exception facts before writing", async (exception) => {
    await expect(recordPaymentRefundObservations({ ...lease, facts: [refund], exception })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("rejects a malformed resolution binding before writing", async () => {
    await expect(recordPaymentRefundObservations({ ...lease, facts: [refund], resolvedException: { ...refundException,
      sessionId: "not-a-session" } })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("retains unknown and prior asynchronous refund statuses for investigation", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    await expect(recordPaymentRefundObservations({ ...lease, facts: [{ ...refund, refundId: "pyr_old", chargeId: "py_old", status: "unknown" }] })).resolves.toBe(true);
  });
  it.each([
    { ...refund, amountCents: -1 }, { ...refund, amountCents: 1.5 }, { ...refund, currency: "eur" },
    { ...refund, paymentIntentId: "secret" }, { ...refund, orderId: "not-a-uuid" },
  ])("rejects malformed refund facts before writing observations", async (fact) => {
    await expect(recordPaymentRefundObservations({ ...lease, facts: [fact] })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("keeps replay authorization and dry-run audit within the database transaction", async () => {
    storage.rpc.mockResolvedValue({ data: { status: "eligible", itemId: id, version: 4, actorEmail: "private" }, error: null });
    await expect(replayPaymentEvent(replay)).resolves.toEqual({ status: "eligible", itemId: id, version: 4 });
    expect(storage.rpc).toHaveBeenCalledWith("replay_payment_event", { p_actor_id: id, p_item_id: id,
      p_expected_version: 4, p_reason: "Reviewed provider recovery", p_request_id: id, p_dry_run: true });
  });
  it("preserves the exact replay reason so reusing a request identifier cannot hide changed arguments", async () => {
    storage.rpc.mockResolvedValue({ data: { status: "eligible", itemId: id, version: 4 }, error: null });
    await replayPaymentEvent({ ...replay, reason: "  Reviewed provider recovery  " });
    expect(storage.rpc).toHaveBeenCalledWith("replay_payment_event", expect.objectContaining({ p_reason: "  Reviewed provider recovery  " }));
  });
  it("preserves denial and version conflict without claiming replay success", async () => {
    storage.rpc.mockResolvedValueOnce({ data: { status: "denied", itemId: id, version: null }, error: null });
    await expect(replayPaymentEvent(replay)).resolves.toEqual({ status: "denied", itemId: id, version: null });
    storage.rpc.mockResolvedValueOnce({ data: { status: "conflict", itemId: id, version: 5 }, error: null });
    await expect(replayPaymentEvent({ ...replay, dryRun: false })).resolves.toEqual({ status: "conflict", itemId: id, version: 5 });
  });
  it("rejects replay acknowledgments for another item and invalid audit context", async () => {
    storage.rpc.mockResolvedValue({ data: { status: "applied", itemId: "22222222-2222-4222-8222-222222222222", version: 5 }, error: null });
    await expect(replayPaymentEvent(replay)).rejects.toBeInstanceOf(PaymentInboxStorageError);
    storage.rpc.mockClear();
    await expect(replayPaymentEvent({ ...replay, reason: "short" })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    await expect(replayPaymentEvent({ ...replay, actorId: "not-an-operator" })).rejects.toBeInstanceOf(PaymentInboxStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("returns only safe operational fields and submits the actor for fresh authorization", async () => {
    storage.rpc.mockResolvedValue({ data: { ...operations, raw: "secret", heartbeat: { ...operations.heartbeat, credential: "secret" },
      items: [{ ...operations.items[0], email: "private@example.com" }],
      incidents: [{ ...operations.incidents[0], payload: { address: "private" } }],
      refunds: [{ ...operations.refunds[0], billing: "private" }] }, error: null });
    await expect(readPaymentOperations({ actorId: id })).resolves.toEqual(operations);
    expect(storage.rpc).toHaveBeenCalledWith("read_payment_operations", { p_actor_id: id });
  });
  it("represents sanitized malformed legacy receipts without exposing their contents", async () => {
    const legacy = { ...operations, items: [{ ...operations.items[0], eventType: "legacy.invalid", objectId: null, provenance: "legacy" as const }] };
    storage.rpc.mockResolvedValue({ data: legacy, error: null });
    await expect(readPaymentOperations({})).resolves.toEqual(legacy);
    expect(storage.rpc).toHaveBeenCalledWith("read_payment_operations", { p_actor_id: null });
  });
  it.each([
    { ...operations, accountId: "acct_other" },
    { ...operations, counts: { ...operations.counts, pending: -1 } },
    { ...operations, items: [{ ...operations.items[0], incidentCode: "buyer@example.com" }] },
    { ...operations, refunds: [{ ...operations.refunds[0], amountCents: -1 }] },
  ])("rejects malformed operations data instead of passing private unknown blobs", async (data) => {
    storage.rpc.mockResolvedValue({ data, error: null });
    await expect(readPaymentOperations({ actorId: id })).rejects.toBeInstanceOf(PaymentInboxStorageError);
  });
});
