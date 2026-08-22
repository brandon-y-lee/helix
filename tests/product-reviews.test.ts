import { describe, expect, it } from "vitest";
import { getProductReviews } from "@/lib/catalog/product-reviews";

describe("Product review fixtures", () => {
  it.each(["peptide-eye-cream", "peptide-nourish-mask"])(
    "uses the canonical active Product slug %s",
    (slug) => {
      expect(getProductReviews(slug).reviews.length).toBeGreaterThan(0);
    },
  );

  it.each(["frame-04-pdrn-eye-cream", "lift-06-pdrn-mask-system"])(
    "does not treat the retired slug %s as an active review key",
    (slug) => {
      expect(getProductReviews(slug).reviews).toEqual([]);
    },
  );
});
