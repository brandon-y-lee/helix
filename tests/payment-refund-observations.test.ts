import { beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  account: vi.fn(), refund: vi.fn(), charge: vi.fn(), intent: vi.fn(), list: vi.fn(),
  from: vi.fn(), rpc: vi.fn(), sdk: {} as Record<string, unknown>,
}));
vi.mock("@/lib/stripe/server", () => ({ getStripeClient: () => external.sdk }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: external.from, rpc: external.rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { PaymentDeadlineExceededError } from "@/lib/payments/deadline";
import { PaymentLeaseLostError } from "@/lib/payments/lease";
import type { PaymentRefundObservationInput } from "@/lib/payments/inbox";
import { reconcileStripeRefundObservation } from "@/lib/payments/refunds";

const order = {
  id: "c34fb992-c0e5-4f06-84f0-b0dbf8442ae8", order_number: "HX-123", user_id: null,
  status: "paid", checkout_environment: "sandbox", currency: "USD", total_cents: 3000,
  stripe_checkout_session_id: "cs_test_1", stripe_payment_intent_id: "pi_1",
  reward_points_earned: 0, reward_points_redeemed: 0,
};
const charge = {
  id: "ch_1", object: "charge", livemode: false, paid: true, captured: true,
  status: "succeeded", currency: "usd", amount: 3000, amount_captured: 3000,
  amount_refunded: 1000, refunded: false, payment_intent: "pi_1",
};
const refund = {
  id: "re_1", object: "refund", charge: "ch_1", payment_intent: "pi_1",
  currency: "usd", amount: 1000, status: "pending", metadata: {},
};
const intent = {
  id: "pi_1", object: "payment_intent", livemode: false, currency: "usd", amount: 3000,
  amount_received: 3000, latest_charge: "ch_1", status: "succeeded", metadata: { order_id: order.id, environment: "sandbox" },
};

describe("authoritative refund lifecycle observations", () => {
  let storedOrder: typeof order | null;
  let observations: unknown[];
  let writes: Array<{ table: string; value: Record<string, unknown> }>;
  let persist: ReturnType<typeof vi.fn>;
  let failedTable: string | null;
  beforeEach(() => {
    vi.resetAllMocks();
    storedOrder = { ...order };
    failedTable = null;
    observations = [];
    writes = [];
    external.sdk = {
      accounts: { retrieve: external.account }, charges: { retrieve: external.charge },
      refunds: { retrieve: external.refund, list: external.list }, paymentIntents: { retrieve: external.intent },
    };
    external.account.mockResolvedValue({ id: "acct_1Tm9WRFEzyaKzdmq" });
    external.charge.mockResolvedValue({ ...charge });
    external.refund.mockResolvedValue({ ...refund });
    external.intent.mockResolvedValue({ ...intent });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund }], has_more: false });
    external.rpc.mockResolvedValue({ data: true, error: null });
    external.from.mockImplementation((table: string) => {
      let mutation = false;
      const result = () => ({
        data: table === "orders" ? storedOrder && { ...storedOrder }
          : table === "payment_attempts" && mutation ? [{ id: "attempt-1" }] : null,
        error: mutation && table === failedTable ? { message: "private database failure" } : null,
      });
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query),
        update: vi.fn((value: Record<string, unknown>) => {
          mutation = true;
          writes.push({ table, value });
          if (table === "orders" && storedOrder && table !== failedTable) Object.assign(storedOrder, value);
          return query;
        }),
        maybeSingle: vi.fn(async () => result()),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    });
    persist = vi.fn(async (input: PaymentRefundObservationInput) => { observations = input.facts; return true; });
  });

  it("retains a pending refund as unresolved minimal facts without claiming returned money", async () => {
    const result = await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    });
    expect(result).toEqual({ disposition: "pending", code: "refund_pending" });
    expect(observations).toEqual([{
      refundId: "re_1", chargeId: "ch_1", paymentIntentId: "pi_1", orderId: order.id,
      amountCents: 1000, currency: "usd", status: "pending",
    }]);
    expect(writes).toEqual([]);
  });
  it("uses the complete succeeded refund history before reconciling a full refund", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValueOnce({ object: "list", data: [
      { ...refund, status: "succeeded" },
      { ...refund, id: "re_failed", amount: 2000, status: "failed" },
    ], has_more: true }).mockResolvedValueOnce({ object: "list", data: [
      { ...refund, id: "re_2", amount: 2000, status: "succeeded" },
    ], has_more: false });
    const result = await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    });
    expect(result).toEqual({ disposition: "processed" });
    expect(observations).toHaveLength(3);
    expect(storedOrder?.status).toBe("refunded");
  });

  it.each([false, true])("surfaces a refunded Order whose current refund requires action (charge.refunded=%s)", async (refunded) => {
    storedOrder = { ...order, status: "refunded" };
    external.charge.mockResolvedValue({ ...charge, refunded, amount_refunded: refunded ? 3000 : 0 });
    external.refund.mockResolvedValue({ ...refund, amount: 3000, status: "requires_action" });
    external.list.mockResolvedValue({ object: "list", data: [
      { ...refund, amount: 3000, status: "requires_action" },
    ], has_more: false });
    const result = await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    });
    expect(result).toEqual({ disposition: "pending", code: "refund_status_reversed" });
    expect(observations).toEqual([expect.objectContaining({ status: "requires_action", amountCents: 3000 })]);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ exception: {
      orderId: order.id, sessionId: "cs_test_1", paymentIntentId: "pi_1", paymentStatus: "unknown", amountCents: 0,
    } }));
    expect(external.rpc).not.toHaveBeenCalledWith("record_checkout_payment_exception", expect.anything());
    expect(storedOrder.status).toBe("refunded");
    expect(writes).toEqual([]);
  });

  it.each([
    ["succeeded", "refund_partial"], ["failed", "refund_failed"], ["canceled", "refund_failed"],
    ["requires_action", "refund_requires_action"],
  ])("retains current %s status as unresolved %s", async (status, code) => {
    external.refund.mockResolvedValue({ ...refund, status });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, status }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code });
    expect(observations).toEqual([expect.objectContaining({ status: status ?? "unknown" })]);
    expect(storedOrder?.status).toBe("paid");
  });

  it.each([
    ["charge", { id: "ch_wrong" }], ["charge", { livemode: true }],
    ["intent", { id: "pi_wrong" }], ["intent", { livemode: true }],
    ["refund", { id: "re_wrong" }], ["refund", { payment_intent: "pi_wrong" }],
  ])("quarantines mismatched %s identity before persisting facts", async (object, difference) => {
    external[object as "charge" | "intent" | "refund"].mockResolvedValue({
      ...(object === "charge" ? charge : object === "intent" ? intent : refund), ...difference,
    });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "provider_identity_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("keeps an early Helix refund with no local binding pending, and persists its minimal facts", async () => {
    storedOrder = null;
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "binding_pending" });
    expect(observations).toEqual([expect.objectContaining({ orderId: null })]);
  });

  it("ignores only an explicitly foreign application with no local binding or Helix identity", async () => {
    storedOrder = null;
    external.intent.mockResolvedValue({ ...intent, metadata: { application: "other_application" } });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "ignored" });
    expect(observations).toEqual([]);
  });

  it("does not treat deleted metadata as positive unrelated-object evidence", async () => {
    storedOrder = null;
    external.intent.mockResolvedValue({ ...intent, metadata: {} });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "binding_pending" });
  });

  it("does not run refund effects after losing the observation lease", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    persist.mockResolvedValue(false);
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toBeInstanceOf(PaymentLeaseLostError);
    expect(writes).toEqual([]);
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("resolves only the full-refund exception through the current observation lease", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "processed" });
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ resolvedException: {
      orderId: order.id, sessionId: "cs_test_1", paymentIntentId: "pi_1",
    } }));
    expect(external.rpc).not.toHaveBeenCalledWith("resolve_checkout_payment_exceptions", expect.anything());
  });

  it.each([
    ["charge", { currency: "eur" }], ["charge", { amount: 3000.5 }],
    ["charge", { amount: 2147483648 }], ["charge", { amount: 0 }],
    ["charge", { amount_captured: 2500 }], ["charge", { amount_refunded: -1 }],
    ["charge", { amount_refunded: 3001 }], ["charge", { paid: false }],
    ["charge", { captured: false }], ["charge", { status: "pending" }],
    ["charge", { refunded: "false" }], ["intent", { currency: "eur" }],
    ["intent", { amount: 3500 }], ["intent", { amount_received: 2900 }],
    ["intent", { status: "processing" }],
  ])("quarantines inconsistent %s financial facts: %j", async (object, difference) => {
    external[object as "charge" | "intent"].mockResolvedValue({
      ...(object === "charge" ? charge : intent), ...difference,
    });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "verification_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it.each([
    { currency: "EUR" }, { checkout_environment: "live" }, { total_cents: 3001 },
    { stripe_payment_intent_id: "pi_other" }, { stripe_checkout_session_id: "cs_live_1" },
  ])("refuses refund facts that contradict the bound Order: %j", async (difference) => {
    storedOrder = { ...order, ...difference };
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "verification_mismatch" });
    expect(writes).toEqual([]);
    expect(observations).toEqual([]);
  });

  it("waits for settlement if the matching Order has not been finalized", async () => {
    storedOrder = { ...order, status: "pending" };
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "binding_pending" });
    expect(writes).toEqual([]);
  });

  it.each([
    { latest_charge: "ch_other" }, { metadata: { order_id: "other-order" } },
    { metadata: { environment: "live" } },
  ])("quarantines contradictory current payment identity: %j", async (difference) => {
    external.intent.mockResolvedValue({ ...intent, ...difference });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "provider_identity_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it.each([
    { amount: 0 }, { amount: -1 }, { amount: 1000.5 }, { amount: 2147483648 },
    { currency: "eur" }, { id: "refund-invalid" }, { object: "charge" },
    { charge: "ch_other" }, { payment_intent: "pi_other" }, { status: undefined }, { status: 1 },
  ])("refuses malformed current refund history before persisting facts: %j", async (difference) => {
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, ...difference }], has_more: false });
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_schema_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it.each([
    { object: "list", data: [], has_more: true },
    { object: "list", data: [refund, refund], has_more: false },
    { object: "list", data: [refund] },
    { object: "wrong", data: [refund], has_more: false },
  ])("does not accept incomplete or repeated refund history", async (page) => {
    external.list.mockResolvedValue(page);
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_schema_mismatch" });
    expect(observations).toEqual([]);
  });

  it.each([{ amount: 500 }, { currency: "eur" }, { id: "re_missing" }])(
    "rejects a retrieved Refund that disagrees with the complete current list: %j", async (difference) => {
      external.refund.mockResolvedValue({ ...refund, ...difference });
      const reference = difference.id ?? "re_1";
      await expect(reconcileStripeRefundObservation({
        objectKind: "refund", objectId: reference, persistObservations: persist,
      })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_schema_mismatch" });
      expect(observations).toEqual([]);
    },
  );

  it("retains the latest listed status but waits when current reads disagree", async () => {
    external.refund.mockResolvedValue({ ...refund, status: "succeeded" });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, status: "requires_action" }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "provider_pending" });
    expect(observations).toEqual([expect.objectContaining({ status: "requires_action" })]);
  });

  it.each([null, "new_provider_status"])("retains unsupported status %s as visible quarantined facts", async (status) => {
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, status }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "provider_schema_mismatch" });
    expect(observations).toEqual([expect.objectContaining({ status: "unknown" })]);
  });

  it.each(["refund", "charge", "intent", "list"] as const)("preserves safe provider retry facts from %s", async (boundary) => {
    external[boundary].mockRejectedValue({ message: "private customer provider details", statusCode: 429, headers: { "retry-after": "123" } });
    await expect(reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_unavailable", retryAfterSeconds: 123,
      message: "Payment provider facts could not be verified." });
    expect(observations).toEqual([]);
  });

  it.each(["refund", "charge", "intent", "list"] as const)("preserves execution deadline failures from %s", async (boundary) => {
    const expired = new PaymentDeadlineExceededError();
    external[boundary].mockRejectedValue(expired);
    await expect(reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).rejects.toBe(expired);
    expect(observations).toEqual([]);
  });

  it.each([
    [{ ...refund, amount: 3001, status: "failed" }],
    [{ ...refund, amount: 2000, status: "succeeded" }, { ...refund, id: "re_2", amount: 2000, status: "succeeded" }],
  ])("never accepts returned amounts larger than the original payment", async (...history) => {
    external.list.mockResolvedValue({ object: "list", data: history, has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "quarantined", code: "verification_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("retains fenced full-refund failure facts until every local effect succeeds", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    failedTable = "payment_attempts";
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "refund_reconciliation_failed" });
    expect(storedOrder?.status).toBe("paid");
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ exception: {
      orderId: order.id, sessionId: "cs_test_1", paymentIntentId: "pi_1", paymentStatus: "refunded", amountCents: 3000,
    } }));
    expect(external.rpc).not.toHaveBeenCalledWith("record_checkout_payment_exception", expect.anything());
    failedTable = null;
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "processed" });
    expect(storedOrder?.status).toBe("refunded");
  });

  it("does not overwrite a newer lease when a failed local effect tries to record its exception", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    failedTable = "payment_attempts";
    persist.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toBeInstanceOf(PaymentLeaseLostError);
    expect(storedOrder?.status).toBe("paid");
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("does not swallow a deadline during fenced exception resolution", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    const expired = new PaymentDeadlineExceededError();
    persist.mockResolvedValueOnce(true).mockRejectedValueOnce(expired);
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toBe(expired);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("does not claim processing completed when exception resolution loses its lease", async () => {
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    persist.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toBeInstanceOf(PaymentLeaseLostError);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(external.rpc).not.toHaveBeenCalled();
  });

  it("keeps a Charge with Helix metadata pending even if its PaymentIntent metadata was changed", async () => {
    storedOrder = null;
    external.intent.mockResolvedValue({ ...intent, metadata: { application: "other_application" } });
    external.charge.mockResolvedValue({ ...charge, metadata: { order_id: order.id, environment: "sandbox" } });
    expect(await reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "binding_pending" });
  });

  it.each(["refund", "charge", "intent", "list"] as const)("rejects a missing current %s response", async (boundary) => {
    external[boundary].mockResolvedValue(null);
    await expect(reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_schema_mismatch" });
    expect(observations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("bounds provider pagination instead of accepting truncated returned-money proof", async () => {
    for (let page = 0; page < 5; page += 1) external.list.mockResolvedValueOnce({ object: "list", data: [
      { ...refund, id: `re_page_${page}`, amount: 1, status: "succeeded" },
    ], has_more: true });
    await expect(reconcileStripeRefundObservation({
      objectKind: "charge", objectId: "ch_1", persistObservations: persist,
    })).rejects.toMatchObject({ name: "PaymentProviderReadError", code: "provider_schema_mismatch" });
    expect(external.list).toHaveBeenCalledTimes(5);
    expect(observations).toEqual([]);
  });

  it("does not finalize a full refund while retrieved and listed current statuses disagree", async () => {
    external.refund.mockResolvedValue({ ...refund, amount: 3000, status: "pending" });
    external.charge.mockResolvedValue({ ...charge, refunded: true, amount_refunded: 3000 });
    external.list.mockResolvedValue({ object: "list", data: [{ ...refund, amount: 3000, status: "succeeded" }], has_more: false });
    expect(await reconcileStripeRefundObservation({
      objectKind: "refund", objectId: "re_1", persistObservations: persist,
    })).toEqual({ disposition: "pending", code: "provider_pending" });
    expect(observations).toEqual([expect.objectContaining({ status: "succeeded" })]);
    expect(storedOrder?.status).toBe("paid");
    expect(writes).toEqual([]);
  });

});
