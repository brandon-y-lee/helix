import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_VISIBLE_REVIEW_COUNT,
  ProductReviewsSection,
  REVIEW_VISIBLE_INCREMENT,
} from "@/components/product-detail/ProductReviewsSection";
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
  return document.querySelectorAll("[data-review-row]");
}

function expectLastVisibleDivider() {
  const rows = Array.from(visibleRows());
  expect(rows.at(-1)).toHaveAttribute("data-review-divider", "false");
  if (rows.length > 1) {
    expect(rows.at(-2)).toHaveAttribute("data-review-divider", "true");
  }
}

function controlMobileViewport(initialMobile: boolean) {
  let mobile = initialMobile;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" && mobile,
    media: query,
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return (nextMobile: boolean) => {
    act(() => {
      mobile = nextMobile;
      listeners.forEach((listener) => listener());
    });
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ProductReviewsSection", () => {
  it("uses one factual empty message on the pilot phone while retaining the desktop summary", () => {
    const resize = controlMobileViewport(true);
    render(
      <ProductReviewsSection
        productName="Super Serum"
        productSlug="super-serum"
        pdpPresentation="mobile-pilot"
        reviews={makeReviews(0)}
      />,
    );

    const section = screen.getByRole("region", {
      name: "Super Serum customer reviews",
    });
    expect(within(section).queryByText("—")).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("img", { name: "No ratings yet" }),
    ).toBeNull();
    expect(within(section).queryByText("AVERAGE RATING")).not.toBeInTheDocument();
    expect(
      within(section).getByText(
        "Reviews are not available for this product yet.",
      ),
    ).toBeInTheDocument();

    resize(false);
    expect(within(section).getByText("—")).toBeInTheDocument();
    expect(
      within(section).getByRole("img", { name: "No ratings yet" }),
    ).toBeInTheDocument();
    expect(within(section).getByText("Based on 0 reviews.")).toBeInTheDocument();

    resize(true);
    expect(within(section).queryByText("—")).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("img", { name: "No ratings yet" }),
    ).toBeNull();
    expect(
      within(section).getAllByText(
        "Reviews are not available for this product yet.",
      ),
    ).toHaveLength(1);
  });

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
    expectLastVisibleDivider();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Based on 14 reviews.")).toBeInTheDocument();

    const showMore = screen.getByRole("button", { name: "SHOW MORE" });
    await user.click(showMore);
    expect(visibleRows()).toHaveLength(7);
    expectLastVisibleDivider();
    expect(screen.getByText("Review title 1")).toBeInTheDocument();
    expect(screen.getByText("Review title 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(12);

    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(14);
    expectLastVisibleDivider();
    expect(
      screen.queryByRole("button", { name: "SHOW MORE" }),
    ).not.toBeInTheDocument();
  });

  it("preserves nonempty pilot ratings and expanded reviews when resizing", async () => {
    const resize = controlMobileViewport(true);
    const user = userEvent.setup();
    render(
      <ProductReviewsSection
        productName="Super Serum"
        productSlug="super-serum"
        pdpPresentation="mobile-pilot"
        reviews={makeReviews(8)}
      />,
    );
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Based on 8 reviews.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(7);

    resize(false);
    expect(visibleRows()).toHaveLength(7);
    resize(true);
    expect(visibleRows()).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(visibleRows()).toHaveLength(8);
    expect(screen.getByText("Based on 8 reviews.")).toBeInTheDocument();
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
