"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { CorePdpPresentation } from "@/lib/content/core-pdp";

export function PdpOutcomeSplit({
  productName,
  presentation,
  rootRef,
}: {
  productName: string;
  presentation: CorePdpPresentation;
  rootRef?: Ref<HTMLElement>;
}) {
  const [active, setActive] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = presentation.outcomeOptions.length - 1;
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
    >
      <div className="pdp-outcome-split__viewport" aria-hidden="true">
        <div
          className="pdp-outcome-split__track"
          style={{ "--pdp-outcome-index": active } as CSSProperties}
        >
          {presentation.outcomeOptions.map((option) => (
            <div
              key={option.label}
              className="pdp-outcome-split__slide"
              style={
                {
                  "--pdp-outcome-surface": option.surface,
                  "--pdp-outcome-accent": option.accent,
                  "--pdp-outcome-detail": option.detail,
                } as CSSProperties
              }
            >
              <span className="pdp-outcome-split__shape pdp-outcome-split__shape--one" />
              <span className="pdp-outcome-split__shape pdp-outcome-split__shape--two" />
              <span className="pdp-outcome-split__line" />
            </div>
          ))}
        </div>
      </div>

      <div className="pdp-outcome-split__content">
        <p className="pdp-outcome-split__product">{productName}</p>
        <h2 id="pdp-outcome-heading">{presentation.outcomeHeading}</h2>
        <div
          className="pdp-outcome-split__options"
          role="group"
          aria-label={`${productName} outcomes`}
        >
          {presentation.outcomeOptions.map((option, index) => (
            <button
              key={option.label}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              className="pdp-ink-option"
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              onMouseEnter={() => setActive(index)}
              onPointerEnter={() => setActive(index)}
              onKeyDown={(event) => moveSelection(event, index)}
            >
              <span className="pdp-ink-option__label">
                <span className="pdp-ink-option__outline">{option.label}</span>
                <span className="pdp-ink-option__fill" aria-hidden="true">
                  {option.label}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          Selected outcome: {presentation.outcomeOptions[active].label}
        </p>
      </div>
    </section>
  );
}
