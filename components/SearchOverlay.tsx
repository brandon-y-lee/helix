"use client";

import { SearchView } from "@/components/SearchView";
import { Sheet } from "@/components/Sheet";

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
  return (
    <Sheet
      open={open}
      side="right"
      title="Search"
      eyebrow="Discover Mei Pelle"
      description="Search the Mei Pelle product catalog."
      onClose={onClose}
      returnFocus={returnFocus}
      className="search-sheet"
    >
      <SearchView autoFocus onResultClick={onClose} />
    </Sheet>
  );
}
