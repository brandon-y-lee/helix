"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { HomeThreePrinciple } from "@/lib/content/home";

type HomeThreePrinciplesProps = {
  headingId: string;
  principles: readonly HomeThreePrinciple[];
};

export function HomeThreePrinciples({ headingId, principles }: HomeThreePrinciplesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const contentId = useId();
  const keyboardIntent = useRef(false);
  const labelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activePrinciple = principles[activeIndex] ?? principles[0];

  const labelIds = useMemo(
    () => principles.map((principle) => `${contentId}-${principle.id}`),
    [contentId, principles],
  );

  function activate(index: number) {
    if (!principles[index]) return;
    setActiveIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    keyboardIntent.current = true;
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
    <div className="home-three-principles" data-active-index={activeIndex}>
      <h2 id={headingId} className="sr-only">
        {activePrinciple.titleLines.join(" ")}
      </h2>

      <div id={contentId} className="home-three-principles__copy">
        <p
          key={activePrinciple.id}
          className="home-three-principles__description"
        >
          {activePrinciple.description}
        </p>
        <Link href="/about" className="btn btn--ghost btn--editorial-rounded home-three-principles__cta">
          Our values
        </Link>
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
              aria-controls={contentId}
              data-active={isActive ? "true" : "false"}
              onClick={() => {
                keyboardIntent.current = false;
                activate(index);
              }}
              onFocus={() => {
                keyboardIntent.current = true;
                activate(index);
              }}
              onPointerDown={() => {
                keyboardIntent.current = false;
              }}
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
  );
}
