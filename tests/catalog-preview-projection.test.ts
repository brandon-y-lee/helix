import { describe, expect, it } from "vitest";
import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import {
  CatalogPreviewProjectionError,
  projectCatalogDraftPreview,
} from "@/lib/catalog-editor/preview-projection";
import type { CatalogPreviewBase } from "@/lib/catalog-editor/preview-data";
import type {
  CoreRoutineSummary,
  PdpProduct,
} from "@/lib/catalog/models";
import { catalogDocument } from "./fixtures/catalog-editor";
import { SYSTEM_STEPS } from "@/lib/catalog/system-steps";

const productId = "33333333-3333-4333-8333-333333333333";
const canonicalSlug = "cleanse-01-calming-gel-cleanser";
const storageOrigin = "https://erasogmsqpgiirovubjh.supabase.co";
const approvedImage = `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/hero.webp`;
const approvedEditorialImage = `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/core-routine-editorial.webp`;
const approvedGalleryImage = `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/gallery-02.webp`;
const approvedApplicationImages = [1, 2, 3].map(
  (position) =>
    `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/drafts/application-${position}.webp`,
);
const approvedOutcomeImages = [1, 2, 3].map(
  (position) =>
    `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/treat/outcomes/outcome-${position}.webp`,
);

function canonicalProduct(): PdpProduct {
  return {
    id: productId,
    slug: canonicalSlug,
    displayName: "Biotic Reset",
    routineGroup: "core",
    systemStepPosition: 1,
    systemStepName: "CLEANSE",
    routineSort: 10,
    productType: "Daily gel cleanser",
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
    productType: product.productType ?? "",
    description: product.description,
    benefits: ["Cleans without stripping"],
    goodFor: product.goodFor,
    texture: product.texture,
    finish: product.finish,
    keyIngredients: product.keyIngredients,
    routineGroup: "core",
    systemStepPosition: 1,
    systemStepName: "CLEANSE",
    routineSort: 10,
    swatch: product.swatch,
    textureMedia,
    editorialMedia: {
      ...textureMedia,
      url: `${storageOrigin}/storage/v1/object/public/mei-pelle-catalog/products/cleanse/core/editorial.webp`,
      alt: "Canonical CLEANSE editorial",
      role: "core_routine_editorial",
      sortOrder: 1,
    },
    cardMedia: null,
    cartMedia: null,
    pdpContent: null,
    status: product.status,
    variants: product.variants,
  };
  return {
    product,
    coreProducts: [coreProduct],
    systemSteps: SYSTEM_STEPS.map((step) => ({ ...step })),
  };
}

function document(): ProductEditorDocumentV4 {
  const draft = structuredClone(catalogDocument);
  draft.productId = productId;
  draft.product.id = productId;
  draft.product.slug = canonicalSlug;
  draft.product.display_name = "Biotic Reset";
  draft.product.product_type = "Draft daily gel cleanser";
  draft.product.editorial_description = "Draft editorial description";
  draft.product.editorial_how_to_use = "Draft editorial use";
  draft.product.benefits = ["Draft benefit"];
  draft.productPdpContent = {
    product_id: productId,
    schema_version: 1,
    profile_title_tokens: [{ text: "Draft profile" }],
    routine_overlay: "Draft routine overlay",
    outcome_heading: null,
    outcome_labels: null,
    how_to_use_steps: ["Draft step"],
    application_steps: null,
    ingredient_cards: null,
    ingredient_story: null,
    routine_guidance: "Draft Core guidance",
    created_at: draft.product.created_at,
    updated_at: draft.product.updated_at,
  };
  draft.variants = [
    {
      ...draft.variants[0],
      id: "55555555-5555-4555-8555-555555555555",
      product_id: productId,
      label: "Draft 100 mL",
      price_cents: 9900,
      volume: "100 mL",
    },
  ];
  draft.media = [
    {
      ...draft.media[0],
      id: "66666666-6666-4666-8666-666666666666",
      product_id: productId,
      url: approvedImage,
      alt: "Saved draft CLEANSE product",
      width: 1200,
      height: 1500,
      role: "detail",
      sort_order: 0,
    },
  ];
  draft.relationships = [];
  if (draft.productSource) draft.productSource.product_id = productId;
  return draft;
}

describe("catalog draft PDP projection", () => {
  it("projects a zero-Offer waitlist Product", () => {
    const draft = document();
    draft.product.status = "waitlist";
    draft.variants = [];

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product.status).toBe("waitlist");
    expect(preview.product.variants).toEqual([]);
  });

  it("applies editor precedence without mutating the canonical aggregate", () => {
    const canonical = base();
    const original = structuredClone(canonical);
    const preview = projectCatalogDraftPreview(document(), canonical, {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product).toMatchObject({
      displayName: "Biotic Reset",
      productType: "Draft daily gel cleanser",
      description: "Draft editorial description",
      howToUse: "Draft editorial use",
      variants: [
        { id: "55555555-5555-4555-8555-555555555555", price: 9900 },
      ],
      pdpContent: {
        routineOverlay: "Draft routine overlay",
        routineGuidance: "Draft Core guidance",
      },
    });
    expect(preview.product.media).toHaveLength(1);
    expect(preview.product.detailMedia?.url).toBe(approvedImage);
    expect(preview.warnings).toEqual([]);
    expect(preview.coreProducts[0]).toMatchObject({
      displayName: "Biotic Reset",
      productType: "Draft daily gel cleanser",
      benefits: ["Draft benefit"],
      variants: [
        { id: "55555555-5555-4555-8555-555555555555", price: 9900 },
      ],
      pdpContent: { routineGuidance: "Draft Core guidance" },
      editorialMedia: null,
    });
    expect(canonical).toEqual(original);
  });

  it("projects System Step position from the Supabase-backed preview registry", () => {
    const canonical = Object.assign(base(), {
      systemSteps: [
        { name: "CLEANSE" as const, position: 2, routineGroup: "core" as const },
      ],
    });

    const preview = projectCatalogDraftPreview(document(), canonical, {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product.systemStepPosition).toBe(2);
  });

  it("projects staged Core editorial media while preserving the left texture", () => {
    const draft = document();
    draft.media.push({
      ...draft.media[0],
      id: "77777777-7777-4777-8777-777777777777",
      variant_id: null,
      media_type: "image",
      url: approvedEditorialImage,
      alt: "Draft CLEANSE routine editorial",
      width: 1400,
      height: 1600,
      role: "core_routine_editorial",
      sort_order: 1,
    });

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.coreProducts[0].textureMedia.role).toBe(
      "core_routine_texture",
    );
    expect(preview.coreProducts[0].editorialMedia).toMatchObject({
      role: "core_routine_editorial",
      url: approvedEditorialImage,
      alt: "Draft CLEANSE routine editorial",
    });
  });

  it("projects a staged gallery image after the primary detail media", () => {
    const draft = document();
    draft.media.push({
      ...draft.media[0],
      id: "99999999-9999-4999-8999-999999999999",
      variant_id: null,
      media_type: "image",
      url: approvedGalleryImage,
      alt: "CLEANSE secondary gallery portrait",
      width: 1440,
      height: 1800,
      role: "gallery",
      sort_order: 2,
    });

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });

    expect(preview.product.media.map((item) => item.role)).toEqual([
      "detail",
      "gallery",
    ]);
    expect(preview.product.media[1]).toMatchObject({
      url: approvedGalleryImage,
      alt: "CLEANSE secondary gallery portrait",
      sortOrder: 2,
    });
  });

  it("projects staged application images in canonical numeric order", () => {
    const draft = document();
    draft.media.push(
      ...approvedApplicationImages.map((url, index) => ({
        ...draft.media[0],
        id: `88888888-8888-4888-8888-88888888888${index}`,
        variant_id: null,
        media_type: "image" as const,
        url,
        alt: `Draft CLEANSE application visual ${index + 1}`,
        width: 1122,
        height: 1402,
        role: "pdp_application" as const,
        sort_order: index + 1,
      })),
    );

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });
    const applicationMedia = preview.product.media.filter(
      (item) => item.role === "pdp_application",
    );

    expect(applicationMedia.map((item) => item.sortOrder)).toEqual([1, 2, 3]);
    expect(applicationMedia.map((item) => item.url)).toEqual(
      approvedApplicationImages,
    );
  });

  it("projects staged outcome images in canonical numeric order", () => {
    const draft = document();
    draft.media.push(
      ...[3, 1, 2].map((position) => ({
        ...draft.media[0],
        id: `77777777-7777-4777-8777-77777777777${position}`,
        variant_id: null,
        media_type: "image" as const,
        url: approvedOutcomeImages[position - 1],
        alt: `Draft TREAT outcome visual ${position}`,
        width: 1200,
        height: 1400,
        role: "pdp_outcome" as const,
        sort_order: position,
      })),
    );

    const preview = projectCatalogDraftPreview(draft, base(), {
      approvedMediaOrigin: storageOrigin,
    });
    const outcomeMedia = preview.product.media.filter(
      (item) => item.role === "pdp_outcome",
    );

    expect(outcomeMedia.map((item) => item.sortOrder)).toEqual([1, 2, 3]);
    expect(outcomeMedia.map((item) => item.url)).toEqual(approvedOutcomeImages);
  });

  it("fails closed for external draft media", () => {
    const draft = document();
    draft.media = [
      {
        ...draft.media[0],
        url: "javascript:alert(1)",
      },
    ];

    expect(() =>
      projectCatalogDraftPreview(draft, base(), {
        approvedMediaOrigin: storageOrigin,
      }),
    ).toThrow(CatalogPreviewProjectionError);
  });

  it("fails honestly for unsupported document schema versions", () => {
    const draft = { ...document(), schemaVersion: 99 };

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
