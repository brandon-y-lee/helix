"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { useCartCount } from "@/components/cart/useCart";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { Sheet } from "@/components/overlays/Sheet";
import {
  registerHeaderCartFocus,
  useModalPresence,
} from "@/components/overlays/modal-state";

type HeaderNavState = "top" | "revealed" | "hidden";

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
}: {
  commerceDisabled?: boolean;
}) {
  const { count, hasLoadedCart, error: cartError } = useCartCount();
  const {
    cartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
  } = useCartDrawer();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const modalPresent = useModalPresence();
  const pathname = usePathname();
  const overlayOpen =
    modalPresent || searchOpen || (!commerceDisabled && cartDrawerOpen) || menuOpen;
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
    setNavStateIfChanged(getScrollY() > TOP_EDGE_Y ? "revealed" : "top");
    searchTriggerRef.current?.focus({ preventScroll: true });
  }, [setNavStateIfChanged]);
  const returnFocusToCart = useCallback(() => {
    setNavStateIfChanged(getScrollY() > TOP_EDGE_Y ? "revealed" : "top");
    const target = cartTriggerRef.current?.disabled
      ? searchTriggerRef.current
      : cartTriggerRef.current;
    target?.focus({ preventScroll: true });
  }, [setNavStateIfChanged]);
  const returnFocusToMenu = useCallback(() => {
    const trigger = menuTriggerRef.current;
    if (trigger && window.getComputedStyle(trigger).display !== "none") {
      setNavStateIfChanged(getScrollY() > TOP_EDGE_Y ? "revealed" : "top");
      trigger.focus({ preventScroll: true });
    } else {
      returnFocusToSearch();
    }
  }, [returnFocusToSearch, setNavStateIfChanged]);
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

  useEffect(() => registerHeaderCartFocus(returnFocusToCart), [returnFocusToCart]);

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
  const cartQuantity = hasLoadedCart ? count : "—";
  const cartStatus = hasLoadedCart
    ? count > 0 ? `${count} ${count === 1 ? "item" : "items"}` : "empty"
    : cartError ? "temporarily unavailable" : "loading";

  return (
    <header
      className="site-header"
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
          <Link href="/collections/shop" aria-current={current("/collections/shop")}>SHOP</Link>
          <Link href="/system" aria-current={current("/system")}>SYSTEM</Link>
          <Link href="/about" aria-current={current("/about")}>ABOUT</Link>
        </nav>
        <Link href="/" className="brand" aria-label="helix home">
          <HelixIdentity decorative />
        </Link>
        <nav className="site-nav site-nav--right" aria-label="Utilities">
          <button
            ref={searchTriggerRef}
            type="button"
            className="site-nav__search"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-label="SEARCH"
          >
            <span className="site-nav__label" aria-hidden="true">SEARCH</span>
            <svg className="site-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
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
                ? "Cart unavailable in Catalog Preview"
                : `CART (${cartQuantity}), ${cartStatus}`
            }
            disabled={commerceDisabled}
          >
            <span className="site-nav__label" aria-hidden="true">
              {commerceDisabled ? "CART (PREVIEW)" : `CART (${cartQuantity})`}
            </span>
            <span className="cart-link__mobile" aria-hidden="true">
              <svg className="site-nav__icon" viewBox="0 0 24 24" focusable="false">
                <path d="M5 7h14l1 14H4L5 7Z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
              <span>{commerceDisabled ? "—" : cartQuantity}</span>
            </span>
          </button>
        </nav>
      </div>

      <Sheet
        open={menuOpen}
        side="left"
        title="Menu"
        description="Primary navigation"
        onClose={closeMenu}
        returnFocus={returnFocusToMenu}
        className="mobile-nav-sheet"
      >
        <HelixIdentity variant="symbol" className="mobile-nav__identity" />
        <nav className="mobile-nav" aria-label="Mobile primary">
          <Link href="/collections/shop" onClick={closeMenu} aria-current={current("/collections/shop")}>SHOP</Link>
          <div className="mobile-nav__categories">
            <Link href="/collections/core" className="mobile-nav__category" onClick={closeMenu} aria-current={current("/collections/core")}>
              <Image src="/media/home/plug-and-play-poster.webp" alt="" width={400} height={300} sizes="(max-width: 720px) calc(50vw - 24px), 190px" />
              <span>Core</span>
            </Link>
            <Link href="/collections/beyond-the-core" className="mobile-nav__category mobile-nav__category--beyond" onClick={closeMenu} aria-current={current("/collections/beyond-the-core")}>
              <Image src="/media/home/final-cta-poster.webp" alt="" width={400} height={300} sizes="(max-width: 720px) calc(50vw - 24px), 190px" />
              <span>Beyond The Core</span>
            </Link>
          </div>
          <Link href="/system" onClick={closeMenu} aria-current={current("/system")}>SYSTEM</Link>
          <Link href="/about" onClick={closeMenu} aria-current={current("/about")}>ABOUT</Link>
          <button type="button" onClick={() => { closeMenu(); setSearchOpen(true); }}>
            SEARCH
          </button>
          <Link href="/account" onClick={closeMenu}>ACCOUNT</Link>
          <Link href="/faq" onClick={closeMenu}>Support</Link>
        </nav>
      </Sheet>
      <SearchOverlay
        open={searchOpen}
        onClose={closeSearch}
        returnFocus={returnFocusToSearch}
      />
    </header>
  );
}
