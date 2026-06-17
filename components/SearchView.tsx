"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/products";

export function SearchView({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term) return [];
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.collection.toLowerCase().includes(term) ||
        p.blurb.toLowerCase().includes(term),
    );
  }, [products, term]);

  return (
    <>
      <div className="search-box">
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          placeholder="Search the collection…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div style={{ paddingTop: "24px" }} aria-live="polite">
        {term === "" ? (
          <p style={{ color: "var(--ink-soft)" }}>
            Type to search the collection.
          </p>
        ) : results.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>
            No products match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="product-grid">
            {results.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
