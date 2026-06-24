import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
}));

import HomePage from "@/app/page";
import { CartProvider } from "@/components/CartProvider";
import { getCachedProducts } from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;

function makeProduct(
  slug: string,
  displayName: string,
  routineOrder: number,
  price = 2000,
): Product {
  return {
    id: `${slug}-id`,
    slug,
    displayName,
    formalTitle: `${displayName} Method Product`,
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
    benefits: ["Supports a consistent routine"],
    howToUse: "Use as directed.",
    editorialHowToUse: "Use as directed.",
    formulaNotes: [],
    variants: [
      {
        id: "default",
        label: "Default",
        price,
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
    keyIngredients: [],
    ingredients: null,
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
    createdAt: `2026-06-1${routineOrder}T00:00:00.000Z`,
  };
}

const fixtures = [
  makeProduct("reset-01-calming-gel-cleanser", "RESET", 1, 2200),
  makeProduct("refine-02-pore-treatment-pads", "REFINE", 2, 1700),
  makeProduct("recode-03-pdrn-5-ampoule", "RECODE", 3, 2500),
  makeProduct("frame-04-pdrn-eye-cream", "FRAME", 4, 2300),
  makeProduct("seal-05-green-collagen-cream", "SEAL", 5, 2600),
  makeProduct("lift-06-pdrn-mask-system", "LIFT", 7, 4500),
];

function sectionForHeading(name: string) {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(fixtures);
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

describe("homepage Method merchandising presets", () => {
  it("removes collection chips and uses the shared three- and four-step Method presets", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(screen.queryByRole("heading", { name: "Shop by collection" })).not.toBeInTheDocument();
    expect(document.querySelector(".collection-chips")).toBeNull();

    const featured = sectionForHeading("Featured");
    expect(
      Array.from(featured.querySelectorAll(".product-card__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["RESET", "RECODE", "SEAL"]);
    expect(within(featured).getByRole("button", { name: "Open quick buy for RESET" }))
      .toBeInTheDocument();
    expect(within(featured).getByRole("button", { name: "Open quick buy for RECODE" }))
      .toBeInTheDocument();
    expect(within(featured).getByRole("button", { name: "Open quick buy for SEAL" }))
      .toBeInTheDocument();

    const routine = sectionForHeading("Build your daily routine");
    expect(
      Array.from(routine.querySelectorAll(".routine-step__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["RESET", "RECODE", "SEAL", "PROTECT"]);
    const methodCta = within(routine).getByRole("link", { name: "VIEW THE METHOD" });
    expect(methodCta).toHaveAttribute("href", "/method");
    expect(methodCta).toHaveClass("btn--editorial-rounded");
    expect(within(featured).getByRole("button", { name: "Open quick buy for RESET" }))
      .not.toHaveClass("btn--editorial-rounded");

    const protect = within(routine).getByRole("link", {
      name: "View PROTECT Method step, coming soon",
    });
    expect(protect).toHaveAttribute("href", "/method#step-protect");
    expect(within(protect).getByText("COMING SOON")).toBeInTheDocument();
    expect(within(protect).getByText("Final morning SPF step")).toBeInTheDocument();
    expect(within(protect).queryByRole("button")).not.toBeInTheDocument();
    expect(within(protect).queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(protect.getAttribute("href")).not.toContain("/products/");
  });

  it("does not substitute unrelated products when a required Method preset product is missing", async () => {
    mockedGetProducts.mockResolvedValue(
      fixtures.filter((product) => product.slug !== "seal-05-green-collagen-cream"),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    const featured = sectionForHeading("Featured");
    expect(
      Array.from(featured.querySelectorAll(".product-card__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["RESET", "RECODE"]);
    expect(within(featured).queryByText("REFINE")).not.toBeInTheDocument();
    expect(within(featured).queryByText("FRAME")).not.toBeInTheDocument();

    const routine = sectionForHeading("Build your daily routine");
    expect(
      Array.from(routine.querySelectorAll(".routine-step__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["RESET", "RECODE", "PROTECT"]);
  });
});
