"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { Swatch } from "@/components/Swatch";
import { formatPrice } from "@/lib/products";

export function CartView() {
  const { lines, subtotal, count, setQuantity, remove, clear } = useCart();

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        <p>Your cart is empty.</p>
        <Link href="/products" className="btn">
          Browse the collection
        </Link>
      </div>
    );
  }

  // Flat development shipping placeholder.
  const shipping = subtotal >= 5000 ? 0 : 600;
  const total = subtotal + shipping;

  return (
    <div className="cart-layout">
      <div>
        <div className="cart-items__head">
          <span>{count} {count === 1 ? "item" : "items"}</span>
          <button type="button" className="link-button" onClick={clear}>
            Clear cart
          </button>
        </div>
      <ul className="cart-items" aria-label="Cart items">
        {lines.map((line) => (
          <li key={line.key} className="cart-item">
            <Swatch colors={line.swatch} className="cart-item__thumb" />
            <div>
              <div className="cart-item__name">{line.name}</div>
              <div className="cart-item__variant">{line.variantLabel}</div>
              <div className="qty">
                <button
                  type="button"
                  aria-label={`Decrease ${line.name} quantity`}
                  onClick={() => setQuantity(line.key, line.quantity - 1)}
                >
                  &minus;
                </button>
                <span aria-label="Quantity">{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`Increase ${line.name} quantity`}
                  onClick={() => setQuantity(line.key, line.quantity + 1)}
                >
                  +
                </button>
              </div>
            </div>
            <div className="cart-item__right">
              <span>{formatPrice(line.price * line.quantity)}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => remove(line.key)}
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
          <span>Shipping</span>
          <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
        </div>
        <div className="summary-row summary-row--total">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
        <Link href="/checkout" className="btn">
          Checkout
        </Link>
        <p className="cart-summary__note">
          Development storefront — checkout is a placeholder. No payment is taken.
        </p>
      </aside>
    </div>
  );
}
