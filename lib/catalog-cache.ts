import { unstable_cache } from "next/cache";
import { getProduct, getProducts, getRelatedProducts } from "@/lib/catalog";
import type { Product } from "@/lib/products";

export const CATALOG_CACHE_REVALIDATE_SECONDS = 60 * 60;

export function collectionCacheTag(collection: string): string {
  const slug = collection
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `collection:${slug || "uncategorized"}`;
}

const readCachedProducts = unstable_cache(getProducts, ["catalog-products-v1"], {
  revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
  tags: ["catalog", "products", "collections"],
});

export function getCachedProducts(): Promise<Product[]> {
  return readCachedProducts();
}

export function getCachedProduct(slug: string): Promise<Product | undefined> {
  return unstable_cache(
    () => getProduct(slug),
    ["catalog-product-v1", slug],
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
    ["catalog-related-v1", collection, excludeSlug, String(limit)],
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
