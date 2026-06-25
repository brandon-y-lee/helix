"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type MouseEvent,
} from "react";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductImage";
import {
  formatFreeShippingThreshold,
  qualifiesForFreeStandardShipping,
  remainingForFreeStandardShipping,
} from "@/content/support/policy";
import { formatPrice, type ProductMedia } from "@/lib/products";

function isPlainSameTabClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.currentTarget.target !== "_blank"
  );
}

export function CartView({
  mode = "page",
  onContinue,
}: {
  mode?: "page" | "drawer";
  onContinue?: () => void;
}) {
  const { lines, subtotal, count, loading, error, setQuantity, remove, clear } = useCart();
  const isDrawer = mode === "drawer";
  const pathname = usePathname();
  const [pendingCartRoute, setPendingCartRoute] = useState(false);
  const freeShippingQualified = qualifiesForFreeStandardShipping(subtotal);
  const freeShippingRemaining = remainingForFreeStandardShipping(subtotal);
  const checkoutDisabled = loading || lines.some((line) => !line.available || line.quantity <= 0);

  useEffect(() => {
    if (!isDrawer || !pendingCartRoute || pathname !== "/cart") return;
    setPendingCartRoute(false);
    onContinue?.();
  }, [isDrawer, onContinue, pathname, pendingCartRoute]);

  function handleViewCartClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDrawer || !isPlainSameTabClick(event)) return;
    if (pathname === "/cart") {
      event.preventDefault();
      onContinue?.();
      return;
    }
    setPendingCartRoute(true);
  }

  if (loading && lines.length === 0) {
    return (
      <div className="empty-state">
        <p>Loading cart.</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        {error && <p className="form-status form-status--error">{error}</p>}
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
          <button type="button" className="link-button" onClick={() => void clear()}>
            Clear cart
          </button>
        </div>
        {error && <p className="form-status form-status--error">{error}</p>}
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
              <li key={line.key} className="cart-item">
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
                    >
                      &minus;
                    </button>
                    <span aria-label={`${line.name} quantity`}>{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${line.name} quantity`}
                      onClick={() => void setQuantity(line.key, line.quantity + 1)}
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
        <Link
          href="/cart"
          className="btn btn--ghost btn--editorial-rounded"
          onClick={handleViewCartClick}
          aria-busy={pendingCartRoute || undefined}
        >
          View cart
        </Link>
        <p className="cart-summary__note">
          {freeShippingQualified
            ? "Your cart meets the free standard shipping threshold. Hosted Stripe Checkout runs in sandbox mode only."
            : `${formatPrice(freeShippingRemaining)} away from the free standard shipping threshold. Hosted Stripe Checkout runs in sandbox mode only.`}
        </p>
      </aside>
    </div>
  );
}
