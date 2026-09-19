import { beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ identity: vi.fn(), membership: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentIdentity: external.identity }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: external.from, rpc: external.rpc }),
}));
import { getPaymentOperations, replayPaymentOperation } from "@/lib/admin/payments/service";

const actor = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const command = { itemId, requestId, expectedVersion: 3, reason: "Provider connection restored", dryRun: true };
const operations = {
  accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", observedAt: "2026-09-19T02:00:00Z",
  heartbeat: { startedAt: null, completedAt: null, processedCount: 0, failureCount: 0 },
  counts: { pending: 0, processing: 0, processed: 0, ignored: 0, dead_letter: 0 },
  oldestPendingAt: null, items: [], incidents: [], refunds: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  external.identity.mockResolvedValue({ id: actor, email: "operator@example.test" });
  external.membership.mockResolvedValue({ data: { user_id: actor, role: "admin", active: true }, error: null });
  external.from.mockImplementation((table: string) => {
    expect(table).toBe("admin_memberships");
    return { select: () => ({ eq: (key: string, id: string) => {
      expect([key, id]).toEqual(["user_id", actor]);
      return { maybeSingle: external.membership };
    } }) };
  });
  external.rpc.mockResolvedValue({ data: operations, error: null });
});

describe("payment service and inbox authorization integration", () => {
  it("uses fresh active admin identity for the real read adapter", async () => {
    await expect(getPaymentOperations()).resolves.toMatchObject({ accountId: operations.accountId });
    expect(external.rpc).toHaveBeenCalledWith("read_payment_operations", { p_actor_id: actor });
  });

  it.each(["catalog_publisher", "catalog_editor", "unknown", null])("denies %s before any payment RPC", async (role) => {
    external.membership.mockResolvedValue({ data: role ? { user_id: actor, role, active: true } : null, error: null });
    await expect(getPaymentOperations()).rejects.toMatchObject({ status: 403 });
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 403 });
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("denies anonymous requests before reading membership or payment data", async () => {
    external.identity.mockResolvedValue(null);
    await expect(getPaymentOperations()).rejects.toMatchObject({ status: 401 });
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 401 });
    expect(external.from).not.toHaveBeenCalled();
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("does not reuse earlier admin access after membership revocation", async () => {
    await getPaymentOperations();
    external.membership.mockResolvedValue({ data: { user_id: actor, role: "admin", active: false }, error: null });
    external.rpc.mockClear();
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 403 });
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("forwards the exact inspected item and server actor through the real replay adapter", async () => {
    external.rpc.mockResolvedValue({ data: { status: "eligible", itemId, version: 3 }, error: null });
    await expect(replayPaymentOperation(command)).resolves.toEqual({ status: "eligible", itemId, version: 3 });
    expect(external.rpc).toHaveBeenCalledWith("replay_payment_event", {
      p_actor_id: actor, p_item_id: itemId, p_expected_version: 3,
      p_reason: "Provider connection restored", p_request_id: requestId, p_dry_run: true,
    });
  });

  it("fails closed when membership changes before the replay transaction", async () => {
    external.rpc.mockResolvedValue({ data: { status: "denied", itemId, version: null }, error: null });
    await expect(replayPaymentOperation(command)).rejects.toMatchObject({ status: 403 });
  });

  it("redacts database errors from a denied or failed read transaction", async () => {
    external.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(getPaymentOperations()).rejects.toMatchObject({ status: 503, message: "Payment operations are temporarily unavailable." });
  });
});
