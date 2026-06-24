// Deterministic merchandising selectors for discovery surfaces. These are pure
// functions over the Supabase catalog — no schema changes, no CMS, no Algolia.
// Products arrive pre-ordered by featured `position` from the catalog layer;
// selectors preserve or derive order from existing fields only.

import type { Product } from "@/lib/products";

/** Newest N by createdAt (descending). Stable for equal timestamps. */
export function newArrivals(products: Product[], limit = 3): Product[] {
  return [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Available-now N in featured order. */
export function availableNow(products: Product[], limit = 4): Product[] {
  return products.filter((p) => p.status === "available").slice(0, limit);
}
