import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";

const comingSoonProduct: AlgoliaProductRecord = {
  objectID: "lift",
  productId: "lift",
  slug: "lift",
  slugAliases: [],
  displayName: "LIFT",
  editorialDescription: "A focused eye treatment.",
  productType: "Eye treatment",
  routineGroup: "beyond_core",
  systemStepPosition: 7,
  systemStepName: "LIFT",
  routineSort: 70,
  badge: "Coming soon",
  status: "coming_soon",
  currency: "USD",
  available: false,
  waitlist: false,
  variantCount: 0,
  variantNames: [],
  keywords: [],
  concerns: [],
  ingredients: [],
  swatch: ["#ece4dc", "#8a7467"],
  placeholderMedia: null,
  imageMedia: null,
  cardMedia: {
    kind: "gradient",
    colors: ["#ece4dc", "#8a7467"],
  },
  sortOrder: 70,
  createdAt: "2026-01-01T00:00:00.000Z",
  publishedAt: null,
  updatedAt: null,
  madeFor: null,
  goodFor: null,
  texture: null,
  familyId: null,
  familySlug: null,
  familyDisplayName: null,
  familyOptionLabel: null,
  familySortOrder: null,
  familyIsEntry: null,
};

const waitlistProduct: AlgoliaProductRecord = {
  ...comingSoonProduct,
  objectID: "mineral-guard",
  productId: "mineral-guard",
  slug: "mineral-guard",
  displayName: "Mineral Guard",
  productType: "Mineral facial sunscreen",
  systemStepPosition: 6,
  systemStepName: "PROTECT",
  routineSort: 60,
  badge: "Waitlist",
  status: "waitlist",
  waitlist: true,
  variantCount: 0,
  variantNames: [],
};

describe("SearchResultCard", () => {
  it("routes coming-soon products to details without promising a waitlist", () => {
    render(<SearchResultCard hit={comingSoonProduct} />);

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText("View details")).toBeInTheDocument();
    expect(screen.queryByText("$28.00")).not.toBeInTheDocument();
    expect(document.querySelector(".search-result__price")).not.toBeInTheDocument();
    expect(screen.queryByText(/join the waitlist/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "LIFT — Eye treatment" }),
    ).toHaveAttribute("href", "/products/lift");
  });

  it("omits price when the search record has no Product Offer", () => {
    render(
      <SearchResultCard
        hit={{
          ...comingSoonProduct,
          variantCount: 0,
          variantNames: [],
          priceMin: 0,
          priceMax: 0,
        }}
      />,
    );

    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.getByText("View details")).toBeInTheDocument();
  });

  it("omits fabricated pricing for a zero-Offer Waitlist Product", () => {
    render(<SearchResultCard hit={waitlistProduct} />);

    expect(screen.getByText("Waitlist")).toBeInTheDocument();
    expect(screen.getByText("View details")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
