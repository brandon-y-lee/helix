import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductCards: vi.fn(),
  getCachedIngredientIndexProducts: vi.fn(),
}));

import HomePage from "@/app/page";
import { CartProvider } from "@/components/CartProvider";
import {
  getCachedIngredientIndexProducts,
  getCachedProductCards,
} from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProductCards as unknown as Mock;
const mockedGetIngredientProducts =
  getCachedIngredientIndexProducts as unknown as Mock;

const ingredientsBySlug: Record<string, string[]> = {
  "treat-03-pdrn-5-ampoule": [
    "Sodium DNA (50,000 ppm)",
    "Niacinamide",
    "Copper Tripeptide-1",
  ],
};

function makeProduct(
  slug: string,
  displayName: string,
  routineOrder: number,
): Product {
  const keyIngredients = ingredientsBySlug[slug] ?? [];

  return {
    id: `${slug}-id`,
    slug,
    displayName,
    formalTitle: `${displayName} System Product`,
    name: displayName,
    tagline: `${displayName} tagline`,
    cardTagline: `${displayName} card tagline`,
    collection: "THE SYSTEM",
    actionName: displayName,
    routineNumber: String(routineOrder).padStart(2, "0"),
    subtitle: `${displayName} subtitle`,
    descriptor: `${displayName} descriptor`,
    productType: "Treatment",
    badge: null,
    currency: "USD",
    featuredRank: routineOrder,
    sortOrder: routineOrder,
    blurb: `${displayName} blurb`,
    description: `${displayName} description`,
    editorialDescription: `${displayName} description`,
    benefits: [],
    howToUse: "Use as directed.",
    editorialHowToUse: "Use as directed.",
    formulaNotes: [],
    variants: [
      {
        id: "default",
        label: "Default",
        price: 2000,
        compareAtPrice: null,
        sku: null,
        available: true,
        inventoryStatus: "in_stock",
        volume: "50 mL",
        packCount: null,
        optionValues: { size: "50 mL" },
        sortOrder: 0,
      },
    ],
    swatch: ["#dce8df", "#7e9285"],
    media: [],
    cardMedia: null,
    cardHoverMedia: null,
    heroMedia: null,
    detailMedia: null,
    cartMedia: null,
    searchMedia: null,
    status: "available",
    catalogStatus: "active",
    madeFor: "All skin types",
    goodFor: "Routine",
    texture: "Light",
    keyIngredients,
    ingredients: keyIngredients.join(", ") || null,
    productDetails: {},
    cautions: [],
    finish: null,
    volume: "50 mL",
    skinTypes: [],
    concerns: [],
    routineStep: "Routine",
    routineOrder,
    usageTime: ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
}

const fixtures = [
  makeProduct("cleanse-01-calming-gel-cleanser", "CLEANSE", 1),
  makeProduct("refine-02-pore-treatment-pads", "REFINE", 2),
  makeProduct("treat-03-pdrn-5-ampoule", "TREAT", 3),
  makeProduct("frame-04-pdrn-eye-cream", "FRAME", 4),
  makeProduct("seal-05-green-collagen-cream", "SEAL", 5),
  makeProduct("lift-06-pdrn-mask-system", "LIFT", 7),
];

function sectionForHeading(name: string) {
  const section = screen.getByRole("heading", { name }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function productDestinations(section: HTMLElement) {
  return Array.from(
    new Set(
      within(section)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => href?.startsWith("/products/") ?? false),
    ),
  );
}

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(fixtures);
  mockedGetIngredientProducts.mockReset();
  mockedGetIngredientProducts.mockResolvedValue(fixtures);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ lines: [], count: 0, subtotal: 0, currency: "USD" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
});

describe("homepage product wiring", () => {
  it("selects Core and Beyond products in canonical order without merchandising PROTECT", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/cleanse-01-calming-gel-cleanser",
      "/products/treat-03-pdrn-5-ampoule",
      "/products/seal-05-green-collagen-cream",
    ]);
    expect(productDestinations(sectionForHeading("Beyond The Core"))).toEqual([
      "/products/refine-02-pore-treatment-pads",
      "/products/frame-04-pdrn-eye-cream",
      "/products/lift-06-pdrn-mask-system",
    ]);
    expect(screen.queryByRole("button", { name: /PROTECT/i })).not.toBeInTheDocument();
  });

  it("links homepage ingredient previews to their canonical System anchors", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    const ingredients = sectionForHeading("Know what you are using.");
    expect(
      within(ingredients).getByRole("link", {
        name: "Read about PDRN in the System",
      }),
    ).toHaveAttribute("href", "/system#system-ingredient-pdrn");
    expect(
      within(ingredients).getByRole("link", {
        name: "Read about Peptides in the System",
      }),
    ).toHaveAttribute("href", "/system#system-ingredient-peptides");
    expect(
      within(ingredients).getByRole("link", {
        name: "Read about Niacinamide in the System",
      }),
    ).toHaveAttribute("href", "/system#system-ingredient-niacinamide");
  });

  it("does not substitute unrelated products when a required Core product is missing", async () => {
    mockedGetProducts.mockResolvedValue(
      fixtures.filter((product) => product.slug !== "seal-05-green-collagen-cream"),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/cleanse-01-calming-gel-cleanser",
      "/products/treat-03-pdrn-5-ampoule",
    ]);
  });
});
