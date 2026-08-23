import Link from "next/link";
import { ProductImage } from "@/components/product/ProductImage";
import {
  SystemCoreFlow,
  type SystemCoreFlowItem,
} from "@/components/system/SystemCoreFlow";
import { SystemLegacyAnchors } from "@/components/system/SystemLegacyAnchors";
import {
  BEYOND_SYSTEM_STEP_NAMES,
  CORE_SYSTEM_STEP_NAMES,
  SYSTEM_STEP_ANCHORS,
  SYSTEM_STEP_LEGACY_ANCHORS,
  ingredientAnchorId,
  type BeyondSystemProductEntry,
  type IngredientIndexCard,
  type SystemProductGroups,
} from "@/lib/content/system";
import { firstPurchasableVariant, type Product } from "@/lib/products";

const MISSING_CORE_SWATCH: [string, string] = ["#dedbd3", "#807d76"];

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
        description: entry.product.description,
        displayName: entry.product.displayName,
        displayNumber: entry.displayNumber,
        legacyAnchorIds: entry.legacyAnchorIds,
        productType: entry.product.productType,
        slug: entry.product.slug,
        stepName,
        swatch: entry.product.swatch,
      };
    }

    return {
      anchorId: SYSTEM_STEP_ANCHORS[stepName],
      description: "No collection-facing Core entry is available for this step.",
      displayName: `${stepName} currently unavailable`,
      displayNumber: String(index + 1).padStart(2, "0"),
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
          View product
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
          <p className="eyebrow">Ingredient literacy</p>
          <h2 id="system-ingredients-heading">KNOW WHAT YOU’RE USING.</h2>
        </div>
      </div>
      {cards.length > 0 ? (
        <div className="ingredient-index">
          {cards.map((card) => {
            const anchorId = ingredientAnchorId(card.id);
            return (
              <article
                key={card.id}
                id={anchorId}
                className="ingredient-card"
                aria-labelledby={`${anchorId}-heading`}
              >
                <p>{card.ingredientClass}</p>
                <h3 id={`${anchorId}-heading`}>{card.name}</h3>
                <dl className="ingredient-card__fields">
                  <div>
                    <dt>INCI / IDENTITY</dt>
                    <dd>{card.identity}</dd>
                  </div>
                  <div>
                    <dt>MECHANISM</dt>
                    <dd>{card.mechanism}</dd>
                  </div>
                  <div>
                    <dt>SKIN RELEVANCE</dt>
                    <dd>{card.skinRelevance}</dd>
                  </div>
                  {card.formulationNote && (
                    <div>
                      <dt>FORMULATION NOTE</dt>
                      <dd>{card.formulationNote}</dd>
                    </div>
                  )}
                </dl>
                <div className="ingredient-card__found">
                  <strong>FOUND IN</strong>
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
            );
          })}
        </div>
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
          <h2 id="system-intentional-heading">intentional skincare</h2>
          <p>
            Helix is a line of curated skincare essentials. Formulated for a
            variety of skin types and needs with high performance ingredients,
            it’s a daily routine that nourishes your skin barrier over time.
          </p>
        </div>
      </div>
      <div className="method-intentional__visual" aria-hidden="true">
        <div className="editorial-hue-field editorial-hue-field--clean editorial-hue-field--method">
          <span />
          <span />
          <span />
        </div>
      </div>
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
            <p className="eyebrow">Beyond The Core</p>
            <h2 id="system-beyond-heading">TARGETED STEPS. USED DELIBERATELY.</h2>
            <p>
              Add prep, eye care, daily protection, or a weekly intensive where it
              earns a place in your routine.
            </p>
          </div>
          <Link
            href="/collections/beyond-the-core"
            className="btn btn--ghost btn--editorial-rounded"
          >
            Shop Beyond
          </Link>
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
