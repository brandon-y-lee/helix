import { describe, expect, it } from "vitest";
import { catalogDocumentDiff } from "@/lib/admin/catalog/diff";
import { catalogDocument } from "./fixtures/catalog-editor";

describe("catalog editor publish diff", () => {
  it("groups advanced changes by normalized table with auditable values", () => {
    const candidate = structuredClone(catalogDocument);
    candidate.product.texture = "Fluid gel";
    candidate.variants[0].price_cents = 2400;
    candidate.productSource!.supplier_title = "Corrected supplier title";

    const result = catalogDocumentDiff(catalogDocument, candidate);

    expect(result.affectedTables).toEqual([
      "products",
      "product_variants",
      "product_sources",
    ]);
    expect(result.advancedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "products",
          field: "texture",
          before: "Gel",
          after: "Fluid gel",
        }),
        expect.objectContaining({
          table: "product_variants",
          field: expect.stringContaining(".price_cents"),
          before: 2200,
          after: 2400,
        }),
        expect.objectContaining({
          table: "product_sources",
          field: "supplier_title",
          before: "Supplier Cleanser",
          after: "Corrected supplier title",
        }),
      ]),
    );
  });

  it("requires disruptive acknowledgement when all sellable variants are deactivated", () => {
    const candidate = structuredClone(catalogDocument);
    candidate.variants[0].available = false;
    candidate.variants[0].inventory_status = "out_of_stock";

    expect(
      catalogDocumentDiff(catalogDocument, candidate).diff.product_variants,
    ).toContainEqual(
      expect.objectContaining({
        field: expect.stringContaining(".available"),
        disruptive: true,
      }),
    );
  });

  it("distinguishes primary media archive from non-primary cleanup", () => {
    const withoutCard = structuredClone(catalogDocument);
    withoutCard.media = withoutCard.media.filter((media) => media.role !== "card");
    const withGallery = structuredClone(catalogDocument);
    withGallery.media.push({
      ...withGallery.media[1],
      id: "123e4567-e89b-42d3-a456-426614174088",
      role: "gallery",
      sort_order: 2,
    });
    const withoutGallery = structuredClone(withGallery);
    withoutGallery.media = withoutGallery.media.filter(
      (media) => media.role !== "gallery",
    );

    expect(
      catalogDocumentDiff(catalogDocument, withoutCard).diff.product_media,
    ).toContainEqual(expect.objectContaining({ disruptive: true }));
    expect(
      catalogDocumentDiff(withGallery, withoutGallery).diff.product_media,
    ).toContainEqual(expect.objectContaining({ disruptive: false }));
  });
});
