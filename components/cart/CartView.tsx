"use client";

import Link from "next/link";
import { CheckoutPanel } from "@/components/cart/CheckoutPanel";
import { useCart, useCartMutations } from "@/components/cart/useCart";
import { ProductImage } from "@/components/product/ProductImage";
import {
  formatFreeShippingThreshold,
  qualifiesForFreeStandardShipping,
  remainingForFreeStandardShipping,
} from "@/content/support/policy";
import { formatPrice, type ProductMedia } from "@/lib/products";

export function CartView({
  mode = "page",
  onContinue,
}: {
  mode?: "page" | "drawer";
  onContinue?: () => void;
}) {
  const {
    lines,
    subtotal,
    count,
    loading,
    hasLoadedCart,
    error: queryError,
    retryable: queryRetryable,
    refresh,
  } = useCart();
  const {
    setQuantity,
    remove,
    clear,
    isLinePending,
    isClearing,
    isMutating,
    error: mutationError,
    retryable: mutationRetryable,
    resetErrors,
  } = useCartMutations();
  const error = mutationError ?? queryError;
  const retryable = mutationError ? mutationRetryable : queryRetryable;
  const isDrawer = mode === "drawer";
  const freeShippingQualified = qualifiesForFreeStandardShipping(subtotal);
  const freeShippingRemaining = remainingForFreeStandardShipping(subtotal);
  const checkoutDisabled = loading || isMutating || lines.some((line) => !line.available || line.quantity <= 0);

  async function retryCart() {
    resetErrors();
    await refresh();
  }

  if (loading && !hasLoadedCart && lines.length === 0) {
    return (
      <div className="empty-state">
        <p>Loading cart.</p>
      </div>
    );
  }

  if (!hasLoadedCart && error && lines.length === 0) {
    return (
      <div className="empty-state" role="status">
        <p className="form-status form-status--error">{error}</p>
        {retryable && (
          <button
            type="button"
            className="btn btn--editorial-rounded"
            onClick={() => void retryCart()}
            disabled={loading}
          >
            {loading ? "Trying again" : "Try again"}
          </button>
        )}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        {error && (
          <>
            <p className="form-status form-status--error">{error}</p>
            {retryable && (
              <button
                type="button"
                className="btn btn--editorial-rounded"
                onClick={() => void retryCart()}
                disabled={loading}
              >
                {loading ? "Trying again" : "Try again"}
              </button>
            )}
          </>
        )}
        <p>Your cart is empty.</p>
        {isDrawer && onContinue ? (
          <button type="button" className="btn btn--editorial-rounded" onClick={onContinue}>
            Continue shopping
          </button>
        ) : (
          <Link href="/products" className="btn btn--editorial-rounded">
            Browse the system
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={isDrawer ? "cart-layout cart-layout--drawer" : "cart-layout"}>
      <div>
        <div className="cart-items__head">
          <span>{count} {count === 1 ? "item" : "items"}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => void clear()}
            disabled={isClearing || isMutating}
            aria-busy={isClearing || undefined}
          >
            Clear cart
          </button>
        </div>
        {error && (
          <div className="cart-unavailable" role="status">
            <p className="form-status form-status--error">{error}</p>
            {retryable && (
              <button
                type="button"
                className="link-button"
                onClick={() => void retryCart()}
                disabled={loading}
              >
                {loading ? "Trying again" : "Try again"}
              </button>
            )}
          </div>
        )}
        <ul className="cart-items" aria-label="Cart items">
          {lines.map((line) => {
            const media: ProductMedia | null = line.placeholderMedia
              ? {
                  kind: "placeholder",
                  url: null,
                  alt: line.placeholderMedia.alt,
                  width: null,
                  height: null,
                  role: "cart",
                  sortOrder: 0,
                  paletteId: line.placeholderMedia.paletteId,
                  palette: line.placeholderMedia.palette,
                }
              : line.imageUrl
                ? {
                    kind: "image",
                    url: line.imageUrl,
                    alt: line.imageAlt ?? line.name,
                    width: null,
                    height: null,
                    role: "cart",
                    sortOrder: 0,
                    paletteId: null,
                    palette: null,
                  }
                : null;

            return (
              <li
                key={line.key}
                className="cart-item"
                aria-busy={isLinePending(line.key) || undefined}
              >
                <ProductImage
                  media={media}
                  swatch={line.swatch}
                  className="cart-item__thumb"
                  imageClassName="cart-item__img"
                  sizes="72px"
                />
                <div>
                  <div className="cart-item__name">{line.name}</div>
                  <div className="cart-item__variant">{line.variantLabel}</div>
                  {line.warning && (
                    <p className="cart-item__warning" role="status">
                      {line.warning}
                    </p>
                  )}
                  <div className="qty">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.name} quantity`}
                      onClick={() => void setQuantity(line.key, line.quantity - 1)}
                      disabled={isLinePending(line.key)}
                    >
                      &minus;
                    </button>
                    <span aria-label={`${line.name} quantity`}>{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${line.name} quantity`}
                      onClick={() => void setQuantity(line.key, line.quantity + 1)}
                      disabled={isLinePending(line.key)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="cart-item__right">
                  <span>{formatPrice(line.lineSubtotal)}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void remove(line.key)}
                    disabled={isLinePending(line.key)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="cart-summary" aria-label="Order summary">
        <h2>Summary</h2>
        <div className="summary-row">
          <span>Subtotal ({count} items)</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>Standard shipping</span>
          <span>
            {freeShippingQualified
              ? "Free threshold met"
            : `Free at ${formatFreeShippingThreshold()}`}
          </span>
        </div>
        <CheckoutPanel disabled={checkoutDisabled} subtotal={subtotal} />
        <p className="cart-summary__note">
          {freeShippingQualified
            ? "Your cart meets the free standard shipping threshold."
            : `${formatPrice(freeShippingRemaining)} away from the free standard shipping threshold.`}
        </p>
      </aside>
    </div>
  );
}
