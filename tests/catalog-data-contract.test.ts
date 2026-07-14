import { describe, expect, it } from "vitest";
import {
  CANONICAL_COLLECTIONS,
  CANONICAL_COMMERCE_PRODUCTS,
  EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS,
  LEGACY_SEED_PRODUCT_SLUGS,
  PROTECTED_CLEANUP_REFERENCE_TABLES,
  PROTECTED_DATABASE_TABLES,
} from "@/scripts/catalog/canonical-catalog-manifest";

describe("canonical catalog data contract", () => {
  it("defines exactly the six active commerce products and keeps PROTECT editorial-only", () => {
    expect(CANONICAL_COMMERCE_PRODUCTS.map((product) => product.slug)).toEqual([
      "cleanse-01-calming-gel-cleanser",
      "treat-03-pdrn-5-ampoule",
      "seal-05-green-collagen-cream",
      "refine-02-pore-treatment-pads",
      "frame-04-pdrn-eye-cream",
      "lift-06-pdrn-mask-system",
    ]);
    expect(
      CANONICAL_COMMERCE_PRODUCTS.some((product) => product.slug.includes("protect")),
    ).toBe(false);
  });

  it("keeps cleanup targets separate from canonical active products", () => {
    const canonical = new Set<string>(CANONICAL_COMMERCE_PRODUCTS.map((product) => product.slug));
    expect(LEGACY_SEED_PRODUCT_SLUGS).toHaveLength(6);
    for (const slug of LEGACY_SEED_PRODUCT_SLUGS) {
      expect(canonical.has(slug)).toBe(false);
    }
  });

  it("defines collection and relationship invariants used by audit scripts", () => {
    expect(CANONICAL_COLLECTIONS.map((collection) => collection.slug)).toEqual([
      "the-core",
      "beyond-the-core",
    ]);
    expect(EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS).toBe(30);
  });

  it("makes protected customer/history tables explicit for cleanup tooling", () => {
    expect(PROTECTED_CLEANUP_REFERENCE_TABLES).toEqual([
      "public.cart_items",
      "public.order_items",
    ]);
    expect(PROTECTED_DATABASE_TABLES).toContain("auth.users");
    expect(PROTECTED_DATABASE_TABLES).toContain("public.orders");
    expect(PROTECTED_DATABASE_TABLES).toContain("public.loyalty_ledger_entries");
    expect(PROTECTED_DATABASE_TABLES).toContain("public.stripe_webhook_events");
  });
});
