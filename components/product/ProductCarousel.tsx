"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { ProductCard } from "@/components/product/ProductCard";
import type { ProductCard as ProductCardModel } from "@/lib/catalog/models";

const DRAG_START_THRESHOLD = 8;
const DRAG_COMMIT_THRESHOLD = 44;
const TRANSITION_LOCK_MS = 240;
const SCROLL_EPSILON = 1;

type Direction = "previous" | "next";
type CarouselTrackStyle = CSSProperties & {
  "--home-beyond-offset"?: string;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  boundedDeltaX: number;
  dragging: boolean;
  pointerType: string;
} | null;

type CarouselMetrics = {
  initialized: boolean;
  maxIndex: number;
  maxScroll: number;
  step: number;
};

type ProductCarouselProps = {
  products: readonly ProductCardModel[];
  ariaLabel: string;
  announcementContext?: string;
  className?: string;
  previewKeyBySlug?: Readonly<Record<string, string | undefined>>;
  onPreviewChange?: (key: string | null) => void;
};

const initialCarouselMetrics: CarouselMetrics = {
  initialized: false,
  maxIndex: 0,
  maxScroll: 0,
  step: 0,
};

function isFinePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("button, input, select, textarea, [data-open='true']"))
    : false;
}

function isPointInProductSurface(
  root: HTMLElement,
  clientX: number,
  clientY: number,
) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(".product-card__surface"),
  ).some((surface) => {
    const rect = surface.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function metricsChanged(current: CarouselMetrics, next: CarouselMetrics) {
  return (
    current.initialized !== next.initialized ||
    current.maxIndex !== next.maxIndex ||
    Math.abs(current.maxScroll - next.maxScroll) > 0.5 ||
    Math.abs(current.step - next.step) > 0.5
  );
}

// The class contract stays home-prefixed so every consumer inherits the exact
// Beyond The Core geometry, motion, and responsive behavior.
export function ProductCarousel({
  products,
  ariaLabel,
  announcementContext = ariaLabel,
  className,
  previewKeyBySlug,
  onPreviewChange,
}: ProductCarouselProps) {
  const trackId = useId();
  const carouselRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const previousButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState>(null);
  const lockTimeoutRef = useRef<number | null>(null);
  const indicatorFrameRef = useRef<number | null>(null);
  const indicatorPointRef = useRef({ x: 0, y: 0 });
  const pendingFocusCorrectionRef = useRef<Direction | null>(null);
  const focusedControlRef = useRef<Direction | null>(null);
  const suppressClickRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [metrics, setMetrics] = useState<CarouselMetrics>(
    initialCarouselMetrics,
  );
  const [motionDirection, setMotionDirection] = useState<Direction | null>(null);
  const [dragging, setDragging] = useState(false);
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const productCount = products.length;
  const productSignature = useMemo(
    () => products.map((product) => `${product.id}:${product.slug}`).join("|"),
    [products],
  );
  const scrollable =
    metrics.initialized && metrics.maxScroll > SCROLL_EPSILON;
  const canScrollPrev = scrollable && activeIndex > 0;
  const canScrollNext = scrollable && activeIndex < metrics.maxIndex;
  const activeOffset = scrollable
    ? Math.min(activeIndex * metrics.step, metrics.maxScroll)
    : 0;
  const trackStyle = {
    "--home-beyond-offset": `${activeOffset}px`,
  } as CarouselTrackStyle;
  const leadProduct = products[activeIndex] ?? products[0] ?? null;

  const measureCarousel = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstCard = track?.querySelector<HTMLElement>(
      ".home-beyond-carousel__card",
    );

    if (!viewport || !track || !firstCard || productCount === 0) {
      setMetrics((current) =>
        metricsChanged(current, {
          ...initialCarouselMetrics,
          initialized: true,
        })
          ? { ...initialCarouselMetrics, initialized: true }
          : current,
      );
      setActiveIndex(0);
      return;
    }

    const trackStyleDeclaration = window.getComputedStyle(track);
    const gap =
      Number.parseFloat(trackStyleDeclaration.columnGap) ||
      Number.parseFloat(trackStyleDeclaration.gap) ||
      0;
    const cardWidth = firstCard.getBoundingClientRect().width;
    const step = cardWidth + gap;
    const maxScroll = Math.max(0, track.scrollWidth - viewport.clientWidth);
    const measuredMaxIndex =
      maxScroll > SCROLL_EPSILON && step > 0
        ? Math.ceil((maxScroll - SCROLL_EPSILON) / step)
        : 0;
    const maxIndex = Math.min(
      productCount - 1,
      Math.max(0, measuredMaxIndex),
    );
    const nextMetrics = {
      initialized: true,
      maxIndex,
      maxScroll,
      step,
    };

    setMetrics((current) =>
      metricsChanged(current, nextMetrics) ? nextMetrics : current,
    );
    setActiveIndex((current) => clamp(current, 0, maxIndex));
  }, [productCount]);

  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) {
        window.clearTimeout(lockTimeoutRef.current);
      }
      if (indicatorFrameRef.current) {
        window.cancelAnimationFrame(indicatorFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    setMotionDirection(null);
    setAnnouncement("");
    setDragging(false);
    setIndicatorVisible(false);
    trackRef.current?.style.setProperty("--home-beyond-drag-x", "0px");
  }, [productSignature]);

  useEffect(() => {
    measureCarousel();
    const frame = window.requestAnimationFrame(measureCarousel);
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measureCarousel())
        : null;

    if (viewport) observer?.observe(viewport);
    if (track) observer?.observe(track);
    window.addEventListener("resize", measureCarousel);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measureCarousel);
    };
  }, [measureCarousel, productSignature]);

  useLayoutEffect(() => {
    const pendingDirection =
      pendingFocusCorrectionRef.current ?? focusedControlRef.current;
    if (!pendingDirection || !metrics.initialized) return;

    const focusedControlBecameUnavailable =
      (pendingDirection === "previous" && !canScrollPrev) ||
      (pendingDirection === "next" && !canScrollNext);

    if (!focusedControlBecameUnavailable) {
      pendingFocusCorrectionRef.current = null;
      return;
    }

    pendingFocusCorrectionRef.current = null;
    focusedControlRef.current = null;
    if (canScrollPrev) {
      previousButtonRef.current?.focus();
      return;
    }
    if (canScrollNext) {
      nextButtonRef.current?.focus();
      return;
    }
    carouselRef.current?.focus();
  }, [canScrollNext, canScrollPrev, metrics.initialized]);

  function releaseMotionLock() {
    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
    }
    lockTimeoutRef.current = window.setTimeout(() => {
      setMotionDirection(null);
      lockTimeoutRef.current = null;
    }, TRANSITION_LOCK_MS);
  }

  function handleControlFocus(direction: Direction) {
    focusedControlRef.current = direction;
  }

  function handleControlBlur(event: FocusEvent<HTMLButtonElement>) {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget === previousButtonRef.current ||
      nextTarget === nextButtonRef.current
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement !== previousButtonRef.current &&
        activeElement !== nextButtonRef.current
      ) {
        focusedControlRef.current = null;
      }
    });
  }

  function boundedDragDelta(deltaX: number) {
    if (!scrollable) return 0;
    const proposedOffset = activeOffset - deltaX;
    const boundedOffset = clamp(proposedOffset, 0, metrics.maxScroll);
    return activeOffset - boundedOffset;
  }

  function move(direction: Direction) {
    if (lockTimeoutRef.current) return;
    if (direction === "next" && !canScrollNext) return;
    if (direction === "previous" && !canScrollPrev) return;

    const activeElement = document.activeElement;
    const activatedButton =
      direction === "next" ? nextButtonRef.current : previousButtonRef.current;
    if (activatedButton && activeElement === activatedButton) {
      pendingFocusCorrectionRef.current = direction;
    }

    setMotionDirection(direction);
    setActiveIndex((current) => {
      const next = clamp(
        current + (direction === "next" ? 1 : -1),
        0,
        metrics.maxIndex,
      );
      const nextProduct = products[next];
      setAnnouncement(
        nextProduct
          ? `${nextProduct.displayName} leads ${announcementContext}.`
          : `${ariaLabel} updated.`,
      );
      return next;
    });
    releaseMotionLock();
  }

  function clearDragTransform() {
    trackRef.current?.style.setProperty("--home-beyond-drag-x", "0px");
  }

  function queueIndicatorPosition(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    const indicator = indicatorRef.current;
    if (!viewport || !indicator) return;

    const rect = viewport.getBoundingClientRect();
    const radius = 32;
    indicatorPointRef.current = {
      x: Math.min(Math.max(clientX - rect.left, radius), rect.width - radius),
      y: Math.min(Math.max(clientY - rect.top, radius), rect.height - radius),
    };

    if (indicatorFrameRef.current) return;
    indicatorFrameRef.current = window.requestAnimationFrame(() => {
      const point = indicatorPointRef.current;
      indicator.style.setProperty(
        "--home-beyond-indicator-x",
        `${point.x}px`,
      );
      indicator.style.setProperty(
        "--home-beyond-indicator-y",
        `${point.y}px`,
      );
      indicatorFrameRef.current = null;
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!scrollable || isInteractiveTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      boundedDeltaX: 0,
      dragging: false,
      pointerType: event.pointerType,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      scrollable &&
      isFinePointer() &&
      !isInteractiveTarget(event.target) &&
      isPointInProductSurface(
        event.currentTarget,
        event.clientX,
        event.clientY,
      )
    ) {
      queueIndicatorPosition(event.clientX, event.clientY);
      setIndicatorVisible(true);
    } else if (!dragging) {
      setIndicatorVisible(false);
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    drag.deltaX = deltaX;
    drag.boundedDeltaX = boundedDragDelta(deltaX);

    if (!drag.dragging) {
      const horizontalIntent =
        Math.abs(deltaX) > DRAG_START_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
      if (!horizontalIntent) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.dragging = true;
      setDragging(true);
    }

    event.preventDefault();
    trackRef.current?.style.setProperty(
      "--home-beyond-drag-x",
      `${drag.boundedDeltaX}px`,
    );
  }

  function finishDrag(
    event: PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const effectiveDelta = drag.boundedDeltaX;
    const shouldMove =
      drag.dragging &&
      !cancelled &&
      Math.abs(effectiveDelta) >= DRAG_COMMIT_THRESHOLD;
    if (drag.dragging) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }

    clearDragTransform();
    setDragging(false);
    setIndicatorVisible(false);
    dragRef.current = null;

    if (shouldMove) {
      move(effectiveDelta < 0 ? "next" : "previous");
    }
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!scrollable || lockTimeoutRef.current) return;
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (Math.abs(event.deltaX) < 18) return;
    const direction = event.deltaX > 0 ? "next" : "previous";
    if (direction === "next" && !canScrollNext) return;
    if (direction === "previous" && !canScrollPrev) return;
    event.preventDefault();
    move(direction);
  }

  if (productCount === 0) return null;

  return (
    <div
      ref={carouselRef}
      className={["home-beyond-carousel", className].filter(Boolean).join(" ")}
      data-carousel-ready={metrics.initialized}
      data-dragging={dragging}
      data-can-scroll-prev={canScrollPrev}
      data-can-scroll-next={canScrollNext}
      data-active-index={activeIndex}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={-1}
    >
      <div
        ref={viewportRef}
        className="home-beyond-carousel__viewport"
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onPointerLeave={() => setIndicatorVisible(false)}
        onWheel={handleWheel}
      >
        <ProductCarouselTrack
          id={trackId}
          products={products}
          motionDirection={motionDirection}
          onPreviewChange={onPreviewChange}
          previewKeyBySlug={previewKeyBySlug}
          trackStyle={trackStyle}
          trackRef={trackRef}
        />
        <span
          ref={indicatorRef}
          className="home-beyond-swipe-indicator"
          data-visible={indicatorVisible}
          data-active={dragging}
          aria-hidden="true"
        >
          SWIPE
        </span>
      </div>

      {canScrollPrev && (
        <button
          ref={previousButtonRef}
          type="button"
          className="home-beyond-carousel__control home-beyond-carousel__control--previous"
          aria-label="Previous product"
          aria-controls={trackId}
          onBlur={handleControlBlur}
          onClick={() => move("previous")}
          onFocus={() => handleControlFocus("previous")}
        >
          <span aria-hidden="true">←</span>
        </button>
      )}
      {canScrollNext && (
        <button
          ref={nextButtonRef}
          type="button"
          className="home-beyond-carousel__control home-beyond-carousel__control--next"
          aria-label="Next product"
          aria-controls={trackId}
          onBlur={handleControlBlur}
          onClick={() => move("next")}
          onFocus={() => handleControlFocus("next")}
        >
          <span aria-hidden="true">→</span>
        </button>
      )}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <span className="sr-only">
        {leadProduct
          ? `Lead product: ${leadProduct.displayName}`
          : ariaLabel}
      </span>
    </div>
  );
}

function ProductCarouselTrack({
  id,
  motionDirection,
  products,
  onPreviewChange,
  previewKeyBySlug,
  trackStyle,
  trackRef,
}: {
  id: string;
  motionDirection: Direction | null;
  products: readonly ProductCardModel[];
  onPreviewChange?: (key: string | null) => void;
  previewKeyBySlug?: Readonly<Record<string, string | undefined>>;
  trackStyle: CarouselTrackStyle;
  trackRef: RefObject<HTMLUListElement | null>;
}) {
  const { cartDrawerOpen } = useCartDrawer();
  const [openQuickBuyProductId, setOpenQuickBuyProductId] = useState<
    string | null
  >(null);
  const visibleQuickBuyProductId = cartDrawerOpen
    ? null
    : openQuickBuyProductId;

  useEffect(() => {
    if (cartDrawerOpen) {
      setOpenQuickBuyProductId(null);
      return;
    }
    if (
      openQuickBuyProductId &&
      !products.some((product) => product.id === openQuickBuyProductId)
    ) {
      setOpenQuickBuyProductId(null);
    }
  }, [cartDrawerOpen, openQuickBuyProductId, products]);

  return (
    <ul
      id={id}
      ref={trackRef}
      className="home-beyond-carousel__track"
      data-motion={motionDirection ?? "idle"}
      style={trackStyle}
    >
      {products.map((product) => (
        <ProductCard
          key={product.slug}
          product={product}
          className="home-beyond-carousel__card"
          imageSizes="(max-width: 720px) 88vw, (max-width: 1199px) 48vw, 33vw"
          quickBuyOpen={visibleQuickBuyProductId === product.id}
          previewKey={previewKeyBySlug?.[product.slug]}
          onPreviewChange={onPreviewChange}
          onQuickBuyOpen={() => setOpenQuickBuyProductId(product.id)}
          onQuickBuyClose={() =>
            setOpenQuickBuyProductId((current) =>
              current === product.id ? null : current,
            )
          }
        />
      ))}
    </ul>
  );
}
