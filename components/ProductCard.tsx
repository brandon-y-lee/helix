"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { Swatch } from "@/components/Swatch";
import { WaitlistButton } from "@/components/WaitlistButton";
import { statusLabel } from "@/components/productStatus";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState("");

  const defaultVariant = product.variants[0];
  const hasVariants = Boolean(defaultVariant);
  const startingPrice = hasVariants
    ? Math.min(...product.variants.map((v) => v.price))
    : 0;
  const hasRange = product.variants.length > 1;
  const badge = statusLabel(product.status);
  const href = `/products/${product.slug}`;

  async function handleAdd() {
    if (!defaultVariant) return;
    setAddError("");
    const ok = await add({
      slug: product.slug,
      name: product.name,
      variantId: defaultVariant.id,
      variantLabel: defaultVariant.label,
      price: defaultVariant.price,
      swatch: product.swatch,
    });
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    } else {
      setAddError("Cart is temporarily unavailable.");
    }
  }

  return (
    <li className="product-card">
      <Link
        href={href}
        className="product-card__media-link"
        aria-label={`${product.name} — ${product.tagline}`}
        tabIndex={-1}
      >
        <div className="product-card__media">
          <Swatch
            colors={product.swatch}
            style={{ position: "absolute", inset: 0 }}
          />
          {badge ? (
            <span className="badge badge--status">{badge}</span>
          ) : (
            <span className="product-card__collection">
              {product.collection}
            </span>
          )}
        </div>
      </Link>
      <div className="product-card__body">
        <Link href={href} className="product-card__name">
          {product.name}
        </Link>
        <span className="product-card__blurb">{product.blurb}</span>
        <span className="product-card__price">
          {hasRange ? "From " : ""}
          {formatPrice(startingPrice)}
        </span>
        <div className="product-card__cta">
          {product.status === "available" && hasVariants && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void handleAdd()}
              aria-label={`Add ${product.name} to cart`}
            >
              {added ? "Added ✓" : "Add"}
            </button>
          )}
          {product.status === "coming_soon" && (
            <WaitlistButton className="btn btn--ghost btn--sm" />
          )}
          {product.status === "sold_out" && (
            <button type="button" className="btn btn--sm" disabled>
              Sold out
            </button>
          )}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {added ? `${product.name} added to cart` : addError}
        </span>
      </div>
    </li>
  );
}
