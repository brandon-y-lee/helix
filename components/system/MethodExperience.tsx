"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { MethodRoutineNav, type MethodRoutineNavItem } from "@/components/system/MethodRoutineNav";
import { ProductImage } from "@/components/product/ProductImage";
import {
  PROTECT_STEP,
  ROUTINE_PRESET_COPY,
  ROUTINE_GROUPS,
  ROUTINE_STEP_COUNTS,
  activeProductSlugsForSteps,
  deriveMethodRoutineSteps,
  formulaFocus,
  ingredientAnchorId,
  isAvailableProduct,
  normalizeRoutineStepCount,
  productSectionId,
  routineGroupEmptyMessage,
  routineTimingEntriesForGroup,
  stepCopyForProduct,
  type DerivedMethodStep,
  type IngredientIndexCard,
  type RoutineStepCount,
} from "@/lib/content/method";
import type { Product } from "@/lib/products";

const MIN_ROUTINE_STEP_COUNT = ROUTINE_STEP_COUNTS[0];
const MAX_ROUTINE_STEP_COUNT = ROUTINE_STEP_COUNTS[ROUTINE_STEP_COUNTS.length - 1];

function routineStepRatio(count: RoutineStepCount) {
  return (count - MIN_ROUTINE_STEP_COUNT) / (MAX_ROUTINE_STEP_COUNT - MIN_ROUTINE_STEP_COUNT);
}

function routinePositionStyle(count: RoutineStepCount) {
  return {
    "--method-edit-position": `${routineStepRatio(count) * 100}%`,
  } as CSSProperties;
}

function routineRangeStyle(count: RoutineStepCount) {
  return {
    "--method-edit-progress": `${routineStepRatio(count) * 100}%`,
  } as CSSProperties;
}

function availabilityLabel(product: Product) {
  if (isAvailableProduct(product)) return "Available";
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "sold_out") return "Sold out";
  return "Unavailable";
}

function LegacyAnchors({ ids }: { ids?: readonly string[] }) {
  if (!ids?.length) return null;
  return (
    <>
      {ids.map((id) => (
        <span key={id} id={id} className="method-anchor-alias" aria-hidden="true" />
      ))}
    </>
  );
}

function primaryVariantMeta(product: Product) {
  const variant = product.variants[0];
  if (variant?.volume) return variant.volume;
  if (variant?.packCount) return `${variant.packCount} pack`;
  if (variant?.label) return variant.label;
  return product.volume;
}

function routineGroupSummary(
  groupId: string,
  selectedCount: RoutineStepCount,
  defaultSummary: string,
  hasEntries: boolean,
) {
  if (groupId === "am" && selectedCount === 3) {
    return "Cleanse, treat, moisturize. Finish the morning with broad-spectrum sunscreen.";
  }
  if (groupId === "weekly" && !hasEntries) {
    return "Weekly care is not a separate selected step in this edit.";
  }
  return defaultSummary;
}

function ProductStep({
  product,
  displayNumber,
  anchorId,
  legacyAnchorIds,
}: {
  product: Product;
  displayNumber: string;
  anchorId: string;
  legacyAnchorIds?: readonly string[];
}) {
  const copy = stepCopyForProduct(product);
  const focus = formulaFocus(product);

  if (!copy) return null;

  return (
    <section
      id={anchorId}
      className="method-step"
      aria-labelledby={`${anchorId}-heading`}
      data-method-step-id={product.displayName.toLowerCase()}
      data-display-number={displayNumber}
    >
      <LegacyAnchors ids={legacyAnchorIds} />
      <div className="method-step__media">
        <ProductImage
          media={product.detailMedia ?? product.cardMedia}
          swatch={product.swatch}
          className="method-step__image"
          imageClassName="method-step__img"
          sizes="(max-width: 860px) 92vw, 46vw"
        />
        <span className="method-step__routine" aria-hidden="true">
          {displayNumber}
        </span>
      </div>
      <div className="method-step__body">
        <p className="eyebrow">STEP {displayNumber}</p>
        <h2 id={`${anchorId}-heading`}>
          <span className="sr-only">{displayNumber} </span>
          {product.displayName}
        </h2>
        <p className="method-step__type">
          {product.productType}
          {primaryVariantMeta(product) ? ` / ${primaryVariantMeta(product)}` : ""}
        </p>

        <div className="method-step__grid">
          <article>
            <h3>WHAT</h3>
            <p>{copy.what}</p>
          </article>
          <article>
            <h3>WHY</h3>
            <p>{copy.why}</p>
          </article>
          <article>
            <h3>HOW</h3>
            <p>{product.howToUse}</p>
          </article>
          <article>
            <h3>FORMULA FOCUS</h3>
            {focus.length > 0 ? (
              <ul>
                {focus.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            ) : (
              <p>Ingredient notes pending.</p>
            )}
          </article>
        </div>

        <div className="method-step__meta" aria-label={`${product.displayName} metadata`}>
          <span>{product.usageTime.join(" + ") || "Use as directed"}</span>
          <span>{availabilityLabel(product)}</span>
          {product.cautions.length > 0 && <span>Review cautions on PDP</span>}
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="btn btn--ghost btn--editorial-rounded method-step__link"
          aria-label={`View ${product.displayName} product details`}
        >
          View {product.displayName}
        </Link>
      </div>
    </section>
  );
}

function ProtectStep({
  displayNumber,
  anchorId,
  legacyAnchorIds,
}: {
  displayNumber: string;
  anchorId: string;
  legacyAnchorIds?: readonly string[];
}) {
  return (
    <section
      id={anchorId}
      className="method-step method-step--protect"
      aria-labelledby={`${anchorId}-heading`}
      data-method-step-id="protect"
      data-display-number={displayNumber}
    >
      <LegacyAnchors ids={legacyAnchorIds} />
      <div className="method-step__media method-protect__visual" aria-hidden="true">
        <span className="method-step__routine">{displayNumber}</span>
      </div>
      <div className="method-step__body">
        <p className="eyebrow">STEP {displayNumber}</p>
        <h2 id={`${anchorId}-heading`}>
          <span className="sr-only">{displayNumber} </span>
          {PROTECT_STEP.displayName}
        </h2>
        <p className="method-step__type">{PROTECT_STEP.productType}</p>
        <div className="method-step__meta" aria-label="PROTECT status">
          <span>{PROTECT_STEP.status}</span>
        </div>
        <div className="method-step__grid">
          <article>
            <h3>WHAT</h3>
            <p>{PROTECT_STEP.what}</p>
          </article>
          <article>
            <h3>WHY</h3>
            <p>{PROTECT_STEP.why}</p>
          </article>
          <article>
            <h3>HOW</h3>
            <p>{PROTECT_STEP.how}</p>
          </article>
          <article>
            <h3>FORMULA FOCUS</h3>
            <p>{PROTECT_STEP.formulaFocus}</p>
          </article>
        </div>
        <p className="method-step__note">{PROTECT_STEP.note}</p>
      </div>
    </section>
  );
}

function MethodRoutineSelector({
  selectedCount,
  onSelectedCountChange,
  inputRef,
}: {
  selectedCount: RoutineStepCount;
  onSelectedCountChange: (count: RoutineStepCount) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const inputId = useId();
  const descriptionId = useId();
  const summaryId = useId();
  const listId = useId();
  const preset = ROUTINE_PRESET_COPY[selectedCount];

  return (
    <section className="method-edit" aria-labelledby={`${inputId}-heading`}>
      <div className="method-edit__copy">
        <p className="eyebrow">EDIT THE SYSTEM</p>
        <h2 id={`${inputId}-heading`}>Choose the system you’ll repeat.</h2>
        <p id={descriptionId}>
          Three steps cover the foundation. Each addition makes the system more
          comprehensive. Adjust the control to see what earns
          a place in your routine.
        </p>
      </div>

      <div className="method-edit__control">
        <div className="method-edit__value" aria-hidden="true">
          <output htmlFor={inputId}>{selectedCount}</output>
          <span>steps</span>
        </div>
        <label htmlFor={inputId}>Routine length</label>
        <div className="method-edit__range" style={routineRangeStyle(selectedCount)}>
          <span className="method-edit__track" aria-hidden="true">
            <span className="method-edit__track-fill" />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="range"
            min="3"
            max="7"
            step="1"
            value={selectedCount}
            list={listId}
            aria-valuenow={selectedCount}
            aria-valuetext={preset.ariaValueText}
            aria-describedby={`${descriptionId} ${summaryId}`}
            onChange={(event) =>
              onSelectedCountChange(normalizeRoutineStepCount(event.currentTarget.value))
            }
          />
          <datalist id={listId}>
            {ROUTINE_STEP_COUNTS.map((count) => (
              <option key={count} value={count} label={`${count}`} />
            ))}
          </datalist>
          <ol className="method-edit__ticks" aria-hidden="true">
            {ROUTINE_STEP_COUNTS.map((count) => (
              <li key={count} style={routinePositionStyle(count)} data-routine-count={count}>
                <span className="method-edit__tick" />
                <span className="method-edit__tick-label">{count}</span>
              </li>
            ))}
          </ol>
        </div>
        <p id={summaryId} className="method-edit__summary" aria-live="polite">
          <strong>{preset.label}</strong>
          {` — ${preset.summary}`}
        </p>
      </div>
    </section>
  );
}

function RoutineTiming({
  steps,
  selectedCount,
}: {
  steps: DerivedMethodStep[];
  selectedCount: RoutineStepCount;
}) {
  return (
    <section
      id="system-routine"
      className="method-routine"
      aria-labelledby="system-routine-heading"
    >
      <LegacyAnchors ids={["method-routine"]} />
      <div className="section-head">
        <div>
          <p className="eyebrow">WHAT / WHY / HOW</p>
          <h2 id="system-routine-heading">Run the routine by timing.</h2>
        </div>
      </div>

      <div className="method-routine__grid">
        {ROUTINE_GROUPS.map((group) => {
          const entries = routineTimingEntriesForGroup(group, steps);
          const hasEntries = entries.length > 0;
          return (
            <article key={group.id} id={`routine-${group.id}`} className="routine-card">
              <p>{group.label}</p>
              <h3>{group.heading}</h3>
              <span>
                {routineGroupSummary(group.id, selectedCount, group.summary, hasEntries)}
              </span>
              {hasEntries ? (
                <ol>
                  {entries.map((entry) => (
                    <li
                      key={entry.key}
                      data-method-step-id={entry.id}
                      data-display-number={entry.displayNumber}
                    >
                      <span aria-hidden="true">{entry.displayNumber}</span>
                      {entry.missing ? (
                        <em>Missing catalog step: {entry.slug}</em>
                      ) : (
                        <Link
                          href={`#${entry.anchorId}`}
                          aria-label={`${entry.displayNumber} ${entry.label}${
                            entry.note ? `, ${entry.note}` : ""
                          }`}
                        >
                          {entry.label}
                          {entry.note && <small>{entry.note}</small>}
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="routine-card__empty">{routineGroupEmptyMessage(group)}</p>
              )}
              {group.id === "am" && selectedCount === 3 && (
                <p className="routine-card__note">
                  Broad-spectrum sunscreen is still recommended as the final morning
                  action.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IngredientLiteracy({
  cards,
  activeProductSlugs,
  selectedCount,
}: {
  cards: IngredientIndexCard[];
  activeProductSlugs: Set<string>;
  selectedCount: RoutineStepCount;
}) {
  return (
    <section
      id="system-ingredients"
      className="method-ingredients"
      aria-labelledby="system-ingredients-heading"
    >
      <LegacyAnchors ids={["method-ingredients"]} />
      <div className="section-head">
        <div>
          <h2 id="system-ingredients-heading">KNOW WHAT YOU’RE USING.</h2>
        </div>
      </div>
      <div className="ingredient-index">
        {cards.map((card) => {
          const anchorId = ingredientAnchorId(card.id);

          return (
            <article
              key={card.id}
              id={anchorId}
              className="ingredient-card"
              aria-labelledby={`${anchorId}-heading`}
            >
              <p>{card.ingredientClass}</p>
              <h3 id={`${anchorId}-heading`}>{card.name}</h3>
              <dl className="ingredient-card__fields">
                <div>
                  <dt>INCI / IDENTITY</dt>
                  <dd>{card.identity}</dd>
                </div>
                <div>
                  <dt>MECHANISM</dt>
                  <dd>{card.mechanism}</dd>
                </div>
                <div>
                  <dt>SKIN RELEVANCE</dt>
                  <dd>{card.skinRelevance}</dd>
                </div>
                {card.formulationNote && (
                  <div>
                    <dt>FORMULATION NOTE</dt>
                    <dd>{card.formulationNote}</dd>
                  </div>
                )}
              </dl>
              <div className="ingredient-card__found">
                <strong>FOUND IN</strong>
                <ul aria-label={`${card.name} products`}>
                  {card.products.map((product) => {
                    const isActive = activeProductSlugs.has(product.slug);
                    return (
                      <li key={`${card.id}-${product.slug}`}>
                        <Link
                          href={`/products/${product.slug}`}
                          data-routine-active={isActive ? "true" : "false"}
                          aria-label={`${product.displayName}, ${
                            isActive ? "included" : "not included"
                          } in the current ${selectedCount}-step system. Opens product details.`}
                        >
                          {product.displayName}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MethodExperience({
  methodProducts,
  ingredientCards,
}: {
  methodProducts: Product[];
  ingredientCards: IngredientIndexCard[];
}) {
  const [selectedCount, setSelectedCount] = useState<RoutineStepCount>(7);
  const selectorInputRef = useRef<HTMLInputElement | null>(null);
  const steps = useMemo(
    () => deriveMethodRoutineSteps(methodProducts, selectedCount),
    [methodProducts, selectedCount],
  );
  const renderableSteps = useMemo(
    () => steps.filter((step) => step.kind === "protect" || Boolean(step.product)),
    [steps],
  );
  const activeProductSlugs = useMemo(() => activeProductSlugsForSteps(steps), [steps]);
  const visibleAnchorKey = renderableSteps.map((step) => step.anchorId).join("|");

  const navItems: MethodRoutineNavItem[] = useMemo(
    () => [
      { id: "system-overview", label: "Start", meta: "Protocol" },
      { id: "system-routine", label: "AM / PM", meta: "Timing" },
      ...renderableSteps.map((step) => ({
        id: step.anchorId,
        label: `${step.displayNumber} ${step.displayName}`,
        meta:
          step.kind === "protect"
            ? PROTECT_STEP.status
            : step.product?.systemStepName ?? undefined,
        position: step.canonicalPosition,
      })),
      { id: "system-ingredients", label: "Index", meta: "Ingredients" },
    ],
    [renderableSteps],
  );

  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    if (hashId && !document.getElementById(hashId)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [visibleAnchorKey]);

  function handleSelectedCountChange(nextCount: RoutineStepCount) {
    const activeElement = document.activeElement;
    const containingStep = activeElement?.closest?.(".method-step");
    if (containingStep) {
      const nextAnchors = new Set(
        deriveMethodRoutineSteps(methodProducts, nextCount)
          .filter((step) => step.kind === "protect" || Boolean(step.product))
          .map((step) => step.anchorId),
      );
      if (!nextAnchors.has(containingStep.id)) {
        selectorInputRef.current?.focus();
      }
    }
    setSelectedCount(nextCount);
  }

  return (
    <div className="method-shell">
      <MethodRoutineNav items={navItems} />

      <div className="method-flow">
        <MethodRoutineSelector
          selectedCount={selectedCount}
          onSelectedCountChange={handleSelectedCountChange}
          inputRef={selectorInputRef}
        />

        <RoutineTiming steps={steps} selectedCount={selectedCount} />

        <div className="method-steps" aria-label="System product steps">
          {renderableSteps.map((step) =>
            step.kind === "protect" ? (
              <ProtectStep
                key={step.id}
                displayNumber={step.displayNumber}
                anchorId={step.anchorId}
                legacyAnchorIds={step.legacyAnchorIds}
              />
            ) : step.product ? (
              <ProductStep
                key={step.slug}
                product={step.product}
                displayNumber={step.displayNumber}
                anchorId={productSectionId(step.product)}
                legacyAnchorIds={step.legacyAnchorIds}
              />
            ) : null,
          )}
        </div>

        <IngredientLiteracy
          cards={ingredientCards}
          activeProductSlugs={activeProductSlugs}
          selectedCount={selectedCount}
        />

        <section className="editorial-cta method-cta" aria-labelledby="method-cta-heading">
          <p className="eyebrow">Build deliberately</p>
          <h2 id="method-cta-heading">CLEAR STEPS. NO WASTED MOTION.</h2>
          <div className="hero__actions">
            <Link href="/collections/shop" className="btn btn--editorial-rounded">
              Build the system
            </Link>
            <Link href="/about" className="btn btn--ghost btn--editorial-rounded">
              About Mei Pelle
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
