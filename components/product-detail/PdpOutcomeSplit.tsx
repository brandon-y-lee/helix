"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import type { CorePdpOutcomeOption } from "@/lib/content/core-pdp";
import type { ProductMedia } from "@/lib/products";

export function PdpOutcomeSplit({
  productName,
  heading,
  options,
  media,
  rootRef,
}: {
  productName: string;
  heading: string;
  options: readonly [
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
  ];
  media: readonly ProductMedia[];
  rootRef?: Ref<HTMLElement>;
}) {
  const [active, setActive] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    setActive(0);
  }, [productName]);

  useLayoutEffect(() => {
    let frame = 0;
    let transitionFrame = 0;
    let disposed = false;

    function measureInkOverflow() {
      const measurements = fillRefs.current.flatMap((fill) => {
        if (!fill?.isConnected) return [];

        const box = fill.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(fill);
        if (typeof range.getClientRects !== "function") {
          range.detach();
          return [];
        }
        const fragments = Array.from(range.getClientRects());
        range.detach();
        if (fragments.length === 0) return [];

        return [{
          fill,
          top: Math.max(0, box.top - Math.min(...fragments.map((rect) => rect.top))),
          bottom: Math.max(
            0,
            Math.max(...fragments.map((rect) => rect.bottom)) - box.bottom,
          ),
        }];
      });

      for (const measurement of measurements) {
        measurement.fill.dataset.pdpInkMeasuring = "true";
        measurement.fill.style.setProperty(
          "--pdp-ink-overflow-top",
          `${measurement.top}px`,
        );
        measurement.fill.style.setProperty(
          "--pdp-ink-overflow-bottom",
          `${measurement.bottom}px`,
        );
        measurement.fill.dataset.pdpInkMeasured = "true";
      }

      cancelAnimationFrame(transitionFrame);
      transitionFrame = requestAnimationFrame(() => {
        for (const measurement of measurements) {
          delete measurement.fill.dataset.pdpInkMeasuring;
        }
      });
    }

    function scheduleMeasurement() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!disposed) measureInkOverflow();
      });
    }

    measureInkOverflow();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasurement);
    for (const fill of fillRefs.current) {
      if (fill) observer?.observe(fill);
    }

    const fonts = document.fonts;
    void fonts?.ready.then(scheduleMeasurement);
    fonts?.addEventListener("loadingdone", scheduleMeasurement);
    window.addEventListener("resize", scheduleMeasurement);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(transitionFrame);
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", scheduleMeasurement);
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [options]);

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = Math.min(index + 1, last);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = Math.max(index - 1, 0);
    }
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;

    event.preventDefault();
    setActive(next);
    optionRefs.current[next]?.focus();
  }

  return (
    <section
      ref={rootRef}
      className="pdp-outcome-split"
      aria-labelledby="pdp-outcome-heading"
      data-pdp-panel-row="outcome"
      data-pdp-panel-mode="connected"
      data-pdp-outcome-split
    >
      <div
        className="pdp-outcome-split__viewport"
        aria-hidden="true"
        data-pdp-panel
        data-pdp-panel-kind="media"
        data-pdp-outcome-media
      >
        <div
          className="pdp-outcome-split__track"
          style={{ "--pdp-outcome-index": active } as CSSProperties}
        >
          {options.map((option, index) => {
            const itemMedia = media.find(
              (item) => item.sortOrder === index + 1,
            );

            return (
              <div
                key={`outcome-${index + 1}`}
                className="pdp-outcome-split__slide"
                style={
                  {
                    "--pdp-outcome-surface": option.surface,
                    "--pdp-outcome-accent": option.accent,
                    "--pdp-outcome-detail": option.detail,
                  } as CSSProperties
                }
                data-pdp-outcome-state={index + 1}
                data-active={active === index ? "true" : "false"}
                data-has-media={itemMedia ? "true" : "false"}
              >
                {itemMedia?.url ? (
                  <ProductImage
                    media={itemMedia}
                    swatch={[option.surface, option.accent]}
                    className="pdp-outcome-split__media"
                    sizes="(max-width: 820px) 100vw, 50vw"
                    loading="lazy"
                    fallback={
                      <>
                        <span className="pdp-outcome-split__shape pdp-outcome-split__shape--one" />
                        <span className="pdp-outcome-split__shape pdp-outcome-split__shape--two" />
                        <span className="pdp-outcome-split__line" />
                      </>
                    }
                  />
                ) : (
                  <>
                    <span className="pdp-outcome-split__shape pdp-outcome-split__shape--one" />
                    <span className="pdp-outcome-split__shape pdp-outcome-split__shape--two" />
                    <span className="pdp-outcome-split__line" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="pdp-outcome-split__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <p className="pdp-outcome-split__product">{productName}</p>
        <h2 id="pdp-outcome-heading">{heading}</h2>
        <div
          className="pdp-outcome-split__options"
          role="group"
          aria-label={`${productName} outcomes`}
        >
          {options.map((option, index) => (
            <button
              key={`outcome-control-${index + 1}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              className="pdp-ink-option"
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              onMouseEnter={() => setActive(index)}
              onKeyDown={(event) => moveSelection(event, index)}
            >
              <span className="sr-only">{option.label}</span>
              <span className="pdp-ink-option__label" aria-hidden="true">
                <span className="pdp-ink-option__outline">{option.label}</span>
                <span
                  ref={(node) => {
                    fillRefs.current[index] = node;
                  }}
                  className="pdp-ink-option__fill"
                >
                  {option.label}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          Selected outcome: {options[active].label}
        </p>
      </div>
    </section>
  );
}
