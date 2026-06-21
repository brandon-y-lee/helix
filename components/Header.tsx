"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartDrawer } from "@/components/CartDrawer";
import { useCart } from "@/components/CartProvider";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Sheet } from "@/components/Sheet";

type HeaderNavState = "home-top" | "revealed" | "hidden";

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
  isHome,
  overlayOpen,
  previousScrollY,
  scrollY,
}: {
  currentState: HeaderNavState;
  isHome: boolean;
  overlayOpen: boolean;
  previousScrollY: number;
  scrollY: number;
}): HeaderNavState {
  if (!isHome || overlayOpen) {
    return "revealed";
  }

  if (scrollY <= TOP_EDGE_Y) {
    return "home-top";
  }

  if (scrollY < HIDE_AFTER_Y) {
    return "revealed";
  }

  const deltaY = scrollY - previousScrollY;

  if (Math.abs(deltaY) < SCROLL_DELTA_Y) {
    return currentState === "home-top" ? "revealed" : currentState;
  }

  return deltaY > 0 ? "hidden" : "revealed";
}

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
  const isHome = pathname === "/";
  const overlayOpen = searchOpen || cartDrawerOpen || menuOpen;
  const [navState, setNavState] = useState<HeaderNavState>("home-top");
  const navStateRef = useRef<HeaderNavState>("home-top");
  const lastScrollYRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const isHomeRef = useRef(isHome);
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

    if (!isHome || scrollY > TOP_EDGE_Y) {
      setNavStateIfChanged("revealed");
    }
  }, [isHome, setNavStateIfChanged]);

  useEffect(() => {
    isHomeRef.current = isHome;
    overlayOpenRef.current = overlayOpen;

    const scrollY = getScrollY();
    lastScrollYRef.current = scrollY;
    setNavStateIfChanged(
      resolveHeaderNavState({
        currentState: navStateRef.current,
        isHome,
        overlayOpen,
        previousScrollY: scrollY,
        scrollY,
      }),
    );
  }, [isHome, overlayOpen, pathname, setNavStateIfChanged]);

  useEffect(() => {
    const syncScrollState = () => {
      frameRef.current = null;

      const scrollY = getScrollY();
      const previousScrollY = lastScrollYRef.current;
      const nextState = resolveHeaderNavState({
        currentState: navStateRef.current,
        isHome: isHomeRef.current,
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

  const renderedNavState: HeaderNavState = !isHome || overlayOpen ? "revealed" : navState;

  return (
    <header
      className="site-header"
      data-home={isHome ? "true" : "false"}
      data-nav-state={renderedNavState}
      data-overlay-open={overlayOpen ? "true" : "false"}
      onFocusCapture={revealForFocus}
    >
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
