import { describe, expect, it } from "vitest";
import type { ProductEditorDocumentV1 } from "@/lib/catalog-editor/contracts";
import {
  CatalogPreviewProjectionError,
  projectCatalogDraftPreview,
} from "@/lib/catalog-editor/preview-projection";
import type { CatalogPreviewBase } from "@/lib/catalog-editor/preview-data";
import type {
  CoreRoutineSummary,
  PdpProduct,
} from "@/lib/catalog/models";

const productId = "33333333-3333-4333-8333-333333333333";
const canonicalSlug = "cleanse-01-calming-gel-cleanser";
const storageOrigin = "https://erasogmsqpgiirovubjh.supabase.co";
const approvedImage = `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/hero.webp`;

function canonicalProduct(): PdpProduct {
  return {
    id: productId,
    slug: canonicalSlug,
    displayName: "CLEANSE",
    cardTagline: "Canonical tagline",
    collection: "The Core",
    routineNumber: "01",
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 1,
    routineStepName: "Cleanse",
    routineDisplayLabel: "01 — The Core",
    productType: "Gel cleanser",
    description: "Canonical description",
    howToUse: "Canonical use",
    swatch: ["#dce8df", "#82978a"],
    media: [],
    cardMedia: null,
    detailMedia: null,
    cartMedia: null,
    madeFor: "All skin types",
    goodFor: "Daily cleansing",
    texture: "Gel",
    keyIngredients: ["LHA"],
    ingredients: "Water",
    productDetails: {},
    cautions: [],
    finish: "Clean",
    volume: "100 mL",
    skinTypes: ["All skin types"],
    usageTime: ["Morning", "Night"],
    pdpContent: null,
    currency: "USD",
    status: "available",
    variants: [
      {
        productId,
        productSlug: canonicalSlug,
        productStatus: "available",
        id: "canonical-100ml",
        label: "100 mL",
        price: 2200,
        available: true,
        inventoryStatus: "in_stock",
        volume: "100 mL",
        packCount: null,
        sortOrder: 0,
      },
    ],
  };
}

function base(): CatalogPreviewBase {
  const product = canonicalProduct();
  const textureMedia = {
    kind: "image" as const,
    url: `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/core/texture.webp`,
    alt: "CLEANSE texture",
    width: 800,
    height: 800,
    role: "core_routine_texture" as const,
    sortOrder: 5,
    paletteId: null,
    palette: null,
  };
  const coreProduct: CoreRoutineSummary = {
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    formalTitle: "CLEANSE 01 Calming Gel Cleanser",
    productType: product.productType ?? "",
    cardTagline: product.cardTagline,
    description: product.description,
    benefits: ["Cleans without stripping"],
    goodFor: product.goodFor,
    texture: product.texture,
    finish: product.finish,
    keyIngredients: product.keyIngredients,
    routineGroup: "core",
    routineStepNumber: 1,
    routineStepName: "Cleanse",
    routineSort: 10,
    swatch: product.swatch,
    textureMedia,
    cardMedia: null,
    cartMedia: null,
    pdpContent: null,
    status: product.status,
    variants: product.variants,
  };
  return { product, coreProducts: [coreProduct] };
}

function document(): ProductEditorDocumentV1 {
  return {
    schemaVersion: 1,
    productId,
    product: {
      slug: canonicalSlug,
      name: "Raw draft name",
      displayName: "DRAFT CLEANSE",
      tagline: "Raw draft tagline",
      cardTagline: "Draft card tagline",
      description: "Raw draft description",
      editorialDescription: "Draft editorial description",
      howToUse: "Raw draft use",
      editorialHowToUse: "Draft editorial use",
      benefits: ["Draft benefit"],
    },
    productPdpContent: {
      schemaVersion: 1,
      profileTitleTokens: [{ text: "Draft profile" }],
      routineOverlay: "Draft routine overlay",
      outcomeHeading: null,
      outcomeLabels: null,
      howToUseSteps: ["Draft step"],
      applicationSteps: null,
      ingredientCards: null,
      ingredientStory: null,
      routineGuidance: "Draft Core guidance",
    },
    variants: [
      {
        id: "draft-100ml",
        label: "Draft 100 mL",
        price: 9900,
        available: true,
        inventoryStatus: "in_stock",
        volume: "100 mL",
        packCount: null,
        sortOrder: 0,
      },
    ],
    media: [
      {
        kind: "image",
        url: approvedImage,
        alt: "Saved draft CLEANSE product",
        width: 1200,
        height: 1500,
        role: "detail",
        sortOrder: 0,
        paletteId: null,
        palette: null,
      },
      {
        kind: "image",
        url: "https://unapproved.example/draft.webp",
        alt: "Unapproved image",
        width: 1200,
        height: 1500,
        role: "gallery",
        sortOrder: 1,
        paletteId: null,
        palette: null,
      },
    ],
    relationships: [],
  };
}

describe("catalog draft PDP projection", () => {
  it("applies editor precedence without mutating the canonical aggregate", () => {
    const canonical = base();
    const original = structuredClone(canonical);
    const preview = projectCatalogDraftPreview(document(), canonical, {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product).toMatchObject({
      displayName: "DRAFT CLEANSE",
      cardTagline: "Draft card tagline",
      description: "Draft editorial description",
      howToUse: "Draft editorial use",
      variants: [{ id: "draft-100ml", price: 9900 }],
      pdpContent: {
        routineOverlay: "Draft routine overlay",
        routineGuidance: "Draft Core guidance",
      },
    });
    expect(preview.product.media).toHaveLength(1);
    expect(preview.product.detailMedia?.url).toBe(approvedImage);
    expect(preview.warnings).toEqual([
      "1 draft media item was omitted because the source, role, or type was not approved.",
    ]);
    expect(preview.coreProducts[0]).toMatchObject({
      displayName: "DRAFT CLEANSE",
      benefits: ["Draft benefit"],
      variants: [{ id: "draft-100ml", price: 9900 }],
      pdpContent: { routineGuidance: "Draft Core guidance" },
    });
    expect(canonical).toEqual(original);
  });

  it("omits external and unsupported media without crashing the preview", () => {
    const draft = document();
    draft.media = [
      {
        ...draft.media[0],
        url: "javascript:alert(1)",
      },
      {
        ...draft.media[0],
        kind: "video",
        role: "detail",
        url: `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/draft.mp4`,
      },
    ];

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product.media).toEqual([]);
    expect(preview.warnings).toEqual([
      "2 draft media items were omitted because the source, role, or type was not approved.",
      "Draft media is unavailable; layout placeholders are shown.",
    ]);
  });

  it("fails honestly for unsupported document schema versions", () => {
    const draft = { ...document(), schemaVersion: 2 };

    try {
      projectCatalogDraftPreview(draft, base(), {
        approvedMediaOrigin: storageOrigin,
      });
      expect.fail("Expected the unsupported schema to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogPreviewProjectionError);
      expect((error as CatalogPreviewProjectionError).code).toBe(
        "unsupported_schema",
      );
    }
  });
});
