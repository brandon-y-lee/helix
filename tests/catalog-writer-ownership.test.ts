import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_FIELD_OWNERSHIP,
  getCatalogFieldOwnership,
} from "@/lib/catalog/field-ownership";
import { parseImportArgs } from "@/scripts/catalog-import-leaders";
import { parseRefreshArgs } from "@/scripts/catalog-refresh-presentation";
import {
  assertCatalogInputFields,
  executeCatalogProductWritePlans,
  overwriteConfirmationMode,
  planPresentationProductWrite,
  planSupplierProductWrite,
} from "@/scripts/catalog/catalog-writer-policy";

const existingProduct = {
  id: "product-id",
  slug: "cleanse-01-calming-gel-cleanser",
  texture: "Old supplier texture",
  ingredients: "Water, Glycerin",
  status: "available",
  display_name: "CLEANSE",
  card_tagline: "Editor-owned card line",
  editorial_description: "Editor-owned description",
  editorial_how_to_use: "Editor-owned directions",
  seo_title: null,
};

function supplierPlan(overwriteEditorial: boolean) {
  return planSupplierProductWrite({
    slug: existingProduct.slug,
    existing: existingProduct,
    insert: {
      id: existingProduct.id,
      slug: existingProduct.slug,
      texture: "New supplier texture",
      ingredients: "Water, Glycerin, Panthenol",
      status: "sold_out",
      ...(overwriteEditorial
        ? {
            display_name: "SUPPLIER DISPLAY",
            card_tagline: "Supplier card line",
            editorial_description: "Supplier description",
            editorial_how_to_use: "Supplier directions",
          }
        : {}),
    },
    source: {
      texture: "New supplier texture",
      ingredients: "Water, Glycerin, Panthenol",
    },
    commerce: {
      status: "sold_out",
    },
    editorial: {
      display_name: "SUPPLIER DISPLAY",
      card_tagline: "Supplier card line",
      editorial_description: "Supplier description",
      editorial_how_to_use: "Supplier directions",
    },
    overwriteEditorial,
  });
}

describe("catalog field ownership", () => {
  it("exports editor metadata for editorial, supplier, commerce, and derived fields", () => {
    expect(getCatalogFieldOwnership("products", "display_name")).toMatchObject({
      owner: "editorial",
      editor: {
        editable: true,
        requiresPublishCapability: true,
      },
    });
    expect(getCatalogFieldOwnership("products", "texture")).toMatchObject({
      owner: "supplier",
      editor: {
        editable: true,
        editableBy: ["admin"],
        readOnlySource: false,
      },
      importWarning: expect.stringContaining("supplier import"),
    });
    expect(
      getCatalogFieldOwnership("product_variants", "price_cents"),
    ).toMatchObject({
      owner: "commerce",
      editor: { commerceSensitive: true },
    });
    expect(getCatalogFieldOwnership("algolia_products", "title")).toMatchObject({
      owner: "derived",
      supplierImport: {
        default: "never",
        overwriteEditorial: "never",
      },
      editor: { derived: true },
    });
    const keys = CATALOG_FIELD_OWNERSHIP.map(
      (field) => `${field.table}.${field.field}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never accepts derived fields as canonical writer input", () => {
    expect(() =>
      assertCatalogInputFields("algolia_products", ["title"], ["supplier"]),
    ).toThrow("derived-owned");
    expect(
      CATALOG_FIELD_OWNERSHIP.filter((field) => field.owner === "derived").every(
        (field) =>
          field.supplierImport.default === "never" &&
          field.supplierImport.overwriteEditorial === "never",
      ),
    ).toBe(true);
  });
});

describe("supplier catalog writer", () => {
  it("seeds editorial fields for a new product without treating them as an overwrite", () => {
    const plan = planSupplierProductWrite({
      slug: "new-product",
      existing: null,
      insert: {
        id: "new-product-id",
        slug: "new-product",
        texture: "Gel",
        status: "available",
        display_name: "NEW",
      },
      source: { texture: "Gel" },
      commerce: { status: "available" },
      editorial: { display_name: "NEW" },
      overwriteEditorial: false,
    });

    expect(plan.insert).toMatchObject({
      id: "new-product-id",
      display_name: "NEW",
    });
    expect(plan.editorialFieldsSeeded).toEqual(["display_name"]);
    expect(plan.editorialFieldsSkipped).toEqual([]);
    expect(plan.editorialFieldsToOverwrite).toEqual([]);
  });

  it("updates source and commerce fields without replacing populated editorial fields", () => {
    const plan = supplierPlan(false);

    expect(plan.update).toEqual({
      texture: "New supplier texture",
      ingredients: "Water, Glycerin, Panthenol",
      status: "sold_out",
    });
    expect(plan.editorialFieldsSkipped).toEqual([
      "display_name",
      "card_tagline",
      "editorial_description",
      "editorial_how_to_use",
    ]);
    expect(plan.editorialFieldsToOverwrite).toEqual([]);
  });

  it("reports and writes only intended editorial fields with the explicit flag", () => {
    const plan = supplierPlan(true);

    expect(plan.update).toMatchObject({
      texture: "New supplier texture",
      ingredients: "Water, Glycerin, Panthenol",
      status: "sold_out",
      display_name: "SUPPLIER DISPLAY",
      card_tagline: "Supplier card line",
      editorial_description: "Supplier description",
      editorial_how_to_use: "Supplier directions",
    });
    expect(plan.editorialFieldsToOverwrite).toEqual([
      "display_name",
      "card_tagline",
      "editorial_description",
      "editorial_how_to_use",
    ]);
    expect(plan.editorialFieldsSkipped).toEqual([]);
  });

  it("does not let --force imply editorial overwrite", () => {
    expect(parseImportArgs(["--apply", "--force"])).toMatchObject({
      apply: true,
      overwriteEditorial: false,
    });
    expect(
      parseImportArgs(["--apply", "--overwrite-editorial"]),
    ).toMatchObject({
      apply: true,
      overwriteEditorial: true,
      confirmedEditorialOverwrite: false,
    });
  });
});

describe("presentation refresh", () => {
  it("seeds missing canonical fields but refuses populated overwrite by default", () => {
    const plan = planPresentationProductWrite({
      slug: existingProduct.slug,
      existing: existingProduct,
      editorial: {
        display_name: "NEW DISPLAY",
        card_tagline: "New card line",
        editorial_description: "New description",
        seo_title: "Seeded SEO title",
      },
      overwriteEditorial: false,
    });

    expect(plan.update).toEqual({ seo_title: "Seeded SEO title" });
    expect(plan.editorialFieldsSeeded).toEqual(["seo_title"]);
    expect(plan.editorialFieldsSkipped).toEqual([
      "display_name",
      "card_tagline",
      "editorial_description",
    ]);
  });

  it("makes controlled recovery possible with explicit editorial overwrite", () => {
    const plan = planPresentationProductWrite({
      slug: existingProduct.slug,
      existing: existingProduct,
      editorial: {
        display_name: "NEW DISPLAY",
        editorial_description: "Recovered description",
      },
      overwriteEditorial: true,
    });

    expect(plan.update).toEqual({
      display_name: "NEW DISPLAY",
      editorial_description: "Recovered description",
    });
    expect(plan.editorialFieldsToOverwrite).toEqual([
      "display_name",
      "editorial_description",
    ]);
  });

  it("requires editorial ownership before media replacement", () => {
    expect(() => parseRefreshArgs(["--apply", "--overwrite-media"])).toThrow(
      "--overwrite-media requires --overwrite-editorial",
    );
    expect(parseRefreshArgs(["--apply", "--force"])).toMatchObject({
      overwriteEditorial: false,
      overwriteMedia: false,
    });
  });
});

describe("catalog writer safeguards", () => {
  it("performs no writes during a dry run", async () => {
    const insert = vi.fn(async () => undefined);
    const update = vi.fn(async () => undefined);

    await expect(
      executeCatalogProductWritePlans({
        apply: false,
        plans: [supplierPlan(true)],
        insert,
        update,
      }),
    ).resolves.toEqual({ inserted: 0, updated: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("requires an additional confirmation outside an interactive terminal", () => {
    expect(() =>
      overwriteConfirmationMode({
        apply: true,
        overwriteEditorial: true,
        hasOverwriteTargets: true,
        interactive: false,
        confirmedNonInteractive: false,
      }),
    ).toThrow("--confirm-editorial-overwrite");
    expect(
      overwriteConfirmationMode({
        apply: true,
        overwriteEditorial: true,
        hasOverwriteTargets: true,
        interactive: false,
        confirmedNonInteractive: true,
      }),
    ).toBe("confirmed-non-interactive");
    expect(
      overwriteConfirmationMode({
        apply: true,
        overwriteEditorial: true,
        hasOverwriteTargets: true,
        interactive: true,
        confirmedNonInteractive: true,
      }),
    ).toBe("prompt");
  });
});
