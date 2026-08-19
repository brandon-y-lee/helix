import { beforeEach, describe, expect, it, vi } from "vitest";

const rewards = vi.hoisted(() => ({
  getRewardsSummaryForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rewards/server", () => rewards);

import { GET } from "@/app/api/rewards/summary/route";

describe("Rewards summary route", () => {
  beforeEach(() => {
    rewards.getRewardsSummaryForCurrentUser.mockReset();
  });

  it("uses only the cart subtotal from browser input and keeps the response private", async () => {
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

    const response = await GET(new Request(
      "https://helixskin.vercel.app/api/rewards/summary?subtotal=5000&pointsBalance=999999&userId=attacker",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rewards.getRewardsSummaryForCurrentUser).toHaveBeenCalledWith(5_000);
    expect(await response.json()).toMatchObject({
      programName: "helix rewards",
      pointsBalance: 425,
    });
  });

  it("returns an honest retryable failure without leaking provider details", async () => {
    rewards.getRewardsSummaryForCurrentUser.mockRejectedValue(
      new Error("provider leaked customer@example.test"),
    );

    const response = await GET(new Request(
      "https://helixskin.vercel.app/api/rewards/summary?subtotal=5000",
    ));
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
