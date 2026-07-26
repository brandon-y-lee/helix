"use client";

import { useState } from "react";
import { HomePhasedDescription } from "@/components/HomePhasedDescription";
import { ProductCarousel } from "@/components/ProductCarousel";
import {
  homeBeyondCoreDescriptions,
  type HomeBeyondCoreDescriptionKey,
} from "@/lib/content/home";
import type { Product } from "@/lib/products";

const BEYOND_DESCRIPTION_KEY_BY_SLUG: Readonly<
  Record<string, HomeBeyondCoreDescriptionKey | undefined>
> = {
  "refine-02-pore-treatment-pads": "refine",
  "frame-04-pdrn-eye-cream": "frame",
  "lift-06-pdrn-mask-system": "lift",
};

export function HomeBeyondCoreShowcase({
  products = [],
}: {
  products?: readonly Product[];
}) {
  const [activeDescriptionKey, setActiveDescriptionKey] =
    useState<HomeBeyondCoreDescriptionKey | null>(null);
  const description = activeDescriptionKey
    ? homeBeyondCoreDescriptions.items[activeDescriptionKey]
    : homeBeyondCoreDescriptions.default;

  return (
    <section
      className="home-section home-section--beyond"
      aria-labelledby="beyond-heading"
    >
      <div
        className="storefront-carousel-shell home-beyond-shell"
        data-layout-shell="carousel"
        data-product-collection="beyond"
      >
        <div className="home-section__intro home-section__intro--wide">
          <p className="hero__eyebrow">Beyond The Core</p>
          <h2 id="beyond-heading" className="sr-only">
            Beyond The Core
          </h2>

          <HomePhasedDescription text={description} />
        </div>

        <ProductCarousel
          products={products}
          ariaLabel="Beyond The Core products"
          announcementContext="Beyond The Core"
          previewKeyBySlug={BEYOND_DESCRIPTION_KEY_BY_SLUG}
          onPreviewChange={(key) =>
            setActiveDescriptionKey(
              key as HomeBeyondCoreDescriptionKey | null,
            )
          }
        />
      </div>
    </section>
  );
}
