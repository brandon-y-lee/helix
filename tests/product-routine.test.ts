import { describe, expect, it } from "vitest";
import {
  routineDisplayLabelForProduct,
  routineGroupLabelForProduct,
} from "@/lib/catalog/product-routine";
type RoutineProduct = Parameters<typeof routineDisplayLabelForProduct>[0];

function product(overrides: Partial<RoutineProduct> = {}): RoutineProduct {
  return {
    routineGroup: "core",
    routineStepNumber: 1,
    ...overrides,
  };
}

describe("commerce routine presentation", () => {
  it("derives labels from canonical Supabase routine fields", () => {
    const catalogProduct = product();

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe(
      "01 — The Core",
    );
    expect(routineGroupLabelForProduct(catalogProduct)).toBe("The Core");
  });

  it("renders Beyond The Core without a synthetic step", () => {
    const catalogProduct = product({
      routineGroup: "beyond_core",
      routineStepNumber: null,
    });

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe(
      "Beyond The Core",
    );
    expect(routineGroupLabelForProduct(catalogProduct)).toBe(
      "Beyond The Core",
    );
  });

  it("does not invent a numbered label for an incomplete Core row", () => {
    const catalogProduct = product({
      routineStepNumber: null,
    });

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe("The Core");
    expect(routineGroupLabelForProduct(catalogProduct)).toBe("The Core");
  });
});
