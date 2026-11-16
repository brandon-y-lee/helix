import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: dependencies.createSupabaseAdminClient,
}));

import {
  ReferralServiceUnavailableError,
  qualifyReferralForPaidOrder,
  resolveReferralOfferForCheckout,
} from "@/lib/referrals/server";
import { checkoutErrorResponseMessage } from "@/lib/orders/server";

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

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

  it("fails Checkout closed when Referral Code validation is unavailable", async () => {
    const referralCodes = query({
      data: null,
      error: { message: "provider detail" },
    });
    dependencies.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => referralCodes),
    });

    const promise = resolveReferralOfferForCheckout({
      code: "HELIX25",
      userId: "referee-1",
      merchandiseSubtotalCents: 5_000,
    });

    await expect(promise).rejects.toBeInstanceOf(ReferralServiceUnavailableError);
    expect(checkoutErrorResponseMessage(await promise.catch((error) => error))).toEqual({
      message: "Sandbox checkout is temporarily unavailable. Try again in a moment.",
      status: 503,
    });
  });

  it("fails Checkout closed when prior Paid Order eligibility cannot be verified", async () => {
    const results = {
      referral_codes: query({
        data: { code: "HELIX25", user_id: "referrer-1", active: true },
        error: null,
      }),
      orders: query({ data: null, error: { message: "provider detail" } }),
    };
    dependencies.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: keyof typeof results) => results[table]),
    });

    await expect(resolveReferralOfferForCheckout({
      code: "HELIX25",
      userId: "referee-1",
      merchandiseSubtotalCents: 5_000,
    })).rejects.toBeInstanceOf(ReferralServiceUnavailableError);
  });
});
