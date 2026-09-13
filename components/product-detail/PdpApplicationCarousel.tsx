"use client";

import {
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import type { PdpPresentation } from "@/components/product-detail/pdp-presentation";
import { usePdpMobilePresentation } from "@/components/product-detail/usePdpMobilePresentation";
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
  pdpPresentation = "default",
}: {
  productName: string;
  steps: readonly [
    CorePdpApplicationStep,
    CorePdpApplicationStep,
    CorePdpApplicationStep,
  ];
  media: readonly ProductMedia[];
  rootRef?: Ref<HTMLElement>;
  pdpPresentation?: PdpPresentation;
}) {
  const isMobile = usePdpMobilePresentation(pdpPresentation);
  const durationMs = isMobile ? 250 : PDP_SLIDE_DURATION_MS;
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const nextButton = useRef<HTMLButtonElement | null>(null);
  const previousButton = useRef<HTMLButtonElement | null>(null);
  const setPreviousButton = useCallback((element: HTMLButtonElement | null) => {
    if (!element && previousButton.current === document.activeElement) {
      nextButton.current?.focus({ preventScroll: true });
    }
    previousButton.current = element;
  }, []);
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
    durationMs,
  });

  function showNext() {
    advance(1, "forward");
  }

  function handleStepKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = Math.max(0, index - 1);
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = Math.min(steps.length - 1, index + 1);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = steps.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectStep(nextIndex);
    stepButtons.current[nextIndex]?.focus({ preventScroll: true });
  }

  return (
    <section
      ref={rootRef}
      className="pdp-application"
      aria-label={`${productName} application`}
      data-direction={direction}
      data-pdp-slide-transitioning={isTransitioning}
      data-slide-direction={direction}
      data-transition-duration={durationMs}
      data-pdp-panel-row="application"
      data-pdp-panel-mode="independent"
      data-pdp-application
      style={
        {
          ...PDP_SLIDE_STYLE,
          "--pdp-slide-duration": `${durationMs}ms`,
        } as CSSProperties
      }
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
                ref={(element) => {
                  stepButtons.current[index] = element;
                }}
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
                onKeyDown={
                  isMobile
                    ? (event) => handleStepKeyDown(event, index)
                    : undefined
                }
              >
                {itemMedia?.url ? (
                  <ProductImage
                    media={itemMedia}
                    swatch={[step.surface, step.accent]}
                    className="pdp-application__swatch-media"
                    imageClassName="pdp-application__swatch-image"
                    imageAlt=""
                    sizes={
                      pdpPresentation === "mobile-pilot"
                        ? index === 2
                          ? "(max-width: 820px) calc(100vw - 64px), 13vw"
                          : "(max-width: 820px) calc((100vw - 76px) / 2), 13vw"
                        : "(max-width: 820px) 30vw, 13vw"
                    }
                    fallback={
                      <span
                        className="pdp-application__swatch-fallback"
                        aria-hidden="true"
                      />
                    }
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

        <div className="pdp-application__navigation">
          {isMobile ? (
            <button
              key="previous"
              ref={setPreviousButton}
              type="button"
              className="pdp-application__next pdp-application__next--previous"
              aria-label="Show previous application step"
              onClick={() => advance(-1, "backward")}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : null}
          <button
            key="next"
            ref={nextButton}
            type="button"
            className="pdp-application__next"
            aria-label="Show next application step"
            onClick={showNext}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
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
        data-pdp-zoom-frame
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
                <ProductImage
                  media={itemMedia}
                  swatch={[step.surface, step.accent]}
                  className="pdp-application__media"
                  data-pdp-zoom-media
                  imageClassName="pdp-application__image"
                  imageAlt=""
                  sizes="(max-width: 820px) 100vw, 50vw"
                  imageDataAttributes={{
                    "data-pdp-application-main-image": index + 1,
                  }}
                  fallback={
                    <>
                      <span className="pdp-application__shape pdp-application__shape--one" />
                      <span className="pdp-application__shape pdp-application__shape--two" />
                      <span className="pdp-application__shape pdp-application__shape--three" />
                    </>
                  }
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
