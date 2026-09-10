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
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useModalLayer } from "@/components/overlays/modal-state";

type SheetSide = "left" | "right" | "bottom";
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

type SheetLayerProps = {
  open: boolean;
  active: boolean;
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
  layerRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  motionTransition?: SheetMotionTransition;
  onMotionComplete?: () => void;
};

function SheetLayer(props: SheetLayerProps) {
  const isPresent = useIsPresent();
  const shouldReduceMotion = useReducedMotion();
  const {
    open,
    active,
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
    layerRef,
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
  const closedTransform = side === "bottom"
    ? "translate3d(0, 100%, 0)"
    : `translate3d(${side === "right" ? "100%" : "-100%"}, 0, 0)`;
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
      ref={layerRef}
      className={`sheet sheet--${side} ${overlayClassName}`}
      data-motion-sheet={animated ? "" : undefined}
      data-state={state}
      data-modal-active={active ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-hidden={state === "open" && active ? undefined : true}
      inert={state === "open" && active ? undefined : true}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (state === "open" && active && event.target === event.currentTarget) onClose();
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
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-sheet-title`;
  const descriptionId = `${id}-sheet-description`;
  const animated = motionTransition !== undefined;
  const keepMounted = persistent && animated;

  const { active, completeClose } = useModalLayer({
    open,
    layerRef,
    panelRef,
    onClose,
    returnFocus,
    initialFocus,
    waitForExit: animated,
  });

  const layerProps: SheetLayerProps = {
    open,
    active,
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
    layerRef,
    panelRef,
    motionTransition,
    onMotionComplete: completeClose,
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        {keepMounted ? (
          <SheetLayer {...layerProps} />
        ) : animated ? (
          <AnimatePresence onExitComplete={completeClose}>
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
