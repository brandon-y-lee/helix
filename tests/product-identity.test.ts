import { describe, expect, it } from "vitest";
import { composeProductTitle } from "@/lib/products";

describe("Product identity presentation", () => {
  it("composes the canonical combined label only from Display Name and Product Type", () => {
    expect(composeProductTitle("Peptide Bounce", "PDRN serum")).toBe(
      "Peptide Bounce — PDRN serum",
    );
  });
});
