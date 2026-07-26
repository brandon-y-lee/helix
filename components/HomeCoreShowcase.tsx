"use client";

import { useState } from "react";
import { HomePhasedDescription } from "@/components/HomePhasedDescription";
import { ProductGrid } from "@/components/ProductGrid";
import type { ProductCardImageOverride } from "@/components/ProductCard";
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

const CORE_CARD_IMAGES_BY_SLUG = {
  "cleanse-01-calming-gel-cleanser": {
    src: "/media/home/cleanse-core-card.webp",
    alt: "CLEANSE product bottle.",
    width: 1200,
    height: 1650,
    objectPosition: "50% 54%",
    presentation: "full-frame",
    sizes: "(max-width: 900px) 92vw, 33vw",
  },
  "treat-03-pdrn-5-ampoule": {
    src: "/media/home/treat-core-card.webp",
    alt: "TREAT product bottle.",
    width: 1400,
    height: 1867,
    objectPosition: "50% 54%",
    presentation: "full-frame",
    sizes: "(max-width: 900px) 92vw, 33vw",
  },
  "seal-05-green-collagen-cream": {
    src: "/media/home/seal-core-card.webp",
    alt: "SEAL product jar.",
    width: 1400,
    height: 1867,
    objectPosition: "50% 57%",
    presentation: "full-frame",
    sizes: "(max-width: 900px) 92vw, 33vw",
  },
} as const satisfies Readonly<Record<string, ProductCardImageOverride>>;

export function HomeCoreShowcase({ products }: { products: Product[] }) {
  const [activeDescriptionKey, setActiveDescriptionKey] =
    useState<HomeCoreDescriptionKey | null>(null);
  const description = activeDescriptionKey
    ? homeCoreDescriptions.items[activeDescriptionKey]
    : homeCoreDescriptions.default;

  return (
    <section
      id="core-three"
      className="storefront-shell home-section home-section--core"
      aria-labelledby="core-three-heading"
      data-layout-shell="storefront"
      data-product-collection="core"
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
          defaultImageBySlug={CORE_CARD_IMAGES_BY_SLUG}
          previewKeyBySlug={CORE_DESCRIPTION_KEY_BY_SLUG}
          onPreviewChange={(key) =>
            setActiveDescriptionKey(key as HomeCoreDescriptionKey | null)
          }
        />
      )}
    </section>
  );
}
