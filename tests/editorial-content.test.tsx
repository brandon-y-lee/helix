import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
}));

import AboutPage from "@/app/about/page";
import MethodPage from "@/app/system/page";
import { getCachedProducts } from "@/lib/catalog-cache";
import {
  METHOD_PRODUCT_SLUGS,
  METHOD_STEP_CONFIGS,
  PROTECT_STEP,
  ROUTINE_GROUPS,
  ROUTINE_STEP_COUNTS,
  buildIngredientIndex,
  deriveMethodRoutineSteps,
  formulaFocus,
  getMethodProductState,
  routineTimingEntriesForGroup,
} from "@/lib/content/system";
import type { Product } from "@/lib/products";
import type { SystemStepName } from "@/lib/catalog/system-steps";

const mockedGetProducts = getCachedProducts as unknown as Mock;

const nameBySlug: Record<string, string> = {
  "biotic-reset": "Biotic Reset",
  "balancing-prep": "Balancing Prep",
  "peptide-bounce": "Peptide Bounce",
  "frame-04-pdrn-eye-cream": "FRAME",
  "ceramide-cushion": "Ceramide Cushion",
  "lift-06-pdrn-mask-system": "LIFT",
};

const systemStepBySlug: Record<string, SystemStepName> = {
  "biotic-reset": "CLEANSE",
  "balancing-prep": "REFINE",
  "peptide-bounce": "TREAT",
  "frame-04-pdrn-eye-cream": "FRAME",
  "ceramide-cushion": "SEAL",
  "lift-06-pdrn-mask-system": "LIFT",
};

const ingredientsBySlug: Record<string, string[]> = {
  "biotic-reset": ["6-Type Cica Complex"],
  "balancing-prep": ["Panthenol", "Hyaluronic Acid"],
  "peptide-bounce": [
    "Sodium DNA (50,000 ppm)",
    "Niacinamide",
    "Copper Tripeptide-1",
  ],
  "frame-04-pdrn-eye-cream": ["Sodium DNA", "Acetyl Tetrapeptide-5"],
  "ceramide-cushion": ["Ceramide AP", "Panthenol"],
  "lift-06-pdrn-mask-system": ["Sodium DNA (5,000 ppm)", "Niacinamide"],
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

function makeProduct(slug: string, overrides: Partial<Product> = {}): Product {
  const displayName = nameBySlug[slug] ?? "PRODUCT";
  const systemStepName = systemStepBySlug[slug] ?? "CLEANSE";
  const routineNumber = slug === "lift-06-pdrn-mask-system"
    ? "07"
    : slug.match(/-(\d{2})-/)?.[1] ?? null;
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
    routineSort: Number(routineNumber ?? 0) * 10,
    productType: "Treatment",
    badge: null,
    currency: "USD",
    sortOrder: Number(routineNumber ?? 0),
    description: "A product description.",
    benefits: [],
    howToUse: "Use as directed.",
    formulaNotes: [],
    variants: [
      {
        id: "default",
        label: "Default",
        price: 2200,
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
    usageTime: slug.includes("lift") ? ["Weekly", "PM"] : ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

const methodFixtures = METHOD_PRODUCT_SLUGS.map((slug) => makeProduct(slug));

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

function selectedStepIds(count: number) {
  return deriveMethodRoutineSteps([], count).map((step) => step.id);
}

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(methodFixtures);
});

describe("System content architecture", () => {
  it("renders helix casing across the public System journey", async () => {
    render(await MethodPage());
    const pageText = document.body.textContent ?? "";

    expect(screen.getByText("helix")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About helix" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(pageText).toContain("A helix sunscreen is in development.");
    expect(pageText).not.toMatch(/Mei Pelle/i);
  });

  it("keeps the canonical 01-07 sequence and reports missing catalog records", () => {
    expect(
      METHOD_STEP_CONFIGS.map((step) => [
        step.id,
        step.canonicalPosition,
        step.kind,
      ]),
    ).toEqual([
      ["cleanse", 1, "product"],
      ["refine", 2, "product"],
      ["treat", 3, "product"],
      ["frame", 4, "product"],
      ["seal", 5, "product"],
      ["protect", 6, "protect"],
      ["lift", 7, "product"],
    ]);
    expect(PROTECT_STEP.number).toBe("06");

    const state = getMethodProductState(
      methodFixtures.filter(
        (product) => product.slug !== "ceramide-cushion",
      ),
    );
    expect(state.methodProducts.map((product) => product.slug)).toEqual(
      METHOD_PRODUCT_SLUGS.filter(
        (slug) => slug !== "ceramide-cushion",
      ),
    );
    expect(state.missingSlugs).toEqual(["ceramide-cushion"]);
  });

  it("derives the exact monotonic 3-7 System ladder without mutating catalog metadata", () => {
    const expectedIds = {
      3: ["cleanse", "treat", "seal"],
      4: ["cleanse", "treat", "seal", "protect"],
      5: ["cleanse", "refine", "treat", "seal", "protect"],
      6: ["cleanse", "refine", "treat", "frame", "seal", "protect"],
      7: ["cleanse", "refine", "treat", "frame", "seal", "protect", "lift"],
    } as const;
    const metadataBefore = methodFixtures.map(
      ({ slug, routineGroup, systemStepPosition, routineSort }) => ({
        slug,
        routineGroup,
        systemStepPosition,
        routineSort,
      }),
    );

    for (const count of ROUTINE_STEP_COUNTS) {
      const steps = deriveMethodRoutineSteps(methodFixtures, count);
      expect(steps.map((step) => step.id)).toEqual(expectedIds[count]);
      expect(selectedStepIds(count)).toEqual(expectedIds[count]);
      expect(steps.map((step) => step.displayNumber)).toEqual(
        steps.map((_, index) => String(index + 1).padStart(2, "0")),
      );
    }

    for (let index = 1; index < ROUTINE_STEP_COUNTS.length; index += 1) {
      const previous = new Set(
        selectedStepIds(ROUTINE_STEP_COUNTS[index - 1]),
      );
      const next = new Set(selectedStepIds(ROUTINE_STEP_COUNTS[index]));
      expect([...previous].every((id) => next.has(id))).toBe(true);
      expect(next.size).toBeGreaterThan(previous.size);
    }

    expect(
      methodFixtures.map(({ slug, routineGroup, systemStepPosition, routineSort }) => ({
        slug,
        routineGroup,
        systemStepPosition,
        routineSort,
      })),
    ).toEqual(metadataBefore);
  });

  it("groups selected steps into AM, PM, and weekly timing without inventing formula data", () => {
    const coreSteps = deriveMethodRoutineSteps(methodFixtures, 3);
    expect(
      routineTimingEntriesForGroup(ROUTINE_GROUPS[0], coreSteps).map(
        (entry) => entry.label,
      ),
    ).toEqual(["Biotic Reset", "Peptide Bounce", "Ceramide Cushion"]);
    expect(
      routineTimingEntriesForGroup(ROUTINE_GROUPS[1], coreSteps).map(
        (entry) => entry.label,
      ),
    ).toEqual(["Biotic Reset", "Peptide Bounce", "Ceramide Cushion"]);
    expect(routineTimingEntriesForGroup(ROUTINE_GROUPS[2], coreSteps)).toEqual([]);

    const fullSteps = deriveMethodRoutineSteps(methodFixtures, 7);
    expect(
      routineTimingEntriesForGroup(ROUTINE_GROUPS[0], fullSteps).at(-1),
    ).toMatchObject({ id: "protect", label: "PROTECT" });
    expect(
      routineTimingEntriesForGroup(ROUTINE_GROUPS[1], fullSteps).some(
        (entry) => entry.id === "protect",
      ),
    ).toBe(false);
    expect(
      routineTimingEntriesForGroup(ROUTINE_GROUPS[2], fullSteps).map(
        (entry) => entry.label,
      ),
    ).toEqual(["LIFT"]);
    const balancingEntries = [
      ...routineTimingEntriesForGroup(ROUTINE_GROUPS[0], fullSteps),
      ...routineTimingEntriesForGroup(ROUTINE_GROUPS[1], fullSteps),
    ].filter((entry) => entry.slug === "balancing-prep");
    expect(balancingEntries).toHaveLength(2);
    expect(balancingEntries.every((entry) => entry.note === "Use daily after cleansing."))
      .toBe(true);
    expect(
      formulaFocus(
        makeProduct("cleanse-01-calming-gel-cleanser", { keyIngredients: [] }),
      ),
    ).toEqual([]);
  });

  it("keeps ingredient science fields and claim-safety boundaries catalog-derived", () => {
    const cards = buildIngredientIndex(methodFixtures);
    expect(cards.map((card) => card.name)).toEqual(
      expect.arrayContaining(["PDRN / Sodium DNA", "Niacinamide", "Peptides"]),
    );
    expect(cards.map((card) => card.name)).not.toContain("Ceramides");
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

  it("renders PROTECT as an editorial coming-soon step with no commerce controls", async () => {
    render(await MethodPage());

    const protect = document.getElementById("system-protect");
    expect(protect).not.toBeNull();
    expect(
      within(protect as HTMLElement).getByRole("heading", {
        name: "06 PROTECT",
      }),
    ).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("COMING SOON")).toBeInTheDocument();
    expect(
      within(protect as HTMLElement).getByText(
        /No formula details are being claimed yet/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(protect as HTMLElement).queryByRole("button", {
        name: /add to cart/i,
      }),
    ).not.toBeInTheDocument();
    expect(within(protect as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(protect).not.toHaveTextContent(/\$\d|variant|inventory/i);
  });

  it("renders an incomplete-System state when a required product is missing", async () => {
    mockedGetProducts.mockResolvedValue(
      methodFixtures.filter(
        (product) => product.slug !== "lift-06-pdrn-mask-system",
      ),
    );

    render(await MethodPage());

    expect(screen.getByText("System catalog incomplete")).toBeInTheDocument();
    expect(screen.getAllByText(/lift-06-pdrn-mask-system/)).not.toHaveLength(0);
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
    expect(pageText).not.toMatch(/Mei Pelle/i);
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
