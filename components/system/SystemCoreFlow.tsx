"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";

export type SystemCoreFlowItem = {
  anchorId: string;
  description: string;
  displayName: string;
  displayNumber: string;
  legacyAnchorIds: readonly string[];
  productType: string;
  slug: string | null;
  stepName: "CLEANSE" | "TREAT" | "SEAL";
  swatch: [string, string];
};

type CoreHueStyle = CSSProperties & {
  "--system-core-hue-from": string;
  "--system-core-hue-to": string;
};

function stepKey(item: SystemCoreFlowItem) {
  return item.stepName.toLowerCase();
}

export function SystemCoreFlow({ items }: { items: SystemCoreFlowItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    function selectHashedStep() {
      const hash = window.location.hash.slice(1);
      const hashedIndex = items.findIndex(
        (item) =>
          item.anchorId === hash || item.legacyAnchorIds.includes(hash),
      );
      if (hashedIndex >= 0) setActiveIndex(hashedIndex);
    }

    selectHashedStep();
    window.addEventListener("hashchange", selectHashedStep);
    return () => window.removeEventListener("hashchange", selectHashedStep);
  }, [items]);

  if (items.length === 0) return null;

  function advance(offset: -1 | 1) {
    setActiveIndex(
      (current) => (current + offset + items.length) % items.length,
    );
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      id="system-core"
      className="method-flow"
      aria-labelledby="system-core-flow-heading"
      data-active-step={items[activeIndex]?.stepName.toLowerCase()}
    >
      <span id="system-routine" className="method-anchor-alias" aria-hidden="true" />
      <span id="method-routine" className="method-anchor-alias" aria-hidden="true" />
      {items
        .flatMap((item) => [item.anchorId, ...item.legacyAnchorIds])
        .map((id) => (
          <span
            key={id}
            id={id}
            className="method-anchor-alias"
            aria-hidden="true"
          />
        ))}
      <div className="method-flow__backgrounds" aria-hidden="true">
        {items.map((item, index) => (
          <div
            key={item.stepName}
            className="method-flow__background"
            data-state={index === activeIndex ? "active" : "inactive"}
            style={
              {
                "--system-core-hue-from": item.swatch[0],
                "--system-core-hue-to": item.swatch[1],
              } as CoreHueStyle
            }
          />
        ))}
      </div>

      <header className="method-flow__heading">
        <p className="method-flow__eyebrow">
          <HelixIdentity variant="symbol" decorative />
          <span>The Core</span>
        </p>
        <h2 id="system-core-flow-heading">Three daily steps form the baseline</h2>
      </header>

      <div className="method-flow__panels">
        {items.map((item, index) => {
          const key = stepKey(item);
          return (
            <article
              key={item.stepName}
              id={`system-core-panel-${key}`}
              className="method-flow__panel"
              role="tabpanel"
              aria-labelledby={`system-core-tab-${key}`}
              hidden={index !== activeIndex}
              inert={index !== activeIndex}
            >
              <p className="method-flow__position">
                <span>{item.displayNumber}</span>
                <span>{item.stepName}</span>
              </p>
              <h3>{item.displayName}</h3>
              <p className="method-flow__type">{item.productType}</p>
              <p className="method-flow__description">{item.description}</p>
              {item.slug ? (
                <Link
                  href={`/products/${item.slug}`}
                  className="method-flow__product-link"
                >
                  View {item.displayName}
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>

      <div
        className="method-flow__steps"
        role="tablist"
        aria-label="Core system steps"
      >
        {items.map((item, index) => {
          const key = stepKey(item);
          return (
            <button
              key={item.stepName}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`system-core-tab-${key}`}
              type="button"
              role="tab"
              aria-controls={`system-core-panel-${key}`}
              aria-selected={index === activeIndex}
              data-display-number={item.displayNumber}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <strong>{item.stepName}</strong>
              <span>{item.displayName}</span>
              <small>{item.productType}</small>
            </button>
          );
        })}
      </div>

      <div className="method-flow__controls">
        <button
          type="button"
          aria-label="Previous Core step"
          onClick={() => advance(-1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          aria-label="Next Core step"
          onClick={() => advance(1)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Core step {activeIndex + 1} of {items.length}: {items[activeIndex].stepName},{" "}
        {items[activeIndex].displayName}
      </p>
    </section>
  );
}
