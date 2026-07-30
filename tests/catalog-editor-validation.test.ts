import { describe, expect, it } from "vitest";
import {
  assertValidProductEditorDocument,
  validateProductEditorDocument,
} from "@/lib/admin/catalog/validation";
import type { ProductEditorDocumentV1 } from "@/lib/admin/catalog/types";

const PRODUCT_ID = "123e4567-e89b-42d3-a456-426614174000";
const VARIANT_ID = "123e4567-e89b-42d3-a456-426614174001";
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174002";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174003";

function validDocument(): ProductEditorDocumentV1 {
  return {
    schemaVersion: 1,
    productId: PRODUCT_ID,
    product: {
      action_name: null,
      badge: null,
      benefits: [],
      blurb: "Focused daily care.",
      card_tagline: null,
      catalog_status: "active",
      cautions: [],
      collection: "Beyond The Core",
      concerns: [],
      currency: "USD",
      description: "A focused product description.",
      descriptor: null,
      display_name: "REFINE",
      editorial_description: null,
      editorial_how_to_use: null,
      featured_rank: null,
      finish: null,
      formal_title: null,
      formula_notes: [],
      good_for: null,
      how_to_use: "Use as directed.",
      ingredients: null,
      key_ingredients: [],
      legacy_routine_display_label: null,
      legacy_routine_group_label: null,
      made_for: null,
      name: "REFINE",
      position: 1,
      product_details: {},
      product_type: null,
      routine_display_label: null,
      routine_group: "beyond_core",
      routine_group_label: null,
      routine_number: null,
      routine_order: null,
      routine_sort: null,
      routine_step: null,
      routine_step_name: null,
      routine_step_number: null,
      search_keywords: [],
      seo_description: null,
      seo_title: null,
      skin_types: [],
      slug: "refine-02-pore-treatment-pads",
      sort_order: null,
      status: "available",
      subtitle: null,
      swatch_from: "#ffffff",
      swatch_to: "#eeeeee",
      tagline: "Measured surface care.",
      texture: null,
      usage_time: [],
      volume: null,
    },
    productPdpContent: null,
    variants: [
      {
        id: VARIANT_ID,
        available: true,
        compare_at_price_cents: null,
        inventory_status: "in_stock",
        label: "Single",
        option_values: { size: "Single" },
        pack_count: 1,
        position: 0,
        price_cents: 3200,
        sku: null,
        sort_order: 0,
        supplier_variant_id: null,
        variant_key: "single",
        volume: null,
      },
    ],
    media: [],
    relationships: [],
  };
}

describe("product editor document validation", () => {
  it("accepts the normalized versioned aggregate", () => {
    expect(assertValidProductEditorDocument(validDocument())).toMatchObject({
      schemaVersion: 1,
      productId: PRODUCT_ID,
    });
  });

  it("accepts current long-form SEO copy while retaining a finite bound", () => {
    const document = validDocument();
    document.product.seo_description = "a".repeat(360);
    expect(validateProductEditorDocument(document).issues).toEqual([]);

    document.product.seo_description = "a".repeat(401);
    expect(validateProductEditorDocument(document).issues).toEqual([
      expect.objectContaining({
        path: "product.seo_description",
        code: "too_long",
      }),
    ]);
  });

  it("rejects fractional prices, duplicate variant keys, and review data", () => {
    const document = validDocument();
    document.variants.push({
      ...document.variants[0],
      id: MEDIA_ID,
      price_cents: 12.5,
    });
    const withReviews = {
      ...document,
      reviews: [{ rating: 5, body: "Not editor-owned" }],
    };
    const { issues } = validateProductEditorDocument(withReviews);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "review_data_forbidden" }),
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({ code: "invalid_price" }),
      ]),
    );
  });

  it("validates staged media ownership metadata and controlled origins", () => {
    const document = validDocument();
    const sha256 = "a".repeat(64);
    document.media.push({
      id: MEDIA_ID,
      variant_id: VARIANT_ID,
      media_type: "image",
      media_kind: "image",
      url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/refine-02-pore-treatment-pads/drafts/${sha256}.webp`,
      alt: "REFINE product texture",
      width: 1200,
      height: 1600,
      role: "gallery",
      sort_order: 0,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: "source.webp",
      pendingUpload: {
        bucket: "mei-pelle-catalog",
        path: `products/refine-02-pore-treatment-pads/drafts/${sha256}.webp`,
        sha256,
        mimeType: "image/webp",
        sizeBytes: 2048,
        uploadedBy: ACTOR_ID,
      },
    });

    expect(
      validateProductEditorDocument(document, {
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL:
          "https://erasogmsqpgiirovubjh.supabase.co",
      } as NodeJS.ProcessEnv).issues,
    ).toEqual([]);

    document.media[0].url = "https://untrusted.example/product.webp";
    expect(
      validateProductEditorDocument(document, {
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL:
          "https://erasogmsqpgiirovubjh.supabase.co",
      } as NodeJS.ProcessEnv).issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_media_origin" }),
      ]),
    );
  });
});
