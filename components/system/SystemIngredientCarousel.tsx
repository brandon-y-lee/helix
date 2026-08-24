"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
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

export function SystemIngredientCarousel({
  cards,
}: {
  cards: IngredientIndexCard[];
}) {
  const { activeIndex, handleTabKeyDown, registerTab, selectIndex } =
    useRovingTabSelection(cards.length, { scrollTabsIntoView: true });

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashIndex = cards.findIndex((card) => panelId(card) === hash);
    if (hashIndex < 0) return;

    selectIndex(hashIndex);
    window.requestAnimationFrame?.(() => {
      document.getElementById(hash)?.scrollIntoView?.({ block: "start" });
    });
  }, [cards, selectIndex]);

  if (cards.length === 0) return null;

  return (
    <div className="ingredient-carousel" data-active-ingredient={cards[activeIndex].id}>
      <div className="ingredient-carousel__controls">
        <button
          type="button"
          aria-label="Previous ingredient"
          onClick={() => selectIndex(activeIndex - 1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          aria-label="Next ingredient"
          onClick={() => selectIndex(activeIndex + 1)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div
        className="ingredient-carousel__rail"
        role="tablist"
        aria-label="Ingredient literacy"
      >
        {cards.map((card, index) => {
          const imagePath = INGREDIENT_IMAGE_PATHS[card.id];
          return (
            <button
              key={card.id}
              ref={(node) => {
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

      <div className="ingredient-carousel__details">
        {cards.map((card, index) => (
          <article
            key={card.id}
            id={panelId(card)}
            className="ingredient-carousel__panel"
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
