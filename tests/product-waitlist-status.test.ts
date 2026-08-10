import { describe, expect, it } from "vitest";
import { statusLabel } from "@/lib/catalog/product-status";
import { productPurchaseCta } from "@/lib/products";

describe("Waitlist Product merchandising status", () => {
  it("is distinct from coming soon and never becomes purchasable", () => {
    const product = {
      displayName: "Mineral Guard",
      status: "waitlist" as const,
      variants: [],
    };

    expect(statusLabel(product.status)).toBe("Waitlist");
    expect(productPurchaseCta(product, null)).toEqual({
      label: "Join the waitlist",
      purchasable: false,
      variant: null,
    });
  });
});
