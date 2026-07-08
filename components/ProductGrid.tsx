"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/products";

export function ProductGrid({
  products,
  className = "product-grid",
  previewKeyBySlug,
  onPreviewChange,
}: {
  products: Product[];
  className?: string;
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
