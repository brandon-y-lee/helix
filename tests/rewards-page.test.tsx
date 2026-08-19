import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rewards = vi.hoisted(() => ({
  getRewardsSummaryForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rewards/server", () => rewards);

import RewardsPage, { metadata } from "@/app/rewards/page";

describe("helix rewards page", () => {
  beforeEach(() => {
    rewards.getRewardsSummaryForCurrentUser.mockReset();
  });

  it("presents the Account Holder program and Points Ledger in canonical language", async () => {
    rewards.getRewardsSummaryForCurrentUser.mockResolvedValue({
      authenticated: true,
      emailConfirmed: true,
      programName: "helix rewards",
      pointsBalance: 425,
      lifetimePoints: 725,
      estimatedPurchasePoints: 0,
      affordableTiers: [],
      referralCode: "HELIX25",
      recentLedger: [
        {
          id: "entry-1",
          entry_type: "redemption_released",
          points: 200,
          description: "Checkout Points Reservation released.",
          created_at: "2026-08-19T12:00:00.000Z",
        },
      ],
      feedbackRequests: [],
    });

    render(await RewardsPage());

    expect(screen.getByRole("heading", { level: 1, name: "helix rewards" }))
      .toBeVisible();
    expect(screen.getByText("Available Points Balance").nextElementSibling)
      .toHaveTextContent("425");
    expect(screen.getByText("Lifetime Points").nextElementSibling)
      .toHaveTextContent("725");
    expect(screen.getByRole("heading", { level: 2, name: "Points Ledger" }))
      .toBeVisible();
    expect(screen.getByText("Points Release")).toBeVisible();
    expect(screen.getByText(/your referral code: HELIX25/i)).toBeVisible();
    expect(screen.getByText(/first qualifying order of \$50\.00 or more/i))
      .toBeVisible();
    expect(document.body).not.toHaveTextContent(/mei pelle rewards|loyalty/i);
    expect(metadata).toMatchObject({
      title: "helix rewards | helix",
      description: expect.stringContaining("helix rewards"),
    });
  });

  it("presents an honest unavailable state instead of sign-in guidance", async () => {
    rewards.getRewardsSummaryForCurrentUser.mockRejectedValue(
      new Error("provider unavailable"),
    );

    render(await RewardsPage());

    expect(screen.getByRole("heading", { level: 1, name: "helix rewards" }))
      .toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "helix rewards is temporarily unavailable.",
    );
    expect(screen.queryByRole("link", { name: /sign in/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/no rewards activity yet/i))
      .not.toBeInTheDocument();
  });
});
