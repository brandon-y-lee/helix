"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type SheetSide = "left" | "right";
type SheetMotionState = "starting" | "open" | "closed";

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
  animatePresence = false,
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
  animatePresence?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const presentRef = useRef(open);
  const [motionState, setMotionState] = useState<SheetMotionState>(
    open && animatePresence ? "starting" : open ? "open" : "closed",
  );
  const motionStateRef = useRef<SheetMotionState>(
    open && animatePresence ? "starting" : open ? "open" : "closed",
  );
  const titleId = `${side}-sheet-title`;
  const descriptionId = `${side}-sheet-description`;
  const shouldRender = open || (animatePresence && present);

  useEffect(() => {
    if (!animatePresence) {
      presentRef.current = open;
      setPresent(open);
      motionStateRef.current = open ? "open" : "closed";
      setMotionState(open ? "open" : "closed");
      return;
    }

    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (!open) {
      const previousMotionState = motionStateRef.current;
      motionStateRef.current = "closed";
      setMotionState("closed");

      if (reducedMotion || previousMotionState === "starting") {
        presentRef.current = false;
        setPresent(false);
      }
      return;
    }

    if (reducedMotion) {
      presentRef.current = true;
      setPresent(true);
      motionStateRef.current = "open";
      setMotionState("open");
      return;
    }

    if (presentRef.current && motionStateRef.current === "closed") {
      motionStateRef.current = "open";
      setMotionState("open");
      return;
    }

    presentRef.current = true;
    setPresent(true);
    motionStateRef.current = "starting";
    setMotionState("starting");

    let entryFrame = window.requestAnimationFrame(() => {
      entryFrame = window.requestAnimationFrame(() => {
        motionStateRef.current = "open";
        setMotionState("open");
      });
    });

    return () => window.cancelAnimationFrame(entryFrame);
  }, [animatePresence, open]);

  useEffect(() => {
    if (!open) return;

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
    };
  }, [open, onClose, returnFocus]);

  useEffect(() => {
    if (!shouldRender) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const prevScrollbarWidth = document.body.style.getPropertyValue(
      "--sheet-scrollbar-width",
    );
    const hadScrollLockAttribute = document.body.hasAttribute(
      "data-sheet-scroll-lock",
    );
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      const computedPaddingRight = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight,
      );
      document.body.style.paddingRight = `${
        (Number.isFinite(computedPaddingRight) ? computedPaddingRight : 0) +
        scrollbarWidth
      }px`;
      document.body.style.setProperty(
        "--sheet-scrollbar-width",
        `${scrollbarWidth}px`,
      );
    }
    document.body.setAttribute("data-sheet-scroll-lock", "");
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      if (prevScrollbarWidth) {
        document.body.style.setProperty(
          "--sheet-scrollbar-width",
          prevScrollbarWidth,
        );
      } else {
        document.body.style.removeProperty("--sheet-scrollbar-width");
      }
      if (!hadScrollLockAttribute) {
        document.body.removeAttribute("data-sheet-scroll-lock");
      }
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return createPortal(
    <div
      className={`sheet sheet--${side} ${overlayClassName}`}
      data-state={open ? "open" : "closed"}
      data-motion-state={motionState}
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
        data-motion-state={motionState}
        ref={panelRef}
        style={panelStyle}
        onTransitionEnd={(event) => {
          if (
            animatePresence &&
            !open &&
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          ) {
            presentRef.current = false;
            setPresent(false);
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
    </div>,
    document.body,
  );
}
