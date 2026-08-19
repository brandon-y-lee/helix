import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => supabase,
}));

import {
  RewardsReservationUnavailableError,
  awardPaidOrderPoints,
  getAvailablePointsBalance,
  reservePointsForOrder,
  reversePaidOrderPoints,
} from "@/lib/rewards/operations";

describe("operational rewards", () => {
  beforeEach(() => {
    supabase.from.mockReset();
    supabase.rpc.mockReset();
  });

  it("loads the Available Points Balance through rewards-named server interfaces", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { points_balance: 425 },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ select });

    await expect(getAvailablePointsBalance("account-holder-1")).resolves.toBe(425);

    expect(supabase.rpc).toHaveBeenCalledWith("ensure_rewards_account", {
      p_user_id: "account-holder-1",
    });
    expect(supabase.from).toHaveBeenCalledWith("rewards_accounts");
  });

  it("reserves Checkout Points through the rewards contract", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ select });
    supabase.rpc.mockResolvedValue({ error: null });

    await reservePointsForOrder({
      amountCents: 500,
      description: "$5 off sandbox Checkout reward reserved.",
      orderId: "order-1",
      points: 200,
      userId: "account-holder-1",
    });

    expect(supabase.from).toHaveBeenCalledWith("rewards_reservations");
    expect(supabase.rpc).toHaveBeenCalledWith("reserve_rewards_points", {
      p_amount_cents: 500,
      p_description: "$5 off sandbox Checkout reward reserved.",
      p_order_id: "order-1",
      p_points: 200,
      p_source_key: "reward-reserve:order-1:1",
      p_user_id: "account-holder-1",
    });
  });

  it("distinguishes an unavailable Points Reservation from an operational failure", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockReturnValue({ select: vi.fn(() => ({ eq })) });
    supabase.rpc.mockResolvedValue({ error: { message: "insufficient balance" } });

    await expect(
      reservePointsForOrder({
        amountCents: 500,
        description: "$5 off sandbox Checkout reward reserved.",
        orderId: "order-1",
        points: 200,
        userId: "account-holder-1",
      }),
    ).rejects.toBeInstanceOf(RewardsReservationUnavailableError);
  });

  it("records a Paid Order Points Award through the rewards contract", async () => {
    supabase.rpc.mockResolvedValue({ error: null });

    await awardPaidOrderPoints({
      eligibleNetMerchandiseCents: 4_500,
      orderId: "order-1",
      orderNumber: "HLX-1001",
      points: 90,
      userId: "account-holder-1",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("award_rewards_points", {
      p_description: "Sandbox Order HLX-1001 Points Award.",
      p_entry_type: "purchase_earn",
      p_metadata: { eligible_net_merchandise_cents: 4_500 },
      p_order_id: "order-1",
      p_points: 90,
      p_source_key: "purchase:order-1",
      p_user_id: "account-holder-1",
    });
  });

  it("records idempotent Points Reversals for a refunded Paid Order", async () => {
    supabase.rpc.mockResolvedValue({ error: null });

    await reversePaidOrderPoints({
      orderId: "order-1",
      orderNumber: "HLX-1001",
      pointsEarned: 90,
      pointsRedeemed: 200,
      userId: "account-holder-1",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "record_rewards_points_adjustment", {
      p_description: "Sandbox Order HLX-1001 Points Award reversed after Refund.",
      p_entry_type: "purchase_refund",
      p_metadata: {},
      p_order_id: "order-1",
      p_points: -90,
      p_source_key: "purchase-refund:order-1",
      p_user_id: "account-holder-1",
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "record_rewards_points_adjustment", {
      p_description: "Sandbox Order HLX-1001 Points Redemption reversed after Refund.",
      p_entry_type: "redemption_reversal",
      p_metadata: {},
      p_order_id: "order-1",
      p_points: 200,
      p_source_key: "reward-refund-restore:order-1",
      p_user_id: "account-holder-1",
    });
  });
});
