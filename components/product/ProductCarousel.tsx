"use client";

import { useEffect, useState } from "react";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { HorizontalCarousel } from "@/components/carousel/HorizontalCarousel";
import { ProductCard, type ProductCardImageOverride } from "@/components/product/ProductCard";
import type { ProductCard as ProductCardModel } from "@/lib/catalog/models";

type ProductCarouselProps = {
  products: readonly ProductCardModel[];
  ariaLabel: string;
  announcementContext?: string;
  className?: string;
  defaultImageBySlug?: Readonly<Record<string, ProductCardImageOverride | undefined>>;
  previewKeyBySlug?: Readonly<Record<string, string | undefined>>;
  onPreviewChange?: (key: string | null) => void;
};

export function ProductCarousel({
  products,
  ariaLabel,
  announcementContext,
  className,
  defaultImageBySlug,
  previewKeyBySlug,
  onPreviewChange,
}: ProductCarouselProps) {
  const { cartDrawerOpen } = useCartDrawer();
  const [openQuickBuyProductId, setOpenQuickBuyProductId] = useState<
    string | null
  >(null);
  const visibleQuickBuyProductId = cartDrawerOpen
    ? null
    : openQuickBuyProductId;

  useEffect(() => {
    if (cartDrawerOpen) {
      setOpenQuickBuyProductId(null);
      return;
    }
    if (
      openQuickBuyProductId &&
      !products.some((product) => product.id === openQuickBuyProductId)
    ) {
      setOpenQuickBuyProductId(null);
    }
  }, [cartDrawerOpen, openQuickBuyProductId, products]);

  return (
    <HorizontalCarousel
      ariaLabel={ariaLabel}
      announcementContext={announcementContext}
      className={className}
      items={products.map((product) => ({
        key: `${product.id}:${product.slug}`,
        label: product.displayName,
        content: (
          <ProductCard
            key={product.slug}
            product={product}
            className="home-beyond-carousel__card"
            imageSizes="(max-width: 720px) 80vw, (max-width: 1199px) 48vw, 33vw"
            defaultImage={defaultImageBySlug?.[product.slug]}
            quickBuyOpen={visibleQuickBuyProductId === product.id}
            previewKey={previewKeyBySlug?.[product.slug]}
            onPreviewChange={onPreviewChange}
            onQuickBuyOpen={() => setOpenQuickBuyProductId(product.id)}
            onQuickBuyClose={() =>
              setOpenQuickBuyProductId((current) =>
                current === product.id ? null : current,
              )
            }
          />
        ),
      }))}
    />
  );
}
