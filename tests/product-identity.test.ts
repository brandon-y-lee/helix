import { describe, expect, it } from "vitest";
import { composeProductTitle } from "@/lib/products";
import { CORE_ROUTINE_PRODUCT_SLUGS } from "@/lib/catalog/models";

describe("Product identity presentation", () => {
  it("composes the canonical combined label only from Display Name and Product Type", () => {
    expect(composeProductTitle("Peptide Bounce", "PDRN serum")).toBe(
      "Peptide Bounce — PDRN serum",
    );
  });

  it("identifies the approved Core by Product identity rather than Step tokens", () => {
    expect(CORE_ROUTINE_PRODUCT_SLUGS).toEqual([
      "biotic-reset",
      "peptide-bounce",
      "ceramide-cushion",
    ]);
  });
});
