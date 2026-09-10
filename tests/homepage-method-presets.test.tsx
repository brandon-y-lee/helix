import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductCards: vi.fn(),
  getCachedIngredientIndexProducts: vi.fn(),
}));

import HomePage from "@/app/page";
import { CartProvider } from "@/components/cart/CartProvider";
import {
  getCachedIngredientIndexProducts,
  getCachedProductCards,
} from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";
import { homeCoreDescriptions } from "@/lib/content/home";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

const mockedGetProducts = getCachedProductCards as unknown as Mock;
const mockedGetIngredientProducts =
  getCachedIngredientIndexProducts as unknown as Mock;

const ingredientsBySlug: Record<string, string[]> = {
  "peptide-bounce": [
    "Sodium DNA (50,000 ppm)",
    "Niacinamide",
    "Copper Tripeptide-1",
  ],
};

const systemPositionByName: Record<SystemStepName, number> = {
  CLEANSE: 1,
  REFINE: 2,
  TREAT: 3,
  FRAME: 4,
  SEAL: 5,
  PROTECT: 6,
  LIFT: 7,
};

function makeProduct(
  slug: string,
  displayName: string,
  systemStepName: SystemStepName,
  routineOrder: number,
): Product {
  const keyIngredients = ingredientsBySlug[slug] ?? [];

  return {
    id: `${slug}-id`,
    slug,
    displayName,
    routineGroup: ["CLEANSE", "TREAT", "SEAL"].includes(systemStepName)
      ? "core"
      : "beyond_core",
    systemStepPosition: systemPositionByName[systemStepName],
    systemStepName,
    routineSort: routineOrder * 10,
    productType: "Treatment",
    badge: null,
    currency: "USD",
    sortOrder: routineOrder,
    description: `${displayName} description`,
    benefits: [],
    howToUse: "Use as directed.",
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
    cautions: [],
    finish: null,
    volume: "50 mL",
    skinTypes: [],
    concerns: [],
    usageTime: ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
}

const fixtures = [
  makeProduct("biotic-reset", "Biotic Reset", "CLEANSE", 1),
  makeProduct("balancing-prep", "Balancing Prep", "REFINE", 2),
  makeProduct("peptide-bounce", "Peptide Bounce", "TREAT", 3),
  makeProduct("peptide-eye-cream", "Peptide Eye Cream", "FRAME", 4),
  makeProduct("ceramide-cushion", "Ceramide Cushion", "SEAL", 5),
  makeProduct("peptide-nourish-mask", "Peptide Nourish Mask", "LIFT", 7),
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
  it("uses the lowercase helix name in the editorial hero", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(screen.getByText("helix")).toHaveClass("home-video-hero__eyebrow");
    expect(document.body).not.toHaveTextContent(FORMER_BRAND_PATTERN);
  });

  it("selects Core and Beyond products in canonical order without merchandising PROTECT", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/biotic-reset",
      "/products/peptide-bounce",
      "/products/ceramide-cushion",
    ]);
    expect(productDestinations(sectionForHeading("Beyond The Core"))).toEqual([
      "/products/balancing-prep",
      "/products/peptide-eye-cream",
      "/products/peptide-nourish-mask",
    ]);
    expect(screen.queryByRole("button", { name: /PROTECT/i })).not.toBeInTheDocument();
  });

  it.each([
    ["maxxing-serum", "Maxxing Serum"],
    ["super-serum", "Super Serum"],
  ])("keeps the Core in order with TREAT named %s", async (slug, displayName) => {
    mockedGetProducts.mockResolvedValue(
      fixtures.map((product) =>
        product.slug === "peptide-bounce"
          ? { ...product, slug, displayName }
          : product,
      ),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/biotic-reset",
      `/products/${slug}`,
      "/products/ceramide-cushion",
    ]);
    expect(screen.getByRole("link", { name: displayName })).toHaveAttribute(
      "href",
      `/products/${slug}`,
    );
  });

  it("prefers Maxxing Serum over Peptide Bounce before Super Serum is published", async () => {
    mockedGetProducts.mockResolvedValue([
      ...fixtures,
      makeProduct("maxxing-serum", "Maxxing Serum", "TREAT", 3),
    ]);

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/biotic-reset",
      "/products/maxxing-serum",
      "/products/ceramide-cushion",
    ]);
    expect(
      screen.queryByRole("link", { name: "Peptide Bounce" }),
    ).not.toBeInTheDocument();
  });

  it("prefers Super Serum when all three TREAT names are present", async () => {
    mockedGetProducts.mockResolvedValue([
      ...fixtures,
      makeProduct("maxxing-serum", "Maxxing Serum", "TREAT", 3),
      makeProduct("super-serum", "Super Serum", "TREAT", 3),
    ]);

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/biotic-reset",
      "/products/super-serum",
      "/products/ceramide-cushion",
    ]);
    expect(screen.getByRole("link", { name: "Super Serum" })).toHaveAttribute(
      "href",
      "/products/super-serum",
    );
    expect(
      screen.queryByRole("link", { name: "Maxxing Serum" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Peptide Bounce" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["peptide-bounce", "Peptide Bounce"],
    ["maxxing-serum", "Maxxing Serum"],
    ["super-serum", "Super Serum"],
  ])("uses canonical TREAT media and preview copy for %s", async (slug, displayName) => {
    const product = makeProduct(slug, displayName, "TREAT", 3);
    product.cardMedia = {
      kind: "image",
      url: "/test/treat-canonical-hero.webp",
      alt: "Approved TREAT bottle hero",
      width: 1122,
      height: 1402,
      role: "card_default",
      sortOrder: 0,
      paletteId: null,
      palette: null,
    };
    product.cardHoverMedia = {
      ...product.cardMedia,
      url: "/test/treat-unchanged-portrait.webp",
      alt: "Existing TREAT portrait",
      role: "card_hover",
    };
    mockedGetProducts.mockResolvedValue(
      fixtures.map((item) =>
        item.slug === "peptide-bounce" ? product : item,
      ),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    const core = sectionForHeading("The Core");
    const hero = within(core).getByRole("img", {
      name: "Approved TREAT bottle hero",
    });
    expect(hero).toHaveAttribute(
      "src",
      expect.stringContaining("treat-canonical-hero.webp"),
    );
    expect(hero.closest(".product-card__image")).not.toHaveClass(
      "product-card__image--asset",
    );
    const surface = hero.closest("[data-product-card-media]");
    expect(surface).toHaveAttribute("data-product-card-media-layout", "full-bleed");
    expect(
      within(core).getByRole("img", { name: "Existing TREAT portrait" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("treat-unchanged-portrait.webp"),
    );
    expect(
      within(core).getByRole("img", { name: "Biotic Reset product bottle." }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("cleanse-product-card-default-01.webp"),
    );

    fireEvent.pointerEnter(surface!, { pointerType: "mouse" });
    await waitFor(() =>
      expect(core.querySelector(".home-phased-description")).toHaveTextContent(
        homeCoreDescriptions.items.treat,
      ),
    );
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
      fixtures.filter((product) => product.slug !== "ceramide-cushion"),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(productDestinations(sectionForHeading("The Core"))).toEqual([
      "/products/biotic-reset",
      "/products/peptide-bounce",
    ]);
  });

  it("publishes the approved System line on the Core education surface", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(sectionForHeading("The Core")).toHaveTextContent(
      "A simple daily system for skin that looks better now—and stays smooth, even, and resilient over time.",
    );
  });
});
