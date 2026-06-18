// Deterministic merchandising selectors for discovery surfaces (homepage,
// collection landing, PDP rails). These are pure functions over the Supabase
// catalog — no schema changes, no CMS, no Algolia. Products arrive pre-ordered
// by featured `position` from the catalog layer; selectors preserve or derive
// order from existing fields only.

import type { Product } from "@/lib/products";

/** Top N in featured (position) order, as returned by the catalog. */
export function featuredProducts(products: Product[], limit = 3): Product[] {
  return products.slice(0, limit);
}

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

/** Distinct collections in featured order (for chips / callouts). */
export function collectionNames(products: Product[]): string[] {
  const seen: string[] = [];
  for (const p of products) {
    if (!seen.includes(p.collection)) seen.push(p.collection);
  }
  return seen;
}

/**
 * A "daily routine" — one representative product per collection, in catalog
 * order, preferring an available product within each collection. Gives the
 * homepage a guided "start here" module without any schema additions.
 */
export function routine(products: Product[], limit = 4): Product[] {
  const byCollection = new Map<string, Product>();
  for (const p of products) {
    const current = byCollection.get(p.collection);
    if (!current) {
      byCollection.set(p.collection, p);
    } else if (current.status !== "available" && p.status === "available") {
      // Upgrade to an available product if the first pick wasn't buyable.
      byCollection.set(p.collection, p);
    }
  }
  return [...byCollection.values()].slice(0, limit);
}
