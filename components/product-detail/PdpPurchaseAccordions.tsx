"use client";

import { useState } from "react";

type PurchaseAccordionId = "use" | "ingredients";

export type PdpPurchaseAccordionsProps = {
  ingredientHref: string;
  ingredientLinkLabel: string;
  keyIngredients: string[];
  productName: string;
  showCautionNote: boolean;
  steps: string[];
};

export function PdpPurchaseAccordions({
  ingredientHref,
  ingredientLinkLabel,
  keyIngredients,
  productName,
  showCautionNote,
  steps,
}: PdpPurchaseAccordionsProps) {
  const [openAccordion, setOpenAccordion] =
    useState<PurchaseAccordionId | null>(null);

  function toggleAccordion(id: PurchaseAccordionId) {
    setOpenAccordion((current) => (current === id ? null : id));
  }

  return (
    <div
      className="pdp-accordions"
      aria-label={`${productName} purchase details`}
    >
      <section className="pdp-accordion">
        <h2 className="pdp-accordion__heading">
          <button
            type="button"
            className="pdp-accordion__trigger"
            id="pdp-accordion-use-trigger"
            aria-expanded={openAccordion === "use"}
            aria-controls="pdp-accordion-use-panel"
            onClick={() => toggleAccordion("use")}
          >
            <span>HOW TO USE</span>
            <span aria-hidden="true">
              {openAccordion === "use" ? "-" : "+"}
            </span>
          </button>
        </h2>
        <div
          id="pdp-accordion-use-panel"
          className="pdp-accordion__panel"
          data-open={openAccordion === "use"}
          role="region"
          aria-labelledby="pdp-accordion-use-trigger"
          aria-hidden={openAccordion !== "use"}
        >
          <div className="pdp-accordion__content">
            <ol>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {showCautionNote && (
              <p className="pdp-accordion__note">
                Check cautions before use.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="pdp-accordion">
        <h2 className="pdp-accordion__heading">
          <button
            type="button"
            className="pdp-accordion__trigger"
            id="pdp-accordion-ingredients-trigger"
            aria-expanded={openAccordion === "ingredients"}
            aria-controls="pdp-accordion-ingredients-panel"
            onClick={() => toggleAccordion("ingredients")}
          >
            <span>KEY INGREDIENTS</span>
            <span aria-hidden="true">
              {openAccordion === "ingredients" ? "-" : "+"}
            </span>
          </button>
        </h2>
        <div
          id="pdp-accordion-ingredients-panel"
          className="pdp-accordion__panel"
          data-open={openAccordion === "ingredients"}
          role="region"
          aria-labelledby="pdp-accordion-ingredients-trigger"
          aria-hidden={openAccordion !== "ingredients"}
        >
          <div className="pdp-accordion__content">
            {keyIngredients.length > 0 ? (
              <ul className="pdp-key-ingredients">
                {keyIngredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            ) : (
              <p>Key ingredient notes are not available for this product yet.</p>
            )}
            <a
              href={ingredientHref}
              tabIndex={openAccordion === "ingredients" ? undefined : -1}
            >
              {ingredientLinkLabel}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
