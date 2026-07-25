"use client";

import { useMemo } from "react";
import { ProductCarousel } from "@/components/ProductCarousel";
import {
  selectPdpDiscoveryProducts,
  PDP_DISCOVERY_PRODUCT_LIMIT,
} from "@/lib/merchandising";
import type { Product } from "@/lib/products";

export function ProductDiscoveryCarousel({
  currentSlug,
  products,
}: {
  currentSlug: string;
  products: readonly Product[];
}) {
  const recommendations = useMemo(
    () => selectPdpDiscoveryProducts(products, currentSlug),
    [currentSlug, products],
  );

  if (recommendations.length === 0) return null;

  return (
    <section
      className="pdp-discovery"
      aria-label="Recommended products"
      data-product-count={recommendations.length}
      data-product-limit={PDP_DISCOVERY_PRODUCT_LIMIT}
    >
      <ProductCarousel
        products={recommendations}
        ariaLabel="Recommended product carousel"
        announcementContext="the recommended products"
        className="pdp-discovery__carousel"
      />
    </section>
  );
}
