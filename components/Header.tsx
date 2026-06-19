"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { CartDrawer } from "@/components/CartDrawer";
import { useCart } from "@/components/CartProvider";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Sheet } from "@/components/Sheet";

export function Header() {
  const {
    count,
    cartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
    returnFocusAfterCartDrawerClose,
  } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const cartTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const returnFocusToSearch = useCallback(() => {
    searchTriggerRef.current?.focus();
  }, []);
  const returnFocusToCart = useCallback(() => {
    cartTriggerRef.current?.focus();
  }, []);
  const returnFocusToMenu = useCallback(() => {
    menuTriggerRef.current?.focus();
  }, []);
  const current = useCallback(
    (href: string) => (pathname === href ? "page" : undefined),
    [pathname],
  );

  return (
    <header className="site-header">
      <a href="#content" className="skip-link">
        Skip to main content
      </a>
      <div className="site-header__bar">
        <button
          ref={menuTriggerRef}
          type="button"
          className="mobile-menu-trigger"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          Menu
        </button>
        <nav className="site-nav site-nav--left" aria-label="Primary">
          <Link href="/products" aria-current={current("/products")}>SHOP</Link>
          <Link href="/method" aria-current={current("/method")}>METHOD</Link>
          <Link href="/about" aria-current={current("/about")}>ABOUT</Link>
        </nav>
        <Link href="/" className="brand" aria-label="Mei-Pelle home">
          MEI-PELLE
        </Link>
        <nav className="site-nav site-nav--right" aria-label="Utilities">
          <button
            ref={searchTriggerRef}
            type="button"
            className="site-nav__search"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
          >
            SEARCH
          </button>
          <Link href="/account">ACCOUNT</Link>
          <button
            ref={cartTriggerRef}
            type="button"
            className="cart-link"
            onClick={() => openCartDrawer(returnFocusToCart)}
            aria-haspopup="dialog"
            aria-expanded={cartDrawerOpen}
          >
            CART ({count})
            <span className="sr-only">
              {count > 0 ? `, ${count} items` : ", empty"}
            </span>
          </button>
        </nav>
      </div>

      <Sheet
        open={menuOpen}
        side="left"
        title="Menu"
        eyebrow="Mei-Pelle"
        description="Primary navigation"
        onClose={closeMenu}
        returnFocus={returnFocusToMenu}
        className="mobile-nav-sheet"
      >
        <nav className="mobile-nav" aria-label="Mobile primary">
          <Link href="/products" onClick={closeMenu} aria-current={current("/products")}>SHOP</Link>
          <Link href="/method" onClick={closeMenu} aria-current={current("/method")}>METHOD</Link>
          <Link href="/about" onClick={closeMenu} aria-current={current("/about")}>ABOUT</Link>
          <button type="button" onClick={() => { closeMenu(); setSearchOpen(true); }}>
            SEARCH
          </button>
          <Link href="/account" onClick={closeMenu}>ACCOUNT</Link>
        </nav>
      </Sheet>
      <SearchOverlay
        open={searchOpen}
        onClose={closeSearch}
        returnFocus={returnFocusToSearch}
      />
      <CartDrawer
        open={cartDrawerOpen}
        onClose={closeCartDrawer}
        returnFocus={returnFocusAfterCartDrawerClose}
      />
    </header>
  );
}
