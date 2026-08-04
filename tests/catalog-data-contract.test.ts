import { describe, expect, it } from "vitest";
import {
  CANONICAL_COMMERCE_PRODUCTS,
  EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS,
} from "@/lib/catalog/canonical-catalog";
import {
  assertExpectedProjectRef,
  projectRefFromSupabaseUrl,
} from "@/scripts/db/supabase-ops";

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

  it("defines canonical routine and relationship invariants used by verification", () => {
    expect(
      CANONICAL_COMMERCE_PRODUCTS.map((product) => [
        product.routineGroup,
        product.routineStepNumber,
        product.routineSort,
      ]),
    ).toEqual([
      ["core", 1, 10],
      ["core", 2, 20],
      ["core", 3, 30],
      ["beyond_core", null, 110],
      ["beyond_core", null, 120],
      ["beyond_core", null, 130],
    ]);
    expect(EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS).toBe(30);
  });
});

describe("Supabase operations safety", () => {
  it("accepts only the approved non-production project without an override", () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalOverride = process.env.ALLOW_NON_CANONICAL_SUPABASE_REF;

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL =
        "https://erasogmsqpgiirovubjh.supabase.co";
      expect(assertExpectedProjectRef).not.toThrow();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        "https://production-project.supabase.co";
      process.env.ALLOW_NON_CANONICAL_SUPABASE_REF = "true";
      expect(assertExpectedProjectRef).toThrow(
        /Expected approved non-production project/,
      );
    } finally {
      if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      }
      if (originalOverride === undefined) {
        delete process.env.ALLOW_NON_CANONICAL_SUPABASE_REF;
      } else {
        process.env.ALLOW_NON_CANONICAL_SUPABASE_REF = originalOverride;
      }
    }
  });

  it("rejects non-Supabase and malformed URLs", () => {
    expect(
      projectRefFromSupabaseUrl("https://erasogmsqpgiirovubjh.supabase.co"),
    ).toBe("erasogmsqpgiirovubjh");
    expect(projectRefFromSupabaseUrl("https://example.com")).toBeNull();
    expect(projectRefFromSupabaseUrl("not a URL")).toBeNull();
  });
});
