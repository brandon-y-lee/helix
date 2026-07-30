import type {
  CatalogDraft,
  CatalogDraftDocument,
  CatalogEditorResponse,
  CatalogProductListItem,
} from "@/lib/admin/catalog-editor/client";

export const catalogProduct: CatalogProductListItem = {
  id: "product-cleanse",
  slug: "cleanse",
  display_name: "CLEANSE",
  routine_group: "core",
  product_status: "available",
  catalog_status: "active",
  variant_count: 1,
  minimum_price_cents: 2200,
  maximum_price_cents: 2200,
  draft_status: "draft",
  updated_at: "2026-07-20T12:00:00.000Z",
  draft_updated_at: "2026-07-21T12:00:00.000Z",
  primary_media: null,
};

export const catalogDocument: CatalogDraftDocument = {
  schemaVersion: 1,
  productId: "product-cleanse",
  products: {
    slug: "cleanse",
    display_name: "CLEANSE",
    card_tagline: "Clean skin. No tight finish.",
    editorial_description: "A daily gel cleanser.",
    editorial_how_to_use: "Massage, then rinse.",
    made_for: "Daily cleansing",
    good_for: "All skin types",
    texture: "Gel",
    finish: "Balanced",
    volume: "200 mL",
    key_ingredients: ["Panthenol"],
    benefits: ["Cleans without stripping"],
    cautions: [],
    skin_types: ["All skin types"],
    usage_time: ["AM", "PM"],
    routine_group: "core",
    routine_step_number: 1,
    routine_step_name: "Cleanse",
    routine_display_label: "01 — The Core",
    routine_sort: 1,
    seo_title: "CLEANSE | Mei Pelle",
    seo_description: "Daily gel cleanser.",
    status: "available",
    catalog_status: "active",
    source_fields: {
      name: "Supplier Cleanser",
      tagline: "Supplier tagline",
      description: "Supplier description",
      how_to_use: "Supplier directions",
    },
  },
  product_pdp_content: {
    profile_title_tokens: [{ text: "A daily " }, { text: "GEL", emphasis: true }],
    routine_overlay: "Step one",
    outcome_heading: "Clean, balanced skin",
    outcome_labels: ["Apply", "Lather", "Rinse"],
    how_to_use_steps: ["Wet skin", "Massage", "Rinse"],
    application_steps: ["Dispense", "Lather", "Rinse"],
    ingredient_cards: [
      { name: "Panthenol", description: "Supports a comfortable cleanse." },
    ],
    ingredient_story: {
      heading: "A considered cleanse",
      intro: "A concise ingredient story.",
      highlights: [
        { title: "Panthenol", description: "Comforting support." },
        { title: "Glycerin", description: "Helps retain moisture." },
      ],
      supporting_ingredients: ["Glycerin"],
    },
    routine_guidance: "Use before TREAT and SEAL.",
  },
  product_variants: [
    {
      id: "variant-cleanse",
      variant_key: "200ml",
      label: "200 mL",
      sku: "MP-CLEANSE-200",
      price_cents: 2200,
      available: true,
      inventory_status: "in_stock",
      volume: "200 mL",
      pack_count: 1,
      sort_order: 0,
    },
  ],
  product_media: [
    {
      id: "media-cleanse",
      url: "https://example.test/cleanse.webp",
      media_type: "image",
      media_kind: "image",
      role: "card",
      alt: "CLEANSE bottle",
      width: 800,
      height: 1000,
      sort_order: 0,
    },
    {
      id: "media-cleanse-2",
      url: "https://example.test/cleanse-detail.webp",
      media_type: "image",
      media_kind: "image",
      role: "detail",
      alt: "CLEANSE texture",
      width: 800,
      height: 1000,
      sort_order: 1,
    },
  ],
  product_relationships: [],
};

export const catalogDraft: CatalogDraft = {
  id: "draft-cleanse",
  product_id: "product-cleanse",
  status: "draft",
  base_revision: 3,
  version: 4,
  updated_at: "2026-07-21T12:00:00.000Z",
  document: catalogDocument,
};

export function editorResponse(publish = true): CatalogEditorResponse {
  return {
    product: catalogDocument,
    draft: catalogDraft,
    latest_revision: 3,
    permissions: { publish },
  };
}
