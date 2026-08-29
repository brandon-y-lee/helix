"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  SwipeIndicator,
  useSwipeIndicator,
} from "@/components/carousel/SwipeIndicator";
import { useRovingTabSelection } from "@/components/system/useRovingTabSelection";
import {
  ingredientAnchorId,
  type IngredientIndexCard,
} from "@/lib/content/system";

const DRAG_START_THRESHOLD = 8;
const DRAG_COMMIT_THRESHOLD = 44;

type IngredientDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  dragging: boolean;
} | null;

const INGREDIENT_IMAGE_PATHS: Record<string, string> = {
  "cica-centella": "/media/system/ingredients/cica-centella.jpg",
  "collagen-source": "/media/system/ingredients/collagen-source.jpg",
  "exfoliating-acids": "/media/system/ingredients/exfoliating-acids.jpg",
  glycerin: "/media/system/ingredients/glycerin.jpg",
  "hyaluronic-acid": "/media/system/ingredients/hyaluronic-acid.jpg",
  niacinamide: "/media/system/ingredients/niacinamide.jpg",
  panthenol: "/media/system/ingredients/panthenol.jpg",
  pdrn: "/media/system/ingredients/pdrn.jpg",
  peptides: "/media/system/ingredients/peptides.jpg",
};

function tabId(card: IngredientIndexCard) {
  return `${ingredientAnchorId(card.id)}-tab`;
}

function panelId(card: IngredientIndexCard) {
  return ingredientAnchorId(card.id);
}

function renderedRailOffset(rail: HTMLElement) {
  const transform = window.getComputedStyle(rail).transform;
  if (!transform || transform === "none") return 0;

  const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3d) {
    const values = matrix3d[1].split(",").map(Number);
    return Math.max(0, -(values[12] ?? 0));
  }

  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix) {
    const values = matrix[1].split(",").map(Number);
    return Math.max(0, -(values[4] ?? 0));
  }

  const translation = transform.match(/^translate3d\(([-\d.]+)px/);
  return Math.max(0, -(Number(translation?.[1]) || 0));
}

export function SystemIngredientCarousel({
  cards,
}: {
  cards: IngredientIndexCard[];
}) {
  const { activeIndex, handleTabKeyDown, registerTab, selectIndex } =
    useRovingTabSelection(cards.length);
  const viewportRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousControlRef = useRef<HTMLButtonElement>(null);
  const nextControlRef = useRef<HTMLButtonElement>(null);
  const pendingControlFocus = useRef<"previous" | "next" | null>(null);
  const dragRef = useRef<IngredientDragState>(null);
  const suppressClickRef = useRef(false);
  const [railOffset, setRailOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const {
    hideIndicator,
    indicatorRef,
    indicatorVisible,
    updateIndicator,
  } = useSwipeIndicator(viewportRef);

  function selectFromControl(nextIndex: number) {
    if (nextIndex === 0) pendingControlFocus.current = "next";
    if (nextIndex === cards.length - 1) pendingControlFocus.current = "previous";
    selectIndex(nextIndex);
  }

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashIndex = cards.findIndex((card) => panelId(card) === hash);
    if (hashIndex < 0) return;

    selectIndex(hashIndex);
    window.requestAnimationFrame?.(() => {
      document.getElementById(hash)?.scrollIntoView?.({ block: "start" });
    });
  }, [cards, selectIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const rail = railRef.current;
    const activeCard = cardRefs.current[activeIndex];
    if (!viewport || !rail || !activeCard) return;

    const centerActiveCard = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const activeCardRect = activeCard.getBoundingClientRect();
      const visualDistanceToCenter =
        activeCardRect.left + activeCardRect.width / 2 -
        (viewportRect.left + viewportRect.width / 2);
      setRailOffset(
        Math.max(
          0,
          renderedRailOffset(rail) + visualDistanceToCenter,
        ),
      );
    };

    centerActiveCard();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", centerActiveCard);
      return () => window.removeEventListener("resize", centerActiveCard);
    }

    const observer = new ResizeObserver(centerActiveCard);
    observer.observe(viewport);
    observer.observe(activeCard);
    return () => observer.disconnect();
  }, [activeIndex, cards.length]);

  useEffect(() => {
    const pendingFocus = pendingControlFocus.current;
    if (!pendingFocus) return;

    pendingControlFocus.current = null;
    const control =
      pendingFocus === "previous"
        ? previousControlRef.current
        : nextControlRef.current;
    control?.focus({ preventScroll: true });
  }, [activeIndex]);

  function resetRailTransform() {
    if (!railRef.current) return;
    railRef.current.style.transform = `translate3d(${-railOffset}px, 0, 0)`;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      cards.length < 2 ||
      !(event.target instanceof HTMLElement) ||
      !event.target.closest(".ingredient-carousel__card")
    ) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      dragging: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const overIngredientCard =
      cards.length > 1 &&
      event.target instanceof HTMLElement &&
      Boolean(event.target.closest(".ingredient-carousel__card"));
    updateIndicator(
      event.clientX,
      event.clientY,
      overIngredientCard || dragging,
    );

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
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.dragging = true;
      setDragging(true);
    }

    const canMove =
      (deltaX < 0 && activeIndex < cards.length - 1) ||
      (deltaX > 0 && activeIndex > 0);
    const renderedDelta = canMove ? deltaX : deltaX * 0.16;
    event.preventDefault();
    if (railRef.current) {
      railRef.current.style.transform = `translate3d(${renderedDelta - railOffset}px, 0, 0)`;
    }
  }

  function finishDrag(
    event: PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const canMove =
      (drag.deltaX < 0 && activeIndex < cards.length - 1) ||
      (drag.deltaX > 0 && activeIndex > 0);
    const shouldMove =
      drag.dragging &&
      !cancelled &&
      canMove &&
      Math.abs(drag.deltaX) >= DRAG_COMMIT_THRESHOLD;

    resetRailTransform();
    setDragging(false);
    hideIndicator();
    dragRef.current = null;

    if (drag.dragging) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }

    if (shouldMove) {
      selectIndex(activeIndex + (drag.deltaX < 0 ? 1 : -1));
    }
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  if (cards.length === 0) return null;

  return (
    <div
      className="ingredient-carousel"
      data-active-ingredient={cards[activeIndex].id}
      data-dragging={dragging}
    >
      <div
        ref={viewportRef}
        className="ingredient-carousel__viewport"
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onPointerLeave={hideIndicator}
      >
        <div className="ingredient-carousel__controls">
          {activeIndex > 0 ? (
            <button
              ref={previousControlRef}
              className="method-arrow-control ingredient-carousel__control ingredient-carousel__control--previous"
              type="button"
              aria-label="Previous ingredient"
              onClick={() => selectFromControl(activeIndex - 1)}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : null}
          {activeIndex < cards.length - 1 ? (
            <button
              ref={nextControlRef}
              className="method-arrow-control ingredient-carousel__control ingredient-carousel__control--next"
              type="button"
              aria-label="Next ingredient"
              onClick={() => selectFromControl(activeIndex + 1)}
            >
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>

        <div
          ref={railRef}
          className="ingredient-carousel__rail"
          role="tablist"
          aria-label="Ingredient literacy"
          style={{ transform: `translate3d(${-railOffset}px, 0, 0)` }}
        >
          {cards.map((card, index) => {
            const imagePath = INGREDIENT_IMAGE_PATHS[card.id];
            return (
              <button
                key={card.id}
                ref={(node) => {
                  cardRefs.current[index] = node;
                  registerTab(index, node);
                }}
                id={tabId(card)}
                className="ingredient-carousel__card"
                type="button"
                role="tab"
                aria-controls={panelId(card)}
                aria-selected={index === activeIndex}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => selectIndex(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className="ingredient-carousel__media" aria-hidden="true">
                  {imagePath ? (
                    <Image
                      src={imagePath}
                      alt=""
                      fill
                      className="ingredient-carousel__image"
                      sizes="(max-width: 720px) 78vw, (max-width: 1200px) 34vw, 28vw"
                    />
                  ) : null}
                </span>
                <span className="ingredient-carousel__card-copy">
                  <small>{card.ingredientClass}</small>
                  <strong>{card.name}</strong>
                  <span>View details</span>
                </span>
              </button>
            );
          })}
        </div>
        <SwipeIndicator
          ref={indicatorRef}
          visible={indicatorVisible}
          active={dragging}
        />
      </div>

      <div className="ingredient-carousel__details">
        {cards.map((card, index) => (
          <article
            key={card.id}
            id={panelId(card)}
            className="ingredient-carousel__panel method-selection-panel"
            role="tabpanel"
            aria-labelledby={tabId(card)}
            hidden={index !== activeIndex}
            inert={index !== activeIndex}
          >
            <div className="ingredient-carousel__panel-heading">
              <p>{card.ingredientClass}</p>
              <h3>{card.name}</h3>
            </div>
            <dl>
              <div>
                <dt>INCI / Identity</dt>
                <dd>{card.identity}</dd>
              </div>
              <div>
                <dt>Mechanism</dt>
                <dd>{card.mechanism}</dd>
              </div>
              <div>
                <dt>Skin relevance</dt>
                <dd>{card.skinRelevance}</dd>
              </div>
            </dl>
            <div className="ingredient-carousel__found">
              <strong>Found in</strong>
              <ul aria-label={`${card.name} products`}>
                {card.products.map((product) => (
                  <li key={`${card.id}-${product.slug}`}>
                    <Link
                      href={`/products/${product.slug}`}
                      aria-label={`${product.displayName}. Opens product details.`}
                    >
                      {product.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Ingredient {activeIndex + 1} of {cards.length}: {cards[activeIndex].name}
      </p>
    </div>
  );
}
