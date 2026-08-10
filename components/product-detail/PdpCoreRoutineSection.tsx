"use client";

import {
  type CSSProperties,
  type Ref,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import { useCoreRoutineSelection } from "@/components/product-detail/useCoreRoutineSelection";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_STYLE,
} from "@/components/product-detail/usePdpSlideTransition";
import type { CoreRoutineSummary } from "@/lib/catalog/models";

type CoreRoutinePresentation = Pick<
  CoreRoutineSummary,
  | "displayName"
  | "editorialMedia"
  | "productType"
  | "slug"
  | "swatch"
  | "systemStepName"
  | "systemStepPosition"
  | "textureMedia"
>;

type CoreRoutineStyle = CSSProperties & {
  "--core-from": string;
  "--core-to": string;
};

function sequenceLabel(stepNumber: number) {
  return String(stepNumber).padStart(2, "0");
}

export function PdpCoreRoutineSection({
  products,
  currentSlug,
  rootRef,
}: {
  products: CoreRoutinePresentation[];
  currentSlug: string;
  rootRef?: Ref<HTMLElement>;
}) {
  const expectedSteps = [
    ["CLEANSE", 1],
    ["TREAT", 3],
    ["SEAL", 5],
  ] as const;
  const {
    activeIndex,
    direction,
    handleKeyDown,
    isTransitioning,
    outgoingIndex,
    select,
    setButtonRef,
  } = useCoreRoutineSelection({
    currentSlug,
    slugs: products.map((product) => product.slug),
  });

  if (
    products.length !== 3 ||
    products.some(
      (product, index) =>
        product.systemStepName !== expectedSteps[index][0] ||
        product.systemStepPosition !== expectedSteps[index][1] ||
        product.textureMedia.kind !== "image" || !product.textureMedia.url,
    )
  ) {
    return null;
  }

  return (
    <section
      ref={rootRef}
      className="pdp-core-routine"
      aria-labelledby="pdp-core-routine-heading"
      data-active-step={sequenceLabel(
        products[activeIndex].systemStepPosition,
      )}
      data-direction={direction}
      data-pdp-slide-transitioning={isTransitioning}
      data-slide-direction={direction}
      data-transition-duration={PDP_SLIDE_DURATION_MS}
      data-pdp-panel-row="core-routine"
      data-pdp-panel-mode="independent"
      style={PDP_SLIDE_STYLE}
    >
      <div
        className="pdp-core-routine__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <div className="pdp-core-routine__heading">
          <h2 id="pdp-core-routine-heading">
            The Mei Pelle CORE for clearer, healthier skin.
          </h2>
          <p>Your morning and evening essentials.</p>
        </div>

        <div
          className="pdp-core-routine__callout"
          aria-live="polite"
          data-pdp-slide-viewport
        >
          {products.map((product, index) => {
            const state =
              index === activeIndex
                ? "active"
                : index === outgoingIndex
                  ? "outgoing"
                  : "inactive";
            return (
              <div
                key={product.slug}
                className="pdp-core-routine__callout-state"
                data-pdp-slide-layer
                data-state={state}
                aria-hidden={state !== "active"}
              >
                <span className="pdp-core-routine__annotation">
                  <strong>{product.displayName}</strong>
                  <span
                    className="pdp-core-routine__connector"
                    aria-hidden="true"
                  />
                  <small>{product.productType}</small>
                </span>
                <span className="pdp-core-routine__texture">
                  <ProductImage
                    media={product.textureMedia}
                    swatch={product.swatch}
                    className="pdp-core-routine__texture-media"
                    sizes="(max-width: 640px) 68vw, 320px"
                    loading="eager"
                  />
                </span>
              </div>
            );
          })}
        </div>

        <div
          className="pdp-core-routine__steps"
          role="radiogroup"
          aria-label="Core routine step"
        >
          {products.map((product, index) => (
            <button
              key={product.slug}
              ref={(node) => {
                setButtonRef(index, node);
              }}
              type="button"
              role="radio"
              aria-checked={index === activeIndex}
              aria-label={`Show ${product.systemStepName}, ${product.displayName}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => select(index)}
              onFocus={() => select(index)}
              onPointerEnter={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{sequenceLabel(product.systemStepPosition)}</span>
              <small>{product.displayName}</small>
            </button>
          ))}
        </div>
      </div>

      <div
        className="pdp-core-routine__visual"
        aria-hidden="true"
        data-pdp-panel
        data-pdp-panel-kind="media"
        data-pdp-slide-viewport
      >
        {products.map((product, index) => {
          const state =
            index === activeIndex
              ? "active"
              : index === outgoingIndex
                ? "outgoing"
                : "inactive";
          const style: CoreRoutineStyle = {
            "--core-from": product.swatch[0],
            "--core-to": product.swatch[1],
          };
          return (
            <div
              key={product.slug}
              className="pdp-core-routine__visual-state"
              data-pdp-slide-layer
              data-state={state}
              data-media={product.editorialMedia ? "editorial" : "fallback"}
              style={style}
            >
              {product.editorialMedia?.url ? (
                <ProductImage
                  media={product.editorialMedia}
                  swatch={product.swatch}
                  className="pdp-core-routine__editorial-media"
                  imageAlt=""
                  sizes="(max-width: 760px) calc(100vw - 24px), 50vw"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
