import { describe, expect, it } from "vitest";
import type { ProductCard } from "@/lib/catalog/models";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import { groupSystemProducts } from "@/lib/content/system";

const STEP_POSITION: Record<SystemStepName, number> = {
  CLEANSE: 1,
  REFINE: 2,
  TREAT: 3,
  FRAME: 4,
  SEAL: 5,
  PROTECT: 6,
  LIFT: 7,
};

function product(
  slug: string,
  step: SystemStepName,
  routineGroup: ProductCard["routineGroup"],
  overrides: Partial<ProductCard> = {},
): ProductCard {
  return {
    id: `${slug}-id`,
    slug,
    displayName: slug,
    routineGroup,
    systemStepName: step,
    systemStepPosition: STEP_POSITION[step],
    routineSort: STEP_POSITION[step] * 10,
    sortOrder: STEP_POSITION[step],
    productType: "Treatment",
    volume: null,
    usageTime: [],
    createdAt: "2026-06-14T00:00:00.000Z",
    swatch: ["#ffffff", "#dddddd"],
    cardMedia: null,
    cardHoverMedia: null,
    cartMedia: null,
    productFamily: null,
    status: "waitlist",
    variants: [],
    ...overrides,
  };
}

describe("groupSystemProducts", () => {
  it("uses governed step metadata and collection-facing family entries", () => {
    const products = [
      product("peptide-nourish-mask", "LIFT", "beyond_core"),
      product("super-serum", "TREAT", "core"),
      product("mineral-guard", "PROTECT", "beyond_core"),
      product("biotic-reset", "CLEANSE", "core"),
      product("refine-family-sibling", "REFINE", "beyond_core", {
        productFamily: { familyId: "refine-family", isEntry: false },
        routineSort: 0,
      }),
      product("peptide-eye-cream", "FRAME", "beyond_core"),
      product("ceramide-cushion", "SEAL", "core"),
      product("balancing-prep", "REFINE", "beyond_core"),
    ];
    const result = groupSystemProducts(products);

    expect(result.core.map((entry) => entry.product.slug)).toEqual([
      "biotic-reset",
      "super-serum",
      "ceramide-cushion",
    ]);
    expect(result.core.map((entry) => entry.displayNumber)).toEqual([
      "01",
      "02",
      "03",
    ]);
    expect(result.beyond.map((entry) => entry.product.slug)).toEqual([
      "balancing-prep",
      "peptide-eye-cream",
      "mineral-guard",
      "peptide-nourish-mask",
    ]);
    expect(result.beyond.map((entry) => entry.placement)).toEqual([
      "After cleansing",
      "After treatment",
      "Final morning step",
      "Weekly intensive",
    ]);
    expect(result.missingCoreSteps).toEqual([]);
    expect(result.missingBeyondSteps).toEqual([]);
  });

  it("reports missing steps without substituting another product", () => {
    const cleanser = product("biotic-reset", "CLEANSE", "core");
    const seal = product("ceramide-cushion", "SEAL", "core");

    const result = groupSystemProducts([cleanser, seal]);

    expect(result.core.map((entry) => entry.product.slug)).toEqual([
      "biotic-reset",
      "ceramide-cushion",
    ]);
    expect(result.missingCoreSteps).toEqual(["TREAT"]);
    expect(result.missingBeyondSteps).toEqual([
      "REFINE",
      "FRAME",
      "PROTECT",
      "LIFT",
    ]);
  });
  it("selects each step by routine order, then sort order, then slug", () => {
    const candidates = [
      product("later-routine", "TREAT", "core", { routineSort: 20, sortOrder: 0 }),
      product("later-sort", "TREAT", "core", { routineSort: 10, sortOrder: 20 }),
      product("zeta-serum", "TREAT", "core", { routineSort: 10, sortOrder: 10 }),
      product("alpha-serum", "TREAT", "core", { routineSort: 10, sortOrder: 10 }),
    ];
    expect(groupSystemProducts(candidates).core[0].product.slug).toBe("alpha-serum");
    expect(groupSystemProducts([...candidates].reverse()).core[0].product.slug).toBe("alpha-serum");
  });
});
