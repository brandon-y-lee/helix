"use client";

import { useState } from "react";
import { HomePhasedDescription } from "@/components/home/HomePhasedDescription";
import { ProductCarousel } from "@/components/product/ProductCarousel";
import type { ProductCardImageOverride } from "@/components/product/ProductCard";
import {
  homeCoreDescriptions,
  type HomeCoreDescriptionKey,
} from "@/lib/content/home";
import type { ProductCard } from "@/lib/catalog/models";

const CORE_DESCRIPTION_KEY_BY_SLUG = {
  "biotic-reset": "cleanse",
  "super-serum": "treat",
  "maxxing-serum": "treat",
  "peptide-bounce": "treat",
  "ceramide-cushion": "seal",
} as const satisfies Readonly<Record<string, HomeCoreDescriptionKey>>;

const CORE_CARD_IMAGES_BY_SLUG = {
  "biotic-reset": {
    src: "/media/home/cleanse-product-card-default-01.webp",
    alt: "Biotic Reset product bottle.",
    width: 1200,
    height: 1650,
    objectPosition: "50% 54%",
    presentation: "full-frame",
    sizes: "(max-width: 720px) 80vw, (max-width: 900px) 44vw, 33vw",
  },
} as const satisfies Readonly<Record<string, ProductCardImageOverride>>;

export function HomeCoreShowcase({ products }: { products: ProductCard[] }) {
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
        <ProductCarousel
          products={products}
          className="home-core-products"
          ariaLabel="The Core products"
          announcementContext="The Core"
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
