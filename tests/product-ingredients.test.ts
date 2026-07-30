import { describe, expect, it } from "vitest";
import { resolveFullInci } from "@/lib/catalog/product-ingredients";
function productWithIngredients(ingredients: string | null) {
  return { ingredients };
}

describe("resolveFullInci", () => {
  it("prefers the canonical products.ingredients value and normalizes whitespace", () => {
    expect(
      resolveFullInci(
        productWithIngredients(
          " Water,  Glycerin,\nNiacinamide, Panthenol, Adenosine ",
        ),
      ),
    ).toEqual({
      text: "Water, Glycerin, Niacinamide, Panthenol, Adenosine",
      source: "products.ingredients",
    });
  });

  it.each([
    "Full INCI unavailable in public product copy.",
    "Source highlights hero concepts only; full INCI unavailable.",
    "Check the product packaging for the current list.",
  ])("rejects non-canonical compatibility content: %s", (value) => {
    expect(resolveFullInci(productWithIngredients(value))).toBeNull();
  });

  it("returns null when canonical content is absent", () => {
    expect(resolveFullInci(productWithIngredients(null))).toBeNull();
  });

  it("treats a populated canonical list as authoritative", () => {
    expect(
      resolveFullInci(
        productWithIngredients("Water, Glycerin, Niacinamide"),
      ),
    ).toEqual({
      text: "Water, Glycerin, Niacinamide",
      source: "products.ingredients",
    });
  });
});
