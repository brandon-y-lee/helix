"use client";

import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { Swatch } from "@/components/Swatch";
import { formatPrice, type Product } from "@/lib/products";

export function ProductDetail({ product }: { product: Product }) {
  const { add } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [added, setAdded] = useState(false);

  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];

  function handleAdd() {
    add({
      slug: product.slug,
      name: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      price: variant.price,
      swatch: product.swatch,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  return (
    <div className="pdp">
      <Swatch colors={product.swatch} className="pdp__media" />

      <div>
        <p className="pdp__collection">{product.collection}</p>
        <h1>{product.name}</h1>
        <p className="pdp__tagline">{product.tagline}</p>
        <p className="pdp__price">{formatPrice(variant.price)}</p>
        <p className="pdp__description">{product.description}</p>

        <span className="field-label" id="size-label">
          Size
        </span>
        <div
          className="variant-options"
          role="group"
          aria-labelledby="size-label"
        >
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              className="variant-option"
              aria-pressed={v.id === variantId}
              onClick={() => setVariantId(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="pdp__actions">
          <button type="button" className="btn" onClick={handleAdd}>
            Add to cart &middot; {formatPrice(variant.price)}
          </button>
        </div>
        <p className="add-feedback" role="status" aria-live="polite">
          {added ? "Added to cart" : ""}
        </p>

        <ul className="benefits">
          {product.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>

        <div className="howto">
          <h3>How to use</h3>
          <p>{product.howToUse}</p>
        </div>
      </div>
    </div>
  );
}
