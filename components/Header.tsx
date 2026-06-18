"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { SearchOverlay } from "@/components/SearchOverlay";

export function Header() {
  const { count } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const returnFocusToSearch = useCallback(() => {
    searchTriggerRef.current?.focus();
  }, []);

  return (
    <header className="site-header">
      <div className="container site-header__bar">
        <Link href="/" className="brand" aria-label="Mei Pelle home">
          Mei&nbsp;Pelle <span>/ skincare</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/products">Shop</Link>
          <Link href="/about">About</Link>
          <button
            ref={searchTriggerRef}
            type="button"
            className="site-nav__search"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
          >
            <span aria-hidden="true">⌕</span> Search
          </button>
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

      <SearchOverlay
        open={searchOpen}
        onClose={closeSearch}
        returnFocus={returnFocusToSearch}
      />
    </header>
  );
}
