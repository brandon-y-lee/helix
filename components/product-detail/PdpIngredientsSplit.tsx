"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import type { PdpIngredientStory } from "@/lib/catalog/product-content";
import type { ResolvedFullInci } from "@/lib/catalog/product-ingredients";
import type { ProductMedia } from "@/lib/products";
import type { PdpPresentation } from "./pdp-presentation";
import { usePdpMobilePresentation } from "./usePdpMobilePresentation";

export function PdpIngredientsSplit({
  productSlug,
  productName,
  story,
  media,
  swatch,
  fullInci,
  mediaPosition,
  rootRef,
  pdpPresentation = "default",
}: {
  productSlug: string;
  productName: string;
  story: PdpIngredientStory;
  media: ProductMedia | null;
  swatch: [string, string];
  fullInci: ResolvedFullInci | null;
  mediaPosition: string;
  rootRef?: Ref<HTMLElement>;
  pdpPresentation?: PdpPresentation;
}) {
  const pilot = pdpPresentation === "mobile-pilot";
  const mobilePilot = usePdpMobilePresentation(pdpPresentation);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fullListRef = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(false);
  const previousMobile = useRef(mobilePilot);
  const headingId = useId();
  const disclosureId = useId();

  useEffect(() => {
    setExpanded(false);
  }, [productSlug]);

  useEffect(() => {
    const justOpened = expanded && !wasExpanded.current;
    wasExpanded.current = expanded;
    if (!expanded) return;

    if (justOpened && !mobilePilot) closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setExpanded(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded, mobilePilot]);

  useEffect(() => {
    const changed = previousMobile.current !== mobilePilot;
    previousMobile.current = mobilePilot;
    if (!pilot || !changed) return;

    const focused = document.activeElement;
    if (
      !(focused instanceof HTMLElement) ||
      (focused !== triggerRef.current && !fullListRef.current?.contains(focused))
    ) return;

    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement !== focused) return;
      const bounds = focused.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const sticky = document.querySelector<HTMLElement>(
        '.pdp-sticky-purchase[data-visible="true"]',
      );
      const clearTop = 64 + 8;
      const clearBottom = window.innerHeight - (sticky?.getBoundingClientRect().height ?? 0) - 8;
      const top = bounds.top < clearTop
        ? bounds.top - clearTop
        : bounds.bottom > clearBottom
          ? bounds.bottom - clearBottom
          : 0;
      if (top) window.scrollBy({ top, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobilePilot, pilot]);

  function closeDisclosure() {
    setExpanded(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const storyHidden = expanded && !mobilePilot;
  const storyContent = (
    <div
      className="pdp-ingredients__story"
      data-state={storyHidden ? "inactive" : "active"}
      aria-hidden={storyHidden}
      inert={storyHidden}
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
  );

  const fullList = (
    <div
      ref={fullListRef}
      id={disclosureId}
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
          tabIndex={mobilePilot ? undefined : 0}
        >
          <p>{fullInci.text}</p>
          <p className="pdp-ingredients__contact">
            Questions about a specific ingredient?{" "}
            <a href="/contact">Contact our team.</a>
          </p>
        </div>
      )}
    </div>
  );

  const trigger = fullInci ? (
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
  ) : null;

  const texture = (
    <div
      className="pdp-ingredients__media"
      data-testid="pdp-ingredients-media"
      data-pdp-panel
      data-pdp-panel-kind="media"
    >
      {!pilot && trigger}
      {media?.kind === "image" && media.url ? (
        <ProductImage
          media={media}
          swatch={swatch}
          className="pdp-ingredients__media-content"
          sizes="(max-width: 760px) 100vw, 50vw"
          imageStyle={{ objectPosition: mediaPosition }}
          imageClassName="pdp-ingredients__image"
        />
      ) : (
        <p role="status">
          Formula texture image is unavailable for {productName}.
        </p>
      )}
    </div>
  );

  return (
    <section
      ref={rootRef}
      id={`pdp-ingredients-${productSlug}`}
      className={`pdp-ingredients${pilot ? " pdp-ingredients--mobile-pilot" : ""}`}
      aria-label={`${productName} ingredients`}
      data-pdp-panel-row="ingredients"
      data-pdp-panel-mode="independent"
    >
      {pilot ? (
        <>
          {texture}
          <div
            className="pdp-ingredients__content"
            data-pdp-panel
            data-pdp-panel-kind="copy"
          >
            {storyContent}
          </div>
          {trigger}
          {fullList}
        </>
      ) : (
        <>
          <div
            className="pdp-ingredients__content"
            data-pdp-panel
            data-pdp-panel-kind="copy"
          >
            <div className="pdp-ingredients__content-stack">
              {storyContent}
              {fullList}
            </div>
          </div>
          {texture}
        </>
      )}
    </section>
  );
}
