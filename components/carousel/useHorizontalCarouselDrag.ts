"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";

const DRAG_START_THRESHOLD = 8;
const DRAG_COMMIT_THRESHOLD = 44;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  renderedDeltaX: number;
  dragging: boolean;
} | null;

type DragFinish = {
  committed: boolean;
  deltaX: number;
};

export function useHorizontalCarouselDrag({
  canStart,
  enabled,
  getCommitDelta = (deltaX) => deltaX,
  getRenderedDelta = (deltaX) => deltaX,
  onDrag,
  onFinish,
}: {
  canStart: (target: EventTarget) => boolean;
  enabled: boolean;
  getCommitDelta?: (deltaX: number) => number;
  getRenderedDelta?: (deltaX: number) => number;
  onDrag: (renderedDeltaX: number) => void;
  onFinish: (result: DragFinish) => void;
}) {
  const dragRef = useRef<DragState>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    suppressClickRef.current = false;
    setDragging(false);
    if (suppressClickTimeoutRef.current) {
      window.clearTimeout(suppressClickTimeoutRef.current);
      suppressClickTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      dragRef.current = null;
      if (suppressClickTimeoutRef.current) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || !canStart(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      renderedDeltaX: 0,
      dragging: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    drag.deltaX = deltaX;
    drag.renderedDeltaX = getRenderedDelta(deltaX);

    if (!drag.dragging) {
      const horizontalIntent =
        Math.abs(deltaX) > DRAG_START_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
      if (!horizontalIntent) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.dragging = true;
      setDragging(true);
    }

    event.preventDefault();
    onDrag(drag.renderedDeltaX);
  }

  function finishDrag(
    event: PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const commitDelta = getCommitDelta(drag.deltaX);
    const committed =
      drag.dragging &&
      !cancelled &&
      Math.abs(commitDelta) >= DRAG_COMMIT_THRESHOLD;

    dragRef.current = null;
    setDragging(false);
    onFinish({
      committed,
      deltaX: commitDelta,
    });

    if (!drag.dragging) return;
    suppressClickRef.current = true;
    if (suppressClickTimeoutRef.current) {
      window.clearTimeout(suppressClickTimeoutRef.current);
    }
    suppressClickTimeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimeoutRef.current = null;
    }, 80);
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  return {
    dragging,
    finishDrag,
    handleClickCapture,
    handlePointerDown,
    handlePointerMove,
    resetDrag,
  };
}
