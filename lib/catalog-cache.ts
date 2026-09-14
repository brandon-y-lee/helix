import { unstable_cache } from "next/cache";
import {
  getCoreRoutineContentSummaries,
  getDiscoveryProductCardContents,
  getIngredientIndexProducts,
  getPdpProductContent,
  getProductCardContents,
  getProductMetadata,
  getProductOffer,
  getProductOffers,
  getProductRoutes,
  getProductSlugResolution,
} from "@/lib/catalog/storefront";
import {
  CORE_ROUTINE_PRODUCT_SLUGS,
  type CoreRoutineContentSummary,
  type CoreRoutineSummary,
  type IngredientIndexProduct,
  type PdpProduct,
  type PdpProductContent,
  type ProductCard,
  type ProductCardContent,
  type ProductMetadata,
  type ProductOffer,
  type ProductRoute,
  type ProductSlugResolution,
} from "@/lib/catalog/models";
import { PDP_DISCOVERY_PRODUCT_LIMIT } from "@/lib/catalog/discovery";
import { CATALOG_MEDIA_BUCKET } from "@/lib/catalog/media-storage";
import { routineGroupLabel } from "@/lib/catalog/product-routine";

// Tags are the primary freshness mechanism. Durations bound staleness if a
// delivery is missed, with volatile commerce state isolated from editorial.
export const PRODUCT_CONTENT_REVALIDATE_SECONDS = 24 * 60 * 60;
export const PRODUCT_OFFER_REVALIDATE_SECONDS = 60;
export const PRODUCT_CARD_REVALIDATE_SECONDS = 60 * 60;
const COLLECTION_REVALIDATE_SECONDS = 60 * 60;
export const CORE_ROUTINE_REVALIDATE_SECONDS = 24 * 60 * 60;
const DISCOVERY_REVALIDATE_SECONDS = 60 * 60;
const CATALOG_MEDIA_CACHE_NAMESPACE = `catalog-media:${CATALOG_MEDIA_BUCKET}`;

export const CATALOG_PRODUCTS_CACHE_TAG = "catalog-products";
export const PRODUCT_CONTENT_COLLECTION_CACHE_TAG =
  "catalog-product-content";
export const PRODUCT_OFFER_COLLECTION_CACHE_TAG = "catalog-product-offer";
export const PRODUCT_CARD_COLLECTION_CACHE_TAG = "catalog-product-card";
export const CORE_ROUTINE_CACHE_TAG = "catalog-core-routine";
export const DISCOVERY_CACHE_TAG = "catalog-discovery";
export const PRODUCT_FAMILY_CACHE_TAG = "catalog-product-family";
export const PRODUCT_SLUG_ROUTE_COLLECTION_CACHE_TAG =
  "catalog-product-slug-route";
export { CORE_ROUTINE_PRODUCT_SLUGS } from "@/lib/catalog/models";

export function productContentCacheTag(productKey: string): string {
  return `catalog-product-content:${productKey}`;
}

export function productOfferCacheTag(productKey: string): string {
  return `catalog-product-offer:${productKey}`;
}

export function productCardCacheTag(productKey: string): string {
  return `catalog-product-card:${productKey}`;
}

export function productSlugRouteCacheTag(sourceSlug: string): string {
  return `catalog-product-slug-route:${sourceSlug}`;
}

export function collectionCacheTag(routineGroup: string): string {
  const label =
    routineGroup === "core" || routineGroup === "beyond_core"
      ? routineGroupLabel(routineGroup)
      : routineGroup;
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `collection:${slug || "uncategorized"}`;
}

const readCachedProductOffers = unstable_cache(
  getProductOffers,
  ["catalog-purpose-offers-v1"],
  {
    revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_OFFER_COLLECTION_CACHE_TAG,
    ],
  },
);

function offerMap(offers: readonly ProductOffer[]) {
  return new Map(offers.map((offer) => [offer.slug, offer]));
}

function composeCard(
  content: ProductCardContent,
  offer: ProductOffer,
): ProductCard {
  if (content.id !== offer.id || content.slug !== offer.slug) {
    throw new Error(
      `[catalog-cache] Cannot compose mismatched card and offer for "${content.slug}".`,
    );
  }
  return {
    ...content,
    status: offer.status,
    variants: offer.variants,
  };
}

function composePdp(
  content: PdpProductContent,
  offer: ProductOffer,
): PdpProduct {
  if (content.id !== offer.id || content.slug !== offer.slug) {
    throw new Error(
      `[catalog-cache] Cannot compose mismatched PDP and offer for "${content.slug}".`,
    );
  }
  return {
    ...content,
    currency: offer.currency,
    status: offer.status,
    variants: offer.variants,
  };
}

function composeCore(
  content: CoreRoutineContentSummary,
  offer: ProductOffer,
): CoreRoutineSummary {
  if (content.id !== offer.id || content.slug !== offer.slug) {
    throw new Error(
      `[catalog-cache] Cannot compose mismatched Core summary and offer for "${content.slug}".`,
    );
  }
  return {
    ...content,
    status: offer.status,
    variants: offer.variants,
  };
}

const readCachedProductCardContents = unstable_cache(
  getProductCardContents,
  ["catalog-product-cards-v3", CATALOG_MEDIA_CACHE_NAMESPACE],
  {
    revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CARD_COLLECTION_CACHE_TAG,
      PRODUCT_FAMILY_CACHE_TAG,
    ],
  },
);

export async function getCachedProductCards(): Promise<ProductCard[]> {
  const [contents, offers] = await Promise.all([
    readCachedProductCardContents(),
    readCachedProductOffers(),
  ]);
  const offersBySlug = offerMap(offers);
  return contents.flatMap((content) => {
    const offer = offersBySlug.get(content.slug);
    return offer ? [composeCard(content, offer)] : [];
  });
}

const readCachedProductRoutes = unstable_cache(
  getProductRoutes,
  ["catalog-product-routes-v2"],
  {
    revalidate: COLLECTION_REVALIDATE_SECONDS,
    tags: [CATALOG_PRODUCTS_CACHE_TAG],
  },
);

export function getCachedProductRoutes(): Promise<ProductRoute[]> {
  return readCachedProductRoutes();
}

export function getCachedProductSlugResolution(
  sourceSlug: string,
): Promise<ProductSlugResolution | undefined> {
  return unstable_cache(
    () => getProductSlugResolution(sourceSlug),
    ["catalog-product-slug-route-v1", sourceSlug],
    {
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [
        PRODUCT_SLUG_ROUTE_COLLECTION_CACHE_TAG,
        productSlugRouteCacheTag(sourceSlug),
      ],
    },
  )();
}

const readCachedIngredientIndexProducts = unstable_cache(
  getIngredientIndexProducts,
  ["catalog-ingredient-index-products-v2"],
  {
    revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CONTENT_COLLECTION_CACHE_TAG,
    ],
  },
);

export function getCachedIngredientIndexProducts(): Promise<
  IngredientIndexProduct[]
> {
  return readCachedIngredientIndexProducts();
}

const readCachedCoreRoutineContents = unstable_cache(
  getCoreRoutineContentSummaries,
  ["catalog-core-routine-content-v5", CATALOG_MEDIA_CACHE_NAMESPACE],
  {
    revalidate: CORE_ROUTINE_REVALIDATE_SECONDS,
    tags: [
      CORE_ROUTINE_CACHE_TAG,
      ...CORE_ROUTINE_PRODUCT_SLUGS.map(productContentCacheTag),
    ],
  },
);

export async function getCachedCoreRoutineSummaries(): Promise<
  CoreRoutineSummary[]
> {
  const [contents, offers] = await Promise.all([
    readCachedCoreRoutineContents(),
    readCachedProductOffers(),
  ]);
  const offersBySlug = offerMap(offers);
  return contents.flatMap((content) => {
    const offer = offersBySlug.get(content.slug);
    return offer ? [composeCore(content, offer)] : [];
  });
}

export async function getCachedPdpProduct(
  slug: string,
): Promise<PdpProduct | undefined> {
  const [content, offer] = await Promise.all([
    unstable_cache(
      () => getPdpProductContent(slug),
      ["catalog-pdp-content-v4", CATALOG_MEDIA_CACHE_NAMESPACE, slug],
      {
        revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
        tags: [productContentCacheTag(slug), PRODUCT_FAMILY_CACHE_TAG],
      },
    )(),
    unstable_cache(
      () => getProductOffer(slug),
      ["catalog-pdp-offer-v2", slug],
      {
        revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
        tags: [productOfferCacheTag(slug)],
      },
    )(),
  ]);
  return content && offer ? composePdp(content, offer) : undefined;
}

export function getCachedProductMetadata(
  slug: string,
): Promise<ProductMetadata | undefined> {
  return unstable_cache(
    () => getProductMetadata(slug),
    ["catalog-product-metadata-v3", slug],
    {
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [productContentCacheTag(slug)],
    },
  )();
}

export async function getCachedDiscoveryProductCards(
  excludeSlug: string,
  limit = PDP_DISCOVERY_PRODUCT_LIMIT,
): Promise<ProductCard[]> {
  const [contents, offers] = await Promise.all([
    unstable_cache(
      () => getDiscoveryProductCardContents(excludeSlug, limit),
      [
        "catalog-discovery-cards-v5",
        CATALOG_MEDIA_CACHE_NAMESPACE,
        excludeSlug,
        String(limit),
      ],
      {
        revalidate: DISCOVERY_REVALIDATE_SECONDS,
        tags: [
          CATALOG_PRODUCTS_CACHE_TAG,
          DISCOVERY_CACHE_TAG,
          PRODUCT_CARD_COLLECTION_CACHE_TAG,
          PRODUCT_FAMILY_CACHE_TAG,
        ],
      },
    )(),
    readCachedProductOffers(),
  ]);
  const offersBySlug = offerMap(offers);
  return contents.flatMap((content) => {
    const offer = offersBySlug.get(content.slug);
    return offer ? [composeCard(content, offer)] : [];
  });
}
