import { describe, it, expect, vi } from "vitest";
import {
  handleReviewMutation,
  type ReviewRequestDependencies,
} from "@/lib/reviews/requests";
const input = {
  orderItemId: "00000000-0000-4000-8000-000000000001",
  expectedRevision: 0,
  displayName: "Alex",
  rating: 1,
  title: "Not for me",
  body: "The texture was not a fit.",
  consent: true,
};
const req = (body: unknown, origin = "https://helix.test") =>
  new Request("https://helix.test/api/reviews/submit", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function dependencies(): ReviewRequestDependencies {
  return {
    enabled: () => true,
    user: vi.fn(async () => "server-user"),
    moderator: vi.fn(async () => "server-admin"),
    rpc: vi.fn(async () => ({ id: "review", revision: 1, status: "pending" })),
    invalidate: vi.fn(),
  };
}
describe("review request authority", () => {
  it("derives identity server-side and invalidates only successful writes", async () => {
    const d = dependencies();
    expect((await handleReviewMutation(req(input), "submit", d)).status).toBe(
      200,
    );
    expect(d.rpc).toHaveBeenCalledWith(
      "submit_product_review",
      expect.objectContaining({ p_user_id: "server-user", p_rating: 1 }),
    );
    expect(d.invalidate).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin, missing consent and identity injection before writes", async () => {
    const d = dependencies();
    expect(
      (await handleReviewMutation(req(input, "https://evil.test"), "submit", d))
        .status,
    ).toBe(403);
    expect(
      (
        await handleReviewMutation(
          req({ ...input, consent: false }),
          "submit",
          d,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReviewMutation(
          req({ ...input, userId: "attacker" }),
          "submit",
          d,
        )
      ).status,
    ).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when disabled, authentication fails or body is oversized", async () => {
    const d = dependencies();
    d.enabled = () => false;
    expect((await handleReviewMutation(req(input), "submit", d)).status).toBe(
      503,
    );
    d.enabled = () => true;
    expect(
      (
        await handleReviewMutation(
          req({ ...input, body: "a".repeat(13000) }),
          "submit",
          d,
        )
      ).status,
    ).toBe(413);
    d.user = async () => {
      throw new Error("auth offline");
    };
    expect((await handleReviewMutation(req(input), "submit", d)).status).toBe(
      503,
    );
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("requires moderator authority and neutral reason for explicit takedown", async () => {
    const d = dependencies();
    const body = {
      id: input.orderItemId,
      expectedRevision: 3,
      decision: "removed",
      reason: "personal_data",
    };
    expect((await handleReviewMutation(req(body), "moderate", d)).status).toBe(
      200,
    );
    expect(d.rpc).toHaveBeenCalledWith("moderate_product_review", {
      p_actor_id: "server-admin",
      p_review_id: input.orderItemId,
      p_expected_revision: 3,
      p_decision: "removed",
      p_reason: "personal_data",
    });
    expect(
      (
        await handleReviewMutation(
          req({ ...body, reason: "low_rating" }),
          "moderate",
          d,
        )
      ).status,
    ).toBe(400);
  });
  it("does not accept low rating as a moderation reason", async () => {
    const d = dependencies();
    expect(
      (
        await handleReviewMutation(
          req({
            id: input.orderItemId,
            expectedRevision: 1,
            decision: "rejected",
            reason: "low_rating",
          }),
          "moderate",
          d,
        )
      ).status,
    ).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });
});
