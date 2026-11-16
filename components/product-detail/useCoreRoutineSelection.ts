"use client";

import {
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { usePdpSlideTransition } from "@/components/product-detail/usePdpSlideTransition";

export function useCoreRoutineSelection({
  currentSlug,
  slugs,
  durationMs,
}: {
  currentSlug: string;
  slugs: string[];
  durationMs?: number;
}) {
  const defaultIndex = Math.max(slugs.indexOf(currentSlug), 0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slugSignature = slugs.join("|");
  const {
    activeIndex,
    direction,
    isTransitioning,
    outgoingIndex,
    select,
  } = usePdpSlideTransition({
    initialIndex: defaultIndex,
    itemCount: slugs.length,
    resetKey: `${currentSlug}:${slugSignature}`,
    durationMs,
  });

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
    isTransitioning,
    outgoingIndex,
    select,
    setButtonRef,
  };
}
