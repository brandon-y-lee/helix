import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: dependencies.createSupabaseAdminClient,
}));

import { qualifyReferralForPaidOrder } from "@/lib/referrals/server";

describe("Referral Reward qualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the atomic server-only qualification contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "reward-1", error: null });
    dependencies.createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(qualifyReferralForPaidOrder("order-1")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("qualify_referral_for_paid_order", {
      p_order_id: "order-1",
    });
  });

  it("fails the paid-order side effect so a webhook retry can recover", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "provider detail" } })
      .mockResolvedValueOnce({ data: "reward-1", error: null });
    dependencies.createSupabaseAdminClient.mockReturnValue({ rpc });

    await expect(qualifyReferralForPaidOrder("order-1")).rejects.toThrow(
      "Referral Reward qualification failed",
    );
    await expect(qualifyReferralForPaidOrder("order-1")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
