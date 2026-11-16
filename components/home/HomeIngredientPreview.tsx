import Image from "next/image";
import Link from "next/link";
import { ingredientAnchorId, type IngredientIndexCard } from "@/lib/content/system";

const INGREDIENT_LINK_LABELS: Record<string, string> = {
  pdrn: "PDRN",
  peptides: "Peptides",
  niacinamide: "Niacinamide",
};

const INGREDIENT_PREVIEWS: Record<string, { image: string; description: string }> = {
  pdrn: {
    image: "/media/system/ingredients/pdrn.jpg",
    description: "Polynucleotide that supports a hydrated, replenished-looking finish.",
  },
  peptides: {
    image: "/media/system/ingredients/peptides.jpg",
    description: "Combination of amino acids that result in a smoother, conditioned-looking surface.",
  },
  niacinamide: {
    image: "/media/system/ingredients/niacinamide.jpg",
    description: "Vitamin derivative that strengthens and brightens the skin barrier.",
  },
};

export function HomeIngredientPreview({ cards }: { cards: readonly IngredientIndexCard[] }) {
  return (
    <ul className="home-ingredient-list" aria-label="Ingredient literacy preview">
      {cards.map((card) => {
        const preview = INGREDIENT_PREVIEWS[card.id];
        return (
          <li key={card.id}>
            <Link
              href={`/system#${ingredientAnchorId(card.id)}`}
              className="home-ingredient-row"
              aria-label={`Read about ${INGREDIENT_LINK_LABELS[card.id] ?? card.name} in the System`}
            >
              {preview && (
                <Image
                  src={preview.image}
                  alt=""
                  width={112}
                  height={112}
                  sizes="(max-width: 360px) 72px, (max-width: 720px) 88px, 112px"
                  className="home-ingredient-row__image"
                />
              )}
              <div className="home-ingredient-row__copy">
                <h3>{card.name}</h3>
                <p>{preview?.description ?? card.skinRelevance}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
