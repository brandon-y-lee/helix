"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type Ref,
} from "react";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_STYLE,
  usePdpSlideTransition,
} from "@/components/product-detail/usePdpSlideTransition";
import type { CorePdpApplicationStep } from "@/lib/content/core-pdp";
import type { ProductMedia } from "@/lib/products";

export function orderedPdpApplicationMedia(
  productMedia: readonly ProductMedia[],
): ProductMedia[] {
  return productMedia
    .filter(
      (item) =>
        item.role === "pdp_application" &&
        item.kind === "image" &&
        Boolean(item.url),
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function PdpApplicationCarousel({
  productName,
  steps,
  media,
  rootRef,
}: {
  productName: string;
  steps: readonly [
    CorePdpApplicationStep,
    CorePdpApplicationStep,
    CorePdpApplicationStep,
  ];
  media: readonly ProductMedia[];
  rootRef?: Ref<HTMLElement>;
}) {
  const applicationMedia = orderedPdpApplicationMedia(media);
  const {
    activeIndex: active,
    advance,
    direction,
    isTransitioning,
    outgoingIndex: outgoing,
    select: selectStep,
  } = usePdpSlideTransition({
    initialIndex: 0,
    itemCount: steps.length,
    resetKey: productName,
  });

  function showNext() {
    advance(1, "forward");
  }

  return (
    <section
      ref={rootRef}
      className="pdp-application"
      aria-label={`${productName} application`}
      data-direction={direction}
      data-pdp-slide-transitioning={isTransitioning}
      data-slide-direction={direction}
      data-transition-duration={PDP_SLIDE_DURATION_MS}
      data-pdp-panel-row="application"
      data-pdp-panel-mode="independent"
      data-pdp-application
      style={PDP_SLIDE_STYLE}
    >
      <div
        className="pdp-application__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <div
          className="pdp-application__swatches"
          role="group"
          aria-label={`${productName} application steps`}
        >
          {steps.map((step, index) => {
            const itemMedia = applicationMedia.find(
              (item) => item.sortOrder === index + 1,
            );

            return (
              <button
                key={step.id}
                type="button"
                className="pdp-application__swatch"
                style={
                  {
                    "--pdp-application-swatch": step.surface,
                  } as CSSProperties
                }
                aria-label={`Show application step ${index + 1} of ${steps.length}`}
                aria-pressed={active === index}
                data-pdp-application-thumbnail={index + 1}
                data-has-media={Boolean(itemMedia)}
                onClick={() => selectStep(index)}
              >
                {itemMedia?.url ? (
                  <Image
                    src={itemMedia.url}
                    alt={itemMedia.alt}
                    fill
                    sizes="(max-width: 820px) 30vw, 13vw"
                    className="pdp-application__swatch-image"
                  />
                ) : (
                  <span
                    className="pdp-application__swatch-fallback"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="pdp-application__copy">
          <div
            className="pdp-application__copy-stack"
            data-pdp-slide-viewport
          >
            {steps.map((step, index) => (
              <article
                key={step.id}
                className="pdp-application__step"
                data-pdp-slide-layer
                data-state={
                  active === index
                    ? "active"
                    : outgoing === index
                      ? "outgoing"
                      : "inactive"
                }
                aria-hidden={active !== index}
                inert={active !== index}
              >
                <h2 className="pdp-application__eyebrow">APPLICATION</h2>
                <div className="pdp-application__step-body">
                  <span>({step.id})</span>
                  <p>{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="pdp-application__next"
          aria-label="Show next application step"
          onClick={showNext}
        >
          <span aria-hidden="true">→</span>
        </button>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Application step {active + 1} of {steps.length}: {steps[active].copy}
        </p>
      </div>

      <div
        className="pdp-application__visual"
        aria-hidden="true"
        data-pdp-panel
        data-pdp-panel-kind="media"
        data-pdp-application-media
        data-pdp-slide-viewport
      >
        {steps.map((step, index) => {
          const itemMedia = applicationMedia.find(
            (item) => item.sortOrder === index + 1,
          );

          return (
            <div
              key={step.id}
              className="pdp-application__visual-state"
              data-pdp-slide-layer
              data-state={
                active === index
                  ? "active"
                  : outgoing === index
                    ? "outgoing"
                    : "inactive"
              }
              data-pdp-application-state={index + 1}
              data-has-media={Boolean(itemMedia)}
              style={
                {
                  "--pdp-application-surface": step.surface,
                  "--pdp-application-accent": step.accent,
                  "--pdp-application-detail": step.detail,
                } as CSSProperties
              }
            >
              {itemMedia?.url ? (
                <Image
                  src={itemMedia.url}
                  alt=""
                  fill
                  sizes="(max-width: 820px) 100vw, 50vw"
                  className="pdp-application__image"
                  data-pdp-application-main-image={index + 1}
                />
              ) : (
                <>
                  <span className="pdp-application__shape pdp-application__shape--one" />
                  <span className="pdp-application__shape pdp-application__shape--two" />
                  <span className="pdp-application__shape pdp-application__shape--three" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
