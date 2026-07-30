import { describe, expect, it } from "vitest";
import { validateCatalogEditorOwnership } from "@/lib/admin/catalog/ownership";
import { catalogDocument } from "./fixtures/catalog-editor";

function cloneDocument() {
  return structuredClone(catalogDocument);
}

describe("catalog editor field ownership", () => {
  it("allows editorial and commerce changes", () => {
    const canonical = cloneDocument();
    const candidate = cloneDocument();
    candidate.product.editorial_description = "Updated editorial copy.";
    candidate.product.status = "sold_out";
    candidate.variants[0].price_cents = 2400;
    candidate.productPdpContent!.routine_guidance = "Updated guidance.";

    expect(validateCatalogEditorOwnership(candidate, canonical)).toEqual([]);
  });

  it("rejects supplier provenance and system field changes", () => {
    const canonical = cloneDocument();
    const candidate = cloneDocument();
    candidate.product.slug = "attempted-slug-change";
    candidate.variants[0].supplier_variant_id = "supplier-variant";
    candidate.media[0].source_filename = "untrusted-source.webp";

    expect(validateCatalogEditorOwnership(candidate, canonical)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "product.slug",
          code: "field_read_only",
        }),
        expect.objectContaining({
          path: "variants.0.supplier_variant_id",
          code: "field_read_only",
        }),
        expect.objectContaining({
          path: "media.0.source_filename",
          code: "field_read_only",
        }),
      ]),
    );
  });

  it("permits required identities for new rows but not supplier provenance", () => {
    const canonical = cloneDocument();
    const candidate = cloneDocument();
    candidate.variants.push({
      ...candidate.variants[0],
      id: "123e4567-e89b-42d3-a456-426614174099",
      variant_key: "travel",
      supplier_variant_id: "forged-supplier-id",
    });

    const issues = validateCatalogEditorOwnership(candidate, canonical);
    expect(issues).toEqual([
      expect.objectContaining({
        path: "variants.1.supplier_variant_id",
        code: "field_read_only",
      }),
    ]);
    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "variants.1.id" }),
      ]),
    );
  });

  it("rejects fields outside the canonical ownership manifest", () => {
    const canonical = cloneDocument();
    const candidate = cloneDocument();
    Object.assign(candidate.product, { unsupported_field: true });

    expect(validateCatalogEditorOwnership(candidate, canonical)).toContainEqual(
      expect.objectContaining({
        path: "product.unsupported_field",
        code: "field_ownership_undefined",
      }),
    );
  });
});
