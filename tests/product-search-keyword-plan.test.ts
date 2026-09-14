import { describe, expect, it } from "vitest";
import { planProductSearchKeywordCleanup } from "../scripts/catalog/product-search-keyword-plan";

const inventory = {
  projectRef: "erasogmsqpgiirovubjh",
  capturedAt: "2026-09-14T00:00:00Z",
  activeProducts: [{
    productId: "10000000-0000-4000-8000-000000000101",
    slug: "super-serum",
    revision: 12,
    searchKeywords: ["Peptide Bounce", "peptide", "bounce", "maxxing-serum", "hydration", "PDRN"],
  }],
  reservations: [],
};

describe("reviewed Product keyword preparation", () => {
  it("plans only exact retired identity removal while preserving useful words and source data", () => {
    const original = structuredClone(inventory);
    const plan = planProductSearchKeywordCleanup(inventory);
    expect(plan.changes).toEqual([{
      productId: inventory.activeProducts[0].productId,
      slug: "super-serum",
      expectedRevision: 12,
      expectedKeywords: inventory.activeProducts[0].searchKeywords,
      searchKeywords: ["peptide", "bounce", "hydration", "PDRN"],
      removedKeywords: ["Peptide Bounce", "maxxing-serum"],
    }]);
    expect(inventory).toEqual(original);
    expect(plan.mode).toBe("review-only");
  });

  it("uses actual private reservation evidence for additional former URLs", () => {
    const plan = planProductSearchKeywordCleanup({
      ...inventory,
      activeProducts: [{ ...inventory.activeProducts[0], searchKeywords: ["former-special-serum", "former special serum", "special", "different old product"] }],
      reservations: [
        { sourceSlug: "former-special-serum", targetProductId: inventory.activeProducts[0].productId, routeKind: "rename" },
        { sourceSlug: "different-old-product", targetProductId: "10000000-0000-4000-8000-000000000102", routeKind: "replacement" },
      ],
    });
    expect(plan.changes[0].searchKeywords).toEqual(["special", "different old product"]);
  });

  it("produces no change for current meaningful discovery terms", () => {
    expect(planProductSearchKeywordCleanup({ ...inventory,
      activeProducts: [{ ...inventory.activeProducts[0], searchKeywords: ["Super Serum", "peptide", "bounce", "PDRN"] }],
    }).changes).toEqual([]);
  });

  it.each([
    { ...inventory, projectRef: "another-project" },
    { ...inventory, capturedAt: "unknown" },
    { ...inventory, activeProducts: [inventory.activeProducts[0], inventory.activeProducts[0]] },
    { ...inventory, activeProducts: [{ ...inventory.activeProducts[0], revision: -1 }] },
    { ...inventory, reservations: [{ sourceSlug: "old", targetProductId: "invalid", routeKind: "rename" }] },
  ])("refuses ambiguous or unverified inventory", (invalid) => {
    expect(() => planProductSearchKeywordCleanup(invalid)).toThrow();
  });
});
