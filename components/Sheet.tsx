"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SheetSide = "left" | "right";

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function Sheet({
  open,
  side = "right",
  title,
  eyebrow,
  description,
  onClose,
  returnFocus,
  children,
  className = "",
}: {
  open: boolean;
  side?: SheetSide;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  returnFocus: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `${side}-sheet-title`;
  const descriptionId = `${side}-sheet-description`;

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    window.setTimeout(() => {
      if (panel?.contains(document.activeElement)) return;
      const first = panel ? focusableIn(panel)[0] : null;
      first?.focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusable = focusableIn(panelRef.current);
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
      className={`sheet sheet--${side}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`sheet__panel ${className}`} ref={panelRef}>
        <div className="sheet__head">
          <div>
            {eyebrow && <p className="eyebrow sheet__eyebrow">{eyebrow}</p>}
            <h2 className="sheet__title" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="sr-only" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button type="button" className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
