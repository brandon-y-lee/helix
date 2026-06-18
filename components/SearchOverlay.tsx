"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SearchView } from "@/components/SearchView";

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => {
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        });
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (!panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Prevent background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      returnFocus();
    };
  }, [open, onClose, returnFocus]);

  if (!open) return null;

  return createPortal(
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-overlay-title"
      aria-describedby="search-overlay-description"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the panel) is clicked.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="search-overlay__panel" ref={panelRef}>
        <div className="search-overlay__head">
          <div>
            <p className="search-overlay__eyebrow">Discover Mei Pelle</p>
            <h2 className="search-overlay__title" id="search-overlay-title">
              Search
            </h2>
            <p className="sr-only" id="search-overlay-description">
              Search the Mei Pelle product catalog.
            </p>
          </div>
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
    </div>,
    document.body,
  );
}
