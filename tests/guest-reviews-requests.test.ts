import { describe, it, expect, vi } from "vitest";
import {
  handleGuestReview,
  type GuestReviewDependencies,
} from "@/lib/reviews/guest-requests";
const token = "a".repeat(43);
const input = {
  token,
  orderItemId: "00000000-0000-4000-8000-000000000001",
  expectedRevision: 0,
  displayName: "Guest",
  rating: 1,
  title: "Not for me",
  body: "Honest guest experience.",
  consent: true,
};
const req = (body: unknown, origin = "https://helix.test") =>
  new Request("https://helix.test/api/reviews/guest/submit", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
const deps = (): GuestReviewDependencies => ({
  enabled: () => true,
  rpc: vi.fn(async () => []),
  invalidate: vi.fn(),
});
describe("guest review capability boundary", () => {
  it("requires token and explicit consent while deriving identity from capability", async () => {
    const d = deps();
    const response = await handleGuestReview(req(input), "submit", d);
    expect(response.status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith(
      "submit_guest_product_review",
      expect.objectContaining({ p_token: token, p_rating: 1 }),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    for (const bad of [
      { ...input, userId: "injected" },
      { ...input, consent: false },
      { ...input, token: "invalid" },
    ])
      expect(
        (await handleGuestReview(req(bad), "submit", deps())).status,
      ).toBeGreaterThanOrEqual(400);
  });
  it("scanner GET cannot consume or mutate; origin/gates/size fail before RPC", async () => {
    const d = deps();
    expect(
      (
        await handleGuestReview(
          new Request("https://helix.test/api/reviews/guest/read"),
          "read",
          d,
        )
      ).status,
    ).toBe(405);
    expect(
      (await handleGuestReview(req(input, "https://evil.test"), "submit", d))
        .status,
    ).toBe(403);
    expect(
      (
        await handleGuestReview(
          req({ ...input, body: "x".repeat(13000) }),
          "submit",
          d,
        )
      ).status,
    ).toBe(413);
    d.enabled = () => false;
    expect((await handleGuestReview(req(input), "submit", d)).status).toBe(503);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("read accepts no client identity and does not invalidate", async () => {
    const d = deps();
    expect((await handleGuestReview(req({ token }), "read", d)).status).toBe(
      200,
    );
    expect(d.invalidate).not.toHaveBeenCalled();
    expect(
      (await handleGuestReview(req({ token, orderId: "foreign" }), "read", d))
        .status,
    ).toBe(400);
  });
});
