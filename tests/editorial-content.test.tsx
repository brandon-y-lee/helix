import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProducts: vi.fn(),
}));

import AboutPage from "@/app/about/page";
import MethodPage from "@/app/method/page";
import {
  METHOD_PRODUCT_NUMBERS,
  METHOD_PRODUCT_SLUGS,
  METHOD_STEP_CONFIGS,
  PROTECT_STEP,
  ROUTINE_GROUPS,
  ROUTINE_PRESET_COPY,
  ROUTINE_STEP_COUNTS,
  activeProductSlugsForSteps,
  buildIngredientIndex,
  deriveMethodRoutineSteps,
  formulaFocus,
  getMethodProductState,
  methodProductNumber,
  routineTimingEntriesForGroup,
  selectedMethodStepIds,
} from "@/lib/content/method";
import { FORBIDDEN_ABOUT_PATTERNS } from "@/lib/content/about";
import { getCachedProducts } from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;

const nameBySlug: Record<string, string> = {
  "reset-01-calming-gel-cleanser": "RESET",
  "refine-02-pore-treatment-pads": "REFINE",
  "recode-03-pdrn-5-ampoule": "RECODE",
  "frame-04-pdrn-eye-cream": "FRAME",
  "seal-05-green-collagen-cream": "SEAL",
  "lift-06-pdrn-mask-system": "LIFT",
};

const productTypeBySlug: Record<string, string> = {
  "reset-01-calming-gel-cleanser": "Gel cleanser",
  "refine-02-pore-treatment-pads": "Toner pad",
  "recode-03-pdrn-5-ampoule": "Ampoule / Serum",
  "frame-04-pdrn-eye-cream": "Eye contour cream",
  "seal-05-green-collagen-cream": "Cream",
  "lift-06-pdrn-mask-system": "Sheet mask",
};

const ingredientsBySlug: Record<string, string[]> = {
  "reset-01-calming-gel-cleanser": ["6-Type Cica Complex", "Centella-derived support"],
  "refine-02-pore-treatment-pads": ["Panthenol", "Sodium hyaluronate", "LHA"],
  "recode-03-pdrn-5-ampoule": [
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

function makeProduct(slug: string, overrides: Partial<Product> = {}): Product {
  const displayName = nameBySlug[slug] ?? "PRODUCT";
  const productType = productTypeBySlug[slug] ?? "Treatment";
  const routineNumber = slug === "lift-06-pdrn-mask-system"
    ? "07"
    : slug.match(/-(\d{2})-/)?.[1] ?? null;

  return {
    id: `${slug}-id`,
    slug,
    displayName,
    formalTitle: `${displayName} ${routineNumber ?? ""} ${productType}`,
    name: displayName,
    tagline: "Tagline",
    cardTagline: "Short product line",
    collection: slug.includes("lift") ? "INTENSIVE" : "THE SYSTEM",
    actionName: displayName,
    routineNumber,
    subtitle: "Subtitle",
    descriptor: "Descriptor",
    productType,
    badge: null,
    currency: "USD",
    featuredRank: 0,
    sortOrder: Number(routineNumber ?? 0),
    blurb: "Short product line",
    description: "A product description.",
    editorialDescription: "A product description.",
    benefits: ["Supports a better-looking finish"],
    howToUse: "Use exactly as directed by the canonical catalog.",
    editorialHowToUse: "Use exactly as directed by the canonical catalog.",
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
    keyIngredients: ingredientsBySlug[slug] ?? [],
    ingredients: (ingredientsBySlug[slug] ?? []).join(", ") || null,
    productDetails: {},
    cautions: [],
    finish: null,
    volume: "50 mL",
    skinTypes: [],
    concerns: [],
    routineStep: productType,
    routineOrder: Number(routineNumber ?? 0),
    usageTime: slug.includes("lift") ? ["Weekly", "PM"] : ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

const methodFixtures = METHOD_PRODUCT_SLUGS.map((slug) => makeProduct(slug));

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(methodFixtures);
});

describe("Method content architecture", () => {
  it("renders the revised Method hero with the shared hue field and no diagram labels", async () => {
    render(await MethodPage());

    const hero = document.querySelector(".method-hero") as HTMLElement;
    expect(hero).not.toBeNull();
    expect(within(hero).getByText("Mei-Pelle")).toBeInTheDocument();
    expect(
      within(hero).getByRole("heading", { level: 1, name: "THE METHOD." }),
    ).toBeInTheDocument();
    expect(
      within(hero).getByText("A system for clearer, healthier, beautiful skin"),
    ).toBeInTheDocument();
    expect(hero.querySelector(".editorial-hue-field")).not.toBeNull();
    expect(within(hero).queryByText("01")).not.toBeInTheDocument();
    expect(within(hero).queryByText("SPF")).not.toBeInTheDocument();
  });

  it("does not render removed Method filler copy", async () => {
    render(await MethodPage());

    expect(
      screen.queryByText("More steps are not inherently better. Order, purpose, and restraint matter."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Only ingredients present in the active Mei-Pelle catalog appear here."),
    ).not.toBeInTheDocument();
  });

  it("keeps ordered product slug mapping and reports missing catalog records", () => {
    const products = methodFixtures.filter(
      (product) => product.slug !== "seal-05-green-collagen-cream",
    );

    const state = getMethodProductState(products);

    expect(state.methodProducts.map((product) => product.slug)).toEqual(
      METHOD_PRODUCT_SLUGS.filter((slug) => slug !== "seal-05-green-collagen-cream"),
    );
    expect(state.missingSlugs).toEqual(["seal-05-green-collagen-cream"]);
  });

  it("renders stable 01-07 Method sequence numbers", async () => {
    render(await MethodPage());

    const indexLabels = Array.from(
      document.querySelectorAll(".method-index__link span"),
    ).map((node) => node.textContent);

    expect(indexLabels).toEqual([
      "Start",
      "AM / PM",
      "01 RESET",
      "02 REFINE",
      "03 RECODE",
      "04 FRAME",
      "05 SEAL",
      "06 PROTECT",
      "07 LIFT",
      "Index",
    ]);
    const allStepNumbers = [...Object.values(METHOD_PRODUCT_NUMBERS), PROTECT_STEP.number];
    expect(new Set(allStepNumbers).size).toBe(7);
    expect(PROTECT_STEP.number).toBe("06");
    expect(methodProductNumber(makeProduct("lift-06-pdrn-mask-system"))).toBe("07");
  });

  it("derives the exact adaptive Method ladder without mutating catalog metadata", () => {
    const expectedIds = {
      3: ["reset", "recode", "seal"],
      4: ["reset", "recode", "seal", "protect"],
      5: ["reset", "refine", "recode", "seal", "protect"],
      6: ["reset", "refine", "recode", "frame", "seal", "protect"],
      7: ["reset", "refine", "recode", "frame", "seal", "protect", "lift"],
    } as const;
    const catalogMetadataBefore = methodFixtures.map((product) => ({
      slug: product.slug,
      routineNumber: product.routineNumber,
      routineOrder: product.routineOrder,
    }));

    for (const count of [3, 4, 5, 6, 7] as const) {
      const steps = deriveMethodRoutineSteps(methodFixtures, count);
      const expectedIdSet = new Set<string>(expectedIds[count]);
      expect(steps.map((step) => step.id)).toEqual(expectedIds[count]);
      expect(selectedMethodStepIds(count)).toEqual(expectedIds[count]);
      expect(steps.map((step) => step.canonicalPosition)).toEqual(
        [...steps].map((step) => step.canonicalPosition).sort((a, b) => a - b),
      );
      expect(steps.map((step) => step.displayNumber)).toEqual(
        steps.map((_, index) => String(index + 1).padStart(2, "0")),
      );
      expect(
        steps
          .filter((step) => step.kind === "product")
          .every((step) =>
            METHOD_STEP_CONFIGS.some(
              (config) =>
                config.kind === "product" &&
                expectedIdSet.has(config.id) &&
                config.id === step.id &&
                config.slug === step.slug &&
                config.anchorId === step.anchorId,
            ),
          ),
      ).toBe(true);
    }

    for (const [previous, next] of [
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ] as const) {
      const previousIds = new Set(selectedMethodStepIds(previous));
      const nextIds = new Set(selectedMethodStepIds(next));
      for (const id of previousIds) {
        expect(nextIds.has(id)).toBe(true);
      }
      expect(nextIds.size).toBeGreaterThan(previousIds.size);
    }

    const protectStep = deriveMethodRoutineSteps(methodFixtures, 4).find(
      (step) => step.id === "protect",
    );
    expect(selectedMethodStepIds(3)).toEqual(["reset", "recode", "seal"]);
    expect(selectedMethodStepIds(4)).toEqual(["reset", "recode", "seal", "protect"]);
    expect(new Set(selectedMethodStepIds(4)).size).toBeGreaterThan(
      new Set(selectedMethodStepIds(3)).size,
    );
    expect(protectStep).toMatchObject({
      kind: "protect",
      displayNumber: "04",
    });
    expect(protectStep?.product).toBeUndefined();
    expect(ROUTINE_STEP_COUNTS).toEqual([3, 4, 5, 6, 7]);
    expect(ROUTINE_PRESET_COPY[4].summary).toContain("SPF");
    expect(methodFixtures.map((product) => ({
      slug: product.slug,
      routineNumber: product.routineNumber,
      routineOrder: product.routineOrder,
    }))).toEqual(catalogMetadataBefore);
  });

  it("filters routine timing and ingredient active state from the selected steps", () => {
    const steps3 = deriveMethodRoutineSteps(methodFixtures, 3);
    const am3 = routineTimingEntriesForGroup(ROUTINE_GROUPS[0], steps3);
    const pm3 = routineTimingEntriesForGroup(ROUTINE_GROUPS[1], steps3);
    const weekly3 = routineTimingEntriesForGroup(ROUTINE_GROUPS[2], steps3);

    expect(am3.map((entry) => `${entry.displayNumber} ${entry.label}`)).toEqual([
      "01 RESET",
      "02 RECODE",
      "03 SEAL",
    ]);
    expect(pm3.map((entry) => entry.label)).toEqual(["RESET", "RECODE", "SEAL"]);
    expect(weekly3).toEqual([]);
    expect(am3.some((entry) => entry.id === "protect")).toBe(false);

    const am4 = routineTimingEntriesForGroup(
      ROUTINE_GROUPS[0],
      deriveMethodRoutineSteps(methodFixtures, 4),
    );
    expect(am4.map((entry) => `${entry.displayNumber} ${entry.label}`)).toEqual([
      "01 RESET",
      "02 RECODE",
      "03 SEAL",
      "04 PROTECT",
    ]);

    const weekly7 = routineTimingEntriesForGroup(
      ROUTINE_GROUPS[2],
      deriveMethodRoutineSteps(methodFixtures, 7),
    );
    expect(weekly7.map((entry) => `${entry.displayNumber} ${entry.label}`)).toEqual([
      "07 LIFT",
    ]);

    const active3 = activeProductSlugsForSteps(steps3);
    expect(active3.has("reset-01-calming-gel-cleanser")).toBe(true);
    expect(active3.has("recode-03-pdrn-5-ampoule")).toBe(true);
    expect(active3.has("seal-05-green-collagen-cream")).toBe(true);
    expect(active3.has("refine-02-pore-treatment-pads")).toBe(false);
    expect(active3.has("frame-04-pdrn-eye-cream")).toBe(false);
    expect(active3.has("lift-06-pdrn-mask-system")).toBe(false);
  });

  it("renders the accessible routine length selector and condenses Method surfaces together", async () => {
    render(await MethodPage());

    const ingredientCardCount = document.querySelectorAll(".ingredient-card").length;
    const slider = screen.getByRole("slider", { name: "Routine length" });
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "7");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("7");
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "7 steps, full Method with the scheduled weekly intensive",
    );
    expect(
      Array.from(document.querySelectorAll(".method-edit__ticks li")).map((tick) => ({
        count: tick.getAttribute("data-routine-count"),
        label: tick.textContent,
      })),
    ).toEqual(ROUTINE_STEP_COUNTS.map((count) => ({
      count: String(count),
      label: String(count),
    })));

    fireEvent.change(slider, { target: { value: "3" } });

    expect(slider).toHaveValue("3");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "3 steps, foundation: cleanse, treat, moisturize",
    );
    expect(screen.getByText("FOUNDATION")).toBeInTheDocument();

    const indexLabels = Array.from(
      document.querySelectorAll(".method-index__link span"),
    ).map((node) => node.textContent);
    expect(indexLabels).toEqual([
      "Start",
      "AM / PM",
      "01 RESET",
      "02 RECODE",
      "03 SEAL",
      "Index",
    ]);

    expect(document.getElementById("step-reset")).not.toBeNull();
    expect(document.getElementById("step-recode")).not.toBeNull();
    expect(document.getElementById("step-seal")).not.toBeNull();
    expect(document.getElementById("step-refine")).toBeNull();
    expect(document.getElementById("step-frame")).toBeNull();
    expect(document.getElementById("step-protect")).toBeNull();
    expect(document.getElementById("step-lift")).toBeNull();
    expect(within(document.getElementById("step-recode") as HTMLElement).getByText("STEP 02")).toBeInTheDocument();
    expect(
      (document.getElementById("step-recode") as HTMLElement).querySelector(
        ".method-step__routine",
      )?.textContent,
    ).toBe("02");

    const amEntries = Array.from(
      document.querySelectorAll("#routine-am li"),
    ).map((entry) => entry.textContent?.replace(/\s+/g, " ").trim());
    expect(amEntries).toEqual(["01RESET", "02RECODE", "03SEAL"]);
    expect(screen.getByText(/Broad-spectrum sunscreen is still recommended/i)).toBeInTheDocument();
    expect(screen.getByText("No separate weekly step is included in this edit.")).toBeInTheDocument();

    expect(document.querySelectorAll(".ingredient-card").length).toBe(ingredientCardCount);
    const refineChip = document.querySelector(
      '.ingredient-card__found a[href="/products/refine-02-pore-treatment-pads"]',
    ) as HTMLAnchorElement | null;
    expect(refineChip).not.toBeNull();
    expect(refineChip).toHaveAttribute("data-routine-active", "false");
    expect(refineChip).toHaveAttribute(
      "aria-label",
      "REFINE, not included in the current 3-step system. Opens product details.",
    );
    refineChip?.focus();
    expect(document.activeElement).toBe(refineChip);

    fireEvent.change(slider, { target: { value: "7" } });
    expect(slider).toHaveValue("7");
    expect(document.getElementById("step-lift")).not.toBeNull();
    expect(within(document.getElementById("step-protect") as HTMLElement).getByText("STEP 06")).toBeInTheDocument();
    expect(within(document.getElementById("step-lift") as HTMLElement).getByText("STEP 07")).toBeInTheDocument();
    expect(refineChip).toHaveAttribute("href", "/products/refine-02-pore-treatment-pads");
  });

  it("renders PROTECT 06 as a coming-soon Method step instead of a product", async () => {
    render(await MethodPage());

    const protect = document.getElementById("step-protect");
    expect(protect).not.toBeNull();
    expect(within(protect as HTMLElement).getByText("STEP 06")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByRole("heading", { name: "06 PROTECT" })).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("COMING SOON")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("WHAT")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("WHY")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("HOW")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText("FORMULA FOCUS")).toBeInTheDocument();
    expect(within(protect as HTMLElement).getByText(/No formula details are being claimed yet/i)).toBeInTheDocument();
    expect(within(protect as HTMLElement).queryByRole("button", { name: /add to cart/i })).not.toBeInTheDocument();
    expect(within(protect as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(protect?.textContent).not.toMatch(/\$\d|variant|inventory/i);
  });

  it("renders an incomplete-method state when a required product is missing", async () => {
    mockedGetProducts.mockResolvedValue(
      methodFixtures.filter((product) => product.slug !== "lift-06-pdrn-mask-system"),
    );

    render(await MethodPage());

    expect(screen.getByText("Method catalog incomplete")).toBeInTheDocument();
    expect(screen.getAllByText(/lift-06-pdrn-mask-system/).length).toBeGreaterThan(0);
  });

  it("builds AM, PM, and weekly groups with PROTECT only in AM and LIFT only weekly", () => {
    expect(ROUTINE_GROUPS.map((group) => group.id)).toEqual(["am", "pm", "weekly"]);
    expect(ROUTINE_GROUPS[0].entries.at(-1)).toMatchObject({
      kind: "protect",
      id: "protect",
    });
    expect(ROUTINE_GROUPS[1].entries.some((entry) => entry.kind === "protect")).toBe(false);
    expect(ROUTINE_GROUPS[2].entries).toEqual([
      {
        kind: "product",
        slug: "lift-06-pdrn-mask-system",
        note: "Use weekly or before an event.",
      },
    ]);
  });

  it("does not invent formula focus when no key ingredients exist", () => {
    expect(formulaFocus(makeProduct("reset-01-calming-gel-cleanser", {
      keyIngredients: [],
    }))).toEqual([]);
  });

  it("renders ingredient cards with scientific fields and no fine-print footer", async () => {
    const cards = buildIngredientIndex(methodFixtures);
    const names = cards.map((card) => card.name);

    expect(names).toContain("PDRN / Sodium DNA");
    expect(names).toContain("Niacinamide");
    expect(names).toContain("Peptides");
    expect(names).not.toContain("Ceramides");
    expect(cards.find((card) => card.id === "pdrn")).toMatchObject({
      identity: expect.stringContaining("Polydeoxyribonucleotide"),
      ingredientClass: "Polynucleotide",
      mechanism: expect.any(String),
      skinRelevance: expect.any(String),
    });

    render(await MethodPage());
    expect(screen.getByRole("heading", { name: "KNOW WHAT YOU’RE USING." })).toBeInTheDocument();
    expect(screen.queryByText("INGREDIENT LITERACY")).not.toBeInTheDocument();
    expect(screen.queryByText(/Composition, mechanism/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("INCI / IDENTITY").length).toBeGreaterThan(0);
    expect(screen.getAllByText("MECHANISM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SKIN RELEVANCE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FOUND IN").length).toBeGreaterThan(0);
    expect(document.querySelector(".ingredient-card small")).toBeNull();
    expect(
      document.querySelector(
        '.ingredient-card__found a[href="/products/recode-03-pdrn-5-ampoule"]',
      ),
    ).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/DNA repair|tissue regeneration|wound healing/i);
    expect(document.body.textContent).not.toMatch(/guaranteed collagen production/i);
  });

  it("removes REFINE and RECODE callout disclaimer blocks while preserving directions", async () => {
    render(await MethodPage());

    expect(screen.queryByText(/THE RULE:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ADVANCED DOES NOT MEAN AGGRESSIVE/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Use exactly as directed by the canonical catalog.").length).toBeGreaterThan(0);
  });
});

describe("About content architecture", () => {
  it("renders cultural narrative sections and avoids routine-manual UI", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "TWO CITIES. ONE STANDARD." }),
    ).toBeInTheDocument();
    expect(screen.getByText("SEOUL")).toBeInTheDocument();
    expect(screen.getByText("LOS ANGELES")).toBeInTheDocument();
    expect(screen.getByText("MEN DESERVE A BETTER SYSTEM.")).toBeInTheDocument();
    expect(screen.getByText("LESS, DONE BETTER.")).toBeInTheDocument();
    expect(screen.queryByText("FORMULA FOCUS")).not.toBeInTheDocument();
  });

  it("does not publish fake founder, advisor, certification, or green claims", () => {
    render(<AboutPage />);
    const pageText = document.body.textContent?.toLowerCase() ?? "";

    for (const pattern of FORBIDDEN_ABOUT_PATTERNS) {
      expect(pageText).not.toContain(pattern);
    }
  });

  it("links the final brand narrative to Method and Shop", () => {
    render(<AboutPage />);

    expect(screen.getByRole("link", { name: /learn the method/i })).toHaveAttribute(
      "href",
      "/method",
    );
    expect(screen.getByRole("link", { name: /shop mei-pelle/i })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
