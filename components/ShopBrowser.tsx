"use client";

import { useMemo, useState } from "react";
import { ProductGrid } from "@/components/ProductGrid";
import { routineGroupLabelForProduct } from "@/lib/catalog/product-routine";
import type { Product } from "@/lib/products";

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

const ALL = "All";

function minPrice(p: Product): number {
  return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
}

function groupLabel(product: Product) {
  return routineGroupLabelForProduct(product);
}

export function ShopBrowser({
  products,
  initialCollection,
}: {
  products: Product[];
  initialCollection?: string;
}) {
  // Commerce groups in the catalog's featured order.
  const collections = useMemo(() => {
    const seen: string[] = [];
    for (const p of products) {
      const label = groupLabel(p);
      if (!seen.includes(label)) seen.push(label);
    }
    return seen;
  }, [products]);

  // Honor a ?collection= deep-link from the homepage, but only if it names a
  // real collection; otherwise fall back to "All".
  const startCollection =
    initialCollection && collections.includes(initialCollection)
      ? initialCollection
      : ALL;

  const [collection, setCollection] = useState<string>(startCollection);
  const [sort, setSort] = useState<SortKey>("featured");

  const visible = useMemo(() => {
    const filtered =
      collection === ALL
        ? products
        : products.filter((p) => groupLabel(p) === collection);

    // `products` arrives pre-ordered by featured position from Supabase.
    const sorted = [...filtered];
    switch (sort) {
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name));
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
  }, [products, collection, sort]);

  return (
    <>
      <div className="container shop-toolbar">
        <div
          className="filter-chips"
          role="group"
          aria-label="Filter by collection"
        >
          <button
            type="button"
            className="chip"
            aria-pressed={collection === ALL}
            onClick={() => setCollection(ALL)}
          >
            {ALL}
          </button>
          {collections.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={collection === c}
              onClick={() => setCollection(c)}
            >
              {c}
            </button>
          ))}
        </div>

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

      <section className="container" style={{ paddingTop: "24px" }}>
        {visible.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>
            No products match this collection.
          </p>
        ) : (
          <ProductGrid products={visible} />
        )}
      </section>
    </>
  );
}
