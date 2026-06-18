"use client";

import { useEffect, useRef } from "react";
import { SearchView } from "@/components/SearchView";

/**
 * Accessible search modal. Escape and backdrop click close it; focus moves
 * into the panel on open and returns to the trigger on close. Rendered by the
 * header.
 */
export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Prevent background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-overlay-title"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the panel) is clicked.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="search-overlay__panel" ref={panelRef}>
        <div className="search-overlay__head">
          <h2 className="search-overlay__title" id="search-overlay-title">
            Search
          </h2>
          <button
            type="button"
            className="search-overlay__close"
            onClick={onClose}
            aria-label="Close search"
          >
            Close
          </button>
        </div>
        <SearchView autoFocus onResultClick={onClose} />
      </div>
    </div>
  );
}
