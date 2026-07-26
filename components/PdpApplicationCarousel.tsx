"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import type { CorePdpApplicationStep } from "@/lib/content/core-pdp";

const TRANSITION_DURATION_MS = 560;

export function PdpApplicationCarousel({
  productName,
  steps,
  rootRef,
}: {
  productName: string;
  steps: readonly [
    CorePdpApplicationStep,
    CorePdpApplicationStep,
    CorePdpApplicationStep,
  ];
  rootRef?: Ref<HTMLElement>;
}) {
  const [active, setActive] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setActive(0);
    setOutgoing(null);
  }, [productName]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  function selectStep(next: number) {
    if (next === active) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setOutgoing(active);
    setActive(next);
    timerRef.current = window.setTimeout(() => {
      setOutgoing(null);
      timerRef.current = null;
    }, TRANSITION_DURATION_MS);
  }

  function showNext() {
    selectStep((active + 1) % steps.length);
  }

  return (
    <section
      ref={rootRef}
      className="pdp-application"
      aria-labelledby="pdp-application-heading"
      data-pdp-panel-row="application"
      data-pdp-panel-mode="independent"
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
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className="pdp-application__swatch"
              style={{ "--pdp-application-swatch": step.surface } as CSSProperties}
              aria-label={`Show application step ${index + 1} of ${steps.length}`}
              aria-pressed={active === index}
              onClick={() => selectStep(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="pdp-application__copy">
          <h2
            id="pdp-application-heading"
            className="pdp-application__eyebrow"
          >
            APPLICATION
          </h2>
          <div className="pdp-application__copy-stack">
            {steps.map((step, index) => (
              <article
                key={step.id}
                className="pdp-application__step"
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
                <span>({step.id})</span>
                <p>{step.copy}</p>
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
      >
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="pdp-application__visual-state"
            data-state={
              active === index
                ? "active"
                : outgoing === index
                  ? "outgoing"
                  : "inactive"
            }
            data-future-media={step.futureMediaFilename}
            style={
              {
                "--pdp-application-surface": step.surface,
                "--pdp-application-accent": step.accent,
                "--pdp-application-detail": step.detail,
              } as CSSProperties
            }
          >
            <span className="pdp-application__shape pdp-application__shape--one" />
            <span className="pdp-application__shape pdp-application__shape--two" />
            <span className="pdp-application__shape pdp-application__shape--three" />
          </div>
        ))}
      </div>
    </section>
  );
}
