"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  MotionConfig,
  useAnimationControls,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
import {
  useCallback,
  useEffect,
  forwardRef,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ProductGrid } from "@/components/product/ProductGrid";
import {
  SHOP_COLLECTIONS,
  type ShopCollectionSlug,
} from "@/lib/catalog/collection-routes";
import type { ProductCard } from "@/lib/catalog/models";

type SortKey =
  | "featured"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "newest";

const SORTS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name, A–Z" },
  { value: "name-desc", label: "Name, Z–A" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "newest", label: "Newest first" },
];

const SHOP_FADE_EASE = [0.22, 1, 0.36, 1] as const;
const SHOP_FADE_TRANSITION = {
  type: "tween" as const,
  duration: 0.24,
  ease: SHOP_FADE_EASE,
};

type FilterNavigateEvent = {
  preventDefault: () => void;
};

type ShopGridTransitionProps = {
  children: ReactNode;
  navigationPending: boolean;
  onAnimationComplete: () => void;
  reduceMotion: boolean | null;
};

const ShopGridTransition = forwardRef<
  HTMLDivElement,
  ShopGridTransitionProps
>(function ShopGridTransition(
  {
    children,
    navigationPending,
    onAnimationComplete,
    reduceMotion,
  },
  ref,
) {
  const controls = useAnimationControls();
  const transition = reduceMotion
    ? { type: "tween" as const, duration: 0 }
    : SHOP_FADE_TRANSITION;

  useLayoutEffect(() => {
    if (reduceMotion) {
      controls.set({ opacity: 1, y: 0 });
      return;
    }

    controls.set({ opacity: 0, y: 6 });
    void controls.start({
      opacity: 1,
      y: 0,
      transition: SHOP_FADE_TRANSITION,
    });
  }, [controls, reduceMotion]);

  return (
    <m.div
      ref={ref}
      className="shop-grid-transition"
      data-shop-grid-transition
      initial={false}
      animate={
        navigationPending ? { opacity: 0, y: -6 } : controls
      }
      exit={{ opacity: 0, y: -6 }}
      transition={transition}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </m.div>
  );
});

function minPrice(p: ProductCard): number {
  return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
}

export function ShopBrowser({
  products,
  activeCollection,
}: {
  products: ProductCard[];
  activeCollection: ShopCollectionSlug;
}) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const sortMenuId = useId();
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const restoreFocusTimeoutRef = useRef<number | null>(null);
  const navigationStartedRef = useRef(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pendingCollectionHref, setPendingCollectionHref] = useState<
    string | null
  >(null);

  const visible = useMemo(() => {
    // `products` arrives in canonical catalog sort order from Supabase.
    const sorted = [...products];
    switch (sort) {
      case "name-asc":
        sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.displayName.localeCompare(a.displayName));
        break;
      case "price-asc":
        sorted.sort((a, b) => minPrice(a) - minPrice(b));
        break;
      case "price-desc":
        sorted.sort((a, b) => minPrice(b) - minPrice(a));
        break;
      case "newest":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "featured":
      default:
        break;
    }
    return sorted;
  }, [products, sort]);

  const selectedSort = SORTS.find((item) => item.value === sort) ?? SORTS[0];
  const activeCollectionHref = `/collections/${activeCollection}`;
  const collectionNavigationPending =
    pendingCollectionHref !== null &&
    pendingCollectionHref !== activeCollectionHref;
  const transition = shouldReduceMotion
    ? { type: "tween" as const, duration: 0 }
    : SHOP_FADE_TRANSITION;

  const restoreSortTriggerFocus = useCallback(() => {
    if (restoreFocusTimeoutRef.current !== null) {
      window.clearTimeout(restoreFocusTimeoutRef.current);
    }
    restoreFocusTimeoutRef.current = window.setTimeout(() => {
      sortTriggerRef.current?.focus({ preventScroll: true });
      restoreFocusTimeoutRef.current = null;
    }, 0);
  }, []);

  const closeSortMenu = useCallback(() => {
    setSortMenuOpen(false);
    restoreSortTriggerFocus();
  }, [restoreSortTriggerFocus]);

  useEffect(() => {
    return () => {
      if (restoreFocusTimeoutRef.current !== null) {
        window.clearTimeout(restoreFocusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sortMenuOpen) return;

    const focusTimeout = window.setTimeout(() => {
      sortMenuRef.current
        ?.querySelector<HTMLButtonElement>(`[data-sort-value="${sort}"]`)
        ?.focus({ preventScroll: true });
    }, 0);

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSortMenu();
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimeout);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeSortMenu, sort, sortMenuOpen]);

  function handleSortMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const menu = sortMenuRef.current;
    if (!menu) return;

    const focusableButtons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );

    if (event.key === "Tab" && focusableButtons.length > 0) {
      const firstButton = focusableButtons[0];
      const lastButton = focusableButtons[focusableButtons.length - 1];

      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus({ preventScroll: true });
      }
      return;
    }

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const optionButtons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("[data-sort-option]"),
    );
    if (optionButtons.length === 0) return;

    event.preventDefault();
    const currentIndex = optionButtons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex = currentIndex;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = optionButtons.length - 1;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % optionButtons.length;
    }
    if (event.key === "ArrowUp") {
      nextIndex =
        currentIndex < 0
          ? optionButtons.length - 1
          : (currentIndex - 1 + optionButtons.length) % optionButtons.length;
    }

    optionButtons[nextIndex]?.focus({ preventScroll: true });
  }

  function selectSort(nextSort: SortKey) {
    setSort(nextSort);
    closeSortMenu();
  }

  function startCollectionNavigation(
    event: FilterNavigateEvent,
    nextCollection: ShopCollectionSlug,
  ) {
    event.preventDefault();
    if (nextCollection === activeCollection) return;
    if (collectionNavigationPending) return;

    navigationStartedRef.current = false;
    setPendingCollectionHref(`/collections/${nextCollection}`);
  }

  function completeGridAnimation() {
    if (
      !collectionNavigationPending ||
      !pendingCollectionHref ||
      navigationStartedRef.current
    ) {
      return;
    }

    navigationStartedRef.current = true;
    router.push(pendingCollectionHref, { scroll: false });
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div
          className="storefront-shell shop-toolbar"
          data-layout-shell="storefront"
        >
          <nav className="filter-chips" aria-label="Shop collections">
            <div className="filter-chips__track">
              {SHOP_COLLECTIONS.map((collection) => (
                <Link
                  key={collection.slug}
                  href={`/collections/${collection.slug}`}
                  scroll={false}
                  className="chip"
                  onNavigate={(event) =>
                    startCollectionNavigation(event, collection.slug)
                  }
                  aria-current={
                    activeCollection === collection.slug ? "page" : undefined
                  }
                >
                  {collection.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="shop-toolbar__utility">
            <div className="sort-control" data-open={sortMenuOpen}>
              <button
                ref={sortTriggerRef}
                type="button"
                className="sort-control__trigger"
                aria-label={`Sort: ${selectedSort.label}`}
                aria-haspopup="dialog"
                aria-expanded={sortMenuOpen}
                aria-controls={sortMenuId}
                onClick={() => setSortMenuOpen((open) => !open)}
              >
                <span className="sort-control__label">Sort:</span>
                <span className="sort-control__value">{selectedSort.label}</span>
                <span className="sort-control__caret" aria-hidden="true" />
              </button>

              <AnimatePresence initial={false}>
                {sortMenuOpen && (
                  <>
                    <m.button
                      key="sort-backdrop"
                      type="button"
                      className="sort-menu__backdrop"
                      tabIndex={-1}
                      aria-hidden="true"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={transition}
                      onClick={closeSortMenu}
                    />
                    <m.div
                      key="sort-menu"
                      ref={sortMenuRef}
                      id={sortMenuId}
                      className="sort-menu__panel"
                      role="dialog"
                      aria-label="Sort products"
                      aria-modal="true"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={transition}
                      onKeyDown={handleSortMenuKeyDown}
                    >
                      <button
                        type="button"
                        className="sort-menu__close"
                        aria-label="Close sort menu"
                        onClick={closeSortMenu}
                      >
                        <span aria-hidden="true" />
                      </button>
                      <ul className="sort-menu__options" role="presentation">
                        {SORTS.map((item) => (
                          <li key={item.value}>
                            <button
                              type="button"
                              className="sort-menu__option"
                              data-sort-option
                              data-sort-value={item.value}
                              aria-pressed={sort === item.value}
                              onClick={() => selectSort(item.value)}
                            >
                              {item.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </m.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <span className="product-count" aria-live="polite">
              {visible.length} {visible.length === 1 ? "product" : "products"}
            </span>
          </div>
        </div>

        <section
          className="storefront-shell shop-grid-shell"
          data-layout-shell="storefront"
          data-product-collection={activeCollection}
          aria-busy={collectionNavigationPending}
          style={{ paddingTop: "24px" }}
        >
          <AnimatePresence mode="popLayout">
            <ShopGridTransition
              key={`${activeCollection}:${sort}`}
              navigationPending={collectionNavigationPending}
              reduceMotion={shouldReduceMotion}
              onAnimationComplete={completeGridAnimation}
            >
              {visible.length === 0 ? (
                <p className="shop-grid-empty">
                  No products are available in this collection right now.
                </p>
              ) : (
                <ProductGrid products={visible} />
              )}
            </ShopGridTransition>
          </AnimatePresence>
        </section>
      </MotionConfig>
    </LazyMotion>
  );
}
