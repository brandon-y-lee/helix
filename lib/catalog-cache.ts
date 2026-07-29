import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  getCoreRoutineProducts,
  getDiscoveryProductSlugs,
  getProduct,
  getProducts,
  getRelatedProductSlugs,
  resolveProductPresentationMedia,
} from "@/lib/catalog";
import type {
  CoreRoutineProduct,
  Product,
  ProductMedia,
} from "@/lib/products";

// Event tags are the primary freshness mechanism. These durations are bounded
// fallbacks for missed delivery: editorial is stable, offers are not.
export const PRODUCT_CONTENT_REVALIDATE_SECONDS = 24 * 60 * 60;
export const PRODUCT_OFFER_REVALIDATE_SECONDS = 60;
export const PRODUCT_CARD_REVALIDATE_SECONDS = 60 * 60;
export const COLLECTION_REVALIDATE_SECONDS = 60 * 60;
export const CORE_ROUTINE_REVALIDATE_SECONDS = 24 * 60 * 60;
export const DISCOVERY_REVALIDATE_SECONDS = 60 * 60;

export const CATALOG_PRODUCTS_CACHE_TAG = "catalog-products";
export const PRODUCT_CONTENT_COLLECTION_CACHE_TAG =
  "catalog-product-content";
export const PRODUCT_OFFER_COLLECTION_CACHE_TAG = "catalog-product-offer";
export const PRODUCT_CARD_COLLECTION_CACHE_TAG = "catalog-product-card";
export const CORE_ROUTINE_CACHE_TAG = "catalog-core-routine";
export const DISCOVERY_CACHE_TAG = "catalog-discovery";

export const CORE_ROUTINE_PRODUCT_SLUGS = [
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
] as const;

const CARD_MEDIA_ROLES = new Set<ProductMedia["role"]>([
  "card",
  "card_default",
  "card_hover",
  "search",
]);

type OfferKey = "currency" | "variants" | "status" | "catalogStatus";
type CardKey =
  | "cardTagline"
  | "badge"
  | "featuredRank"
  | "sortOrder";
type DerivedMediaKey =
  | "media"
  | "cardMedia"
  | "cardHoverMedia"
  | "heroMedia"
  | "detailMedia"
  | "cartMedia"
  | "searchMedia";

export type CachedProductContent = Omit<
  Product,
  OfferKey | CardKey | DerivedMediaKey
> & {
  media: ProductMedia[];
};

export type CachedProductOffer = Pick<
  Product,
  "id" | "slug" | "currency" | "variants" | "status" | "catalogStatus"
>;

type CachedProductCard = Pick<
  Product,
  "id" | "slug" | CardKey
> & {
  media: ProductMedia[];
};

const requestProducts = cache(getProducts);
const requestProduct = cache(getProduct);

export function productContentCacheTag(productKey: string): string {
  return `catalog-product-content:${productKey}`;
}

export function productOfferCacheTag(productKey: string): string {
  return `catalog-product-offer:${productKey}`;
}

export function productCardCacheTag(productKey: string): string {
  return `catalog-product-card:${productKey}`;
}

export function collectionCacheTag(collection: string): string {
  const slug = collection
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

function toProductContent(product: Product): CachedProductContent {
  const content = withoutKeys(product, [
    "currency",
    "variants",
    "status",
    "catalogStatus",
    "cardTagline",
    "badge",
    "featuredRank",
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

function toProductOffer(product: Product): CachedProductOffer {
  return {
    id: product.id,
    slug: product.slug,
    currency: product.currency,
    variants: product.variants,
    status: product.status,
    catalogStatus: product.catalogStatus,
  };
}

function toProductCard(product: Product): CachedProductCard {
  return {
    id: product.id,
    slug: product.slug,
    cardTagline: product.cardTagline,
    badge: product.badge,
    featuredRank: product.featuredRank,
    sortOrder: product.sortOrder,
    media: product.media.filter((media) => CARD_MEDIA_ROLES.has(media.role)),
  };
}

function composeProduct(
  content: CachedProductContent,
  offer: CachedProductOffer,
  card: CachedProductCard,
): Product {
  if (
    content.id !== offer.id ||
    content.id !== card.id ||
    content.slug !== offer.slug ||
    content.slug !== card.slug
  ) {
    throw new Error(
      `[catalog-cache] Cannot compose mismatched product cache fragments for "${content.slug}".`,
    );
  }

  const media = [...content.media, ...card.media].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return {
    ...content,
    cardTagline: card.cardTagline,
    badge: card.badge,
    featuredRank: card.featuredRank,
    sortOrder: card.sortOrder,
    currency: offer.currency,
    variants: offer.variants,
    status: offer.status,
    catalogStatus: offer.catalogStatus,
    media,
    ...resolveProductPresentationMedia(media),
  };
}

function composeProductList(
  contents: readonly CachedProductContent[],
  offers: readonly CachedProductOffer[],
  cards: readonly CachedProductCard[],
): Product[] {
  const contentsBySlug = new Map(
    contents.map((content) => [content.slug, content]),
  );
  const offersBySlug = new Map(offers.map((offer) => [offer.slug, offer]));

  return cards.flatMap((card) => {
    const content = contentsBySlug.get(card.slug);
    const offer = offersBySlug.get(card.slug);
    return content && offer ? [composeProduct(content, offer, card)] : [];
  });
}

const readCachedProductContents = unstable_cache(
  async () => (await requestProducts()).map(toProductContent),
  ["catalog-products-content-v1"],
  {
    revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CONTENT_COLLECTION_CACHE_TAG,
    ],
  },
);

const readCachedProductOffers = unstable_cache(
  async () => (await requestProducts()).map(toProductOffer),
  ["catalog-products-offer-v1"],
  {
    revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_OFFER_COLLECTION_CACHE_TAG,
    ],
  },
);

const readCachedProductCards = unstable_cache(
  async () => (await requestProducts()).map(toProductCard),
  ["catalog-products-card-v1"],
  {
    revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
    tags: [
      CATALOG_PRODUCTS_CACHE_TAG,
      PRODUCT_CARD_COLLECTION_CACHE_TAG,
    ],
  },
);

export async function getCachedProducts(): Promise<Product[]> {
  const [contents, offers, cards] = await Promise.all([
    readCachedProductContents(),
    readCachedProductOffers(),
    readCachedProductCards(),
  ]);
  return composeProductList(contents, offers, cards);
}

const readCachedCoreRoutineProducts = unstable_cache(
  getCoreRoutineProducts,
  ["catalog-core-routine-v2"],
  {
    revalidate: CORE_ROUTINE_REVALIDATE_SECONDS,
    tags: [
      CORE_ROUTINE_CACHE_TAG,
      ...CORE_ROUTINE_PRODUCT_SLUGS.map(productContentCacheTag),
    ],
  },
);

export function getCachedCoreRoutineProducts(): Promise<CoreRoutineProduct[]> {
  return readCachedCoreRoutineProducts();
}

export function getCachedProductContent(
  slug: string,
): Promise<CachedProductContent | undefined> {
  return unstable_cache(
    async () => {
      const product = await requestProduct(slug);
      return product ? toProductContent(product) : undefined;
    },
    ["catalog-product-content-v1", slug],
    {
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [productContentCacheTag(slug)],
    },
  )();
}

export function getCachedProductOffer(
  slug: string,
): Promise<CachedProductOffer | undefined> {
  return unstable_cache(
    async () => {
      const product = await requestProduct(slug);
      return product ? toProductOffer(product) : undefined;
    },
    ["catalog-product-offer-v1", slug],
    {
      revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
      tags: [productOfferCacheTag(slug)],
    },
  )();
}

function getCachedProductCard(
  slug: string,
): Promise<CachedProductCard | undefined> {
  return unstable_cache(
    async () => {
      const product = await requestProduct(slug);
      return product ? toProductCard(product) : undefined;
    },
    ["catalog-product-card-v1", slug],
    {
      revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
      tags: [productCardCacheTag(slug)],
    },
  )();
}

export async function getCachedProduct(
  slug: string,
): Promise<Product | undefined> {
  const [content, offer, card] = await Promise.all([
    getCachedProductContent(slug),
    getCachedProductOffer(slug),
    getCachedProductCard(slug),
  ]);
  return content && offer && card
    ? composeProduct(content, offer, card)
    : undefined;
}

export async function getCachedRelatedProducts(
  collection: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  const readMembership = unstable_cache(
    () => getRelatedProductSlugs(collection, excludeSlug, limit),
    ["catalog-related-membership-v1", collection, excludeSlug, String(limit)],
    {
      revalidate: COLLECTION_REVALIDATE_SECONDS,
      tags: [
        CATALOG_PRODUCTS_CACHE_TAG,
        collectionCacheTag(collection),
      ],
    },
  );
  const [slugs, products] = await Promise.all([
    readMembership(),
    getCachedProducts(),
  ]);
  const productsBySlug = new Map(
    products.map((product) => [product.slug, product]),
  );
  return slugs.flatMap((slug) => {
    const product = productsBySlug.get(slug);
    return product ? [product] : [];
  });
}

export async function getCachedDiscoveryProducts(
  excludeSlug: string,
  limit = 6,
): Promise<Product[]> {
  const readMembership = unstable_cache(
    () => getDiscoveryProductSlugs(excludeSlug, limit),
    ["catalog-discovery-membership-v1", excludeSlug, String(limit)],
    {
      revalidate: DISCOVERY_REVALIDATE_SECONDS,
      tags: [CATALOG_PRODUCTS_CACHE_TAG, DISCOVERY_CACHE_TAG],
    },
  );
  const [slugs, products] = await Promise.all([
    readMembership(),
    getCachedProducts(),
  ]);
  const productsBySlug = new Map(
    products.map((product) => [product.slug, product]),
  );
  return slugs.flatMap((slug) => {
    const product = productsBySlug.get(slug);
    return product ? [product] : [];
  });
}
