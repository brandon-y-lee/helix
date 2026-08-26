"use client";

import Link from "next/link";
import {
  useEffect,
  type CSSProperties,
} from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { SystemLegacyAnchors } from "@/components/system/SystemLegacyAnchors";
import { useRovingTabSelection } from "@/components/system/useRovingTabSelection";

export type SystemCoreFlowItem = {
  anchorId: string;
  displayName: string;
  displayNumber: string;
  legacyAnchorIds: readonly string[];
  narrative: string;
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
  const { activeIndex, handleTabKeyDown, registerTab, selectIndex } =
    useRovingTabSelection(items.length);

  useEffect(() => {
    function selectHashedStep() {
      const hash = window.location.hash.slice(1);
      const hashedIndex = items.findIndex(
        (item) =>
          item.anchorId === hash || item.legacyAnchorIds.includes(hash),
      );
      if (hashedIndex >= 0) selectIndex(hashedIndex);
    }

    selectHashedStep();
    window.addEventListener("hashchange", selectHashedStep);
    return () => window.removeEventListener("hashchange", selectHashedStep);
  }, [items, selectIndex]);

  if (items.length === 0) return null;

  return (
    <section
      id="system-core"
      className="method-flow"
      aria-labelledby="system-core-flow-heading"
      data-active-step={items[activeIndex]?.stepName.toLowerCase()}
    >
      <SystemLegacyAnchors
        ids={[
          "system-routine",
          "method-routine",
          ...items.flatMap((item) => [item.anchorId, ...item.legacyAnchorIds]),
        ]}
      />
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
        <h2 id="system-core-flow-heading">The essential baseline</h2>
      </header>

      <div className="method-flow__panels">
        {items.map((item, index) => {
          const key = stepKey(item);
          return (
            <article
              key={item.stepName}
              id={`system-core-panel-${key}`}
              className="method-flow__panel method-selection-panel"
              role="tabpanel"
              aria-labelledby={`system-core-tab-${key}`}
              hidden={index !== activeIndex}
              inert={index !== activeIndex}
            >
              <h3>{item.displayName}</h3>
              <p className="method-flow__type">{item.productType}</p>
              <p className="method-flow__description">{item.narrative}</p>
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
                registerTab(index, node);
              }}
              id={`system-core-tab-${key}`}
              type="button"
              role="tab"
              aria-controls={`system-core-panel-${key}`}
              aria-selected={index === activeIndex}
              data-display-number={item.displayNumber}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => selectIndex(index)}
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
          className="method-arrow-control"
          type="button"
          aria-label="Previous Core step"
          onClick={() => selectIndex(activeIndex - 1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          className="method-arrow-control"
          type="button"
          aria-label="Next Core step"
          onClick={() => selectIndex(activeIndex + 1)}
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
