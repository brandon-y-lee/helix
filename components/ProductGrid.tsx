"use client";

import { useEffect, useState } from "react";
import {
  ProductCard,
  type ProductCardImageOverride,
} from "@/components/ProductCard";
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
  const [openQuickBuyProductId, setOpenQuickBuyProductId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (
      openQuickBuyProductId &&
      !products.some((product) => product.id === openQuickBuyProductId)
    ) {
      setOpenQuickBuyProductId(null);
    }
  }, [openQuickBuyProductId, products]);

  return (
    <ul className={className}>
      {products.map((product) => (
        <ProductCard
          key={product.slug}
          product={product}
          defaultImage={defaultImageBySlug?.[product.slug]}
          quickBuyOpen={openQuickBuyProductId === product.id}
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
