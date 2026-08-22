import { describe, expect, it } from "vitest";
import type { ProductCard } from "@/lib/catalog/models";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import { groupSystemProducts } from "@/lib/content/system";
import type { Product } from "@/lib/products";

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
  routineGroup: Product["routineGroup"],
  overrides: Partial<Product> = {},
): Product {
  return {
    id: `${slug}-id`,
    slug,
    displayName: slug,
    routineGroup,
    systemStepName: step,
    systemStepPosition: STEP_POSITION[step],
    routineSort: STEP_POSITION[step] * 10,
    sortOrder: STEP_POSITION[step],
    catalogStatus: "active",
    ...overrides,
  } as Product;
}

function card(item: Product): Pick<ProductCard, "id"> {
  return { id: item.id };
}

describe("groupSystemProducts", () => {
  it("uses governed step metadata and collection-facing family entries", () => {
    const products = [
      product("peptide-nourish-mask", "LIFT", "beyond_core"),
      product("peptide-bounce", "TREAT", "core"),
      product("mineral-guard", "PROTECT", "beyond_core"),
      product("biotic-reset", "CLEANSE", "core"),
      product("refine-family-sibling", "REFINE", "beyond_core"),
      product("peptide-eye-cream", "FRAME", "beyond_core"),
      product("ceramide-cushion", "SEAL", "core"),
      product("balancing-prep", "REFINE", "beyond_core"),
    ];
    const familyEntryProducts = products.filter(
      (item) => item.slug !== "refine-family-sibling",
    );

    const result = groupSystemProducts(
      products,
      familyEntryProducts.map(card),
    );

    expect(result.core.map((entry) => entry.product.slug)).toEqual([
      "biotic-reset",
      "peptide-bounce",
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

  it("reports absent or inactive entries without substituting another product", () => {
    const cleanser = product("biotic-reset", "CLEANSE", "core");
    const archivedTreat = product("peptide-bounce", "TREAT", "core", {
      catalogStatus: "archived",
    });
    const seal = product("ceramide-cushion", "SEAL", "core");

    const result = groupSystemProducts(
      [cleanser, archivedTreat, seal],
      [cleanser, archivedTreat, seal].map(card),
    );

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
});
