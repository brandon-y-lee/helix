import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  account: vi.fn(), retrieve: vi.fn(), refunds: vi.fn(), from: vi.fn(), reverse: vi.fn(),
  exception: vi.fn(), resolve: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({ charges: { retrieve: boundary.retrieve }, refunds: { list: boundary.refunds } }),
}));
vi.mock("@/lib/stripe/payment-verification", () => ({ verifyStripeAccount: boundary.account }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: boundary.from }) }));
vi.mock("@/lib/rewards/operations", () => ({ reversePaidOrderPoints: boundary.reverse }));
vi.mock("@/lib/orders/payment-contracts", () => ({
  recordCheckoutPaymentException: boundary.exception,
  resolveCheckoutPaymentExceptions: boundary.resolve,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { reconcileFullStripeRefund } from "@/lib/orders/refunds";

const order = {
  id: "order-1", order_number: "HX-123", user_id: "user-1", status: "paid",
  checkout_environment: "sandbox", currency: "USD", total_cents: 3000,
  stripe_checkout_session_id: "cs_test_1", stripe_payment_intent_id: "pi_1",
  reward_points_earned: 50, reward_points_redeemed: 200,
};
const charge = {
  id: "ch_1", object: "charge", livemode: false, paid: true, captured: true,
  status: "succeeded", currency: "usd", amount: 3000, amount_captured: 3000,
  amount_refunded: 3000, refunded: true, payment_intent: "pi_1",
};

describe("full sandbox refund reconciliation", () => {
  let writes: Array<{ table: string; value: Record<string, unknown> }>;
  let failedTable: string | null;
  let missingAttempt: boolean;
  let storedOrder: Record<string, unknown>;
  let missingAward: boolean;
  beforeEach(() => {
    vi.resetAllMocks();
    writes = [];
    failedTable = null;
    missingAttempt = false;
    storedOrder = { ...order };
    missingAward = false;
    boundary.account.mockResolvedValue({ accountId: "acct_1Tm9WRFEzyaKzdmq", apiVersion: "2026-06-24.dahlia" });
    boundary.retrieve.mockResolvedValue(charge);
    boundary.refunds.mockResolvedValue({ data: [{
      id: "re_1", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 3000, status: "succeeded",
    }], has_more: false });
    boundary.reverse.mockResolvedValue(undefined);
    boundary.exception.mockResolvedValue(undefined);
    boundary.resolve.mockResolvedValue(undefined);
    boundary.from.mockImplementation((table: string) => {
      let mutation = false;
      const result = () => ({
        data: mutation ? (table === "orders" ? { id: order.id }
          : table === "payment_attempts" ? (missingAttempt ? [] : [{ id: "attempt-1" }]) : null)
          : table === "orders" ? { ...storedOrder }
          : table === "rewards_ledger_entries" ? (missingAward ? null : {
              user_id: "user-1", order_id: "order-1", points: 50, entry_type: "purchase_earn", status: "posted",
            }) : { id: "attribution-1" },
        error: mutation && failedTable === table ? { message: "sensitive database detail" } : null,
      });
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query),
        update: vi.fn((value: Record<string, unknown>) => {
          mutation = true; writes.push({ table, value }); return query;
        }),
        maybeSingle: vi.fn(async () => result()),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    });
  });

  it("retains a retryable exception without claiming reconciliation when points reversal fails", async () => {
    boundary.reverse.mockRejectedValue(new Error("private database error"));

    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");

    expect(writes.some(({ table }) => table === "orders")).toBe(false);
    expect(boundary.exception).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-1", sessionId: "cs_test_1", paymentIntentId: "pi_1",
      code: "full_refund_reconciliation_failed", paymentStatus: "refunded", amountCents: 3000,
    }));
    expect(boundary.resolve).not.toHaveBeenCalled();
  });

  it("records completion only after every existing refund effect succeeds", async () => {
    await reconcileFullStripeRefund("ch_1");
    expect(writes.map(({ table }) => table)).toEqual([
      "referral_attributions", "referral_rewards", "payment_attempts", "orders",
    ]);
    expect(writes.at(-1)?.value).toEqual(expect.objectContaining({ status: "refunded" }));
    expect(boundary.resolve).toHaveBeenCalledWith({
      orderId: "order-1", sessionId: "cs_test_1", code: "full_refund_reconciliation_failed",
    });
    expect(boundary.exception).not.toHaveBeenCalled();
  });

  it.each([
    { currency: "eur" }, { livemode: true }, { amount: 3100 },
    { amount_refunded: 3001 }, { amount_captured: 2900 }, { paid: false },
    { status: "pending" }, { captured: false }, { id: "ch_other" },
  ])("refuses inconsistent full-refund facts before any local effect: %j", async (difference) => {
    boundary.retrieve.mockResolvedValue({ ...charge, ...difference });
    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
    expect(writes).toEqual([]);
    expect(boundary.reverse).not.toHaveBeenCalled();
  });

  it("does not report a partial refund as completed", async () => {
    boundary.retrieve.mockResolvedValue({ ...charge, refunded: false, amount_refunded: 1000 });
    await reconcileFullStripeRefund("ch_1");
    expect(writes).toEqual([]);
    expect(boundary.reverse).not.toHaveBeenCalled();
  });

  it.each(["pending", "failed", "canceled", "requires_action"])(
    "does not infer successful returned money from a %s refund", async (status) => {
      boundary.refunds.mockResolvedValue({ data: [{
        id: "re_1", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 3000, status,
      }], has_more: false });
      await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
      expect(writes).toEqual([]);
      expect(boundary.reverse).not.toHaveBeenCalled();
      expect(boundary.exception).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "unknown" }));
    },
  );

  it.each(["referral_attributions", "referral_rewards", "payment_attempts", "orders"])(
    "keeps a failed %s write retryable", async (table) => {
      failedTable = table;
      await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
      expect(boundary.exception).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "refunded" }));
      expect(boundary.resolve).not.toHaveBeenCalled();
    },
  );

  it("redacts provider failures", async () => {
    boundary.retrieve.mockRejectedValue(new Error("raw provider customer detail"));
    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
    expect(writes).toEqual([]);
  });

  it("uses every refund page and counts only successful returned amounts", async () => {
    boundary.refunds.mockResolvedValueOnce({ data: [{
      id: "re_1", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 1000, status: "succeeded",
    }, {
      id: "re_failed", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 2000, status: "failed",
    }], has_more: true }).mockResolvedValueOnce({ data: [{
      id: "re_2", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 2000, status: "succeeded",
    }], has_more: false });
    await reconcileFullStripeRefund("ch_1");
    expect(boundary.refunds).toHaveBeenNthCalledWith(2, {
      charge: "ch_1", limit: 100, starting_after: "re_failed",
    });
    expect(writes.at(-1)?.value.status).toBe("refunded");
  });

  it("does not complete when the matching payment attempt is missing", async () => {
    missingAttempt = true;
    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
    expect(writes.some(({ table }) => table === "orders")).toBe(false);
  });

  it("preserves the original refund date when retrying completed effects", async () => {
    storedOrder = { ...order, status: "refunded", refunded_at: "2026-09-01T12:00:00.000Z" };
    await reconcileFullStripeRefund("ch_1");
    expect(writes.some(({ table }) => table === "orders")).toBe(false);
    expect(boundary.reverse).toHaveBeenCalled();
    expect(boundary.resolve).toHaveBeenCalled();
  });

  it("requires explicit evidence that refund pagination is complete", async () => {
    boundary.refunds.mockResolvedValue({ data: [{
      id: "re_1", charge: "ch_1", payment_intent: "pi_1", currency: "usd", amount: 3000, status: "succeeded",
    }] });
    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
    expect(boundary.reverse).not.toHaveBeenCalled();
  });

  it("never deducts unrelated points when settlement crashed before posting its purchase award", async () => {
    missingAward = true;
    await expect(reconcileFullStripeRefund("ch_1")).rejects.toThrow("Refund reconciliation is temporarily unavailable.");
    expect(boundary.reverse).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(boundary.exception).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "refunded" }));

    missingAward = false;
    await reconcileFullStripeRefund("ch_1");
    expect(boundary.reverse).toHaveBeenCalledTimes(1);
    expect(writes.at(-1)?.value.status).toBe("refunded");
  });
});
