"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { HomeThreePrinciple } from "@/lib/content/home";

type HomeThreePrinciplesProps = {
  principles: readonly HomeThreePrinciple[];
};

export function HomeThreePrinciples({ principles }: HomeThreePrinciplesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const descriptionId = useId();
  const labelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activePrinciple = principles[activeIndex] ?? principles[0];

  const labelIds = useMemo(
    () => principles.map((principle) => `${descriptionId}-${principle.id}`),
    [descriptionId, principles],
  );

  function activate(index: number) {
    if (!principles[index]) return;
    setActiveIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
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
      <div className="home-three-principles__copy">
        <p
          key={activePrinciple.id}
          id={descriptionId}
          className="home-three-principles__description"
        >
          {activePrinciple.description}
        </p>
      </div>

      <div
        className="home-three-principles__labels"
        role="group"
        aria-label="Simple is not basic principles"
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
              aria-controls={descriptionId}
              data-active={isActive ? "true" : "false"}
              onClick={() => activate(index)}
              onFocus={() => activate(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") activate(index);
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
