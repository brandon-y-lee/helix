import Link from "next/link";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { ProductImage } from "@/components/product/ProductImage";
import {
  SystemCoreFlow,
  type SystemCoreFlowItem,
} from "@/components/system/SystemCoreFlow";
import { SystemLegacyAnchors } from "@/components/system/SystemLegacyAnchors";
import { SystemIngredientCarousel } from "@/components/system/SystemIngredientCarousel";
import { IntentionalSkincareVisual } from "@/components/system/IntentionalSkincareVisual";
import {
  BEYOND_SYSTEM_STEP_NAMES,
  CORE_SYSTEM_STEP_NAMES,
  SYSTEM_STEP_ANCHORS,
  SYSTEM_STEP_LEGACY_ANCHORS,
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
      className="method-beyond-card method-system-card--missing"
      aria-labelledby={`${anchorId}-heading`}
    >
      <SystemLegacyAnchors ids={SYSTEM_STEP_LEGACY_ANCHORS[stepName]} />
      <div className="method-beyond-card__body">
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
        legacyAnchorIds: entry.legacyAnchorIds,
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
      legacyAnchorIds: SYSTEM_STEP_LEGACY_ANCHORS[stepName],
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
      className="method-beyond-card"
      aria-labelledby={`${entry.anchorId}-heading`}
      data-method-step-id={entry.stepName.toLowerCase()}
    >
      <SystemLegacyAnchors ids={entry.legacyAnchorIds} />
      <div className="method-beyond-card__media">
        <ProductImage
          media={product.cardMedia ?? product.detailMedia}
          swatch={product.swatch}
          className="method-beyond-card__image"
          imageClassName="method-beyond-card__img"
          sizes="(max-width: 720px) 44vw, (max-width: 1020px) 42vw, 20vw"
        />
      </div>
      <div className="method-beyond-card__body">
        <p className="eyebrow">{entry.stepName}</p>
        <h3 id={`${entry.anchorId}-heading`}>{product.displayName}</h3>
        <p className="method-system-card__type">{product.productType}</p>
        <p className="method-beyond-card__placement">{entry.placement}</p>
        <div className="method-system-card__meta">
          <span>{availabilityLabel(product)}</span>
        </div>
        <Link
          href={`/products/${product.slug}`}
          className="method-beyond-card__link"
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
      className="method-ingredients"
      aria-labelledby="system-ingredients-heading"
    >
      <SystemLegacyAnchors ids={["method-ingredients"]} />
      <div className="section-head">
        <div>
          <p className="eyebrow method-section-eyebrow">
            <HelixIdentity variant="symbol" decorative />
            <span>Ingredient literacy</span>
          </p>
          <h2 id="system-ingredients-heading">Research-backed ingredients</h2>
        </div>
      </div>
      {cards.length > 0 ? (
        <SystemIngredientCarousel cards={cards} />
      ) : (
        <p className="method-ingredients__empty">
          Ingredient details are being prepared for the active System products.
        </p>
      )}
    </section>
  );
}

function IntentionalSkincare() {
  return (
    <section
      className="method-intentional"
      aria-labelledby="system-intentional-heading"
    >
      <div className="method-intentional__copy">
        <div>
          <h2 id="system-intentional-heading" className="method-intentional__heading">
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

export function MethodExperience({
  groups,
  ingredientCards,
}: {
  groups: SystemProductGroups;
  ingredientCards: IngredientIndexCard[];
}) {
  return (
    <div className="method-shell">
      <SystemCoreFlow items={buildCoreFlowItems(groups)} />

      <IntentionalSkincare />

      <section
        id="system-beyond"
        className="method-beyond"
        aria-labelledby="system-beyond-heading"
      >
        <header className="method-section-head method-section-head--beyond">
          <div>
            <p className="eyebrow method-section-eyebrow">
              <HelixIdentity variant="symbol" decorative />
              <span>Beyond The Core</span>
            </p>
            <h2 id="system-beyond-heading">Targeted steps</h2>
            <p>
              Add prep, eye care, daily protection, or a weekly intensive.
            </p>
          </div>
        </header>

        <div className="method-beyond__grid">
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
