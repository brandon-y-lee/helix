import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  INITIAL_VISIBLE_REVIEW_COUNT,
  ProductReviewsSection,
  REVIEW_VISIBLE_INCREMENT,
} from "@/components/ProductReviewsSection";
import type {
  ProductReviewFixture,
  ProductReviews,
} from "@/lib/catalog/product-reviews";

function makeReview(index: number): ProductReviewFixture {
  return {
    id: `review-${index}`,
    initials: `R${index}`,
    firstName: `Reviewer ${index}`,
    ageRange: "25-34",
    skinType: "Combination",
    primaryConcern: "Uneven-looking texture",
    routineContext: "Morning Core routine",
    favoriteFeatures: ["Easy layers", "Clean finish"],
    rating: index % 2 === 0 ? 4 : 5,
    date: `2026-07-${String(index).padStart(2, "0")}`,
    title: `Review title ${index}`,
    body: `Review body ${index}.`,
    meterValue: 80 + (index % 10),
  };
}

function makeReviews(count: number): ProductReviews {
  return {
    meter: {
      question: "How well did this fit your routine?",
      lowLabel: "Not useful",
      highLabel: "Easy to repeat",
    },
    reviews: Array.from({ length: count }, (_, index) =>
      makeReview(index + 1),
    ),
  };
}

function visibleRows() {
  return document.querySelectorAll(".review-row");
}

describe("ProductReviewsSection", () => {
  it("reveals reviews cumulatively in two-then-five batches", async () => {
    const user = userEvent.setup();
    render(
      <ProductReviewsSection
        productName="TREAT"
        productSlug="treat"
        reviews={makeReviews(14)}
      />,
    );

    expect(INITIAL_VISIBLE_REVIEW_COUNT).toBe(2);
    expect(REVIEW_VISIBLE_INCREMENT).toBe(5);
    expect(visibleRows()).toHaveLength(2);
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Based on 14 reviews.")).toBeInTheDocument();

    const showMore = screen.getByRole("button", { name: "SHOW MORE" });
    await user.click(showMore);
    expect(visibleRows()).toHaveLength(7);
    expect(screen.getByText("Review title 1")).toBeInTheDocument();
    expect(screen.getByText("Review title 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(12);

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(14);
    expect(
      screen.queryByRole("button", { name: "SHOW MORE" }),
    ).not.toBeInTheDocument();
  });

  it("shows all collections smaller than three without an expansion control", () => {
    render(
      <ProductReviewsSection
        productName="CLEANSE"
        productSlug="cleanse"
        reviews={makeReviews(2)}
      />,
    );

    expect(visibleRows()).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "SHOW MORE" }),
    ).not.toBeInTheDocument();
  });

  it("shows an honest empty state without inventing an average", () => {
    render(
      <ProductReviewsSection
        productName="FRAME"
        productSlug="frame"
        reviews={makeReviews(0)}
      />,
    );

    const section = screen.getByRole("region", {
      name: "FRAME customer reviews",
    });
    expect(within(section).getByText("—")).toBeInTheDocument();
    expect(within(section).getByText("Based on 0 reviews.")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "Reviews are not available for this product yet.",
      ),
    ).toBeInTheDocument();
  });

  it("resets expansion when the product or result ordering changes", async () => {
    const user = userEvent.setup();
    const firstReviews = makeReviews(12);
    const { rerender } = render(
      <ProductReviewsSection
        productName="TREAT"
        productSlug="treat"
        reviews={firstReviews}
      />,
    );

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(7);

    rerender(
      <ProductReviewsSection
        productName="SEAL"
        productSlug="seal"
        reviews={makeReviews(12)}
      />,
    );
    await waitFor(() => expect(visibleRows()).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(7);

    rerender(
      <ProductReviewsSection
        productName="SEAL"
        productSlug="seal"
        reviews={{
          ...firstReviews,
          reviews: [...firstReviews.reviews].reverse(),
        }}
      />,
    );
    await waitFor(() => expect(visibleRows()).toHaveLength(2));
    expect(screen.getByText("Review title 12")).toBeInTheDocument();
  });
});
