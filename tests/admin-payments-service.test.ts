import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), replay: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: { paymentsManage: "payments.manage" },
  requireAdminCapability: mocks.access,
}));
vi.mock("@/lib/payments/inbox", () => ({
  readPaymentOperations: mocks.read, replayPaymentEvent: mocks.replay,
}));
import { getPaymentOperations, replayPaymentOperation } from "@/lib/admin/payments/service";

const actorId = "11111111-1111-4111-8111-111111111111";
const command = { itemId: "22222222-2222-4222-8222-222222222222", expectedVersion: 3, reason: "Provider connection restored", requestId: "33333333-3333-4333-8333-333333333333", dryRun: true };
const snapshot = {
  accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", observedAt: "2026-09-19T02:00:00Z",
  heartbeat: { startedAt: null, completedAt: null, processedCount: 0, failureCount: 0 },
  counts: { pending: 0, processing: 0, processed: 0, ignored: 0, dead_letter: 0 },
  oldestPendingAt: null, items: [], incidents: [], refunds: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ userId: actorId, role: "admin", capabilities: ["payments.manage"] });
  mocks.read.mockResolvedValue(snapshot);
  mocks.replay.mockResolvedValue({ status: "eligible", itemId: command.itemId, version: 3 });
});

describe("authorized payment operations service", () => {
  it("reads operations only for a freshly verified payments operator", async () => {
    await expect(getPaymentOperations()).resolves.toMatchObject({ accountId: snapshot.accountId, environment: "sandbox", health: { heartbeatStale: true } });
    expect(mocks.access).toHaveBeenCalledWith("payments.manage");
    expect(mocks.read).toHaveBeenCalledWith({ actorId });
  });
  it.each([401, 403, 503])("denies reads and replay before storage when current access returns %s", async (status) => {
    mocks.access.mockRejectedValue(new CatalogAdminError("capability_required", "Access denied", status));
    await expect(getPaymentOperations()).rejects.toMatchObject({ status });
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("rechecks membership for every operation and catches revocation after an earlier read", async () => {
    await getPaymentOperations();
    mocks.access.mockRejectedValue(new CatalogAdminError("capability_required", "Revoked", 403));
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 403 });
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("passes server identity and exact reviewed arguments to the transactional replay boundary", async () => {
    await expect(replayPaymentOperation(command)).resolves.toEqual({ status: "eligible", itemId: command.itemId, version: 3 });
    expect(mocks.replay).toHaveBeenCalledWith({ ...command, actorId });
    expect(mocks.access).toHaveBeenCalledWith("payments.manage");
  });

  it("rejects browser authority instead of forwarding a supplied actor", async () => {
    await expect(replayPaymentOperation({ ...command, actorId: "another" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("denies an actor revoked between the service check and the database transaction", async () => {
    mocks.replay.mockResolvedValue({ status: "denied", itemId: command.itemId, version: null });
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 403 });
  });

  it.each(["conflict", "ineligible", "dry_run_required"])("does not apply a replay when storage reports %s", async (status) => {
    mocks.replay.mockResolvedValue({ status, itemId: command.itemId, version: 3 });
    await expect(replayPaymentOperation({ ...command, dryRun: false })).rejects.toMatchObject({ status: 409 });
  });

  it.each(["applied", "duplicate"])("returns a truthful queue acknowledgement for an %s request", async (status) => {
    mocks.replay.mockResolvedValue({ status, itemId: command.itemId, version: 4, rawPayload: "must not leak" });
    await expect(replayPaymentOperation({ ...command, dryRun: false })).resolves.toEqual({ status, itemId: command.itemId, version: 4 });
  });

  it("redacts provider/storage failures and refuses account drift", async () => {
    mocks.read.mockRejectedValue(new Error("secret raw data"));
    await expect(getPaymentOperations()).rejects.toMatchObject({ status: 503, message: "Payment operations are temporarily unavailable." });
    mocks.read.mockResolvedValue({ ...snapshot, accountId: "acct_other" });
    await expect(getPaymentOperations()).rejects.toMatchObject({ status: 503 });
    mocks.replay.mockRejectedValue(new Error("secret raw data"));
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 503, message: "Payment operations are temporarily unavailable." });
  });

  it.each([
    { status: "processed", itemId: command.itemId, version: 3 },
    { status: "eligible", itemId: "different", version: 3 },
    { status: "eligible", itemId: command.itemId, version: null },
    { status: "eligible", itemId: command.itemId, version: 4 },
    { status: "applied", itemId: command.itemId, version: 4 },
  ])("rejects contradictory storage acknowledgements %j", async (result) => {
    mocks.replay.mockResolvedValue(result);
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 503 });
  });

  it("does not confirm a replay that did not advance the inspected version exactly once", async () => {
    mocks.replay.mockResolvedValue({ status: "applied", itemId: command.itemId, version: command.expectedVersion });
    await expect(replayPaymentOperation({ ...command, dryRun: false })).rejects.toMatchObject({ status: 503 });
  });

});
