"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export const PDP_SLIDE_DURATION_MS = 800;
const PDP_SLIDE_EASING_VALUES = [0.66, 0, 0.18, 1] as const;
const PDP_SLIDE_EASING = `cubic-bezier(${PDP_SLIDE_EASING_VALUES.join(", ")})`;

export type PdpSlideDirection = "forward" | "backward";

export const PDP_SLIDE_STYLE = {
  "--pdp-slide-duration": `${PDP_SLIDE_DURATION_MS}ms`,
  "--pdp-slide-easing": PDP_SLIDE_EASING,
} as CSSProperties;

function reducedMotionPreferred() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function usePdpSlideTransition({
  initialIndex,
  itemCount,
  resetKey,
  durationMs = PDP_SLIDE_DURATION_MS,
}: {
  initialIndex: number;
  itemCount: number;
  resetKey: string;
  durationMs?: number;
}) {
  const boundedInitialIndex = Math.min(
    Math.max(initialIndex, 0),
    Math.max(itemCount - 1, 0),
  );
  const [activeIndex, setActiveIndex] = useState(boundedInitialIndex);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] =
    useState<PdpSlideDirection>("forward");
  const activeIndexRef = useRef(boundedInitialIndex);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearTransition = useCallback(() => {
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTransition, [clearTransition]);

  useEffect(() => {
    clearTransition();
    setOutgoingIndex(null);
  }, [clearTransition, durationMs]);

  useEffect(() => {
    clearTransition();
    activeIndexRef.current = boundedInitialIndex;
    setActiveIndex(boundedInitialIndex);
    setOutgoingIndex(null);
    setDirection("forward");
  }, [boundedInitialIndex, clearTransition, resetKey]);

  const select = useCallback(
    (nextIndex: number, forcedDirection?: PdpSlideDirection) => {
      const currentIndex = activeIndexRef.current;
      if (
        nextIndex === currentIndex ||
        nextIndex < 0 ||
        nextIndex >= itemCount
      ) {
        return false;
      }

      clearTransition();
      activeIndexRef.current = nextIndex;
      setDirection(
        forcedDirection ??
          (nextIndex > currentIndex ? "forward" : "backward"),
      );
      setActiveIndex(nextIndex);

      if (reducedMotionPreferred()) {
        setOutgoingIndex(null);
        return true;
      }

      setOutgoingIndex(currentIndex);
      transitionTimeoutRef.current = setTimeout(() => {
        setOutgoingIndex(null);
        transitionTimeoutRef.current = null;
      }, durationMs);
      return true;
    },
    [clearTransition, durationMs, itemCount],
  );

  const advance = useCallback(
    (offset: number, forcedDirection?: PdpSlideDirection) => {
      if (itemCount < 1) return false;
      const nextIndex =
        (activeIndexRef.current + offset + itemCount) % itemCount;
      return select(nextIndex, forcedDirection);
    },
    [itemCount, select],
  );

  return {
    activeIndex,
    advance,
    direction,
    isTransitioning: outgoingIndex !== null,
    outgoingIndex,
    select,
  };
}
