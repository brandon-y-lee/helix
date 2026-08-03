"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartDrawer } from "@/components/CartDrawer";
import { useCartDrawer } from "@/components/CartProvider";
import { useCartCount } from "@/components/useCart";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Sheet } from "@/components/Sheet";

type HeaderNavState = "top" | "revealed" | "hidden";
export type HeaderTheme = "dark" | "light";

const TOP_EDGE_Y = 8;
const HIDE_AFTER_Y = 96;
const SCROLL_DELTA_Y = 7;

function getScrollY() {
  if (typeof window === "undefined") {
    return 0;
  }

  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function resolveHeaderNavState({
  currentState,
  overlayOpen,
  previousScrollY,
  scrollY,
}: {
  currentState: HeaderNavState;
  overlayOpen: boolean;
  previousScrollY: number;
  scrollY: number;
}): HeaderNavState {
  if (overlayOpen) {
    return "revealed";
  }

  if (scrollY <= TOP_EDGE_Y) {
    return "top";
  }

  if (scrollY < HIDE_AFTER_Y) {
    return "revealed";
  }

  const deltaY = scrollY - previousScrollY;

  if (Math.abs(deltaY) < SCROLL_DELTA_Y) {
    return currentState === "top" ? "revealed" : currentState;
  }

  return deltaY > 0 ? "hidden" : "revealed";
}

export function Header({
  commerceDisabled = false,
  theme,
}: {
  commerceDisabled?: boolean;
  theme: HeaderTheme;
}) {
  const { count, hasLoadedCart, error: cartError } = useCartCount();
  const {
    cartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
    returnFocusAfterCartDrawerClose,
  } = useCartDrawer();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const overlayOpen =
    searchOpen || (!commerceDisabled && cartDrawerOpen) || menuOpen;
  const [navState, setNavState] = useState<HeaderNavState>("top");
  const navStateRef = useRef<HeaderNavState>("top");
  const lastScrollYRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const overlayOpenRef = useRef(overlayOpen);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const cartTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const setNavStateIfChanged = useCallback((nextState: HeaderNavState) => {
    if (navStateRef.current === nextState) {
      return;
    }

    navStateRef.current = nextState;
    setNavState(nextState);
  }, []);
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
  const revealForFocus = useCallback(() => {
    const scrollY = getScrollY();

    lastScrollYRef.current = scrollY;

    if (scrollY > TOP_EDGE_Y) {
      setNavStateIfChanged("revealed");
    }
  }, [setNavStateIfChanged]);

  useEffect(() => {
    if (commerceDisabled && cartDrawerOpen) {
      closeCartDrawer();
    }
  }, [commerceDisabled, cartDrawerOpen, closeCartDrawer]);

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;

    const scrollY = getScrollY();
    lastScrollYRef.current = scrollY;
    setNavStateIfChanged(
      resolveHeaderNavState({
        currentState: "revealed",
        overlayOpen,
        previousScrollY: scrollY,
        scrollY,
      }),
    );
  }, [overlayOpen, pathname, setNavStateIfChanged]);

  useEffect(() => {
    const syncScrollState = () => {
      frameRef.current = null;

      const scrollY = getScrollY();
      const previousScrollY = lastScrollYRef.current;
      const nextState = resolveHeaderNavState({
        currentState: navStateRef.current,
        overlayOpen: overlayOpenRef.current,
        previousScrollY,
        scrollY,
      });

      if (
        Math.abs(scrollY - previousScrollY) >= SCROLL_DELTA_Y ||
        scrollY <= TOP_EDGE_Y ||
        nextState !== navStateRef.current
      ) {
        lastScrollYRef.current = scrollY;
      }

      setNavStateIfChanged(nextState);
    };

    const handleScroll = () => {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(syncScrollState);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    syncScrollState();

    return () => {
      window.removeEventListener("scroll", handleScroll);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [setNavStateIfChanged]);

  const renderedNavState: HeaderNavState = overlayOpen ? "revealed" : navState;

  return (
    <header
      className="site-header"
      data-header-theme={theme}
      data-nav-state={renderedNavState}
      data-overlay-open={overlayOpen ? "true" : "false"}
      onFocusCapture={revealForFocus}
    >
      <a href="#content" className="skip-link">
        Skip to main content
      </a>
      <div
        className="storefront-shell site-header__bar"
        data-layout-shell="storefront"
      >
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
          <Link href="/system" aria-current={current("/system")}>SYSTEM</Link>
          <Link href="/about" aria-current={current("/about")}>ABOUT</Link>
        </nav>
        <Link href="/" className="brand" aria-label="Mei Pelle home">
          MEI PELLE
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
            onClick={() => {
              if (!commerceDisabled) openCartDrawer(returnFocusToCart);
            }}
            aria-haspopup="dialog"
            aria-expanded={commerceDisabled ? false : cartDrawerOpen}
            aria-label={
              commerceDisabled
                ? "Cart unavailable in draft preview"
                : undefined
            }
            disabled={commerceDisabled}
          >
            {commerceDisabled
              ? "CART (PREVIEW)"
              : `CART (${hasLoadedCart ? count : "—"})`}
            <span className="sr-only">
              {commerceDisabled
                ? ", purchasing disabled"
                : hasLoadedCart
                ? count > 0
                  ? `, ${count} items`
                  : ", empty"
                : cartError
                  ? ", temporarily unavailable"
                  : ", loading"}
            </span>
          </button>
        </nav>
      </div>

      <Sheet
        open={menuOpen}
        side="left"
        title="Menu"
        eyebrow="Mei Pelle"
        description="Primary navigation"
        onClose={closeMenu}
        returnFocus={returnFocusToMenu}
        className="mobile-nav-sheet"
      >
        <nav className="mobile-nav" aria-label="Mobile primary">
          <Link href="/products" onClick={closeMenu} aria-current={current("/products")}>SHOP</Link>
          <Link href="/system" onClick={closeMenu} aria-current={current("/system")}>SYSTEM</Link>
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
      {!commerceDisabled && (
        <CartDrawer
          open={cartDrawerOpen}
          onClose={closeCartDrawer}
          returnFocus={returnFocusAfterCartDrawerClose}
        />
      )}
    </header>
  );
}
