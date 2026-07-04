"use client";

import {
  useEffect,
  useState,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductCard } from "@/components/ProductCard";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product } from "@/lib/products";

const CORE_CHECKPOINTS = [
  {
    step: 1,
    label: "01",
    description: "cleanse the surface",
    align: "start",
  },
  {
    step: 2,
    label: "02",
    description: "apply the treatment layer",
    align: "center",
  },
  {
    step: 3,
    label: "03",
    description: "finish with moisture and barrier support",
    align: "end",
  },
] as const;

type CoreStep = (typeof CORE_CHECKPOINTS)[number]["step"];
type ActiveCoreStep = CoreStep | 0;

function checkpointState(activeStep: ActiveCoreStep, step: CoreStep) {
  if (activeStep === step) return "active";
  if (activeStep > step) return "complete";
  return "idle";
}

function HomeCoreIntro({ headingId }: { headingId: string }) {
  return (
    <div className="home-section__intro home-section__intro--core home-core-progress__intro">
      <p className="hero__eyebrow home-core-progress__eyebrow">The Core</p>
      <h2 id={headingId} className="sr-only">
        The Core
      </h2>
    </div>
  );
}

export function HomeCoreProgress({
  products,
  headingId,
}: {
  products: Product[];
  headingId: string;
}) {
  const [activeStep, setActiveStep] = useState<ActiveCoreStep>(0);
  const [openQuickBuyProductId, setOpenQuickBuyProductId] = useState<string | null>(null);
  const hasCompleteCore = products.length >= CORE_CHECKPOINTS.length;
  const coreProducts = products.slice(0, CORE_CHECKPOINTS.length);

  useEffect(() => {
    if (
      openQuickBuyProductId &&
      !coreProducts.some((product) => product.id === openQuickBuyProductId)
    ) {
      setOpenQuickBuyProductId(null);
    }
  }, [coreProducts, openQuickBuyProductId]);

  if (!hasCompleteCore) {
    return (
      <>
        <HomeCoreIntro headingId={headingId} />
        {products.length > 0 && (
          <ProductGrid products={products} className="product-grid home-core-products" />
        )}
      </>
    );
  }

  function activate(step: CoreStep) {
    setActiveStep(step);
  }

  function resetFromPointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    setActiveStep(0);
  }

  function resetFromFocus(event: FocusEvent<HTMLElement>) {
    const nextFocus = event.relatedTarget;
    if (
      !nextFocus ||
      !(nextFocus instanceof Node) ||
      !event.currentTarget.contains(nextFocus)
    ) {
      setActiveStep(0);
    }
  }

  return (
    <div className="home-core-progress-shell" data-core-active={activeStep}>
      <div className="home-section__intro home-section__intro--core home-core-progress__intro">
        <p className="hero__eyebrow home-core-progress__eyebrow">The Core</p>
        <h2 id={headingId} className="sr-only">
          The Core
        </h2>
        <div className="home-core-progress" aria-label="Core routine checkpoint progress">
          <div className="home-core-progress__rail" aria-hidden="true">
            <span className="home-core-progress__rail-fill" />
          </div>
          <ol className="home-core-progress__nodes" aria-label="Core routine order">
            {CORE_CHECKPOINTS.map((checkpoint) => (
              <li
                key={checkpoint.step}
                className="home-core-progress__node-item"
                data-state={checkpointState(activeStep, checkpoint.step)}
                aria-current={activeStep === checkpoint.step ? "step" : undefined}
              >
                <span className="home-core-progress__node">{checkpoint.label}</span>
              </li>
            ))}
          </ol>
          <div className="home-core-progress__descriptions" aria-live="polite">
            {CORE_CHECKPOINTS.map((checkpoint) => (
              <span
                key={checkpoint.step}
                className="home-core-progress__description"
                data-align={checkpoint.align}
                data-state={activeStep === checkpoint.step ? "active" : "idle"}
                aria-hidden={activeStep !== checkpoint.step}
              >
                {checkpoint.description}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ul
        className="product-grid home-core-products home-core-products--interactive"
        onPointerLeave={resetFromPointer}
        onBlurCapture={resetFromFocus}
      >
        {coreProducts.map((product, index) => {
          const checkpoint = CORE_CHECKPOINTS[index];

          return (
            <ProductCard
              key={product.slug}
              product={product}
              quickBuyOpen={openQuickBuyProductId === product.id}
              onQuickBuyOpen={() => setOpenQuickBuyProductId(product.id)}
              onQuickBuyClose={() =>
                setOpenQuickBuyProductId((current) =>
                  current === product.id ? null : current,
                )
              }
              rootProps={{
                "data-core-step": String(checkpoint.step),
                onFocusCapture: () => activate(checkpoint.step),
                onPointerDownCapture: () => activate(checkpoint.step),
                onPointerEnter: (event) => {
                  if (event.pointerType !== "touch") activate(checkpoint.step);
                },
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}
