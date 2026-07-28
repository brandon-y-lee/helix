"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

const TRANSITION_DURATION_MS = 640;
const REDUCED_TRANSITION_DURATION_MS = 20;

export function useCoreRoutineSelection({
  currentSlug,
  slugs,
}: {
  currentSlug: string;
  slugs: string[];
}) {
  const defaultIndex = Math.max(slugs.indexOf(currentSlug), 0);
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const slugSignature = slugs.join("|");

  const clearTransition = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTransition, [clearTransition]);

  useEffect(() => {
    clearTransition();
    setActiveIndex(defaultIndex);
    setOutgoingIndex(null);
    setDirection("forward");
  }, [clearTransition, currentSlug, defaultIndex, slugSignature]);

  const select = useCallback(
    (index: number) => {
      if (index === activeIndex) return;
      clearTransition();
      setDirection(index > activeIndex ? "forward" : "backward");
      setOutgoingIndex(activeIndex);
      setActiveIndex(index);
      const transitionDuration =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? REDUCED_TRANSITION_DURATION_MS
          : TRANSITION_DURATION_MS;
      transitionTimeoutRef.current = setTimeout(() => {
        setOutgoingIndex(null);
        transitionTimeoutRef.current = null;
      }, transitionDuration);
    },
    [activeIndex, clearTransition],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % slugs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + slugs.length) % slugs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = slugs.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      select(nextIndex);
      buttonRefs.current[nextIndex]?.focus();
    },
    [select, slugs.length],
  );

  const setButtonRef = useCallback(
    (index: number, node: HTMLButtonElement | null) => {
      buttonRefs.current[index] = node;
    },
    [],
  );

  return {
    activeIndex,
    direction,
    handleKeyDown,
    outgoingIndex,
    select,
    setButtonRef,
  };
}
