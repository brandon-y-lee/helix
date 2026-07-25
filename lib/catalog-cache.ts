import { unstable_cache } from "next/cache";
import {
  getCoreRoutineProducts,
  getDiscoveryProducts,
  getProduct,
  getProducts,
  getRelatedProducts,
} from "@/lib/catalog";
import type { CoreRoutineProduct, Product } from "@/lib/products";

export const CATALOG_CACHE_REVALIDATE_SECONDS = 60 * 60;
export const CORE_ROUTINE_CACHE_TAG = "catalog:core-routine";
export const CORE_ROUTINE_PRODUCT_SLUGS = [
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
] as const;

export function collectionCacheTag(collection: string): string {
  const slug = collection
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `collection:${slug || "uncategorized"}`;
}

const readCachedProducts = unstable_cache(getProducts, ["catalog-products-v5"], {
  revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
  tags: ["catalog", "products", "collections"],
});

export function getCachedProducts(): Promise<Product[]> {
  return readCachedProducts();
}

const readCachedCoreRoutineProducts = unstable_cache(
  getCoreRoutineProducts,
  ["catalog-core-routine-v1"],
  {
    revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
    tags: [
      "catalog",
      "products",
      CORE_ROUTINE_CACHE_TAG,
      ...CORE_ROUTINE_PRODUCT_SLUGS.map((slug) => `product:${slug}`),
    ],
  },
);

export function getCachedCoreRoutineProducts(): Promise<CoreRoutineProduct[]> {
  return readCachedCoreRoutineProducts();
}

export function getCachedProduct(slug: string): Promise<Product | undefined> {
  return unstable_cache(
    () => getProduct(slug),
    ["catalog-product-v5", slug],
    {
      revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
      tags: ["catalog", "products", `product:${slug}`],
    },
  )();
}

export function getCachedRelatedProducts(
  collection: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  return unstable_cache(
    () => getRelatedProducts(collection, excludeSlug, limit),
    ["catalog-related-v5", collection, excludeSlug, String(limit)],
    {
      revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
      tags: [
        "catalog",
        "products",
        "collections",
        collectionCacheTag(collection),
        `product:${excludeSlug}`,
      ],
    },
  )();
}

export function getCachedDiscoveryProducts(
  excludeSlug: string,
  limit = 6,
): Promise<Product[]> {
  return unstable_cache(
    () => getDiscoveryProducts(excludeSlug, limit),
    ["catalog-discovery-v2", excludeSlug, String(limit)],
    {
      revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
      tags: ["catalog", "products", "collections", `product:${excludeSlug}`],
    },
  )();
}
