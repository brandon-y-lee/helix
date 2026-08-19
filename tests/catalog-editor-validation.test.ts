import { describe, expect, it } from "vitest";
import {
  assertValidProductEditorDocument,
  validateProductEditorDocument,
} from "@/lib/admin/catalog/validation";
import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import { catalogDocument } from "./fixtures/catalog-editor";

const PRODUCT_ID = catalogDocument.productId;
const VARIANT_ID = catalogDocument.variants[0].id;
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174002";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174003";
const FAMILY_ID = "123e4567-e89b-42d3-a456-426614174010";
const FAMILY_MEMBER_ID = "123e4567-e89b-42d3-a456-426614174011";
const APPROVED_ENV = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
} as NodeJS.ProcessEnv;

function validDocument(): ProductEditorDocumentV4 {
  const document = structuredClone(catalogDocument);
  document.media = [];
  return document;
}

function coreRoutineEditorialMedia(
  overrides: Partial<ProductEditorDocumentV4["media"][number]> = {},
): ProductEditorDocumentV4["media"][number] {
  return {
    id: MEDIA_ID,
    product_id: PRODUCT_ID,
    variant_id: null,
    media_type: "image",
    url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/cleanse-01-calming-gel-cleanser/drafts/editorial.webp",
    alt: "CLEANSE Core routine editorial",
    width: 1400,
    height: 1600,
    role: "core_routine_editorial",
    sort_order: 1,
    palette_id: null,
    placeholder_palette: {},
    original_source_url: null,
    source_filename: "cleanse-pdp-core-routine-editorial-01.webp",
    created_at: "2026-07-20T12:00:00.000Z",
    updated_at: "2026-07-20T12:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

describe("product editor document validation", () => {
  it("accepts the normalized versioned aggregate", () => {
    expect(assertValidProductEditorDocument(validDocument())).toMatchObject({
      schemaVersion: 4,
      productId: PRODUCT_ID,
    });
  });

  it("accepts a zero-Offer waitlist Product and rejects waitlist variants", () => {
    const document = validDocument();
    document.product.status = "waitlist";
    document.product.catalog_status = "active";
    document.variants = [];

    expect(validateProductEditorDocument(document).issues).toEqual([]);

    document.variants = [structuredClone(catalogDocument.variants[0])];
    expect(validateProductEditorDocument(document).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "variants",
          code: "waitlist_offer_forbidden",
        }),
      ]),
    );
  });

  it("validates System Step identity independently from Display Name", () => {
    const document = validDocument();
    document.product.display_name = "Biotic Reset";
    document.product.system_step_name = "CLEANSE";
    expect(validateProductEditorDocument(document).issues).toEqual([]);

    document.product.routine_group = "beyond_core";
    expect(validateProductEditorDocument(document).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "product.system_step_name",
          code: "routine_group_mismatch",
        }),
      ]),
    );
  });

  it("rejects a Product Family aggregate without one entry, unique order, and the current Product membership", () => {
    const document = validDocument();
    Object.assign(document, {
      productFamily: {
        family: {
          id: FAMILY_ID,
          slug: "refine",
          display_name: "REFINE",
          system_step_name: "REFINE",
          created_at: "2026-08-10T12:00:00.000Z",
          updated_at: "2026-08-10T12:00:00.000Z",
        },
        memberships: [
          {
            family_id: FAMILY_ID,
            product_id: FAMILY_MEMBER_ID,
            option_label: "Exfoliating",
            sort_order: 1,
            is_entry: false,
            created_at: "2026-08-10T12:00:00.000Z",
            updated_at: "2026-08-10T12:00:00.000Z",
          },
          {
            family_id: FAMILY_ID,
            product_id: "123e4567-e89b-42d3-a456-426614174012",
            option_label: "Brightening",
            sort_order: 1,
            is_entry: false,
            created_at: "2026-08-10T12:00:00.000Z",
            updated_at: "2026-08-10T12:00:00.000Z",
          },
        ],
      },
    });

    expect(validateProductEditorDocument(document).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "family_step_mismatch" }),
        expect.objectContaining({ code: "family_entry_required" }),
        expect.objectContaining({ code: "duplicate_family_order" }),
        expect.objectContaining({ code: "current_product_membership_required" }),
      ]),
    );
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

  it("bounds canonical Product slugs for cache tags and public paths", () => {
    const document = validDocument();
    document.product.slug = "a".repeat(120);
    expect(validateProductEditorDocument(document).issues).toEqual([]);

    document.product.slug = "a".repeat(121);
    expect(validateProductEditorDocument(document).issues).toEqual([
      expect.objectContaining({
        path: "product.slug",
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
      product_id: PRODUCT_ID,
      variant_id: VARIANT_ID,
      media_type: "image",
      url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/cleanse-01-calming-gel-cleanser/drafts/${sha256}.webp`,
      alt: "REFINE product texture",
      width: 1200,
      height: 1600,
      role: "gallery",
      sort_order: 0,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: "source.webp",
      created_at: "2026-07-20T12:00:00.000Z",
      updated_at: "2026-07-20T12:00:00.000Z",
      archived_at: null,
      pendingUpload: {
        bucket: "helix-catalog",
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

  it("accepts one fixed Core routine editorial image", () => {
    const document = validDocument();
    document.media = [coreRoutineEditorialMedia()];

    expect(validateProductEditorDocument(document, APPROVED_ENV).issues).toEqual(
      [],
    );
  });

  it("rejects duplicate, variant-linked, and non-Core editorial media", () => {
    const document = validDocument();
    document.product.routine_group = "beyond_core";
    document.media = [
      coreRoutineEditorialMedia({ variant_id: VARIANT_ID }),
      coreRoutineEditorialMedia({
        id: "123e4567-e89b-42d3-a456-426614174004",
      }),
    ];

    expect(validateProductEditorDocument(document, APPROVED_ENV).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "core_product_required" }),
        expect.objectContaining({ code: "variant_forbidden" }),
        expect.objectContaining({ code: "duplicate_core_routine_editorial" }),
      ]),
    );
  });

  it("rejects an editorial role with the wrong shape or Storage origin", () => {
    const document = validDocument();
    document.media = [
      coreRoutineEditorialMedia({
        media_type: "video",
        url: "https://untrusted.example/editorial.mp4",
        width: null,
        sort_order: 2,
      }),
    ];

    expect(validateProductEditorDocument(document, APPROVED_ENV).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "image_required" }),
        expect.objectContaining({ code: "fixed_order" }),
        expect.objectContaining({ code: "dimensions_required" }),
        expect.objectContaining({ code: "approved_storage_required" }),
      ]),
    );
  });
});
