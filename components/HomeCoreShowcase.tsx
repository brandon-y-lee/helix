"use client";

import { useState } from "react";
import { HomePhasedDescription } from "@/components/HomePhasedDescription";
import { ProductGrid } from "@/components/ProductGrid";
import {
  homeCoreDescriptions,
  type HomeCoreDescriptionKey,
} from "@/lib/content/home";
import type { Product } from "@/lib/products";

const CORE_DESCRIPTION_KEY_BY_SLUG = {
  "cleanse-01-calming-gel-cleanser": "cleanse",
  "treat-03-pdrn-5-ampoule": "treat",
  "seal-05-green-collagen-cream": "seal",
} as const satisfies Readonly<Record<string, HomeCoreDescriptionKey>>;

export function HomeCoreShowcase({ products }: { products: Product[] }) {
  const [activeDescriptionKey, setActiveDescriptionKey] =
    useState<HomeCoreDescriptionKey | null>(null);
  const description = activeDescriptionKey
    ? homeCoreDescriptions.items[activeDescriptionKey]
    : homeCoreDescriptions.default;

  return (
    <section
      id="core-three"
      className="container home-section home-section--core"
      aria-labelledby="core-three-heading"
    >
      <div className="home-section__intro home-section__intro--core">
        <p className="hero__eyebrow">The Core</p>
        <h2 id="core-three-heading" className="sr-only">
          The Core
        </h2>
        <HomePhasedDescription text={description} />
      </div>

      {products.length > 0 && (
        <ProductGrid
          products={products}
          className="product-grid home-core-products"
          previewKeyBySlug={CORE_DESCRIPTION_KEY_BY_SLUG}
          onPreviewChange={(key) =>
            setActiveDescriptionKey(key as HomeCoreDescriptionKey | null)
          }
        />
      )}
    </section>
  );
}
