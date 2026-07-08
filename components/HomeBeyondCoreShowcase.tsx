"use client";

import Link from "next/link";
import { useState, type FocusEvent, type PointerEvent } from "react";
import { HomePhasedDescription } from "@/components/HomePhasedDescription";
import { ProductImage } from "@/components/ProductImage";
import {
  homeBeyondCoreDescriptions,
  type HomeBeyondCoreDescriptionKey,
} from "@/lib/content/home";
import type { ProductMedia } from "@/lib/products";

export type HomeBeyondCoreCard = {
  ariaLabel: string;
  descriptionKey: HomeBeyondCoreDescriptionKey;
  displayName: string;
  href: string;
  role: string;
  summary: string;
} & (
  | {
      kind: "product";
      media: ProductMedia | null;
      swatch: [string, string];
    }
  | {
      kind: "protect";
      status: string;
    }
);

function focusLeftCurrentTarget(event: FocusEvent<HTMLElement>) {
  const nextFocus = event.relatedTarget;
  return !nextFocus || !(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus);
}

export function HomeBeyondCoreShowcase({
  cards,
}: {
  cards: readonly HomeBeyondCoreCard[];
}) {
  const [activeDescriptionKey, setActiveDescriptionKey] =
    useState<HomeBeyondCoreDescriptionKey | null>(null);
  const description = activeDescriptionKey
    ? homeBeyondCoreDescriptions.items[activeDescriptionKey]
    : homeBeyondCoreDescriptions.default;

  function activate(key: HomeBeyondCoreDescriptionKey) {
    setActiveDescriptionKey(key);
  }

  function clear() {
    setActiveDescriptionKey(null);
  }

  function handlePointerEnter(
    event: PointerEvent<HTMLAnchorElement>,
    key: HomeBeyondCoreDescriptionKey,
  ) {
    if (event.pointerType === "touch") return;
    activate(key);
  }

  function handlePointerLeave(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType === "touch") return;
    clear();
  }

  return (
    <section
      className="container home-section home-section--beyond"
      aria-labelledby="beyond-heading"
    >
      <div className="home-section__intro home-section__intro--wide">
        <p className="hero__eyebrow">Beyond The Core</p>
        <h2 id="beyond-heading" className="sr-only">
          Beyond The Core
        </h2>

        <HomePhasedDescription text={description} />
      </div>
      <div className="home-addon-grid">
        {cards.map((card) => (
          <Link
            key={card.descriptionKey}
            href={card.href}
            className={[
              "home-addon-card",
              card.kind === "protect" ? "home-addon-card--protect" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={card.ariaLabel}
            data-home-description-key={card.descriptionKey}
            onPointerEnter={(event) => handlePointerEnter(event, card.descriptionKey)}
            onPointerLeave={handlePointerLeave}
            onFocusCapture={() => activate(card.descriptionKey)}
            onBlurCapture={(event) => {
              if (focusLeftCurrentTarget(event)) clear();
            }}
          >
            {card.kind === "protect" ? (
              <>
                <span
                  className="home-addon-card__media home-addon-card__media--protect"
                  aria-hidden="true"
                >
                  <span>SPF</span>
                </span>
                <span className="home-addon-card__label">{card.status}</span>
              </>
            ) : (
              <>
                <ProductImage
                  media={card.media}
                  swatch={card.swatch}
                  className="home-addon-card__media"
                  imageClassName="home-addon-card__img"
                  sizes="(max-width: 720px) 84vw, 260px"
                />
                <span className="home-addon-card__label">{card.displayName}</span>
              </>
            )}
            <h3>{`${card.displayName} — ${card.role}`}</h3>
            <p>{card.summary}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
