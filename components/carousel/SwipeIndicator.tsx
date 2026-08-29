"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const SwipeIndicator = forwardRef<
  HTMLSpanElement,
  { active: boolean; visible: boolean }
>(function SwipeIndicator({ active, visible }, ref) {
  return (
    <span
      ref={ref}
      className="carousel-swipe-indicator"
      data-visible={visible}
      data-active={active}
      aria-hidden="true"
    >
      SWIPE
    </span>
  );
});

function supportsFinePointerHover() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export function useSwipeIndicator(
  viewportRef: RefObject<HTMLElement | null>,
) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicatorFrameRef = useRef<number | null>(null);
  const indicatorPointRef = useRef({ x: 0, y: 0 });
  const [indicatorVisible, setIndicatorVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (indicatorFrameRef.current) {
        window.cancelAnimationFrame(indicatorFrameRef.current);
      }
    };
  }, []);

  const hideIndicator = useCallback(() => {
    setIndicatorVisible(false);
  }, []);

  const updateIndicator = useCallback(
    (clientX: number, clientY: number, eligible: boolean) => {
      const viewport = viewportRef.current;
      const indicator = indicatorRef.current;
      if (!eligible || !supportsFinePointerHover() || !viewport || !indicator) {
        setIndicatorVisible(false);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const radius = 32;
      indicatorPointRef.current = {
        x: Math.min(Math.max(clientX - rect.left, radius), rect.width - radius),
        y: Math.min(Math.max(clientY - rect.top, radius), rect.height - radius),
      };
      setIndicatorVisible(true);

      if (indicatorFrameRef.current) return;
      indicatorFrameRef.current = window.requestAnimationFrame(() => {
        const point = indicatorPointRef.current;
        indicator.style.setProperty("--carousel-indicator-x", `${point.x}px`);
        indicator.style.setProperty("--carousel-indicator-y", `${point.y}px`);
        indicatorFrameRef.current = null;
      });
    },
    [viewportRef],
  );

  return {
    hideIndicator,
    indicatorRef,
    indicatorVisible,
    updateIndicator,
  };
}
