import { describe, expect, it } from "vitest";
import {
  assertValidProductEditorDocument,
  validateProductEditorDocument,
} from "@/lib/admin/catalog/validation";
import type { ProductEditorDocumentV2 } from "@/lib/admin/catalog/types";
import { catalogDocument } from "./fixtures/catalog-editor";

const PRODUCT_ID = catalogDocument.productId;
const VARIANT_ID = catalogDocument.variants[0].id;
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174002";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174003";

function validDocument(): ProductEditorDocumentV2 {
  const document = structuredClone(catalogDocument);
  document.media = [];
  return document;
}

describe("product editor document validation", () => {
  it("accepts the normalized versioned aggregate", () => {
    expect(assertValidProductEditorDocument(validDocument())).toMatchObject({
      schemaVersion: 2,
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
      url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/cleanse-01-calming-gel-cleanser/drafts/${sha256}.webp`,
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
        path: `products/cleanse-01-calming-gel-cleanser/drafts/${sha256}.webp`,
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
