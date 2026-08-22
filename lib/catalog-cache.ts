import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  getProducts,
  resolveProductPresentationMedia,
} from "@/lib/catalog";
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
import type { Product, ProductMedia } from "@/lib/products";

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

const CARD_MEDIA_ROLES = new Set<ProductMedia["role"]>([
  "card",
  "card_default",
  "card_hover",
  "search",
]);

type LegacyOfferKey =
  | "currency"
  | "variants"
  | "status"
  | "catalogStatus";
type LegacyCardKey =
  | "badge"
  | "sortOrder";
type LegacyMediaKey =
  | "media"
  | "cardMedia"
  | "cardHoverMedia"
  | "heroMedia"
  | "detailMedia"
  | "cartMedia"
  | "searchMedia";

type LegacyProductContent = Omit<
  Product,
  LegacyOfferKey | LegacyCardKey | LegacyMediaKey
> & {
  media: ProductMedia[];
};

type LegacyProductOffer = Pick<
  Product,
  "id" | "slug" | "currency" | "variants" | "status" | "catalogStatus"
>;

type LegacyProductCard = Pick<
  Product,
  "id" | "slug" | LegacyCardKey
> & {
  media: ProductMedia[];
};

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

function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

function toLegacyContent(product: Product): LegacyProductContent {
  const content = withoutKeys(product, [
    "currency",
    "variants",
    "status",
    "catalogStatus",
    "badge",
    "sortOrder",
    "media",
    "cardMedia",
    "cardHoverMedia",
    "heroMedia",
    "detailMedia",
    "cartMedia",
    "searchMedia",
  ] as const);
  return {
    ...content,
    media: product.media.filter((media) => !CARD_MEDIA_ROLES.has(media.role)),
  };
}

function toLegacyOffer(product: Product): LegacyProductOffer {
  return {
    id: product.id,
    slug: product.slug,
    currency: product.currency,
    variants: product.variants,
    status: product.status,
    catalogStatus: product.catalogStatus,
  };
}

function toLegacyCard(product: Product): LegacyProductCard {
  return {
    id: product.id,
    slug: product.slug,
    badge: product.badge,
    sortOrder: product.sortOrder,
    media: product.media.filter((media) => CARD_MEDIA_ROLES.has(media.role)),
  };
}

function composeLegacyProduct(
  content: LegacyProductContent,
  offer: LegacyProductOffer,
  card: LegacyProductCard,
): Product {
  if (
    content.id !== offer.id ||
    content.id !== card.id ||
    content.slug !== offer.slug ||
    content.slug !== card.slug
  ) {
    throw new Error(
      `[catalog-cache] Cannot compose mismatched legacy product fragments for "${content.slug}".`,
    );
  }
  const media = [...content.media, ...card.media].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  return {
    ...content,
    ...offer,
    ...card,
    media,
    ...resolveProductPresentationMedia(media),
  };
}

const requestLegacyProducts = cache(getProducts);

const readCachedLegacyContents = unstable_cache(
  async () => (await requestLegacyProducts()).map(toLegacyContent),
  ["catalog-products-content-v3", CATALOG_MEDIA_CACHE_NAMESPACE],
  {
    revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CONTENT_COLLECTION_CACHE_TAG,
    ],
  },
);

const readCachedLegacyOffers = unstable_cache(
  async () => (await requestLegacyProducts()).map(toLegacyOffer),
  ["catalog-products-offer-v2"],
  {
    revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_OFFER_COLLECTION_CACHE_TAG,
    ],
  },
);

const readCachedLegacyCards = unstable_cache(
  async () => (await requestLegacyProducts()).map(toLegacyCard),
  ["catalog-products-card-v3", CATALOG_MEDIA_CACHE_NAMESPACE],
  {
    revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CARD_COLLECTION_CACHE_TAG,
      PRODUCT_FAMILY_CACHE_TAG,
    ],
  },
);

// `/system` still needs the complete editorial shape. Even there, the cached
// stable, offer, and card fragments retain independent freshness policies.
export async function getCachedProducts(): Promise<Product[]> {
  const [contents, offers, cards] = await Promise.all([
    readCachedLegacyContents(),
    readCachedLegacyOffers(),
    readCachedLegacyCards(),
  ]);
  const contentBySlug = new Map(contents.map((item) => [item.slug, item]));
  const offerBySlug = new Map(offers.map((item) => [item.slug, item]));
  return cards.flatMap((card) => {
    const content = contentBySlug.get(card.slug);
    const offer = offerBySlug.get(card.slug);
    return content && offer ? [composeLegacyProduct(content, offer, card)] : [];
  });
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
