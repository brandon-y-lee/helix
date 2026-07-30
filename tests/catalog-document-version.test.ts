import { describe, expect, it } from "vitest";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { upgradeProductEditorDocument } from "@/lib/admin/catalog/document-version";
import type { ProductEditorDocumentV1 } from "@/lib/admin/catalog/types";
import { catalogDocument } from "./fixtures/catalog-editor";

function v1Document(): ProductEditorDocumentV1 {
  const product = {
    ...structuredClone(catalogDocument.product),
    display_name: "",
    name: "CLEANSE",
    card_tagline: null,
    tagline: "Legacy card line",
    editorial_description: null,
    description: "Legacy description",
    editorial_how_to_use: null,
    how_to_use: "Legacy directions",
    sort_order: null,
    position: 7,
    ingredients: null,
    product_details: {
      sourceFullInci: "Water, Glycerin, Panthenol, Niacinamide, Adenosine",
    },
  };
  return {
    schemaVersion: 1,
    productId: catalogDocument.productId,
    product,
    productPdpContent: structuredClone(catalogDocument.productPdpContent),
    variants: catalogDocument.variants.map((variant) => ({
      ...structuredClone(variant),
      sort_order: null,
      position: 3,
    })),
    media: catalogDocument.media.map((media) => ({
      ...structuredClone(media),
      media_type: "",
      media_kind: "image",
    })),
    relationships: [],
  };
}

describe("catalog editor document versioning", () => {
  it("upgrades V1 into the narrow V2 contract deterministically", () => {
    const upgraded = upgradeProductEditorDocument(v1Document());

    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.product).toMatchObject({
      display_name: "CLEANSE",
      card_tagline: "Legacy card line",
      editorial_description: "Legacy description",
      editorial_how_to_use: "Legacy directions",
      sort_order: 7,
      ingredients: "Water, Glycerin, Panthenol, Niacinamide, Adenosine",
    });
    expect(upgraded.product).not.toHaveProperty("name");
    expect(upgraded.product).not.toHaveProperty("product_details");
    expect(upgraded.variants[0]).toMatchObject({ sort_order: 3 });
    expect(upgraded.variants[0]).not.toHaveProperty("position");
    expect(upgraded.media[0]).toMatchObject({ media_type: "image" });
    expect(upgraded.media[0]).not.toHaveProperty("media_kind");
  });

  it("rejects conflicting canonical and compatibility INCI values", () => {
    const legacy = v1Document();
    legacy.product.ingredients =
      "Water, Glycerin, Panthenol, Niacinamide, Adenosine";
    legacy.product.product_details = {
      sourceFullInci: "Water, Glycerin, Retinol, Niacinamide, Adenosine",
    };

    expect(() => upgradeProductEditorDocument(legacy)).toThrowError(
      CatalogAdminError,
    );
  });

  it("rejects the retired campaign media role", () => {
    const legacy = v1Document();
    legacy.media[0].role = "campaign";

    expect(() => upgradeProductEditorDocument(legacy)).toThrowError(
      /campaign media role/,
    );
  });
});
