"use client";

import { useMemo, useRef, type CSSProperties } from "react";
import { useCoreRoutineSelection } from "@/components/useCoreRoutineSelection";
import { useProductPurchase } from "@/components/useProductPurchase";
import type { CartPlaceholderMedia } from "@/lib/cart/types";
import { corePdpStepForProduct } from "@/lib/content/core-pdp";
import { PDP_CORE_DETAILS_PRESENTATIONS } from "@/lib/content/pdp-core-details";
import {
  firstPurchasableVariant,
  productPurchaseCta,
  type Product,
  type ProductMedia,
  type Variant,
} from "@/lib/products";

type PlaceholderStyle = CSSProperties & {
  "--details-start": string;
  "--details-end": string;
  "--details-glow": string;
};

function cartPlaceholderMedia(
  media: ProductMedia | null | undefined,
): CartPlaceholderMedia {
  if (media?.kind !== "placeholder" || !media.palette) return null;
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.paletteId,
    palette: media.palette,
  };
}

function stateFor(
  index: number,
  activeIndex: number,
  outgoingIndex: number | null,
) {
  if (index === activeIndex) return "active";
  if (index === outgoingIndex) return "outgoing";
  return "inactive";
}

export function PdpCoreDetailsRoutine({
  products,
  currentSlug,
}: {
  products: Product[];
  currentSlug: string;
}) {
  const orderedSteps = useMemo(
    () =>
      PDP_CORE_DETAILS_PRESENTATIONS.flatMap((presentation) => {
        const product = products.find(
          (candidate) =>
            corePdpStepForProduct(candidate) === presentation.step &&
            Boolean(candidate.pdpContent?.routineGuidance),
        );
        return product ? [{ presentation, product }] : [];
      }),
    [products],
  );
  const slugs = orderedSteps.map(({ product }) => product.slug);
  const {
    activeIndex,
    direction,
    handleKeyDown,
    outgoingIndex,
    select,
    setButtonRef,
  } = useCoreRoutineSelection({ currentSlug, slugs });
  const { error, pending, purchase } = useProductPurchase();
  const buyButtonRef = useRef<HTMLButtonElement>(null);

  if (
    orderedSteps.length !== PDP_CORE_DETAILS_PRESENTATIONS.length ||
    !orderedSteps.some(({ product }) => product.slug === currentSlug)
  ) {
    return null;
  }

  async function buy(product: Product, variant: Variant) {
    const media = product.cartMedia ?? product.cardMedia;
    await purchase({
      item: {
        slug: product.slug,
        name: product.displayName,
        variantId: variant.id,
        variantLabel: variant.label,
        price: variant.price,
        swatch: product.swatch,
        imageUrl: media?.kind === "image" ? media.url : null,
        imageAlt: media?.alt ?? null,
        placeholderMedia: cartPlaceholderMedia(media),
      },
      returnFocus: () => buyButtonRef.current?.focus(),
    });
  }

  return (
    <section
      className="pdp-details-routine"
      aria-label="Core product details"
      data-direction={direction}
      data-pdp-details-routine
      data-pdp-panel-row="details-routine"
      data-pdp-panel-mode="independent"
    >
      <div
        className="pdp-details-routine__media"
        aria-hidden="true"
        data-pdp-details-media
        data-pdp-panel
        data-pdp-panel-kind="media"
      >
        {orderedSteps.map(({ presentation, product }, index) => {
          const state = stateFor(index, activeIndex, outgoingIndex);
          const style: PlaceholderStyle = {
            "--details-start": presentation.placeholder.start,
            "--details-end": presentation.placeholder.end,
            "--details-glow": presentation.placeholder.glow,
          };
          return (
            <div
              key={product.slug}
              className="pdp-details-routine__media-state"
              data-media-replacement-key={
                presentation.placeholder.replacementKey
              }
              data-state={state}
              style={style}
            />
          );
        })}
      </div>

      <div
        className="pdp-details-routine__info"
        data-pdp-details-info
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <div className="pdp-details-routine__states" aria-live="polite">
          {orderedSteps.map(({ product }, index) => {
            const variant =
              firstPurchasableVariant(product) ?? product.variants[0] ?? null;
            const purchaseCta = productPurchaseCta(product, variant);
            const state = stateFor(index, activeIndex, outgoingIndex);
            const benefits = product.benefits.filter(Boolean).slice(0, 3);
            const ingredients = product.keyIngredients
              .filter(Boolean)
              .slice(0, 5);
            const effect =
              product.finish ||
              product.texture ||
              product.cardTagline ||
              product.description;

            return (
              <article
                key={product.slug}
                className="pdp-details-routine__state"
                data-state={state}
                aria-hidden={state !== "active"}
              >
                <header className="pdp-details-routine__header">
                  <div>
                    <h2>{product.displayName}</h2>
                    <p>{product.productType}</p>
                  </div>
                  <button
                    ref={state === "active" ? buyButtonRef : undefined}
                    type="button"
                    className="pdp-details-routine__buy"
                    data-pdp-details-buy
                    disabled={
                      !purchaseCta.purchasable ||
                      pending ||
                      state !== "active"
                    }
                    tabIndex={
                      state === "active" && purchaseCta.purchasable ? 0 : -1
                    }
                    onClick={() => {
                      if (variant && purchaseCta.purchasable) {
                        void buy(product, variant);
                      }
                    }}
                  >
                    {pending &&
                    state === "active" &&
                    purchaseCta.purchasable
                      ? "ADDING"
                      : purchaseCta.label}
                  </button>
                </header>

                <dl className="pdp-details-routine__fields">
                  <div data-pdp-details-field="benefits">
                    <dt>{benefits.length === 1 ? "BENEFIT" : "BENEFITS"}</dt>
                    <dd>
                      {benefits.length > 1 ? (
                        <ul>
                          {benefits.map((benefit) => (
                            <li key={benefit}>{benefit}</li>
                          ))}
                        </ul>
                      ) : (
                        benefits[0] || product.goodFor || product.cardTagline
                      )}
                    </dd>
                  </div>
                  <div data-pdp-details-field="routine">
                    <dt>WHERE IT FITS IN YOUR ROUTINE</dt>
                    <dd>{product.pdpContent?.routineGuidance}</dd>
                  </div>
                  <div data-pdp-details-field="effect">
                    <dt>THE EFFECT</dt>
                    <dd>{effect}</dd>
                  </div>
                  <div data-pdp-details-field="ingredients">
                    <dt>KEY INGREDIENTS</dt>
                    <dd>
                      {ingredients.length > 0
                        ? ingredients.join(" • ")
                        : "See the approved ingredient list for this formula."}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>

        <div
          className="pdp-details-routine__steps"
          role="radiogroup"
          aria-label="Core details product"
        >
          {orderedSteps.map(({ presentation, product }, index) => {
            return (
              <button
                key={product.slug}
                ref={(node) => setButtonRef(index, node)}
                type="button"
                role="radio"
                aria-checked={index === activeIndex}
                aria-label={`Show ${presentation.step}, ${product.displayName}`}
                tabIndex={index === activeIndex ? 0 : -1}
                data-pdp-details-step={presentation.step}
                onClick={() => select(index)}
                onFocus={() => select(index)}
                onPointerEnter={() => select(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {product.displayName}
              </button>
            );
          })}
        </div>
        {error && (
          <p className="pdp-details-routine__error" role="status">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
