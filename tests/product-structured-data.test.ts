import { describe, expect, it } from "vitest";
import {
  buildProductStructuredData,
  serializeStructuredData,
} from "@/lib/catalog/product-structured-data";
import type { PdpProduct } from "@/lib/catalog/models";

function product(overrides: Partial<PdpProduct> = {}): PdpProduct {
  return {
    id: "product-id",
    slug: "peptide-bounce",
    displayName: "Peptide Bounce",
    productType: "PDRN serum",
    routineGroup: "core",
    systemStepName: "TREAT",
    systemStepPosition: 3,
    routineSort: 3,
    description: "A daily serum for smoother-, bouncier-looking skin.",
    howToUse: "Apply after cleansing.",
    swatch: ["#e8edf0", "#90a2ab"],
    media: [],
    cardMedia: null,
    detailMedia: null,
    cartMedia: null,
    madeFor: null,
    goodFor: null,
    texture: null,
    keyIngredients: ["PDRN"],
    ingredients: null,
    cautions: [],
    finish: null,
    volume: "30 mL",
    skinTypes: [],
    usageTime: ["AM", "PM"],
    pdpContent: null,
    productFamily: null,
    currency: "USD",
    status: "available",
    variants: [
      {
        productId: "product-id",
        productSlug: "peptide-bounce",
        productStatus: "available",
        id: "30ml",
        label: "30 mL",
        price: 2500,
        available: true,
        inventoryStatus: "in_stock",
        volume: "30 mL",
        packCount: null,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("Product structured data", () => {
  it("uses the canonical composed identity and eligible Offer facts", () => {
    expect(
      buildProductStructuredData(
        product(),
        new URL("https://helixskin.vercel.app"),
      ),
    ).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Peptide Bounce — PDRN serum",
      description: "A daily serum for smoother-, bouncier-looking skin.",
      url: "https://helixskin.vercel.app/products/peptide-bounce",
      brand: { "@type": "Brand", name: "helix" },
      offers: [
        {
          "@type": "Offer",
          price: "25.00",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      ],
    });
  });

  it("omits Offers when canonical commerce facts are not purchasable", () => {
    const structuredData = buildProductStructuredData(
      product({ status: "sold_out" }),
      new URL("https://helixskin.vercel.app"),
    );

    expect(structuredData).not.toHaveProperty("offers");
  });

  it("publishes waitlist Product identity without fabricating an Offer", () => {
    const structuredData = buildProductStructuredData(
      product({ status: "waitlist", variants: [] }),
      new URL("https://helixskin.vercel.app"),
    );

    expect(structuredData).toMatchObject({
      "@type": "Product",
      name: "Peptide Bounce — PDRN serum",
    });
    expect(structuredData).not.toHaveProperty("offers");
  });

  it("escapes markup-significant characters before embedding JSON-LD", () => {
    expect(serializeStructuredData({ description: "</script>" })).toBe(
      '{"description":"\\u003c/script>"}',
    );
  });
});
