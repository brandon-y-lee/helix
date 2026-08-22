import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
  getCachedProductCards: vi.fn(),
}));

import AboutPage from "@/app/about/page";
import SystemPage from "@/app/system/page";
import {
  getCachedProductCards,
  getCachedProducts,
} from "@/lib/catalog-cache";
import { buildIngredientIndex } from "@/lib/content/system";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;
const mockedGetProductCards = getCachedProductCards as unknown as Mock;

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
      screen.getByRole("heading", { level: 1, name: "THREE STEPS. ONE BASELINE." }),
    ).toBeInTheDocument();
    const core = document.getElementById("system-core") as HTMLElement;
    const beyond = document.getElementById("system-beyond") as HTMLElement;
    expect(
      within(core).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Biotic Reset", "Peptide Bounce", "Ceramide Cushion"]);
    expect(
      within(beyond).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Balancing Prep",
      "Peptide Eye Cream",
      "Mineral Guard",
      "Peptide Nourish Mask",
    ]);
    expect(document.querySelector('input[type="range"]')).not.toBeInTheDocument();
    expect(document.querySelector(".method-flow")?.lastElementChild).toHaveAttribute(
      "id",
      "system-ingredients",
    );
    expect(document.body.textContent ?? "").not.toMatch(FORMER_BRAND_PATTERN);
  });

  it("numbers only the three-step Core and preserves legacy anchors", async () => {
    render(await SystemPage());

    expect(
      Array.from(document.querySelectorAll(".method-core-card")).map((card) =>
        card.getAttribute("data-display-number"),
      ),
    ).toEqual(["01", "02", "03"]);
    expect(document.getElementById("system-routine")).toBeInTheDocument();
    expect(document.getElementById("method-routine")).toBeInTheDocument();
    expect(document.getElementById("step-reset")).toBeInTheDocument();
    expect(document.getElementById("method-lift")).toBeInTheDocument();
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
    expect(document.getElementById("step-lift")).toBeInTheDocument();
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
