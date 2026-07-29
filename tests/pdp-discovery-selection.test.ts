import { describe, expect, it } from "vitest";
import {
  PDP_DISCOVERY_PRODUCT_LIMIT,
  selectPdpDiscoveryProducts,
} from "@/lib/merchandising";
import type { ProductCard } from "@/lib/catalog/models";

function product(slug: string): ProductCard {
  return { id: slug, slug } as ProductCard;
}

describe("selectPdpDiscoveryProducts", () => {
  it("preserves source order while excluding the current and duplicate products", () => {
    const selected = selectPdpDiscoveryProducts(
      [
        product("cleanse"),
        product("treat"),
        product("cleanse"),
        product("seal"),
        product("refine"),
        product("frame"),
      ],
      "treat",
    );

    expect(PDP_DISCOVERY_PRODUCT_LIMIT).toBe(3);
    expect(selected.map((item) => item.slug)).toEqual([
      "cleanse",
      "seal",
      "refine",
    ]);
  });

  it("returns every eligible unique product when fewer than three exist", () => {
    const selected = selectPdpDiscoveryProducts(
      [product("treat"), product("seal"), product("seal")],
      "treat",
    );

    expect(selected.map((item) => item.slug)).toEqual(["seal"]);
  });
});
