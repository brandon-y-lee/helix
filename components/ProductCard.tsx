"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductImage";
import { WaitlistButton } from "@/components/WaitlistButton";
import { formatPrice, type Product, type ProductMedia } from "@/lib/products";
import type { CartPlaceholderMedia } from "@/lib/cart/types";

function minPrice(product: Product): number {
  return product.variants.length
    ? Math.min(...product.variants.map((variant) => variant.price))
    : 0;
}

function cartPlaceholderMedia(
  media: ProductMedia | null | undefined,
): CartPlaceholderMedia {
  if (media?.kind !== "placeholder" || !media.palette) return null;
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.paletteId,
    palette: media.palette,
  };
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [addError, setAddError] = useState("");

  const href = `/products/${product.slug}`;
  const availableVariants = product.variants.filter(
    (variant) =>
      variant.available &&
      variant.inventoryStatus !== "out_of_stock" &&
      variant.inventoryStatus !== "unavailable",
  );
  const singleAvailableVariant =
    product.status === "available" &&
    product.variants.length === 1 &&
    availableVariants.length === 1
      ? availableVariants[0]
      : null;
  const startingPrice = minPrice(product);
  const hasRange = product.variants.length > 1;
  const priceLabel = `${hasRange ? "From " : ""}${formatPrice(startingPrice)}`;
  const displayName = product.displayName;

  async function handleAdd() {
    if (!singleAvailableVariant || pending) return;
    setPending(true);
    setAddError("");
    const media = product.cartMedia ?? product.cardMedia;
    const ok = await add({
      slug: product.slug,
      name: displayName,
      variantId: singleAvailableVariant.id,
      variantLabel: singleAvailableVariant.label,
      price: singleAvailableVariant.price,
      swatch: product.swatch,
      imageUrl: null,
      imageAlt: media?.alt ?? null,
      placeholderMedia: cartPlaceholderMedia(media),
    });
    setPending(false);
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    } else {
      setAddError("Cart is temporarily unavailable.");
    }
  }

  return (
    <li className="product-card">
      <div className="product-card__surface">
        <ProductImage
          media={product.cardMedia}
          swatch={product.swatch}
          className="product-card__image"
          imageClassName="product-card__img"
          sizes="(max-width: 720px) 92vw, (max-width: 1180px) 33vw, 420px"
        />
        <ProductImage
          media={product.cardHoverMedia}
          swatch={product.swatch}
          className="product-card__image product-card__image--hover"
          imageClassName="product-card__img"
          sizes="(max-width: 720px) 92vw, (max-width: 1180px) 33vw, 420px"
        />

        <Link
          href={href}
          className="product-card__link"
          aria-label={displayName}
        >
          <span className="product-card__name">{displayName}</span>
          <span className="product-card__meta">
            <span className="product-card__tagline">{product.cardTagline}</span>
            <span className="product-card__price">{priceLabel}</span>
          </span>
        </Link>

        <div className="product-card__cta" aria-hidden={false}>
          {singleAvailableVariant ? (
            <button
              type="button"
              className="product-card__button"
              onClick={() => void handleAdd()}
              disabled={pending}
              aria-label={`Buy ${displayName} for ${formatPrice(singleAvailableVariant.price)}`}
            >
              {pending
                ? "ADDING"
                : added
                  ? "ADDED"
                  : `BUY ${displayName} — ${formatPrice(singleAvailableVariant.price)}`}
            </button>
          ) : product.status === "available" ? (
            <Link href={href} className="product-card__button">
              CHOOSE {displayName}
            </Link>
          ) : (
            <WaitlistButton
              className="product-card__button"
              label="JOIN THE WAITLIST"
            />
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {added ? `${displayName} added to cart` : addError}
      </span>
    </li>
  );
}
