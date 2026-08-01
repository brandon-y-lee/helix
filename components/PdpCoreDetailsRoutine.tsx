"use client";

import { useRef, type CSSProperties } from "react";
import { useCoreRoutineSelection } from "@/components/useCoreRoutineSelection";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_STYLE,
} from "@/components/usePdpSlideTransition";
import { useProductPurchase } from "@/components/useProductPurchase";
import type { CartAddInput } from "@/lib/cart/types";

type PlaceholderStyle = CSSProperties & {
  "--details-start": string;
  "--details-end": string;
  "--details-glow": string;
};

export type PdpCoreDetailsItem = {
  slug: string;
  displayName: string;
  productType: string | null;
  benefits: string[];
  goodFor: string | null;
  cardTagline: string;
  finish: string | null;
  texture: string | null;
  description: string;
  keyIngredients: string[];
  presentation: {
    step: string;
    routineFit: string;
    placeholder: {
      start: string;
      end: string;
      glow: string;
      replacementKey: string;
    };
  };
  purchase: {
    label: string;
    purchasable: boolean;
    item: CartAddInput | null;
  };
};

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
  items,
  currentSlug,
}: {
  items: PdpCoreDetailsItem[];
  currentSlug: string;
}) {
  const slugs = items.map((item) => item.slug);
  const {
    activeIndex,
    direction,
    handleKeyDown,
    isTransitioning,
    outgoingIndex,
    select,
    setButtonRef,
  } = useCoreRoutineSelection({ currentSlug, slugs });
  const { error, pending, purchase } = useProductPurchase();
  const buyButtonRef = useRef<HTMLButtonElement>(null);

  if (items.length !== 3 || !items.some((item) => item.slug === currentSlug)) {
    return null;
  }

  async function buy(item: CartAddInput) {
    await purchase({
      item,
      returnFocus: () => buyButtonRef.current?.focus(),
    });
  }

  return (
    <section
      className="pdp-details-routine"
      aria-label="Core product details"
      data-direction={direction}
      data-pdp-slide-transitioning={isTransitioning}
      data-slide-direction={direction}
      data-transition-duration={PDP_SLIDE_DURATION_MS}
      data-pdp-details-routine
      data-pdp-panel-row="details-routine"
      data-pdp-panel-mode="independent"
      style={PDP_SLIDE_STYLE}
    >
      <div
        className="pdp-details-routine__media"
        aria-hidden="true"
        data-pdp-details-media
        data-pdp-panel
        data-pdp-panel-kind="media"
        data-pdp-slide-viewport
      >
        {items.map((item, index) => {
          const state = stateFor(index, activeIndex, outgoingIndex);
          const style: PlaceholderStyle = {
            "--details-start": item.presentation.placeholder.start,
            "--details-end": item.presentation.placeholder.end,
            "--details-glow": item.presentation.placeholder.glow,
          };
          return (
            <div
              key={item.slug}
              className="pdp-details-routine__media-state"
              data-pdp-slide-layer
              data-media-replacement-key={
                item.presentation.placeholder.replacementKey
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
        <div
          className="pdp-details-routine__states"
          aria-live="polite"
          data-pdp-slide-viewport
        >
          {items.map((item, index) => {
            const state = stateFor(index, activeIndex, outgoingIndex);
            const benefits = item.benefits.filter(Boolean).slice(0, 3);
            const ingredients = item.keyIngredients.filter(Boolean).slice(0, 5);
            const effect =
              item.finish ||
              item.texture ||
              item.cardTagline ||
              item.description;

            return (
              <article
                key={item.slug}
                className="pdp-details-routine__state"
                data-pdp-slide-layer
                data-state={state}
                aria-hidden={state !== "active"}
              >
                <header className="pdp-details-routine__header">
                  <div>
                    <h2>{item.displayName}</h2>
                    <p>{item.productType}</p>
                  </div>
                  <button
                    ref={state === "active" ? buyButtonRef : undefined}
                    type="button"
                    className="pdp-details-routine__buy"
                    data-pdp-details-buy
                    disabled={
                      !item.purchase.purchasable ||
                      pending ||
                      state !== "active"
                    }
                    tabIndex={
                      state === "active" && item.purchase.purchasable ? 0 : -1
                    }
                    onClick={() => {
                      if (item.purchase.item && item.purchase.purchasable) {
                        void buy(item.purchase.item);
                      }
                    }}
                  >
                    {pending &&
                    state === "active" &&
                    item.purchase.purchasable
                      ? "ADDING"
                      : item.purchase.label}
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
                        benefits[0] || item.goodFor || item.cardTagline
                      )}
                    </dd>
                  </div>
                  <div data-pdp-details-field="routine">
                    <dt>WHERE IT FITS IN YOUR ROUTINE</dt>
                    <dd>{item.presentation.routineFit}</dd>
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
          {items.map((item, index) => (
            <button
              key={item.slug}
              ref={(node) => setButtonRef(index, node)}
              type="button"
              role="radio"
              aria-checked={index === activeIndex}
              aria-label={`Show ${item.presentation.step}, ${item.displayName}`}
              tabIndex={index === activeIndex ? 0 : -1}
              data-pdp-details-step={item.presentation.step}
              onClick={() => select(index)}
              onFocus={() => select(index)}
              onPointerEnter={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.displayName}
            </button>
          ))}
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
