import { beforeEach, describe, expect, it, vi } from "vitest";

const rewards = vi.hoisted(() => ({
  submitPrivateFeedbackForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rewards/server", () => rewards);

import { POST } from "@/app/api/rewards/private-feedback/route";
import { RewardsServiceUnavailableError } from "@/lib/rewards/errors";

describe("Private feedback rewards route", () => {
  beforeEach(() => {
    rewards.submitPrivateFeedbackForCurrentUser.mockReset();
  });

  it("returns a stable retryable failure without provider or customer details", async () => {
    rewards.submitPrivateFeedbackForCurrentUser.mockRejectedValue(
      new RewardsServiceUnavailableError(),
    );

    const response = await POST(new Request(
      "https://helixskin.vercel.app/api/rewards/private-feedback",
      {
        method: "POST",
        body: JSON.stringify({
          feedbackId: "feedback-1",
          rating: 5,
          comments: "customer@example.test",
        }),
      },
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "REWARDS_SERVICE_UNAVAILABLE",
        message: "helix rewards is temporarily unavailable.",
        retryable: true,
      },
    });
  });
});
