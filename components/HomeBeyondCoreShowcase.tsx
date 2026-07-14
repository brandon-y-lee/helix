"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import { HomePhasedDescription } from "@/components/HomePhasedDescription";
import { ProductCard } from "@/components/ProductCard";
import {
  homeBeyondCoreDescriptions,
  type HomeBeyondCoreDescriptionKey,
} from "@/lib/content/home";
import type { Product } from "@/lib/products";

const BEYOND_DESCRIPTION_KEY_BY_SLUG: Readonly<
  Record<string, HomeBeyondCoreDescriptionKey | undefined>
> = {
  "refine-02-pore-treatment-pads": "refine",
  "frame-04-pdrn-eye-cream": "frame",
  "lift-06-pdrn-mask-system": "lift",
};

const DRAG_START_THRESHOLD = 8;
const DRAG_COMMIT_THRESHOLD = 44;
const TRANSITION_LOCK_MS = 240;

type Direction = "previous" | "next";
type CarouselCardStyle = CSSProperties & {
  "--home-beyond-order"?: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  dragging: boolean;
  pointerType: string;
} | null;

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

function isPointInProductSurface(root: HTMLElement, clientX: number, clientY: number) {
  return Array.from(root.querySelectorAll<HTMLElement>(".product-card__surface")).some(
    (surface) => {
      const rect = surface.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
  );
}

function visualOrderFor(index: number, leadingIndex: number, length: number) {
  if (length <= 0) return 0;
  return (index - leadingIndex + length) % length;
}

export function HomeBeyondCoreShowcase({
  products = [],
}: {
  products?: readonly Product[];
}) {
  const trackId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragState>(null);
  const lockTimeoutRef = useRef<number | null>(null);
  const indicatorFrameRef = useRef<number | null>(null);
  const indicatorPointRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const [activeDescriptionKey, setActiveDescriptionKey] =
    useState<HomeBeyondCoreDescriptionKey | null>(null);
  const [leadingIndex, setLeadingIndex] = useState(0);
  const [motionDirection, setMotionDirection] = useState<Direction | null>(null);
  const [dragging, setDragging] = useState(false);
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const productCount = products.length;
  const canRotate = productCount > 1;

  const visibleProducts = useMemo(
    () =>
      products
        .map((product, index) => ({
          product,
          visualOrder: visualOrderFor(index, leadingIndex, productCount),
        }))
        .sort((a, b) => a.visualOrder - b.visualOrder)
        .map((item) => item.product),
    [leadingIndex, productCount, products],
  );

  const description = activeDescriptionKey
    ? homeBeyondCoreDescriptions.items[activeDescriptionKey]
    : homeBeyondCoreDescriptions.default;

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
    if (leadingIndex >= productCount) {
      setLeadingIndex(0);
    }
  }, [leadingIndex, productCount]);

  function releaseMotionLock() {
    if (lockTimeoutRef.current) {
      window.clearTimeout(lockTimeoutRef.current);
    }
    lockTimeoutRef.current = window.setTimeout(() => {
      setMotionDirection(null);
      lockTimeoutRef.current = null;
    }, TRANSITION_LOCK_MS);
  }

  function rotate(direction: Direction) {
    if (!canRotate || lockTimeoutRef.current) return;

    setMotionDirection(direction);
    setLeadingIndex((current) => {
      const next =
        direction === "next"
          ? (current + 1) % productCount
          : (current - 1 + productCount) % productCount;
      const nextProduct = products[next];
      setAnnouncement(
        nextProduct
          ? `${nextProduct.displayName} leads Beyond The Core.`
          : "Beyond The Core carousel updated.",
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
      indicator.style.setProperty("--home-beyond-indicator-x", `${point.x}px`);
      indicator.style.setProperty("--home-beyond-indicator-y", `${point.y}px`);
      indicatorFrameRef.current = null;
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canRotate || isInteractiveTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      dragging: false,
      pointerType: event.pointerType,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      isFinePointer() &&
      !isInteractiveTarget(event.target) &&
      isPointInProductSurface(event.currentTarget, event.clientX, event.clientY)
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

    if (!drag.dragging) {
      const horizontalIntent =
        Math.abs(deltaX) > DRAG_START_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
      if (!horizontalIntent) return;
      drag.dragging = true;
      setDragging(true);
    }

    event.preventDefault();
    const easedDelta = Math.max(Math.min(deltaX, 120), -120);
    trackRef.current?.style.setProperty(
      "--home-beyond-drag-x",
      `${easedDelta}px`,
    );
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const shouldRotate =
      drag.dragging && !cancelled && Math.abs(drag.deltaX) >= DRAG_COMMIT_THRESHOLD;
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

    if (shouldRotate) {
      rotate(drag.deltaX < 0 ? "next" : "previous");
    }
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!canRotate || lockTimeoutRef.current) return;
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (Math.abs(event.deltaX) < 18) return;
    event.preventDefault();
    rotate(event.deltaX > 0 ? "next" : "previous");
  }

  return (
    <section
      className="home-section home-section--beyond"
      aria-labelledby="beyond-heading"
    >
      <div className="home-beyond-shell">
        <div className="home-section__intro home-section__intro--wide">
          <p className="hero__eyebrow">Beyond The Core</p>
          <h2 id="beyond-heading" className="sr-only">
            Beyond The Core
          </h2>

          <HomePhasedDescription text={description} />
        </div>

        {productCount > 0 && (
          <div
            className="home-beyond-carousel"
            data-dragging={dragging}
            data-can-rotate={canRotate}
            aria-roledescription="carousel"
            aria-label="Beyond The Core products"
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
              <ProductGridLikeTrack
                id={trackId}
                products={products}
                leadingIndex={leadingIndex}
                motionDirection={motionDirection}
                onPreviewChange={(key) =>
                  setActiveDescriptionKey(
                    key as HomeBeyondCoreDescriptionKey | null,
                  )
                }
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

            {canRotate && (
              <>
                <button
                  type="button"
                  className="home-beyond-carousel__control home-beyond-carousel__control--previous"
                  aria-label="Previous product"
                  aria-controls={trackId}
                  onClick={() => rotate("previous")}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <button
                  type="button"
                  className="home-beyond-carousel__control home-beyond-carousel__control--next"
                  aria-label="Next product"
                  aria-controls={trackId}
                  onClick={() => rotate("next")}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </>
            )}

            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {announcement}
            </span>
            <span className="sr-only">
              Visible products:{" "}
              {visibleProducts.map((product) => product.displayName).join(", ")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductGridLikeTrack({
  id,
  leadingIndex,
  motionDirection,
  products,
  onPreviewChange,
  trackRef,
}: {
  id: string;
  leadingIndex: number;
  motionDirection: Direction | null;
  products: readonly Product[];
  onPreviewChange: (key: string | null) => void;
  trackRef: RefObject<HTMLUListElement | null>;
}) {
  const [openQuickBuyProductId, setOpenQuickBuyProductId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (
      openQuickBuyProductId &&
      !products.some((product) => product.id === openQuickBuyProductId)
    ) {
      setOpenQuickBuyProductId(null);
    }
  }, [openQuickBuyProductId, products]);

  return (
    <ul
      id={id}
      ref={trackRef}
      className="home-beyond-carousel__track"
      data-motion={motionDirection ?? "idle"}
    >
      {products.map((product, index) => {
        const style = {
          "--home-beyond-order": visualOrderFor(
            index,
            leadingIndex,
            products.length,
          ),
        } as CarouselCardStyle;
        return (
          <ProductCard
            key={product.slug}
            product={product}
            className="home-beyond-carousel__card"
            style={style}
            quickBuyOpen={openQuickBuyProductId === product.id}
            previewKey={BEYOND_DESCRIPTION_KEY_BY_SLUG[product.slug]}
            onPreviewChange={onPreviewChange}
            onQuickBuyOpen={() => setOpenQuickBuyProductId(product.id)}
            onQuickBuyClose={() =>
              setOpenQuickBuyProductId((current) =>
                current === product.id ? null : current,
              )
            }
          />
        );
      })}
    </ul>
  );
}
