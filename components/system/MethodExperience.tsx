import Link from "next/link";
import { ProductImage } from "@/components/product/ProductImage";
import {
  MethodRoutineNav,
  type MethodRoutineNavItem,
} from "@/components/system/MethodRoutineNav";
import {
  BEYOND_SYSTEM_STEP_NAMES,
  CORE_SYSTEM_STEP_NAMES,
  SYSTEM_STEP_ANCHORS,
  SYSTEM_STEP_LEGACY_ANCHORS,
  ingredientAnchorId,
  type BeyondSystemProductEntry,
  type CoreSystemProductEntry,
  type IngredientIndexCard,
  type SystemProductGroups,
} from "@/lib/content/system";
import { firstPurchasableVariant, type Product } from "@/lib/products";

const SYSTEM_NAV_ITEMS: MethodRoutineNavItem[] = [
  { id: "system-overview", label: "Start", meta: "Overview" },
  { id: "system-core", label: "Core", meta: "Three steps" },
  { id: "system-beyond", label: "Beyond", meta: "Targeted additions" },
  { id: "system-ingredients", label: "Ingredients", meta: "Literacy" },
];

const MISSING_SYSTEM_CARD_PRESENTATION = {
  core: {
    groupLabel: "Core",
    cardClassName: "method-core-card",
    bodyClassName: "method-core-card__body",
  },
  beyond: {
    groupLabel: "Beyond",
    cardClassName: "method-beyond-card",
    bodyClassName: "method-beyond-card__body",
  },
} as const;

function LegacyAnchors({ ids }: { ids?: readonly string[] }) {
  if (!ids?.length) return null;
  return (
    <>
      {ids.map((id) => (
        <span key={id} id={id} className="method-anchor-alias" aria-hidden="true" />
      ))}
    </>
  );
}

function availabilityLabel(product: Product) {
  if (firstPurchasableVariant(product)) return "Available";
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "waitlist") return "Waitlist";
  return "Sold out";
}

function primaryVariantMeta(product: Product) {
  const variant = product.variants[0];
  if (variant?.volume) return variant.volume;
  if (variant?.packCount) return `${variant.packCount} pack`;
  if (variant?.label) return variant.label;
  return product.volume;
}

function CoreProductFeature({ entry }: { entry: CoreSystemProductEntry }) {
  const { product } = entry;
  const variantMeta = primaryVariantMeta(product);

  return (
    <article
      id={entry.anchorId}
      className="method-core-card"
      aria-labelledby={`${entry.anchorId}-heading`}
      data-method-step-id={entry.stepName.toLowerCase()}
      data-display-number={entry.displayNumber}
    >
      <LegacyAnchors ids={entry.legacyAnchorIds} />
      <div className="method-core-card__media">
        <ProductImage
          media={product.detailMedia ?? product.cardMedia}
          swatch={product.swatch}
          className="method-core-card__image"
          imageClassName="method-core-card__img"
          sizes="(max-width: 720px) 92vw, (max-width: 1020px) 86vw, 30vw"
        />
        <span className="method-core-card__number" aria-hidden="true">
          {entry.displayNumber}
        </span>
      </div>
      <div className="method-core-card__body">
        <p className="eyebrow">{entry.stepName}</p>
        <h3 id={`${entry.anchorId}-heading`}>{product.displayName}</h3>
        <p className="method-system-card__type">
          {product.productType}
          {variantMeta ? ` / ${variantMeta}` : ""}
        </p>
        <p className="method-core-card__description">{product.description}</p>
        {product.keyIngredients.length > 0 && (
          <ul className="method-core-card__ingredients" aria-label="Key ingredients">
            {product.keyIngredients.slice(0, 3).map((ingredient) => (
              <li key={ingredient}>{ingredient}</li>
            ))}
          </ul>
        )}
        <div className="method-system-card__meta">
          <span>{product.usageTime.join(" + ") || "Use as directed"}</span>
          <span>{availabilityLabel(product)}</span>
        </div>
        <Link
          href={`/products/${product.slug}`}
          className="btn btn--ghost btn--editorial-rounded method-system-card__link"
          aria-label={`View ${product.displayName} product details`}
        >
          View {product.displayName}
        </Link>
      </div>
    </article>
  );
}

function MissingSystemCard({
  stepName,
  presentation,
  displayNumber,
}: {
  stepName:
    | (typeof CORE_SYSTEM_STEP_NAMES)[number]
    | (typeof BEYOND_SYSTEM_STEP_NAMES)[number];
  presentation: "core" | "beyond";
  displayNumber?: string;
}) {
  const anchorId = SYSTEM_STEP_ANCHORS[stepName];
  const presentationDetails = MISSING_SYSTEM_CARD_PRESENTATION[presentation];
  return (
    <article
      id={anchorId}
      className={`${presentationDetails.cardClassName} method-system-card--missing`}
      aria-labelledby={`${anchorId}-heading`}
    >
      <LegacyAnchors ids={SYSTEM_STEP_LEGACY_ANCHORS[stepName]} />
      {displayNumber && (
        <span className="method-core-card__number" aria-hidden="true">
          {displayNumber}
        </span>
      )}
      <div className={presentationDetails.bodyClassName}>
        <p className="eyebrow">{stepName}</p>
        <h3 id={`${anchorId}-heading`}>{stepName} currently unavailable</h3>
        <p>
          No collection-facing {presentationDetails.groupLabel} entry is available for
          this step.
        </p>
      </div>
    </article>
  );
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
      <LegacyAnchors ids={entry.legacyAnchorIds} />
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
      <LegacyAnchors ids={["method-ingredients"]} />
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

export function MethodExperience({
  groups,
  ingredientCards,
}: {
  groups: SystemProductGroups;
  ingredientCards: IngredientIndexCard[];
}) {
  return (
    <div className="method-shell">
      <MethodRoutineNav items={SYSTEM_NAV_ITEMS} />

      <div className="method-flow">
        <section
          id="system-core"
          className="method-core"
          aria-labelledby="system-core-heading"
        >
          <LegacyAnchors ids={["system-routine", "method-routine"]} />
          <header className="method-section-head">
            <div>
              <p className="eyebrow">The Core</p>
              <h2 id="system-core-heading">CLEANSE. TREAT. SEAL.</h2>
              <p>
                Three daily steps form the baseline. Start here before adding
                anything more.
              </p>
            </div>
            <Link href="/collections/core" className="btn btn--editorial-rounded">
              Shop the Core
            </Link>
          </header>

          <div className="method-core__grid">
            {CORE_SYSTEM_STEP_NAMES.map((stepName, index) => {
              const entry = groups.core.find((item) => item.stepName === stepName);
              return entry ? (
                <CoreProductFeature key={stepName} entry={entry} />
              ) : (
                <MissingSystemCard
                  key={stepName}
                  stepName={stepName}
                  presentation="core"
                  displayNumber={String(index + 1).padStart(2, "0")}
                />
              );
            })}
          </div>
        </section>

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
                Add prep, eye care, daily protection, or a weekly intensive where
                it earns a place in your routine.
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
                <MissingSystemCard
                  key={stepName}
                  stepName={stepName}
                  presentation="beyond"
                />
              );
            })}
          </div>
        </section>

        <IngredientLiteracy cards={ingredientCards} />
      </div>
    </div>
  );
}
