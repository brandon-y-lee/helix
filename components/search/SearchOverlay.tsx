"use client";

import { useCallback, useRef } from "react";
import { SearchView } from "@/components/search/SearchView";
import {
  PERSISTENT_SHEET_MOTION_TRANSITION,
  Sheet,
} from "@/components/overlays/Sheet";

/**
 * Accessible search modal. Escape and backdrop click close it; focus moves
 * into the panel on open and returns to the trigger on close. Rendered by the
 * header.
 */
export function SearchOverlay({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialFocus = useCallback(() => inputRef.current, []);

  return (
    <Sheet
      open={open}
      side="right"
      title="Search"
      description="Search the helix product catalog."
      onClose={onClose}
      returnFocus={returnFocus}
      initialFocus={initialFocus}
      className="search-sheet"
      motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
      persistent
    >
      <SearchView inputRef={inputRef} onResultClick={onClose} />
    </Sheet>
  );
}
