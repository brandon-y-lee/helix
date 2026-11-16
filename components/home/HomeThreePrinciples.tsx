"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { HomeThreePrinciple } from "@/lib/content/home";
import { HomePrinciplesPortrait } from "@/components/home/HomePrinciplesPortrait";

type HomeThreePrinciplesProps = {
  headingId: string;
  principles: readonly HomeThreePrinciple[];
};

export function HomeThreePrinciples({ headingId, principles }: HomeThreePrinciplesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const contentId = useId();
  const keyboardIntent = useRef(false);
  const pointerFocus = useRef(false);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activePrinciple = principles[activeIndex] ?? principles[0];

  const labelIds = useMemo(
    () => principles.map((principle) => `${contentId}-${principle.id}`),
    [contentId, principles],
  );

  function activate(index: number) {
    if (!principles[index] || index === activeIndex) return;
    // Move focus before the outgoing CTA becomes inert during its visual fade.
    if (copyRef.current?.contains(document.activeElement)) {
      labelRefs.current[index]?.focus({ preventScroll: true });
    }
    setActiveIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    keyboardIntent.current = true;
    pointerFocus.current = false;
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const lastIndex = principles.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? lastIndex
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? index === lastIndex
              ? 0
              : index + 1
            : index === 0
              ? lastIndex
              : index - 1;

    activate(nextIndex);
    labelRefs.current[nextIndex]?.focus();
  }

  if (!activePrinciple) return null;

  return (
    <>
      <div className="home-three-principles-panel">
        <div className="home-three-principles" data-active-index={activeIndex}>
          <h2 id={headingId} className="sr-only">
            {activePrinciple.titleLines.join(" ")}
          </h2>

          <div ref={copyRef} className="home-three-principles__copy">
            {principles.map((principle, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={principle.id}
                  id={`${contentId}-panel-${principle.id}`}
                  className="home-three-principles__slide"
                  data-active={isActive}
                  aria-hidden={!isActive}
                  inert={!isActive}
                >
                  <p className="home-three-principles__description">
                    {principle.description}
                  </p>
                  <Link href={principle.cta.href} className="btn btn--ghost btn--editorial-rounded home-three-principles__cta">
                    {principle.cta.label}
                  </Link>
                </div>
              );
            })}
          </div>

          <div
            className="home-three-principles__labels"
            role="group"
            aria-label="helix principles"
          >
            {principles.map((principle, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={principle.id}
                  ref={(element) => {
                    labelRefs.current[index] = element;
                  }}
                  id={labelIds[index]}
                  type="button"
                  className="home-three-principles__label"
                  aria-pressed={isActive}
                  aria-controls={`${contentId}-panel-${principle.id}`}
                  data-active={isActive ? "true" : "false"}
                  onClick={(event) => {
                    keyboardIntent.current = event.detail === 0;
                    activate(index);
                  }}
                  onFocus={() => {
                    if (pointerFocus.current) return;
                    keyboardIntent.current = true;
                    activate(index);
                  }}
                  onPointerDown={() => {
                    keyboardIntent.current = false;
                    pointerFocus.current = true;
                  }}
                  onPointerUp={() => { pointerFocus.current = false; }}
                  onPointerCancel={() => { pointerFocus.current = false; }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== "touch") {
                      keyboardIntent.current = false;
                      activate(index);
                    }
                  }}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch" && !keyboardIntent.current) activate(index);
                  }}
                >
                  <span>{principle.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <HomePrinciplesPortrait activeIndex={activeIndex} principles={principles} />
    </>
  );
}
