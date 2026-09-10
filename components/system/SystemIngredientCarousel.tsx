"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  SwipeIndicator,
  useSwipeIndicator,
} from "@/components/carousel/SwipeIndicator";
import { useHorizontalCarouselDrag } from "@/components/carousel/useHorizontalCarouselDrag";
import { useRovingTabSelection } from "@/components/system/useRovingTabSelection";
import {
  ingredientAnchorId,
  type IngredientIndexCard,
} from "@/lib/content/system";

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
    return -(values[12] ?? 0);
  }

  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix) {
    const values = matrix[1].split(",").map(Number);
    return -(values[4] ?? 0);
  }

  const translation = transform.match(/^translate3d\(([-\d.]+)px/);
  return -(Number(translation?.[1]) || 0);
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
  const pointerFocusRef = useRef(false);
  const [railOffset, setRailOffset] = useState(0);
  const [centeredIndex, setCenteredIndex] = useState(0);
  const {
    hideIndicator,
    indicatorRef,
    indicatorVisible,
    updateIndicator,
  } = useSwipeIndicator(viewportRef);
  const {
    dragging,
    finishDrag,
    handleClickCapture,
    handlePointerDown,
    handlePointerMove: handleDragPointerMove,
  } = useHorizontalCarouselDrag({
    enabled: cards.length > 1,
    canStart: (target) =>
      target instanceof HTMLElement &&
      Boolean(target.closest(".ingredient-carousel__card")),
    getCommitDelta: ingredientCommitDelta,
    getRenderedDelta: ingredientRenderedDelta,
    onDrag: (renderedDeltaX) => {
      if (railRef.current) {
        railRef.current.style.transform = `translate3d(${renderedDeltaX - railOffset}px, 0, 0)`;
      }
    },
    onFinish: ({ committed, deltaX }) => {
      resetRailTransform();
      hideIndicator();
      if (committed) {
        setCenteredIndex(nearestSnapIndex(railOffset - deltaX));
      }
    },
  });

  function moveCarousel(nextIndex: number) {
    if (nextIndex === 0) pendingControlFocus.current = "next";
    if (nextIndex === cards.length - 1) pendingControlFocus.current = "previous";
    setCenteredIndex(nextIndex);
  }

  function selectCard(index: number) {
    setCenteredIndex(index);
    selectIndex(index);
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
    setCenteredIndex(activeIndex);
  }, [activeIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const rail = railRef.current;
    const centeredCard = cardRefs.current[centeredIndex];
    if (!viewport || !rail || !centeredCard) return;

    const centerCard = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const centeredCardRect = centeredCard.getBoundingClientRect();
      const visualDistanceToCenter =
        centeredCardRect.left + centeredCardRect.width / 2 -
        (viewportRect.left + viewportRect.width / 2);
      setRailOffset(renderedRailOffset(rail) + visualDistanceToCenter);
    };

    centerCard();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", centerCard);
      return () => window.removeEventListener("resize", centerCard);
    }

    const observer = new ResizeObserver(centerCard);
    observer.observe(viewport);
    observer.observe(centeredCard);
    return () => observer.disconnect();
  }, [cards.length, centeredIndex]);

  useEffect(() => {
    const pendingFocus = pendingControlFocus.current;
    if (!pendingFocus) return;

    pendingControlFocus.current = null;
    const control =
      pendingFocus === "previous"
        ? previousControlRef.current
        : nextControlRef.current;
    control?.focus({ preventScroll: true });
  }, [centeredIndex]);

  function resetRailTransform() {
    if (!railRef.current) return;
    railRef.current.style.transform = `translate3d(${-railOffset}px, 0, 0)`;
  }

  function ingredientCommitDelta(deltaX: number) {
    const firstOffset = cardSnapOffset(0);
    const lastOffset = cardSnapOffset(cards.length - 1);
    if (firstOffset === null || lastOffset === null) return 0;

    const proposedOffset = railOffset - deltaX;
    const boundedOffset = Math.min(
      Math.max(proposedOffset, Math.min(firstOffset, lastOffset)),
      Math.max(firstOffset, lastOffset),
    );
    return railOffset - boundedOffset;
  }

  function ingredientRenderedDelta(deltaX: number) {
    const boundedDelta = ingredientCommitDelta(deltaX);
    return boundedDelta + (deltaX - boundedDelta) * 0.16;
  }

  function cardSnapOffset(index: number) {
    const viewport = viewportRef.current;
    const rail = railRef.current;
    const card = cardRefs.current[index];
    if (!viewport || !rail || !card) return null;

    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const untransformedCardCenter =
      cardRect.left + renderedRailOffset(rail) + cardRect.width / 2;
    return (
      untransformedCardCenter -
      (viewportRect.left + viewportRect.width / 2)
    );
  }

  function nearestSnapIndex(targetOffset: number) {
    let nearestIndex = centeredIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((_, index) => {
      const offset = cardSnapOffset(index);
      if (offset === null) return;

      const distance = Math.abs(offset - targetOffset);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });

    return nearestIndex;
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

    handleDragPointerMove(event);
  }

  function handleIngredientPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerFocusRef.current =
      event.target instanceof HTMLElement &&
      Boolean(event.target.closest(".ingredient-carousel__card"));
    handlePointerDown(event);
  }

  function finishIngredientDrag(
    event: PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    finishDrag(event, cancelled);
    pointerFocusRef.current = false;
  }

  if (cards.length === 0) return null;

  return (
    <div
      className="ingredient-carousel"
      data-active-ingredient={cards[activeIndex].id}
      data-centered-ingredient={cards[centeredIndex].id}
      data-dragging={dragging}
    >
      <div
        ref={viewportRef}
        className="ingredient-carousel__viewport"
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={handleIngredientPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishIngredientDrag(event)}
        onPointerCancel={(event) => finishIngredientDrag(event, true)}
        onPointerLeave={() => {
          hideIndicator();
          if (!dragging) pointerFocusRef.current = false;
        }}
      >
        <div className="ingredient-carousel__controls">
          {centeredIndex > 0 ? (
            <button
              ref={previousControlRef}
              className="method-arrow-control ingredient-carousel__control ingredient-carousel__control--previous"
              type="button"
              aria-label="Previous ingredient"
              onClick={() => moveCarousel(centeredIndex - 1)}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : null}
          {centeredIndex < cards.length - 1 ? (
            <button
              ref={nextControlRef}
              className="method-arrow-control ingredient-carousel__control ingredient-carousel__control--next"
              type="button"
              aria-label="Next ingredient"
              onClick={() => moveCarousel(centeredIndex + 1)}
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
                data-centered={index === centeredIndex}
                type="button"
                role="tab"
                aria-controls={panelId(card)}
                aria-selected={index === activeIndex}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => selectCard(index)}
                onFocus={() => {
                  if (!pointerFocusRef.current) setCenteredIndex(index);
                }}
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
                  <span>{index === activeIndex ? "Selected" : "View details"}</span>
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
              <h3>
                <span className="ingredient-carousel__selection-label">
                  Selected ingredient:{" "}
                </span>
                {card.name}
              </h3>
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
