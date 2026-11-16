import { beforeEach, describe, expect, it, vi } from "vitest";

const rewards = vi.hoisted(() => ({
  submitPrivateFeedbackForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rewards/server", () => rewards);

import { POST } from "@/app/api/rewards/private-feedback/route";
import {
  RewardsRequestError,
  RewardsServiceUnavailableError,
} from "@/lib/rewards/errors";

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
        headers: { origin: "https://helixskin.vercel.app" },
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

  it("returns only typed validation messages", async () => {
    rewards.submitPrivateFeedbackForCurrentUser.mockRejectedValue(
      new RewardsRequestError("Choose a feedback rating from 1 to 5."),
    );

    const response = await POST(new Request(
      "https://helixskin.vercel.app/api/rewards/private-feedback",
      {
        method: "POST",
        headers: { origin: "https://helixskin.vercel.app" },
        body: "{}",
      },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Choose a feedback rating from 1 to 5.",
    });
  });

  it("sanitizes every unexpected error", async () => {
    rewards.submitPrivateFeedbackForCurrentUser.mockRejectedValue(
      new Error("provider leaked customer@example.test"),
    );

    const response = await POST(new Request(
      "https://helixskin.vercel.app/api/rewards/private-feedback",
      {
        method: "POST",
        headers: { origin: "https://helixskin.vercel.app" },
        body: "{}",
      },
    ));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toBe("helix rewards is temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("customer@example.test");
  });

  it("rejects a cross-origin mutation before reading customer input", async () => {
    const response = await POST(new Request(
      "https://helixskin.vercel.app/api/rewards/private-feedback",
      {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: JSON.stringify({
          feedbackId: "feedback-1",
          rating: 5,
          comments: "should not be read",
        }),
      },
    ));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "SAME_ORIGIN_REQUIRED",
        message: "This request must originate from helix.",
        retryable: false,
      },
    });
    expect(rewards.submitPrivateFeedbackForCurrentUser).not.toHaveBeenCalled();
  });
});
