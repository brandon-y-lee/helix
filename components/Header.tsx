"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export function Header() {
  const { count } = useCart();

  return (
    <header className="site-header">
      <div className="container site-header__bar">
        <Link href="/" className="brand" aria-label="Mei Pelle home">
          Mei&nbsp;Pelle <span>/ skincare</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/products">Shop</Link>
          <Link href="/about">About</Link>
          <Link href="/search" aria-label="Search">
            Search
          </Link>
          <Link href="/account">Account</Link>
          <Link href="/cart" className="cart-link">
            Cart
            {count > 0 && (
              <span className="cart-badge" aria-hidden="true">
                {count}
              </span>
            )}
            <span className="sr-only">
              {count > 0 ? `, ${count} items` : ", empty"}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
