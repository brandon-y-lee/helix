import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
  getCachedProductCardEntryIds: vi.fn(),
}));

import AboutPage from "@/app/about/page";
import SystemPage from "@/app/system/page";
import {
  getCachedProductCardEntryIds,
  getCachedProducts,
} from "@/lib/catalog-cache";
import { buildIngredientIndex } from "@/lib/content/system";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;
const mockedGetProductCards = getCachedProductCardEntryIds as unknown as Mock;

const productDetails: Record<
  string,
  { name: string; step: SystemStepName; ingredients: string[] }
> = {
  "biotic-reset": {
    name: "Biotic Reset",
    step: "CLEANSE",
    ingredients: ["6-Type Cica Complex"],
  },
  "balancing-prep": {
    name: "Balancing Prep",
    step: "REFINE",
    ingredients: ["Panthenol", "Hyaluronic Acid"],
  },
  "peptide-bounce": {
    name: "Peptide Bounce",
    step: "TREAT",
    ingredients: ["Sodium DNA (50,000 ppm)", "Niacinamide", "Copper Tripeptide-1"],
  },
  "peptide-eye-cream": {
    name: "Peptide Eye Cream",
    step: "FRAME",
    ingredients: ["Sodium DNA", "Acetyl Tetrapeptide-5"],
  },
  "ceramide-cushion": {
    name: "Ceramide Cushion",
    step: "SEAL",
    ingredients: ["Ceramide AP", "Panthenol"],
  },
  "mineral-guard": {
    name: "Mineral Guard",
    step: "PROTECT",
    ingredients: [],
  },
  "peptide-nourish-mask": {
    name: "Peptide Nourish Mask",
    step: "LIFT",
    ingredients: ["Sodium DNA (5,000 ppm)", "Niacinamide"],
  },
};

const stepPosition: Record<SystemStepName, number> = {
  CLEANSE: 1,
  REFINE: 2,
  TREAT: 3,
  FRAME: 4,
  SEAL: 5,
  PROTECT: 6,
  LIFT: 7,
};

function makeProduct(slug: string, overrides: Partial<Product> = {}): Product {
  const details = productDetails[slug];
  const position = stepPosition[details.step];
  const isCore = ["CLEANSE", "TREAT", "SEAL"].includes(details.step);
  return {
    id: `${slug}-id`,
    slug,
    displayName: details.name,
    productType: details.step === "PROTECT" ? "Mineral facial sunscreen" : "Treatment",
    routineGroup: isCore ? "core" : "beyond_core",
    systemStepName: details.step,
    systemStepPosition: position,
    routineSort: position * 10,
    badge: null,
    currency: "USD",
    sortOrder: position,
    description: "A catalog-authored product description.",
    benefits: [],
    howToUse: "Use as directed.",
    formulaNotes: [],
    variants: [
      {
        id: `${slug}-default`,
        label: "Default",
        price: 2200,
        compareAtPrice: null,
        sku: null,
        available: details.step !== "PROTECT",
        inventoryStatus: details.step === "PROTECT" ? "unavailable" : "in_stock",
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
    status: details.step === "PROTECT" ? "waitlist" : "available",
    catalogStatus: "active",
    madeFor: "All skin types",
    goodFor: "Routine",
    texture: "Light",
    keyIngredients: details.ingredients,
    ingredients: details.ingredients.join(", ") || null,
    cautions: [],
    finish: null,
    volume: "50 mL",
    skinTypes: [],
    concerns: [],
    usageTime: details.step === "LIFT" ? ["Weekly", "PM"] : ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

const systemFixtures = Object.keys(productDetails).map((slug) => makeProduct(slug));

const FORBIDDEN_ABOUT_PATTERNS = [
  "founder",
  "advisor",
  "advisory board",
  "certified sustainable",
  "dermatologist developed",
  "clinical partner",
  "carbon neutral",
  "zero waste",
  "reef safe",
] as const;

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(systemFixtures);
  mockedGetProductCards.mockReset();
  mockedGetProductCards.mockResolvedValue(
    systemFixtures.map((product) => ({ id: product.id })),
  );
});

describe("System content architecture", () => {
  it("renders a fixed Core-first journey with Ingredient Literacy last", async () => {
    render(await SystemPage());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "a new philosophy on male skincare",
      }),
    ).toBeInTheDocument();
    const hero = document.querySelector(".method-hero") as HTMLElement;
    const heroImage = hero.querySelector("img");
    expect(heroImage).toHaveAttribute("alt", "");
    expect(heroImage?.getAttribute("src")).toContain(
      "a-new-philosophy-hero-01.webp",
    );
    expect(within(hero).queryByRole("link")).not.toBeInTheDocument();
    expect(hero.querySelector(".eyebrow")).not.toBeInTheDocument();
    expect(within(hero).queryByText(/Start with the Core/i)).not.toBeInTheDocument();
    expect(within(hero).queryByRole("link", { name: /three steps/i })).not.toBeInTheDocument();
    const core = document.getElementById("system-core") as HTMLElement;
    const beyond = document.getElementById("system-beyond") as HTMLElement;
    const ingredients = document.getElementById("system-ingredients") as HTMLElement;
    expect(
      within(core).getByRole("heading", {
        level: 2,
        name: "The essential baseline",
      }),
    ).toBeInTheDocument();
    expect(within(core).getAllByRole("tab")).toHaveLength(3);
    expect(document.querySelector(".method-index")).not.toBeInTheDocument();
    expect(core.querySelector('[data-helix-identity="symbol"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(beyond.querySelector('[data-helix-identity="symbol"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(ingredients.querySelector('[data-helix-identity="symbol"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      within(beyond).getByRole("heading", {
        level: 2,
        name: "Targeted steps",
      }),
    ).toBeInTheDocument();
    expect(
      within(ingredients).getByRole("heading", {
        level: 2,
        name: "Research-backed ingredients",
      }),
    ).toBeInTheDocument();
    expect(ingredients.querySelector(".ingredient-carousel")).toBeInTheDocument();
    expect(ingredients.querySelector(".ingredient-index")).not.toBeInTheDocument();
    expect(ingredients).not.toHaveTextContent("FORMULATION NOTE");
    expect(core).not.toHaveTextContent("A catalog-authored product description.");
    expect(core).toHaveTextContent(
      "The reset after a long day, a commute, or a workout. Work it into damp skin to take off sunscreen, sweat, and the day’s buildup, then rinse and move on with skin ready for the next step.",
    );
    expect(core).toHaveTextContent(
      "A nourishing layer for mornings and nights. Apply a few drops onto clean skin for lightweight hydration, a smoother finish, and long-term rejuvenation.",
    );
    expect(core).toHaveTextContent(
      "The last layer before you head out or turn in. Smooth it on to hold layers together with deep moisture, so skin feels supported wherever the rest of the day takes you.",
    );
    expect(beyond).toHaveTextContent(
      "Add prep, eye care, daily protection, or a weekly intensive.",
    );
    expect(within(beyond).queryByRole("link", { name: "Shop Beyond" })).not.toBeInTheDocument();
    expect(beyond).not.toHaveTextContent("View product");
    expect(
      within(core).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Biotic Reset"]);
    expect(
      within(beyond).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Balancing Prep",
      "Peptide Eye Cream",
      "Mineral Guard",
      "Peptide Nourish Mask",
    ]);
    expect(document.querySelector('input[type="range"]')).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(FORMER_BRAND_PATTERN);
  });

  it("numbers only the three-step Core and preserves legacy anchors", async () => {
    render(await SystemPage());

    const core = document.getElementById("system-core");
    expect(core).not.toBeNull();
    expect(
      within(core as HTMLElement)
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("data-display-number")),
    ).toEqual(["01", "02", "03"]);
    expect(document.getElementById("system-routine")).toBeInTheDocument();
    expect(document.getElementById("method-routine")).toBeInTheDocument();
    expect(document.getElementById("step-reset")).toBeInTheDocument();
    expect(document.getElementById("method-lift")).toBeInTheDocument();
  });

  it("places the intentional-skincare split between Core and Beyond", async () => {
    render(await SystemPage());

    const core = document.getElementById("system-core") as HTMLElement;
    const split = document.querySelector(".method-intentional") as HTMLElement;
    const beyond = document.getElementById("system-beyond") as HTMLElement;
    expect(
      within(split).getByRole("heading", {
        level: 2,
        name: "intentional skincare",
      }),
    ).toBeInTheDocument();
    expect(split).toHaveTextContent(
      "Helix is a line of curated skincare essentials. Formulated for a variety of skin types and needs with high performance ingredients, it’s a daily routine that nourishes your skin barrier over time.",
    );
    expect(split.querySelector(".editorial-hue-field--method")).toBeInTheDocument();
    expect(
      within(split).getByRole("heading", {
        level: 2,
        name: "intentional skincare",
      }),
    ).toHaveClass("method-intentional__heading");
    expect(
      core.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      split.compareDocumentPosition(beyond) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses the catalog-backed PROTECT product without invented formula claims", async () => {
    render(await SystemPage());

    const protect = document.getElementById("system-protect") as HTMLElement;
    expect(
      within(protect).getByRole("heading", { name: "Mineral Guard" }),
    ).toBeInTheDocument();
    expect(within(protect).getByText("Waitlist")).toBeInTheDocument();
    expect(within(protect).getByRole("link", { name: /view mineral guard/i })).toHaveAttribute(
      "href",
      "/products/mineral-guard",
    );
    expect(within(protect).getByRole("link", { name: /view mineral guard/i })).toHaveClass(
      "method-beyond-card__link",
    );
    expect(protect).not.toHaveTextContent(/formula focus|in development|UV filters/i);
  });

  it("renders an honest placeholder when a governed entry is unavailable", async () => {
    const available = systemFixtures.filter(
      (product) => product.slug !== "peptide-nourish-mask",
    );
    mockedGetProducts.mockResolvedValue(available);
    mockedGetProductCards.mockResolvedValue(available.map((product) => ({ id: product.id })));

    render(await SystemPage());

    expect(
      screen.getByRole("heading", { name: "LIFT currently unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No collection-facing Beyond entry is available for this step."),
    ).toBeInTheDocument();
    expect(document.getElementById("step-lift")).toBeInTheDocument();
  });

  it("keeps a missing Core step selectable without inventing a PDP", async () => {
    const products = systemFixtures.filter(
      (product) => product.slug !== "biotic-reset",
    );
    mockedGetProducts.mockResolvedValue(products);
    mockedGetProductCards.mockResolvedValue(
      products.map((product) => ({ id: product.id })),
    );

    render(await SystemPage());

    const cleanseTab = screen.getAllByRole("tab")[0];
    expect(cleanseTab).toHaveTextContent("CLEANSE currently unavailable");
    expect(cleanseTab).toHaveTextContent("Currently unavailable");
    const cleanse = screen.getByRole("tabpanel", { name: /CLEANSE/i });
    expect(
      within(cleanse).getByRole("heading", {
        name: "CLEANSE currently unavailable",
      }),
    ).toBeInTheDocument();
    expect(cleanse).toHaveTextContent(
      "No collection-facing Core entry is available for this step.",
    );
    expect(within(cleanse).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps ingredient science fields and claim-safety boundaries catalog-derived", () => {
    const cards = buildIngredientIndex(systemFixtures);
    expect(cards.map((card) => card.name)).toEqual(
      expect.arrayContaining(["PDRN / Sodium DNA", "Niacinamide", "Peptides"]),
    );
    expect(cards.find((card) => card.id === "pdrn")).toMatchObject({
      identity: expect.stringContaining("Polydeoxyribonucleotide"),
      ingredientClass: "Polynucleotide",
      mechanism: expect.any(String),
      skinRelevance: expect.any(String),
    });
    expect(JSON.stringify(cards)).not.toMatch(
      /DNA repair|tissue regeneration|wound healing|guaranteed collagen production/i,
    );
  });
});

describe("About claim safety", () => {
  it("presents the helix origin and motif without genetic implications", () => {
    render(<AboutPage />);
    const pageText = document.body.textContent ?? "";

    expect(pageText).toContain("SEOUL");
    expect(pageText).toContain("LOS ANGELES");
    expect(pageText).toMatch(
      /structure, renewal, and ingredient-literate formulation/i,
    );
    expect(pageText).toContain("Helix Motif");
    expect(pageText).not.toMatch(FORMER_BRAND_PATTERN);
    expect(pageText).not.toMatch(
      /genetic testing|genetic personalization|clinical genomics|DNA effects/i,
    );
  });

  it("does not publish fake founder, advisor, certification, or green claims", () => {
    render(<AboutPage />);
    const pageText = document.body.textContent?.toLowerCase() ?? "";

    for (const pattern of FORBIDDEN_ABOUT_PATTERNS) {
      expect(pageText).not.toContain(pattern);
    }
  });
});
