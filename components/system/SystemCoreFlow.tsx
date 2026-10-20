"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { ProductImage } from "@/components/product/ProductImage";
import { useRovingTabSelection } from "@/components/system/useRovingTabSelection";
import type { ProductMedia } from "@/lib/products";

export type SystemCoreFlowItem = {
  anchorId: string;
  displayName: string;
  displayNumber: string;
  backgroundMedia: ProductMedia | null;
  heroLines: readonly [string, string];
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
  const sectionRef = useRef<HTMLElement>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const { activeIndex, handleTabKeyDown, registerTab, selectIndex } =
    useRovingTabSelection(items.length);

  function selectStep(index: number) {
    setPendingAnchor(null);
    selectIndex(index);
  }

  useEffect(() => {
    function selectHashedStep() {
      const hash = window.location.hash.slice(1);
      const hashedIndex = items.findIndex((item) => item.anchorId === hash);
      if (hashedIndex >= 0) {
        selectIndex(hashedIndex);
        setPendingAnchor(hash);
      } else {
        setPendingAnchor(null);
      }
    }

    selectHashedStep();
    window.addEventListener("hashchange", selectHashedStep);
    return () => window.removeEventListener("hashchange", selectHashedStep);
  }, [items, selectIndex]);

  useLayoutEffect(() => {
    if (!pendingAnchor) return;
    if (items[activeIndex]?.anchorId !== pendingAnchor) {
      setPendingAnchor(null);
      return;
    }

    let frame: number | undefined;
    const positionSelectedStep = () => {
      frame = window.requestAnimationFrame(() => {
        if (window.location.hash.slice(1) === pendingAnchor) {
          sectionRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
        }
        setPendingAnchor(null);
      });
    };
    // Reload can restore the previous fragment's scroll before hydration selects this step.
    if (document.readyState === "complete") positionSelectedStep();
    else window.addEventListener("load", positionSelectedStep, { once: true });

    return () => {
      window.removeEventListener("load", positionSelectedStep);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [activeIndex, items, pendingAnchor]);

  if (items.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      id="system-core"
      className="system-flow"
      aria-labelledby="system-core-flow-heading"
      data-active-step={items[activeIndex]?.stepName.toLowerCase()}
    >
      {items.map((item) => (
        <span
          key={item.anchorId}
          id={item.anchorId}
          className="system-step-anchor"
          aria-hidden="true"
        />
      ))}
      <div className="system-flow__backgrounds" aria-hidden="true">
        {items.map((item, index) => (
          <div
            key={item.stepName}
            className="system-flow__background"
            data-state={index === activeIndex ? "active" : "inactive"}
            style={
              {
                "--system-core-hue-from": item.swatch[0],
                "--system-core-hue-to": item.swatch[1],
              } as CoreHueStyle
            }
          >
            <ProductImage
              media={item.backgroundMedia}
              swatch={item.swatch}
              className="system-flow__background-media"
              imageClassName="system-flow__background-image"
              imageAlt=""
              sizes="(max-width: 720px) calc(100vw - 32px), calc(100vw - 60px)"
            />
          </div>
        ))}
      </div>

      <header className="system-flow__heading">
        <h2 id="system-core-flow-heading" className="system-flow__eyebrow">
          <HelixIdentity variant="symbol" decorative />
          <span>The Core</span>
        </h2>
      </header>

      <div className="system-flow__panels">
        {items.map((item, index) => {
          const key = stepKey(item);
          return (
            <article
              key={item.stepName}
              id={`system-core-panel-${key}`}
              className="system-flow__panel system-selection-panel"
              role="tabpanel"
              aria-labelledby={`system-core-tab-${key}`}
              hidden={index !== activeIndex}
              inert={index !== activeIndex}
            >
              <p className="system-flow__hero-phrase">
                <span>{item.heroLines[0]}</span>
                <span>{item.heroLines[1]}</span>
              </p>
              {item.slug ? (
                <Link
                  href={`/products/${item.slug}`}
                  className="btn btn--editorial-rounded system-flow__product-link"
                >
                  <span>View {item.displayName}</span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>

      <div
        className="system-flow__steps"
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
              onClick={() => selectStep(index)}
              onKeyDown={(event) => {
                handleTabKeyDown(event, index);
                if (event.defaultPrevented) setPendingAnchor(null);
              }}
            >
              <strong>{item.stepName}</strong>
              <span>{item.displayName}</span>
              <small>{item.productType}</small>
            </button>
          );
        })}
      </div>

      <div className="system-flow__controls">
        <button
          className="system-arrow-control"
          type="button"
          aria-label="Previous Core step"
          onClick={() => selectStep(activeIndex - 1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          className="system-arrow-control"
          type="button"
          aria-label="Next Core step"
          onClick={() => selectStep(activeIndex + 1)}
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
