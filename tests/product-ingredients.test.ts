import { describe, expect, it } from "vitest";
import { resolveFullInci } from "@/lib/catalog/product-ingredients";
import type { Product } from "@/lib/products";

function productWithIngredients(
  ingredients: string | null,
  sourceFullInci?: string,
): Product {
  return {
    ingredients,
    productDetails: sourceFullInci ? { sourceFullInci } : {},
  } as Product;
}

describe("resolveFullInci", () => {
  it("prefers the canonical products.ingredients value and normalizes whitespace", () => {
    expect(
      resolveFullInci(
        productWithIngredients(
          " Water,  Glycerin,\nNiacinamide, Panthenol, Adenosine ",
          "Fallback, Should, Never, Win, Here",
        ),
      ),
    ).toEqual({
      text: "Water, Glycerin, Niacinamide, Panthenol, Adenosine",
      source: "products.ingredients",
    });
  });

  it("uses a complete compatibility list only when canonical content is absent", () => {
    expect(
      resolveFullInci(
        productWithIngredients(
          null,
          "Water, Glycerin, Butylene Glycol, Niacinamide, Panthenol",
        ),
      ),
    ).toEqual({
      text: "Water, Glycerin, Butylene Glycol, Niacinamide, Panthenol",
      source: "product_details.sourceFullInci",
    });
  });

  it.each([
    "Full INCI unavailable in public product copy.",
    "Source highlights hero concepts only; full INCI unavailable.",
    "Check the product packaging for the current list.",
    "Water, Glycerin, Niacinamide",
  ])("rejects non-canonical compatibility content: %s", (value) => {
    expect(resolveFullInci(productWithIngredients(null, value))).toBeNull();
  });
});
