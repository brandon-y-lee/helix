"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
} from "react";
import type { PdpIngredientStory } from "@/lib/catalog/product-content";
import type { ResolvedFullInci } from "@/lib/catalog/product-ingredients";
import type { ProductMedia } from "@/lib/products";

export function PdpIngredientsSplit({
  productSlug,
  productName,
  story,
  media,
  fullInci,
  mediaPosition,
  rootRef,
}: {
  productSlug: string;
  productName: string;
  story: PdpIngredientStory;
  media: ProductMedia | null;
  fullInci: ResolvedFullInci | null;
  mediaPosition: string;
  rootRef?: Ref<HTMLElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const disclosureId = useId();

  useEffect(() => {
    setExpanded(false);
  }, [productSlug]);

  useEffect(() => {
    if (!expanded) return;

    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  function closeDisclosure() {
    setExpanded(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <section
      ref={rootRef}
      id={`pdp-ingredients-${productSlug}`}
      className="pdp-ingredients"
      aria-label={`${productName} ingredients`}
      data-pdp-panel-row="ingredients"
      data-pdp-panel-mode="independent"
    >
      <div
        className="pdp-ingredients__content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <div
          id={disclosureId}
          className="pdp-ingredients__content-stack"
        >
          <div
            className="pdp-ingredients__story"
            data-state={expanded ? "inactive" : "active"}
            aria-hidden={expanded}
            inert={expanded}
          >
            <div className="pdp-ingredients__story-body">
              <h2 id={headingId}>{story.heading}</h2>
              <p className="pdp-ingredients__intro">{story.intro}</p>
              <div className="pdp-ingredients__highlights">
                {story.highlights.map((highlight) => (
                  <article key={highlight.name}>
                    <h3>{highlight.name}</h3>
                    <p>{highlight.description}</p>
                  </article>
                ))}
              </div>
              <p className="pdp-ingredients__support">
                {story.supportingIngredients}
              </p>
            </div>
          </div>

          <div
            className="pdp-ingredients__full"
            data-state={expanded ? "active" : "inactive"}
            aria-hidden={!expanded}
            inert={!expanded}
          >
            <button
              ref={closeRef}
              type="button"
              className="pdp-ingredients__close"
              aria-label="Close full ingredients list"
              onClick={closeDisclosure}
            >
              <span aria-hidden="true">×</span>
            </button>
            <h2>ingredients</h2>
            {fullInci && (
              <div
                className="pdp-ingredients__full-scroll"
                role="region"
                aria-label={`${productName} complete ingredient list`}
                tabIndex={0}
              >
                <p>{fullInci.text}</p>
                <p className="pdp-ingredients__contact">
                  Questions about a specific ingredient?{" "}
                  <a href="/contact">Contact our team.</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="pdp-ingredients__media"
        data-testid="pdp-ingredients-media"
        data-pdp-panel
        data-pdp-panel-kind="media"
      >
        {fullInci && (
          <button
            ref={triggerRef}
            type="button"
            className="pdp-ingredients__disclosure-trigger"
            aria-expanded={expanded}
            aria-controls={disclosureId}
            onClick={() => setExpanded((current) => !current)}
          >
            FULL INGREDIENTS LIST
          </button>
        )}
        {media?.kind === "image" && media.url ? (
          <Image
            src={media.url}
            alt={media.alt}
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            style={{ objectPosition: mediaPosition }}
            className="pdp-ingredients__image"
          />
        ) : (
          <p role="status">
            Formula texture image is temporarily unavailable for {productName}.
          </p>
        )}
      </div>
    </section>
  );
}
