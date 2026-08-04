"use client";

import { useEffect, useState } from "react";
import { useCartDrawer } from "@/components/cart/CartProvider";
import {
  ProductCard,
  type ProductCardImageOverride,
} from "@/components/product/ProductCard";
import type { ProductCard as ProductCardModel } from "@/lib/catalog/models";

export function ProductGrid({
  products,
  className = "product-grid",
  defaultImageBySlug,
  previewKeyBySlug,
  onPreviewChange,
}: {
  products: ProductCardModel[];
  className?: string;
  defaultImageBySlug?: Readonly<Record<string, ProductCardImageOverride | undefined>>;
  previewKeyBySlug?: Readonly<Record<string, string | undefined>>;
  onPreviewChange?: (key: string | null) => void;
}) {
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
    <ul className={className}>
      {products.map((product) => (
        <ProductCard
          key={product.slug}
          product={product}
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
      ))}
    </ul>
  );
}
