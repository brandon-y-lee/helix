"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type SheetSide = "left" | "right";

function lockBodyScroll(): () => void {
  const body = document.body;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;
  const previousScrollbarWidth = body.style.getPropertyValue(
    "--sheet-scrollbar-width",
  );
  const hadScrollLockAttribute = body.hasAttribute("data-sheet-scroll-lock");
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;

  if (scrollbarWidth > 0) {
    const computedPaddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    );
    body.style.paddingRight = `${
      (Number.isFinite(computedPaddingRight) ? computedPaddingRight : 0) +
      scrollbarWidth
    }px`;
    body.style.setProperty("--sheet-scrollbar-width", `${scrollbarWidth}px`);
  }

  body.setAttribute("data-sheet-scroll-lock", "");
  body.style.overflow = "hidden";

  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
    if (previousScrollbarWidth) {
      body.style.setProperty(
        "--sheet-scrollbar-width",
        previousScrollbarWidth,
      );
    } else {
      body.style.removeProperty("--sheet-scrollbar-width");
    }
    if (!hadScrollLockAttribute) {
      body.removeAttribute("data-sheet-scroll-lock");
    }
  };
}

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
  overlayClassName = "",
  overlayStyle,
  panelStyle,
  persistent = false,
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
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  panelStyle?: CSSProperties;
  persistent?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const releaseScrollLockRef = useRef<(() => void) | null>(null);
  const id = useId();
  const titleId = `${id}-sheet-title`;
  const descriptionId = `${id}-sheet-description`;
  const shouldRender = persistent || open;

  const releaseScrollLock = useCallback(() => {
    releaseScrollLockRef.current?.();
    releaseScrollLockRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;

    releaseScrollLockRef.current ??= lockBodyScroll();

    const panel = panelRef.current;
    const focusTimeout = window.setTimeout(() => {
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

    return () => {
      window.clearTimeout(focusTimeout);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus();
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      if (!persistent || reducedMotion) releaseScrollLock();
    };
  }, [open, onClose, persistent, releaseScrollLock, returnFocus]);

  useEffect(() => () => releaseScrollLock(), [releaseScrollLock]);

  if (!shouldRender) return null;

  const sheet = (
    <div
      className={`sheet sheet--${side} ${overlayClassName}`}
      data-state={open ? "open" : "closed"}
      role="dialog"
      aria-modal="true"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : true}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (open && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet__panel ${className}`}
        data-state={open ? "open" : "closed"}
        ref={panelRef}
        style={panelStyle}
        onTransitionEnd={(event) => {
          if (
            persistent &&
            !open &&
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          ) {
            releaseScrollLock();
          }
        }}
      >
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
    </div>
  );

  return persistent ? sheet : createPortal(sheet, document.body);
}
