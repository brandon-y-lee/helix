"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { Swatch } from "@/components/Swatch";
import { formatPrice } from "@/lib/products";

export function CartView({
  mode = "page",
  onContinue,
}: {
  mode?: "page" | "drawer";
  onContinue?: () => void;
}) {
  const { lines, subtotal, count, loading, error, setQuantity, remove, clear } = useCart();
  const isDrawer = mode === "drawer";

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
          <button type="button" className="btn" onClick={onContinue}>
            Continue shopping
          </button>
        ) : (
          <Link href="/products" className="btn">
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
          {lines.map((line) => (
            <li key={line.key} className="cart-item">
              <Swatch colors={line.swatch} className="cart-item__thumb" />
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
          ))}
        </ul>
      </div>

      <aside className="cart-summary" aria-label="Order summary">
        <h2>Summary</h2>
        <div className="summary-row">
          <span>Subtotal ({count} items)</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>Checkout</span>
          <span>Development placeholder</span>
        </div>
        <button type="button" className="btn" disabled>
          Checkout unavailable
        </button>
        <Link href="/cart" className="btn btn--ghost">
          View cart
        </Link>
        <p className="cart-summary__note">
          Checkout is not implemented. No payment is taken.
        </p>
      </aside>
    </div>
  );
}
