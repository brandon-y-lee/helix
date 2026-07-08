import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
}));

import HomePage from "@/app/page";
import { CartProvider } from "@/components/CartProvider";
import { getCachedProducts } from "@/lib/catalog-cache";
import {
  homeBeyondCoreDescriptions,
  homeCoreDescriptions,
  homeThreePrinciples,
} from "@/lib/content/home";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;

const ingredientsBySlug: Record<string, string[]> = {
  "cleanse-01-calming-gel-cleanser": ["6-Type Cica Complex", "Centella-derived support"],
  "refine-02-pore-treatment-pads": ["Panthenol", "Sodium hyaluronate", "LHA"],
  "treat-03-pdrn-5-ampoule": [
    "Sodium DNA (50,000 ppm)",
    "Niacinamide",
    "Copper Tripeptide-1",
    "Hexapeptide-9",
    "Glycerin",
  ],
  "frame-04-pdrn-eye-cream": [
    "Sodium DNA",
    "Niacinamide",
    "Panthenol",
    "Acetyl Tetrapeptide-5",
  ],
  "seal-05-green-collagen-cream": [
    "Green collagen complex",
    "Sodium hyaluronate",
    "Panthenol",
    "Niacinamide",
  ],
  "lift-06-pdrn-mask-system": [
    "Sodium DNA (5,000 ppm)",
    "Niacinamide",
    "7-Molecular Weight Collagen",
    "Glycerin",
  ],
};

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
    keyIngredients: ingredientsBySlug[slug] ?? ["Niacinamide", "Glycerin", "Panthenol"],
    ingredients: (ingredientsBySlug[slug] ?? ["Niacinamide", "Glycerin", "Panthenol"]).join(", "),
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
    const user = userEvent.setup();

    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your skin starts with three steps.",
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
    expect(homeCoreDescriptions.default).toBe("Simple by design. For all skin types.");
    expect(Object.keys(homeCoreDescriptions.items)).toEqual(["cleanse", "treat", "seal"]);
    expect(
      within(core).getByText(homeCoreDescriptions.default),
    ).toBeInTheDocument();
    for (const description of Object.values(homeCoreDescriptions.items)) {
      expect(within(core).queryByText(description)).not.toBeInTheDocument();
    }
    expect(
      within(core).queryByText(
        "Simple by design: cleanse the surface, apply the treatment layer, then finish with moisture and barrier support.",
      ),
    ).not.toBeInTheDocument();
    expect(core.querySelector(".home-core-progress")).not.toBeInTheDocument();
    expect(core.querySelector(".home-core-progress-shell")).not.toBeInTheDocument();
    expect(core.querySelector(".home-core-progress__rail")).not.toBeInTheDocument();
    expect(core.querySelector(".home-core-progress__step-number")).not.toBeInTheDocument();
    expect(core.querySelector(".home-core-progress__mini-description")).not.toBeInTheDocument();
    expect(core.querySelector("[data-core-active]")).not.toBeInTheDocument();
    expect(core.querySelector("[data-core-step]")).not.toBeInTheDocument();
    expect(within(core).queryByText("cleanse the surface")).not.toBeInTheDocument();
    expect(within(core).queryByText("apply the treatment layer")).not.toBeInTheDocument();
    expect(
      within(core).queryByText("finish with moisture and barrier support"),
    ).not.toBeInTheDocument();

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

    const coreSurfaces = Array.from(
      core.querySelectorAll<HTMLElement>(".product-card__surface"),
    );
    expect(coreSurfaces).toHaveLength(3);
    fireEvent.pointerEnter(coreSurfaces[0], { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.items.cleanse)).toBeInTheDocument(),
    );
    expect(within(core).queryByText(homeCoreDescriptions.default)).not.toBeInTheDocument();
    fireEvent.pointerLeave(coreSurfaces[0], { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.default)).toBeInTheDocument(),
    );

    const treatLink = within(core).getByRole("link", { name: "TREAT" });
    fireEvent.focus(treatLink);
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.items.treat)).toBeInTheDocument(),
    );
    fireEvent.blur(treatLink, { relatedTarget: document.body });
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.default)).toBeInTheDocument(),
    );

    const sealQuickBuy = within(core).getByRole("button", {
      name: "Open quick buy for SEAL",
    });
    fireEvent.focus(sealQuickBuy);
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.items.seal)).toBeInTheDocument(),
    );
    fireEvent.blur(sealQuickBuy, { relatedTarget: document.body });
    await waitFor(() =>
      expect(within(core).getByText(homeCoreDescriptions.default)).toBeInTheDocument(),
    );

    const why = sectionForHeading(new RegExp(homeThreePrinciples[0].titleLines.join("\\s+"), "i"));
    const whyTitle = why.querySelector("#home-three-principles-heading");
    expect(whyTitle).toHaveClass("home-plug-panel__title");
    expect(whyTitle).toHaveClass("home-three-principles__title");
    expect(whyTitle).toHaveTextContent(homeThreePrinciples[0].titleLines.join(" "));
    expect(why.querySelector(".home-three-principles-visual__title")).not.toBeInTheDocument();
    expect(
      why.querySelector(".home-three-principles-panel #home-three-principles-heading")?.textContent
        ?.replace(/\s+/g, " ")
        .trim(),
    ).toBe(homeThreePrinciples[0].titleLines.join(" "));
    expect(why.querySelector(".home-why-list")).not.toBeInTheDocument();
    expect(why.querySelector(".home-three-principles")).toBeInTheDocument();
    expect(why.querySelector(".home-three-principles a")).not.toBeInTheDocument();
    expect(
      within(why).queryByText(
        "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(why).queryByText(
        "02 Use high-performing, innovative ingredients at efficacious levels in your essential layers.",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(why).queryByText(
        "03 Most routines fail because they ask for too much too soon. Three steps build consistency.",
      ),
    ).not.toBeInTheDocument();
    const principleGroup = within(why).getByRole("group", {
      name: "Mei Pelle principles",
    });
    const principleButtons = within(principleGroup).getAllByRole("button");
    expect(principleButtons.map((button) => button.textContent?.trim())).toEqual(
      homeThreePrinciples.map((principle) => principle.label),
    );
    expect(principleButtons.map((button) => button.getAttribute("href"))).toEqual([
      null,
      null,
      null,
    ]);
    expect(principleButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(principleButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(principleButtons[2]).toHaveAttribute("aria-pressed", "false");
    expect(within(why).getByText(homeThreePrinciples[0].description)).toBeInTheDocument();

    fireEvent.pointerEnter(principleButtons[1], { pointerType: "mouse" });
    expect(principleButtons[1]).toHaveAttribute("aria-pressed", "true");
    expect(whyTitle).toHaveTextContent(homeThreePrinciples[1].titleLines.join(" "));
    expect(within(why).getByText(homeThreePrinciples[1].description)).toBeInTheDocument();

    fireEvent.focus(principleButtons[2]);
    expect(principleButtons[2]).toHaveAttribute("aria-pressed", "true");
    expect(whyTitle).toHaveTextContent(homeThreePrinciples[2].titleLines.join(" "));
    expect(within(why).getByText(homeThreePrinciples[2].description)).toBeInTheDocument();

    const beforeClickUrl = window.location.href;
    await user.click(principleButtons[0]);
    expect(window.location.href).toBe(beforeClickUrl);
    expect(principleButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(whyTitle).toHaveTextContent(homeThreePrinciples[0].titleLines.join(" "));
    expect(within(why).getByText(homeThreePrinciples[0].description)).toBeInTheDocument();

    expect(why.querySelector(".home-three-principles-visual__zoom")).toBeInTheDocument();
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
        /The Core is designed to work as a full routine\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(plug).getByText(
        /Or simply upgrade the layer your current routine is missing or underperforming in\./,
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

    const beyond = sectionForHeading("Beyond The Core");
    expect(homeBeyondCoreDescriptions.default).toBe(
      "For when your skin has a high baseline. Add what you need.",
    );
    expect(Object.keys(homeBeyondCoreDescriptions.items)).toEqual([
      "refine",
      "frame",
      "protect",
      "lift",
    ]);
    expect(
      within(beyond).getByText(homeBeyondCoreDescriptions.default),
    ).toBeInTheDocument();
    for (const description of Object.values(homeBeyondCoreDescriptions.items)) {
      expect(within(beyond).queryByText(description)).not.toBeInTheDocument();
    }
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

    const refine = within(beyond).getByRole("link", {
      name: "View REFINE, texture / controlled refinement",
    });
    fireEvent.pointerEnter(refine, { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.items.refine))
        .toBeInTheDocument(),
    );
    expect(within(beyond).queryByText(homeBeyondCoreDescriptions.default)).not.toBeInTheDocument();
    fireEvent.pointerLeave(refine, { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.default)).toBeInTheDocument(),
    );

    const frame = within(beyond).getByRole("link", {
      name: "View FRAME, eye area / rested-looking frame",
    });
    fireEvent.focus(frame);
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.items.frame))
        .toBeInTheDocument(),
    );
    fireEvent.blur(frame, { relatedTarget: document.body });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.default)).toBeInTheDocument(),
    );

    fireEvent.pointerEnter(protect, { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.items.protect))
        .toBeInTheDocument(),
    );
    fireEvent.pointerLeave(protect, { pointerType: "mouse" });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.default)).toBeInTheDocument(),
    );

    const lift = within(beyond).getByRole("link", {
      name: "View LIFT, weekly intensive",
    });
    fireEvent.focus(lift);
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.items.lift))
        .toBeInTheDocument(),
    );
    fireEvent.blur(lift, { relatedTarget: document.body });
    await waitFor(() =>
      expect(within(beyond).getByText(homeBeyondCoreDescriptions.default)).toBeInTheDocument(),
    );

    const ingredients = sectionForHeading("Know what you are using.");
    const ingredientLinks = [
      ["Read about PDRN in the System", "/system#system-ingredient-pdrn"],
      ["Read about Peptides in the System", "/system#system-ingredient-peptides"],
      ["Read about Niacinamide in the System", "/system#system-ingredient-niacinamide"],
    ] as const;

    for (const [name, href] of ingredientLinks) {
      const link = within(ingredients).getByRole("link", { name });
      expect(link).toHaveClass("home-ingredient-card");
      expect(link).toHaveAttribute("href", href);
      expect(link.getAttribute("href")).not.toContain("/method");
    }

    const final = sectionForHeading("Invest in your skin's future.");
    expect(
      within(final).getByText("Three steps, one order, repeatable morning or night."),
    ).toBeInTheDocument();
    expect(within(final).getByRole("link", { name: "SHOP THE CORE" })).toHaveAttribute(
      "href",
      "#core-three",
    );
    expect(within(final).getByRole("link", { name: "SEE THE SYSTEM" })).toHaveAttribute(
      "href",
      "/system",
    );
    expect(final.querySelector(".home-final-media__poster")).toBeInTheDocument();
    await waitFor(() =>
      expect(final.querySelector(".home-final-media__video source")).toHaveAttribute(
        "src",
        "/media/home/final-cta-loop.mp4",
      ),
    );

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
