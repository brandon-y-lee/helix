"use client";

import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  MotionConfig,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
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
type SheetEase = [number, number, number, number];

export type SheetMotionTransition = {
  duration: number;
  ease: SheetEase;
  backdropDuration?: number;
};

export const PERSISTENT_SHEET_MOTION_TRANSITION: SheetMotionTransition = {
  duration: 0.3,
  ease: [0.42, 0, 0.58, 1],
  backdropDuration: 0.14,
};

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

type SheetLayerProps = {
  open: boolean;
  persistent: boolean;
  side: SheetSide;
  title: string;
  titleId: string;
  eyebrow?: string;
  description?: string;
  descriptionId: string;
  onClose: () => void;
  children: ReactNode;
  className: string;
  overlayClassName: string;
  overlayStyle?: CSSProperties;
  panelStyle?: CSSProperties;
  panelRef: React.RefObject<HTMLDivElement | null>;
  motionTransition?: SheetMotionTransition;
  onMotionComplete?: () => void;
};

function SheetLayer(props: SheetLayerProps) {
  const isPresent = useIsPresent();
  const shouldReduceMotion = useReducedMotion();
  const {
    open,
    persistent,
    side,
    title,
    titleId,
    eyebrow,
    description,
    descriptionId,
    onClose,
    children,
    className,
    overlayClassName,
    overlayStyle,
    panelStyle,
    panelRef,
    motionTransition,
    onMotionComplete,
  } = props;
  const animated = motionTransition !== undefined;
  const duration = shouldReduceMotion
    ? 0.01
    : motionTransition?.duration;
  const backdropDuration = shouldReduceMotion
    ? 0.01
    : (motionTransition?.backdropDuration ?? motionTransition?.duration);
  const closedTransform = `translate3d(${side === "right" ? "100%" : "-100%"}, 0, 0)`;
  const state = persistent
    ? open
      ? "open"
      : "closed"
    : !animated || isPresent
      ? "open"
      : "closed";
  const backdropVariants = motionTransition
    ? { closed: { opacity: 0 }, open: { opacity: 1 } }
    : undefined;
  const panelVariants = motionTransition
    ? {
        closed: { transform: closedTransform },
        open: { transform: "translate3d(0%, 0, 0)" },
      }
    : undefined;

  return (
    <m.div
      className={`sheet sheet--${side} ${overlayClassName}`}
      data-motion-sheet={animated ? "" : undefined}
      data-state={state}
      role="dialog"
      aria-modal="true"
      aria-hidden={state === "open" ? undefined : true}
      inert={state === "open" ? undefined : true}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (state === "open" && event.target === event.currentTarget) onClose();
      }}
    >
      {motionTransition && (
        <m.div
          className="sheet__backdrop"
          aria-hidden="true"
          variants={backdropVariants}
          initial={persistent ? false : "closed"}
          animate={persistent ? state : "open"}
          exit={persistent ? undefined : "closed"}
          transition={{
            type: "tween",
            duration: backdropDuration,
            ease: motionTransition.ease,
          }}
        />
      )}
      <m.div
        className={`sheet__panel ${className}`}
        data-state={state}
        ref={panelRef}
        style={panelStyle}
        variants={panelVariants}
        initial={motionTransition ? (persistent ? false : "closed") : undefined}
        animate={motionTransition ? (persistent ? state : "open") : undefined}
        exit={motionTransition && !persistent ? "closed" : undefined}
        transition={
          motionTransition
            ? {
                type: "tween",
                duration,
                ease: motionTransition.ease,
              }
            : undefined
        }
        onAnimationComplete={persistent ? onMotionComplete : undefined}
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
      </m.div>
    </m.div>
  );
}

export function Sheet({
  open,
  side = "right",
  title,
  eyebrow,
  description,
  onClose,
  returnFocus,
  initialFocus,
  children,
  className = "",
  overlayClassName = "",
  overlayStyle,
  panelStyle,
  motionTransition,
  persistent = false,
}: {
  open: boolean;
  side?: SheetSide;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  returnFocus: () => void;
  initialFocus?: () => HTMLElement | null;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  panelStyle?: CSSProperties;
  motionTransition?: SheetMotionTransition;
  persistent?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const releaseScrollLockRef = useRef<(() => void) | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const id = useId();
  const titleId = `${id}-sheet-title`;
  const descriptionId = `${id}-sheet-description`;
  const animated = motionTransition !== undefined;
  const keepMounted = persistent && animated;

  const releaseScrollLock = useCallback(() => {
    releaseScrollLockRef.current?.();
    releaseScrollLockRef.current = null;
  }, []);

  const completeAnimatedClose = useCallback(() => {
    if (openRef.current || releaseScrollLockRef.current === null) return;
    releaseScrollLock();
    returnFocus();
  }, [releaseScrollLock, returnFocus]);

  useEffect(() => {
    if (!open) return;

    releaseScrollLockRef.current ??= lockBodyScroll();

    const panel = panelRef.current;
    const focusTimeout = window.setTimeout(() => {
      if (panel?.contains(document.activeElement)) return;
      const preferred = initialFocus?.();
      const first =
        preferred && panel?.contains(preferred)
          ? preferred
          : panel
            ? focusableIn(panel)[0]
            : null;
      first?.focus({ preventScroll: true });
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
      if (!animated) {
        releaseScrollLock();
        returnFocus();
      }
    };
  }, [
    animated,
    initialFocus,
    open,
    onClose,
    releaseScrollLock,
    returnFocus,
  ]);

  useEffect(() => () => releaseScrollLock(), [releaseScrollLock]);

  const layerProps: SheetLayerProps = {
    open,
    persistent: keepMounted,
    side,
    title,
    titleId,
    eyebrow,
    description,
    descriptionId,
    onClose,
    children,
    className,
    overlayClassName,
    overlayStyle,
    panelStyle,
    panelRef,
    motionTransition,
    onMotionComplete: completeAnimatedClose,
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        {keepMounted ? (
          <SheetLayer {...layerProps} />
        ) : animated ? (
          <AnimatePresence onExitComplete={completeAnimatedClose}>
            {open && <SheetLayer key={id} {...layerProps} />}
          </AnimatePresence>
        ) : (
          open && <SheetLayer {...layerProps} />
        )}
      </MotionConfig>
    </LazyMotion>,
    document.body,
  );
}
