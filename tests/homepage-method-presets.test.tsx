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
    keyIngredients: ["Niacinamide", "Glycerin", "Panthenol"],
    ingredients: "Niacinamide, Glycerin, Panthenol",
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
  makeProduct("cleanse-01-calming-gel-cleanser", "CLEANSE", 1, 2200),
  makeProduct("refine-02-pore-treatment-pads", "REFINE", 2, 1700),
  makeProduct("treat-03-pdrn-5-ampoule", "TREAT", 3, 2500),
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

describe("homepage Core Three positioning", () => {
  it("renders the requested hero, Core Three products, add-ons, and editorial PROTECT step", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "It all starts with three steps.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cleanse. Treat. Seal.")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "SHOP THE CORE" })[0],
    ).toHaveAttribute("href", "#core-three");
    expect(
      screen.getAllByRole("link", { name: "SEE THE SYSTEM" })[0],
    ).toHaveAttribute("href", "/system");

    expect(
      screen.queryByRole("heading", { level: 2, name: "Cleanse, Treat, Seal." }),
    ).not.toBeInTheDocument();

    const core = sectionForHeading("The Core");
    expect(
      within(core).getByText(
        "Simple by design: cleanse the surface, apply the treatment layer, then finish with moisture and barrier support.",
      ),
    ).toBeInTheDocument();

    const coreStepCards = Array.from(core.querySelectorAll(".home-step-card"));
    expect(coreStepCards).toHaveLength(3);
    expect(
      coreStepCards.map((card) =>
        Array.from(card.children).map((element) => element.tagName),
      ),
    ).toEqual([
      ["H3", "P"],
      ["H3", "P"],
      ["H3", "P"],
    ]);
    expect(
      coreStepCards.map((card) =>
        within(card as HTMLElement).getByRole("heading", { level: 3 }).textContent?.trim(),
      ),
    ).toEqual(["CLEANSE", "TREAT", "SEAL"]);
    expect(
      coreStepCards.map((card) => card.querySelector("p")?.textContent?.trim()),
    ).toEqual([
      "cleans the surface before the rest of the routine.",
      "delivers the central treatment layer.",
      "finishes with moisture and barrier support.",
    ]);
    for (const card of coreStepCards) {
      expect(within(card as HTMLElement).queryByText(/Cleanser|Treatment Serum|Barrier Cream|—/))
        .not.toBeInTheDocument();
    }

    expect(
      Array.from(core.querySelectorAll(".product-card__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["CLEANSE", "TREAT", "SEAL"]);
    expect(within(core).getByRole("button", { name: "Open quick buy for CLEANSE" }))
      .toBeInTheDocument();
    expect(within(core).getByRole("button", { name: "Open quick buy for TREAT" }))
      .toBeInTheDocument();
    expect(within(core).getByRole("button", { name: "Open quick buy for SEAL" }))
      .toBeInTheDocument();

    const why = sectionForHeading("Why Three Works");
    expect(within(why).getByText("01 Start with structure skin understands."))
      .toBeInTheDocument();
    expect(
      within(why).getByText("02 Most routines fail because they ask for too much too soon."),
    ).toBeInTheDocument();
    expect(within(why).getByText("03 Three steps build consistency."))
      .toBeInTheDocument();
    expect(within(why).getByText("SIMPLE IS NOT BASIC")).toBeInTheDocument();
    const whyImage = within(why).getByAltText("Black-and-white editorial portrait.");
    const whyImageSrc = decodeURIComponent(whyImage.getAttribute("src") ?? "");
    expect(whyImageSrc).toContain("/media/home/why-three.webp");
    expect(whyImageSrc).not.toContain("/mnt/data");

    const support = sectionForHeading(
      "For skin that looks clearer, younger, more hydrated, and less tired by default.",
    );
    expect(within(support).getByText("What The Core Supports")).toBeInTheDocument();
    expect(
      within(support).getByRole("heading", { name: "Use all three. Or upgrade one layer." }),
    ).toBeInTheDocument();
    expect(
      Array.from(support.querySelectorAll(".hero__eyebrow")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["What The Core Supports", "Plug and Play"]);
    expect(
      screen.getByText("Appearance is maintenance. Start with the baseline."),
    ).toBeInTheDocument();

    const beyond = sectionForHeading("Add only what solves a real problem.");
    expect(
      within(beyond).getByText(
        "Once the core is stable, add only what solves a real problem.",
      ),
    ).toBeInTheDocument();
    expect(within(beyond).getByText("REFINE — texture / controlled refinement"))
      .toBeInTheDocument();
    expect(within(beyond).getByText("FRAME — eye area / rested-looking frame"))
      .toBeInTheDocument();
    expect(within(beyond).getByText("LIFT — weekly intensive")).toBeInTheDocument();

    const protect = within(beyond).getByRole("link", {
      name: "View PROTECT System step, coming soon",
    });
    expect(protect).toHaveAttribute("href", "/system#system-protect");
    expect(within(protect).getByText("COMING SOON")).toBeInTheDocument();
    expect(within(protect).getByText("SPF")).toBeInTheDocument();
    expect(within(protect).queryByRole("button")).not.toBeInTheDocument();
    expect(within(protect).queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(protect.getAttribute("href")).not.toContain("/products/");

    expect(
      screen.queryByText(/Mei-Pelle|MEI-PELLE/),
    ).not.toBeInTheDocument();
  });

  it("does not substitute unrelated products when a required Core Three product is missing", async () => {
    mockedGetProducts.mockResolvedValue(
      fixtures.filter((product) => product.slug !== "seal-05-green-collagen-cream"),
    );

    render(<CartProvider>{await HomePage()}</CartProvider>);

    const core = sectionForHeading("The Core");
    expect(
      Array.from(core.querySelectorAll(".product-card__name")).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(["CLEANSE", "TREAT"]);
    expect(within(core).queryByText("REFINE")).not.toBeInTheDocument();
    expect(within(core).queryByText("FRAME")).not.toBeInTheDocument();
  });
});
