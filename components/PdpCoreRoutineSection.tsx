"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { CoreRoutineProduct } from "@/lib/products";

type CoreRoutineStyle = CSSProperties & {
  "--core-from": string;
  "--core-to": string;
};

const TRANSITION_DURATION_MS = 640;
const REDUCED_TRANSITION_DURATION_MS = 20;

function sequenceLabel(stepNumber: number) {
  return String(stepNumber).padStart(2, "0");
}

export function PdpCoreRoutineSection({
  products,
  currentSlug,
  rootRef,
}: {
  products: CoreRoutineProduct[];
  currentSlug: string;
  rootRef?: Ref<HTMLElement>;
}) {
  const initialIndex = Math.max(
    products.findIndex((product) => product.slug === currentSlug),
    0,
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  if (
    products.length !== 3 ||
    products.some(
      (product, index) =>
        product.routineStepNumber !== index + 1 ||
        product.textureMedia.kind !== "image" || !product.textureMedia.url,
    )
  ) {
    return null;
  }

  function select(index: number) {
    if (index === activeIndex) return;
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    setDirection(index > activeIndex ? "forward" : "backward");
    setOutgoingIndex(activeIndex);
    setActiveIndex(index);
    const transitionDuration =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? REDUCED_TRANSITION_DURATION_MS
        : TRANSITION_DURATION_MS;
    transitionTimeoutRef.current = setTimeout(() => {
      setOutgoingIndex(null);
      transitionTimeoutRef.current = null;
    }, transitionDuration);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % products.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + products.length) % products.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = products.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    select(nextIndex);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      ref={rootRef}
      className="pdp-core-routine"
      aria-labelledby="pdp-core-routine-heading"
      data-active-step={sequenceLabel(
        products[activeIndex].routineStepNumber,
      )}
      data-direction={direction}
      data-pdp-panel-row="core-routine"
      data-pdp-panel-mode="independent"
    >
      <div
        className="pdp-core-routine__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <div className="pdp-core-routine__heading">
          <p className="eyebrow">The Core</p>
          <h2 id="pdp-core-routine-heading">
            The Mei Pelle CORE for clearer, healthier skin.
          </h2>
          <p>Your morning and evening essentials.</p>
        </div>

        <div className="pdp-core-routine__callout" aria-live="polite">
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
                className="pdp-core-routine__callout-state"
                data-state={state}
                aria-hidden={state !== "active"}
                style={style}
              >
                <span className="pdp-core-routine__miniature">
                  <Image
                    src={product.textureMedia.url!}
                    alt={product.textureMedia.alt}
                    fill
                    sizes="(max-width: 640px) 104px, 156px"
                    loading="eager"
                  />
                </span>
                <span className="pdp-core-routine__callout-copy">
                  <span>
                    Step {sequenceLabel(product.routineStepNumber)} ·{" "}
                    {product.routineStepName}
                  </span>
                  <strong>{product.displayName}</strong>
                  <small>{product.productType}</small>
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
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={index === activeIndex}
              aria-label={`Show step ${product.routineStepNumber}, ${product.displayName}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => select(index)}
              onFocus={() => select(index)}
              onPointerEnter={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{sequenceLabel(product.routineStepNumber)}</span>
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
              data-state={state}
              style={style}
            />
          );
        })}
      </div>
    </section>
  );
}
