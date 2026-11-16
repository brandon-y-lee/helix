import { beforeEach, describe, expect, it, vi } from "vitest";

const rewards = vi.hoisted(() => ({
  getRewardsSummaryForCurrentUser: vi.fn(),
}));
const cart = vi.hoisted(() => ({
  getCartState: vi.fn(),
}));

vi.mock("@/lib/rewards/server", () => rewards);
vi.mock("@/lib/cart/server", () => cart);

import { GET } from "@/app/api/rewards/summary/route";

describe("Rewards summary route", () => {
  beforeEach(() => {
    rewards.getRewardsSummaryForCurrentUser.mockReset();
    cart.getCartState.mockReset();
  });

  it("ignores browser authority and uses the server-backed Cart subtotal", async () => {
    cart.getCartState.mockResolvedValue({
      lines: [],
      count: 0,
      subtotal: 1_000,
      currency: "USD",
    });
    rewards.getRewardsSummaryForCurrentUser.mockResolvedValue({
      authenticated: true,
      emailConfirmed: true,
      programName: "helix rewards",
      pointsBalance: 425,
      lifetimePoints: 725,
      estimatedPurchasePoints: 100,
      affordableTiers: [],
      referralCode: "HELIX25",
      recentLedger: [],
      feedbackRequests: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cart.getCartState).toHaveBeenCalledOnce();
    expect(rewards.getRewardsSummaryForCurrentUser).toHaveBeenCalledWith(1_000);
    expect(await response.json()).toMatchObject({
      programName: "helix rewards",
      pointsBalance: 425,
    });
  });

  it("returns an honest retryable failure without leaking provider details", async () => {
    cart.getCartState.mockResolvedValue({
      lines: [],
      count: 0,
      subtotal: 0,
      currency: "USD",
    });
    rewards.getRewardsSummaryForCurrentUser.mockRejectedValue(
      new Error("provider leaked customer@example.test"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      error: {
        code: "REWARDS_SERVICE_UNAVAILABLE",
        message: "helix rewards is temporarily unavailable.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("customer@example.test");
  });
});
