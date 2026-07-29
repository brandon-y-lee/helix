import { describe, expect, it } from "vitest";
import {
  routineDisplayLabelForProduct,
  routineGroupLabelForProduct,
  routineSortForProduct,
} from "@/lib/catalog/product-routine";
import type { Product } from "@/lib/products";

function product(overrides: Partial<Product> = {}): Product {
  return {
    slug: "cleanse-01-calming-gel-cleanser",
    collection: "The Core",
    routineNumber: "01",
    routineStep: "Cleanse",
    routineDisplayLabel: "01 — Catalog Core",
    routineGroupLabel: "Catalog Core",
    routineSort: 17,
    routineOrder: 1,
    sortOrder: 2,
    ...overrides,
  } as Product;
}

describe("commerce routine presentation", () => {
  it("uses populated Supabase routine fields without slug overrides", () => {
    const catalogProduct = product();

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe(
      "01 — Catalog Core",
    );
    expect(routineGroupLabelForProduct(catalogProduct)).toBe("Catalog Core");
    expect(routineSortForProduct(catalogProduct)).toBe(17);
  });

  it("falls back only to other fields on the same Supabase product row", () => {
    const catalogProduct = product({
      slug: "unknown-product",
      routineDisplayLabel: null,
      routineGroupLabel: null,
      routineSort: null,
    });

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe("01 · Cleanse");
    expect(routineGroupLabelForProduct(catalogProduct)).toBe("The Core");
    expect(routineSortForProduct(catalogProduct)).toBe(1);
  });

  it("does not infer product-specific routine content from a known slug", () => {
    const catalogProduct = product({
      routineNumber: null,
      routineStep: null,
      routineDisplayLabel: null,
      routineGroupLabel: null,
      routineSort: null,
      routineOrder: null,
      collection: "Catalog collection",
      sortOrder: 41,
    });

    expect(routineDisplayLabelForProduct(catalogProduct)).toBe(
      "Catalog collection",
    );
    expect(routineGroupLabelForProduct(catalogProduct)).toBe(
      "Catalog collection",
    );
    expect(routineSortForProduct(catalogProduct)).toBe(41);
  });
});
