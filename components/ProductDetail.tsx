import type { ReactNode } from "react";
import { ProductEndorsementRail } from "@/components/ProductEndorsementRail";
import { ProductReviewsSection } from "@/components/ProductReviewsSection";
import { PdpApplicationCarousel } from "@/components/PdpApplicationCarousel";
import { PdpCoreDetailsRoutine } from "@/components/PdpCoreDetailsRoutine";
import { PdpCoreRoutineSection } from "@/components/PdpCoreRoutineSection";
import { PdpGalleryIsland } from "@/components/PdpGalleryIsland";
import { PdpIngredientsSplit } from "@/components/PdpIngredientsSplit";
import { PdpOutcomeSplit } from "@/components/PdpOutcomeSplit";
import {
  PdpPanelSequence,
  type PdpSequenceItem,
} from "@/components/PdpPanelSequence";
import { PdpProfileSplit } from "@/components/PdpProfileSplit";
import { PdpPurchaseAccordions } from "@/components/PdpPurchaseAccordions";
import { PdpPurchaseIsland } from "@/components/PdpPurchaseIsland";
import { PdpRoutineVideo } from "@/components/PdpRoutineVideo";
import {
  applicationIslandProps,
  coreDetailsIslandItems,
  galleryIslandProps,
  outcomeIslandProps,
  purchaseAccordionProps,
  purchaseIslandProps,
} from "@/components/ProductDetail.adapters";
import {
  type ProductPdpContent,
} from "@/lib/catalog/product-content";
import type {
  CoreRoutineSummary,
  PdpProduct,
} from "@/lib/catalog/models";
import { resolveFullInci } from "@/lib/catalog/product-ingredients";
import {
  routineDisplayLabelForProduct,
  routineGroupLabelForProduct,
} from "@/lib/catalog/product-routine";
import {
  getProductReviews,
  type ProductReviews,
} from "@/lib/catalog/product-reviews";
import { getCorePdpPresentation } from "@/lib/content/core-pdp";
import { productEndorsementMedia } from "@/lib/content/product-endorsements";

function compactDescription(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (sentences.length ? sentences.slice(0, 2).join(" ") : value).trim();
}

function splitCopy(value: string) {
  return value
    .split(/[.;]\s+/)
    .map((item) => item.trim().replace(/[.;]$/, ""))
    .filter(Boolean);
}

function PdpEditorialPair({
  headingId,
  eyebrow,
  heading,
  summary,
  className = "",
  children,
}: {
  headingId: string;
  eyebrow: string;
  heading: string;
  summary?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`pdp-editorial-pair ${className}`.trim()}
      aria-labelledby={headingId}
      data-pdp-panel-row="editorial"
      data-pdp-panel-mode="independent"
    >
      <div
        className="pdp-editorial-pair__panel pdp-editorial-pair__panel--headline"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{heading}</h2>
        {summary && <p>{summary}</p>}
      </div>
      <div
        className="pdp-editorial-pair__panel pdp-editorial-pair__panel--content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        {children}
      </div>
    </section>
  );
}

function ProductSignalGrid({
  product,
  routineLabel,
}: {
  product: PdpProduct;
  routineLabel: string;
}) {
  const signals = [
    { label: "GOOD FOR", value: product.goodFor },
    { label: "FEELS LIKE", value: product.texture },
    { label: "FINISH", value: product.finish },
    { label: "WHEN TO USE", value: product.usageTime.join(" / ") },
    { label: "WHERE IT FITS", value: routineLabel },
  ].filter((signal): signal is { label: string; value: string } =>
    Boolean(signal.value),
  );

  if (signals.length === 0) return null;

  return (
    <PdpEditorialPair
      headingId="pdp-signals-heading"
      eyebrow="Read"
      heading="QUICK SIGNALS"
      summary={`${product.displayName} at a glance, from use timing to finish.`}
      className="pdp-editorial-pair--signals"
    >
      <dl className="product-signal-grid">
        {signals.map((signal) => (
          <div key={signal.label} className="product-signal-grid__item">
            <dt>{signal.label}</dt>
            <dd>{signal.value}</dd>
          </div>
        ))}
      </dl>
    </PdpEditorialPair>
  );
}

export function ProductDetail({
  product,
  coreProducts = [],
  content = product.pdpContent ?? null,
  reviews = getProductReviews(product.slug),
  stripePublishableKey = null,
}: {
  product: PdpProduct;
  coreProducts?: CoreRoutineSummary[];
  content?: ProductPdpContent | null;
  reviews?: ProductReviews;
  stripePublishableKey?: string | null;
}) {
  const routineLabel = routineDisplayLabelForProduct(product);
  const routineGroupLabel = routineGroupLabelForProduct(product);
  const leadDescription = compactDescription(
    product.description || product.cardTagline,
  );
  const howToUse =
    content?.howToUseSteps ??
    splitCopy(product.howToUse);
  const resolvedFullInci = resolveFullInci(product);
  const fullIngredientsText =
    resolvedFullInci?.text ||
    "The current full ingredient list should be checked on product packaging or the approved product source.";
  const initialVariant = product.variants[0];
  const details = [
    { label: "Routine placement", value: routineLabel },
    { label: "Routine group", value: routineGroupLabel },
    { label: "Product type", value: product.productType },
    { label: "Use cadence", value: product.usageTime.join(" / ") },
    { label: "Texture", value: product.texture },
    { label: "Finish", value: product.finish },
    { label: "Size", value: initialVariant?.volume ?? product.volume },
    {
      label: "Pack count",
      value: initialVariant?.packCount ? String(initialVariant.packCount) : "",
    },
    { label: "Made for", value: product.madeFor },
    { label: "Good for", value: product.goodFor },
    { label: "Skin", value: product.skinTypes.join(", ") },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value),
  );
  const howToUseItems: PdpSequenceItem[] = howToUse.map((step, index) => ({
    kicker: `Step ${String(index + 1).padStart(2, "0")}`,
    title:
      index === 0
        ? "Start here"
        : `Then ${String(index + 1).padStart(2, "0")}`,
    body: step,
  }));
  const ingredientItems: PdpSequenceItem[] = (content?.ingredientCards ?? []).map(
    (ingredient) => ({
      kicker: ingredient.label,
      title: ingredient.name,
      body: ingredient.copy,
    }),
  );
  const corePresentation = getCorePdpPresentation(product, content);
  const routineVideo =
    product.media.find(
      (media) =>
        media.role === "routine_video" &&
        media.kind === "video" &&
        Boolean(media.url),
    ) ?? null;
  const routinePoster =
    product.media.find(
      (media) =>
        media.role === "routine_video_poster" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const profileMedia =
    product.media.find(
      (media) =>
        media.role === "profile_editorial" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const ingredientsTextureMedia =
    product.media.find(
      (media) =>
        media.role === "ingredients_texture" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const coreProfileReady = Boolean(corePresentation && profileMedia);
  const galleryProps = galleryIslandProps(product);
  const purchaseProps = purchaseIslandProps(
    product,
    routineLabel,
    stripePublishableKey,
  );
  const accordionProps = purchaseAccordionProps(
    product,
    content,
    howToUse,
    corePresentation,
  );
  const coreDetailsItems = coreDetailsIslandItems(coreProducts);

  return (
    <>
      <div className="pdp" data-pdp-primary-section>
        <PdpGalleryIsland
          key={`gallery:${product.slug}`}
          {...galleryProps}
        />
        <PdpPurchaseIsland
          key={`purchase:${product.slug}`}
          {...purchaseProps}
          accordions={
            <PdpPurchaseAccordions
              key={`accordions:${product.slug}`}
              {...accordionProps}
            />
          }
        >
          <p className="pdp__collection">{routineLabel}</p>
          <h1>{product.displayName}</h1>
          <p className="pdp__tagline">{product.cardTagline}</p>
          <p className="pdp__description">{leadDescription}</p>
        </PdpPurchaseIsland>
      </div>

      <span
        className="pdp-video-start-boundary"
        data-pdp-video-start
        aria-hidden="true"
      />

      {corePresentation ? (
        routineVideo && routinePoster ? (
          <PdpRoutineVideo
            key={`routine-video:${product.slug}`}
            productName={product.displayName}
            overlay={corePresentation.routineOverlay}
            video={routineVideo}
            poster={routinePoster}
          />
        ) : null
      ) : (
        <ProductEndorsementRail items={productEndorsementMedia} />
      )}

      <section
        className="pdp-sections"
        aria-label={`${product.displayName} details`}
        data-pdp-panel-sequence
      >
        {corePresentation && profileMedia && coreProfileReady ? (
          <>
            <PdpProfileSplit
              product={product}
              presentation={corePresentation}
              media={profileMedia}
            />
            <PdpOutcomeSplit
              key={`outcomes:${product.slug}`}
              {...outcomeIslandProps(product, corePresentation)}
            />
            <PdpApplicationCarousel
              key={`application:${product.slug}`}
              {...applicationIslandProps(product, corePresentation)}
            />
            {content?.ingredientStory && (
              <PdpIngredientsSplit
                key={`ingredients:${product.slug}`}
                productSlug={product.slug}
                productName={product.displayName}
                story={content.ingredientStory}
                media={ingredientsTextureMedia}
                fullInci={resolvedFullInci}
                mediaPosition={corePresentation.ingredientsMediaPosition}
              />
            )}
          </>
        ) : corePresentation ? null : (
          <ProductSignalGrid
            product={product}
            routineLabel={routineLabel}
          />
        )}

        {!corePresentation && (
          <>
            <PdpEditorialPair
              headingId="pdp-use-heading"
              eyebrow="Application"
              heading="HOW TO USE"
              summary="Step through the application order without leaving the product context."
              className="pdp-editorial-pair--use"
            >
              <PdpPanelSequence
                key={`how-to-use:${product.slug}`}
                label="How to use"
                items={howToUseItems}
              />
            </PdpEditorialPair>

            <PdpEditorialPair
              headingId="pdp-inside-heading"
              eyebrow="Formula"
              heading="WHAT&apos;S INSIDE"
              summary="Ingredient notes stay close to the full INCI disclosure below."
              className="pdp-editorial-pair--inside"
            >
              {ingredientItems.length > 0 ? (
                <PdpPanelSequence
                  key={`inside:${product.slug}`}
                  label="What's inside"
                  items={ingredientItems}
                />
              ) : (
                <p>Ingredient notes are not available for this product yet.</p>
              )}
            </PdpEditorialPair>

            <PdpEditorialPair
              headingId="full-ingredients-heading"
              eyebrow="Disclosure"
              heading="INGREDIENTS"
              summary="The full ingredient list is kept separate from editorial ingredient notes."
              className="pdp-editorial-pair--ingredients"
            >
              <details id="full-ingredients" className="full-ingredients">
                <summary>Full ingredients</summary>
                <p>{fullIngredientsText}</p>
              </details>
            </PdpEditorialPair>
          </>
        )}

        {corePresentation && coreDetailsItems.length === 3 ? (
          <PdpCoreDetailsRoutine
            key={`details:${product.slug}`}
            items={coreDetailsItems}
            currentSlug={product.slug}
          />
        ) : details.length > 0 ? (
          <PdpEditorialPair
            headingId="product-details"
            eyebrow="Specs"
            heading="DETAILS"
            summary="Server-backed product facts and routine placement."
            className="pdp-editorial-pair--details"
          >
            <dl className="meta-grid">
              {details.map((item) => (
                <div key={item.label} className="meta-grid__item">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            {product.cautions.length > 0 && (
              <div className="pdp-disclosures">
                <details>
                  <summary>Cautions</summary>
                  <ul>
                    {product.cautions.map((caution) => (
                      <li key={caution}>{caution}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </PdpEditorialPair>
        ) : null}

        {product.routineGroup === "core" && coreProducts.length === 3 && (
          <PdpCoreRoutineSection
            key={`core-routine:${product.slug}`}
            products={coreProducts}
            currentSlug={product.slug}
          />
        )}
      </section>

      <ProductReviewsSection
        key={`reviews:${product.slug}`}
        productName={product.displayName}
        productSlug={product.slug}
        reviews={reviews}
      />
    </>
  );
}
