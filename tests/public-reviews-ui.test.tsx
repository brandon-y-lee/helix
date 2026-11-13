import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { PublicReviewFeed } from "@/components/reviews/PublicReviewFeed";
const purchase = {
  orderItemId: "00000000-0000-4000-8000-000000000001",
  productName: "Super Serum",
  productSlug: "super-serum",
  id: null,
  revision: null,
  status: null,
  environment: "sandbox",
  displayName: null,
  rating: null,
  title: null,
  body: null,
};
afterEach(() => vi.unstubAllGlobals());
describe("public reviews", () => {
  it("requires publication consent and preserves negative feedback", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        ok: true,
        result: { id: purchase.orderItemId, revision: 1, status: "pending" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<ReviewForm purchase={purchase} />);
    expect(
      screen.getByRole("button", { name: "Submit review" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Public display name"), "Alex");
    await user.selectOptions(screen.getByLabelText("Your rating"), "1");
    await user.type(screen.getByLabelText("Title"), "Not for me");
    await user.type(
      screen.getByLabelText("Your experience"),
      "This texture was not right for me.",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Submitted for moderation",
      ),
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      rating: 1,
      consent: true,
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("shows whole-product aggregate, truthful provenance and offer disclosure", () => {
    render(
      <PublicReviewFeed
        slug="super-serum"
        productName="Super Serum"
        initial={{
          count: 20,
          average: 3.2,
          nextCursor: purchase.orderItemId,
          reviews: [
            {
              id: purchase.orderItemId,
              displayName: "Alex",
              rating: 1,
              title: "Not for me",
              body: "Not right for my routine.",
              date: "2026-11-01",
              verifiedPurchase: true,
              offerNotice: true,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Based on 20 reviews.")).toBeInTheDocument();
    expect(screen.getByText("3.2")).toBeInTheDocument();
    expect(screen.getByText("Verified purchase")).toBeInTheDocument();
    expect(
      screen.getByText("Next-purchase offer provided; no review required."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more reviews" }),
    ).toBeInTheDocument();
  });
});
