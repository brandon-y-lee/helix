"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductGrid } from "@/components/product/ProductGrid";
import {
  SHOP_COLLECTIONS,
  type ShopCollectionSlug,
} from "@/lib/catalog/collection-routes";
import type { ProductCard } from "@/lib/catalog/models";

type SortKey =
  | "featured"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "newest";

const SORTS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest first" },
];

function minPrice(p: ProductCard): number {
  return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
}

export function ShopBrowser({
  products,
  activeCollection,
}: {
  products: ProductCard[];
  activeCollection: ShopCollectionSlug;
}) {
  const [sort, setSort] = useState<SortKey>("featured");

  const visible = useMemo(() => {
    // `products` arrives in canonical catalog sort order from Supabase.
    const sorted = [...products];
    switch (sort) {
      case "name-asc":
        sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.displayName.localeCompare(a.displayName));
        break;
      case "price-asc":
        sorted.sort((a, b) => minPrice(a) - minPrice(b));
        break;
      case "price-desc":
        sorted.sort((a, b) => minPrice(b) - minPrice(a));
        break;
      case "newest":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "featured":
      default:
        break;
    }
    return sorted;
  }, [products, sort]);

  return (
    <>
      <div
        className="storefront-shell shop-toolbar"
        data-layout-shell="storefront"
      >
        <nav className="filter-chips" aria-label="Shop collections">
          <div className="filter-chips__track">
            {SHOP_COLLECTIONS.map((collection) => (
              <Link
                key={collection.slug}
                href={`/collections/${collection.slug}`}
                className="chip"
                aria-current={
                  activeCollection === collection.slug ? "page" : undefined
                }
              >
                {collection.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="shop-toolbar__right">
          <span className="product-count" aria-live="polite">
            {visible.length} {visible.length === 1 ? "product" : "products"}
          </span>
          <label className="sort-control">
            <span className="sr-only">Sort products</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section
        className="storefront-shell shop-grid-shell"
        data-layout-shell="storefront"
        data-product-collection={activeCollection}
        style={{ paddingTop: "24px" }}
      >
        {visible.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>
            No products are available in this collection right now.
          </p>
        ) : (
          <ProductGrid products={visible} />
        )}
      </section>
    </>
  );
}
