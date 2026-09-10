"use client";

import Link from "next/link";
import { HorizontalCarousel } from "@/components/carousel/HorizontalCarousel";
import { ingredientAnchorId, type IngredientIndexCard } from "@/lib/content/system";

const INGREDIENT_LINK_LABELS: Record<string, string> = {
  pdrn: "PDRN",
  peptides: "Peptides",
  niacinamide: "Niacinamide",
};

export function HomeIngredientPreview({ cards }: { cards: readonly IngredientIndexCard[] }) {
  return (
    <HorizontalCarousel
      className="home-ingredient-preview"
      ariaLabel="Ingredient literacy preview"
      itemName="ingredient"
      items={cards.map((card) => ({
        key: card.id,
        label: card.name,
        content: (
          <li key={card.id} className="home-beyond-carousel__card">
            <Link
              href={`/system#${ingredientAnchorId(card.id)}`}
              className="home-ingredient-card"
              aria-label={`Read about ${INGREDIENT_LINK_LABELS[card.id] ?? card.name} in the System`}
            >
              <p>{card.ingredientClass}</p>
              <h3>{card.name}</h3>
              <span>{card.skinRelevance}</span>
            </Link>
          </li>
        ),
      }))}
    />
  );
}
