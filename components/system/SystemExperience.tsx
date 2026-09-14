import Link from "next/link";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { ProductImage } from "@/components/product/ProductImage";
import {
  SystemCoreFlow,
  type SystemCoreFlowItem,
} from "@/components/system/SystemCoreFlow";
import { SystemIngredientCarousel } from "@/components/system/SystemIngredientCarousel";
import { IntentionalSkincareVisual } from "@/components/system/IntentionalSkincareVisual";
import {
  BEYOND_SYSTEM_STEP_NAMES,
  CORE_SYSTEM_STEP_NAMES,
  SYSTEM_STEP_ANCHORS,
  type BeyondSystemProductEntry,
  type IngredientIndexCard,
  type SystemProductGroups,
} from "@/lib/content/system";
import { firstPurchasableVariant, type Product } from "@/lib/products";

const MISSING_CORE_SWATCH: [string, string] = ["#dedbd3", "#807d76"];

const CORE_STEP_HERO_LINES: Record<
  (typeof CORE_SYSTEM_STEP_NAMES)[number],
  readonly [string, string]
> = {
  CLEANSE: ["Wash off the day.", "Start fresh."],
  TREAT: ["Bring skin back.", "Smooth. Hydrated."],
  SEAL: ["Hold every layer.", "Keep moisture in."],
};

function availabilityLabel(product: Product) {
  if (firstPurchasableVariant(product)) return "Available";
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "waitlist") return "Waitlist";
  return "Sold out";
}

function MissingSystemCard({
  stepName,
}: {
  stepName: (typeof BEYOND_SYSTEM_STEP_NAMES)[number];
}) {
  const anchorId = SYSTEM_STEP_ANCHORS[stepName];
  return (
    <article
      id={anchorId}
      className="system-beyond-card system-product-card--missing"
      aria-labelledby={`${anchorId}-heading`}
    >
      <div className="system-beyond-card__body">
        <p className="eyebrow">{stepName}</p>
        <h3 id={`${anchorId}-heading`}>{stepName} currently unavailable</h3>
        <p>
          No collection-facing Beyond entry is available for this step.
        </p>
      </div>
    </article>
  );
}

function buildCoreFlowItems(groups: SystemProductGroups): SystemCoreFlowItem[] {
  return CORE_SYSTEM_STEP_NAMES.map((stepName, index) => {
    const entry = groups.core.find((item) => item.stepName === stepName);
    if (entry) {
      return {
        anchorId: entry.anchorId,
        backgroundMedia:
          entry.product.cardHoverMedia ??
          entry.product.heroMedia ??
          entry.product.cardMedia ??
          entry.product.detailMedia,
        displayName: entry.product.displayName,
        displayNumber: entry.displayNumber,
        heroLines: CORE_STEP_HERO_LINES[stepName],
        productType: entry.product.productType,
        slug: entry.product.slug,
        stepName,
        swatch: entry.product.swatch,
      };
    }

    return {
      anchorId: SYSTEM_STEP_ANCHORS[stepName],
      backgroundMedia: null,
      displayName: `${stepName} currently unavailable`,
      displayNumber: String(index + 1).padStart(2, "0"),
      heroLines: [
        "Step unavailable.",
        "No product is listed.",
      ],
      productType: "Currently unavailable",
      slug: null,
      stepName,
      swatch: MISSING_CORE_SWATCH,
    };
  });
}

function BeyondProductCard({ entry }: { entry: BeyondSystemProductEntry }) {
  const { product } = entry;
  return (
    <article
      id={entry.anchorId}
      className="system-beyond-card"
      aria-labelledby={`${entry.anchorId}-heading`}
      data-system-step-id={entry.stepName.toLowerCase()}
    >
      <div className="system-beyond-card__media">
        <ProductImage
          media={product.cardMedia ?? product.detailMedia}
          swatch={product.swatch}
          className="system-beyond-card__image"
          imageClassName="system-beyond-card__img"
          sizes="(max-width: 360px) calc(100vw - 68px), (max-width: 720px) calc((100vw - 76px) / 2), (max-width: 1020px) 42vw, 20vw"
        />
      </div>
      <div className="system-beyond-card__body">
        <p className="eyebrow">{entry.stepName}</p>
        <h3 id={`${entry.anchorId}-heading`}>{product.displayName}</h3>
        <p className="system-product-card__type">{product.productType}</p>
        <p className="system-beyond-card__placement">{entry.placement}</p>
        <div className="system-product-card__meta">
          <span>{availabilityLabel(product)}</span>
        </div>
        <Link
          href={`/products/${product.slug}`}
          className="system-beyond-card__link"
          aria-label={`View ${product.displayName} product details`}
        >
          <span className="sr-only">View {product.displayName} product details</span>
        </Link>
      </div>
    </article>
  );
}

function IngredientLiteracy({ cards }: { cards: IngredientIndexCard[] }) {
  return (
    <section
      id="system-ingredients"
      className="system-ingredients"
      aria-labelledby="system-ingredients-heading"
    >
      <div className="section-head">
        <div>
          <p className="eyebrow system-section-eyebrow">
            <HelixIdentity variant="symbol" decorative />
            <span>Ingredient literacy</span>
          </p>
          <h2 id="system-ingredients-heading">Research-backed ingredients</h2>
        </div>
      </div>
      {cards.length > 0 ? (
        <SystemIngredientCarousel cards={cards} />
      ) : (
        <p className="system-ingredients__empty">
          Ingredient details are being prepared for the active System products.
        </p>
      )}
    </section>
  );
}

function IntentionalSkincare() {
  return (
    <section
      className="system-intentional"
      aria-labelledby="system-intentional-heading"
    >
      <div className="system-intentional__copy">
        <div>
          <h2 id="system-intentional-heading" className="system-intentional__heading">
            intentional skincare
          </h2>
          <p>
            Helix is a line of curated skincare essentials. Formulated for a
            variety of skin types and needs with high performance ingredients,
            it’s a daily routine that nourishes your skin barrier over time.
          </p>
        </div>
      </div>
      <IntentionalSkincareVisual />
    </section>
  );
}

export function SystemExperience({
  groups,
  ingredientCards,
}: {
  groups: SystemProductGroups;
  ingredientCards: IngredientIndexCard[];
}) {
  return (
    <div className="system-shell">
      <SystemCoreFlow items={buildCoreFlowItems(groups)} />

      <IntentionalSkincare />

      <section
        id="system-beyond"
        className="system-beyond"
        aria-labelledby="system-beyond-heading"
      >
        <header className="system-section-head system-section-head--beyond">
          <div>
            <p className="eyebrow system-section-eyebrow">
              <HelixIdentity variant="symbol" decorative />
              <span>Beyond The Core</span>
            </p>
            <h2 id="system-beyond-heading">Targeted steps</h2>
            <p>
              Add prep, eye care, daily protection, or a weekly intensive.
            </p>
          </div>
        </header>

        <div className="system-beyond__grid">
          {BEYOND_SYSTEM_STEP_NAMES.map((stepName) => {
            const entry = groups.beyond.find((item) => item.stepName === stepName);
            return entry ? (
              <BeyondProductCard key={stepName} entry={entry} />
            ) : (
              <MissingSystemCard key={stepName} stepName={stepName} />
            );
          })}
        </div>
      </section>

      <IngredientLiteracy cards={ingredientCards} />
    </div>
  );
}
