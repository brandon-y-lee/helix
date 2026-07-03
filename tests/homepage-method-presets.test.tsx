import { render, screen, waitFor, within } from "@testing-library/react";
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

function sectionForHeading(name: string | RegExp) {
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
        name: /^(It all starts|Better skin starts) with three steps\.$/,
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

    expect(core.querySelector(".home-step-grid")).not.toBeInTheDocument();
    expect(core.querySelector(".home-step-card")).not.toBeInTheDocument();

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

    const why = sectionForHeading(/simple is\s+not basic\.?/i);
    expect(within(why).getByText("01 Start with structure skin understands."))
      .toBeInTheDocument();
    expect(
      within(why).getByText("02 Most routines fail because they ask for too much too soon."),
    ).toBeInTheDocument();
    expect(within(why).getByText("03 Three steps build consistency."))
      .toBeInTheDocument();
    const whyTitle = why.querySelector("#why-three-heading");
    expect(whyTitle).toHaveClass("home-plug-panel__title");
    expect(whyTitle).toHaveTextContent(/simple is\s+not basic\.?/i);
    expect(why.querySelector(".home-why-visual__title")).not.toBeInTheDocument();
    expect(why.querySelector(".home-why-visual .home-why-title")).not.toBeInTheDocument();
    expect(
      why.querySelector(".home-why-principles #why-three-heading")?.textContent
        ?.replace(/\s+/g, " ")
        .trim(),
    ).toMatch(/^simple is not basic\.?$/i);
    expect(why.querySelector(".home-why-visual__zoom")).toBeInTheDocument();
    const whyImage = within(why).getByAltText("Black-and-white editorial portrait.");
    const whyImageSrc = decodeURIComponent(whyImage.getAttribute("src") ?? "");
    expect(whyImageSrc).toContain("/media/home/why-three.webp");
    expect(whyImageSrc).not.toContain("/_next/image");
    expect(whyImageSrc).not.toContain("/mnt/data");

    const plug = sectionForHeading("Plug and Play");
    expect(
      within(plug).getByText("For skin that is clearer, more hydrated, and less tired."),
    ).toBeInTheDocument();
    expect(
      within(plug).getByText(
        /The Core is designed to work as a full routine, but it does not need to replace yours\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(plug).getByText(
        /Upgrade the layer your current routine is missing or underperforming in\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(plug).getByRole("link", { name: "Explore The Core" }),
    ).toHaveAttribute("href", "#core-three");
    expect(plug.querySelector(".home-plug-media__poster")).toBeInTheDocument();
    await waitFor(() =>
      expect(plug.querySelector(".home-plug-media__video source")).toHaveAttribute(
        "src",
        "/media/home/plug-and-play-loop.mp4",
      ),
    );
    expect(within(plug).queryByText("What The Core Supports")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Appearance is maintenance. Start with the baseline."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Use all three. Or upgrade one layer." }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name:
          "For skin that looks clearer, younger, more hydrated, and less tired by default.",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("For skin that is clearer, more hydrated, and less tired."),
    ).toBeInTheDocument();

    const beyond = sectionForHeading(
      /^(Add only (what solves a real problem|what you need)\.|Add what you need\.|For when the core is stable\.)$/i,
    );
    expect(
      within(beyond).getByText(
        /^(Once the core is stable, add only what solves a real problem\.|For when the core is stable\.|Add only what you need\.)$/,
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
