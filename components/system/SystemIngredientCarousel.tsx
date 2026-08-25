"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [railOffset, setRailOffset] = useState(0);

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

  if (cards.length === 0) return null;

  return (
    <div
      className="ingredient-carousel"
      data-active-ingredient={cards[activeIndex].id}
    >
      <div ref={viewportRef} className="ingredient-carousel__viewport">
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
