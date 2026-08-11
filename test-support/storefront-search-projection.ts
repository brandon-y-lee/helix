import {
  buildAlgoliaRecord,
  type AlgoliaProductRecord,
  type CatalogProductSource,
} from "@/lib/algolia/record";
import type { StorefrontSnapshotProduct } from "@/test-support/storefront-baseline";

/** Project one validated snapshot Product through the production search mapper. */
export function buildStorefrontSearchRecord(
  product: StorefrontSnapshotProduct,
): AlgoliaProductRecord {
  const source = {
    id: product.id,
    slug: product.slug,
    display_name: product.displayName,
    product_type: product.productType,
    badge: product.badge,
    catalog_status: product.catalogStatus,
    editorial_description: product.editorialDescription,
    status: product.merchandisingStatus,
    swatch_from: product.swatch[0],
    swatch_to: product.swatch[1],
    sort_order: product.sortOrder,
    created_at: product.createdAt,
    made_for: product.madeFor,
    good_for: product.goodFor,
    texture: product.texture,
    key_ingredients: [...product.keyIngredients],
    ingredients: product.ingredients,
    concerns: [...product.concerns],
    usage_time: [...product.usageTime],
    search_keywords: [...product.searchKeywords],
    routine_group: product.routineGroup,
    system_step_name: product.systemStepName,
    system_steps:
      product.systemStepName && product.systemPosition !== null
        ? {
            name: product.systemStepName,
            position: product.systemPosition,
            routine_group: product.routineGroup,
          }
        : null,
    routine_sort: product.routineSort,
    published_at: product.publishedAt,
    updated_at: product.updatedAt,
    product_slug_routes: [],
    product_family_memberships: null,
    product_variants: product.variants.map((variant) => ({
      variant_key: variant.id,
      label: variant.label,
      price_cents: variant.price,
      sort_order: variant.sortOrder,
      available: variant.available,
      inventory_status: variant.inventoryStatus,
    })),
    product_media: product.media.map((media) => ({
      media_type: media.kind === "video" ? "video" : "image",
      url: media.url,
      alt: media.alt,
      width: media.width,
      height: media.height,
      role: media.role,
      sort_order: media.sortOrder,
      palette_id: media.paletteId,
      placeholder_palette: media.placeholderPalette
        ? { ...media.placeholderPalette }
        : null,
    })),
  } satisfies CatalogProductSource;

  return buildAlgoliaRecord(source);
}
