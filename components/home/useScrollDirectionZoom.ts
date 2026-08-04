"use client";

import { useEffect, useRef } from "react";

type ScrollDirectionZoomOptions = {
  cssVariable: `--${string}`;
  ease?: number;
  maxScale: number;
  minScale: number;
  minScrollDistance?: number;
  observedAncestorSelector?: string;
  restingScale: number;
  scrollDelta?: number;
  scrollDistanceViewports?: number;
  scrollMode?: "direction" | "element-progress";
  staticMediaQuery?: string;
  staticScale?: number;
};

const DEFAULT_SCROLL_DELTA = 8;
const DEFAULT_SCROLL_DISTANCE_VIEWPORTS = 1.4;
const DEFAULT_MIN_SCROLL_DISTANCE = 960;
const DEFAULT_EASE = 0.18;

function getScrollY() {
  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(-1, value));
}

function clampUnitProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function useScrollDirectionZoom<T extends HTMLElement>({
  cssVariable,
  ease = DEFAULT_EASE,
  maxScale,
  minScale,
  minScrollDistance = DEFAULT_MIN_SCROLL_DISTANCE,
  observedAncestorSelector,
  restingScale,
  scrollDelta = DEFAULT_SCROLL_DELTA,
  scrollDistanceViewports = DEFAULT_SCROLL_DISTANCE_VIEWPORTS,
  scrollMode = "direction",
  staticMediaQuery,
  staticScale = restingScale,
}: ScrollDirectionZoomOptions) {
  const frameRef = useRef<T | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let active = false;
    let reducedMotion = false;
    let currentScale = restingScale;
    let targetScale = restingScale;
    let targetProgress = 0;
    let lastScrollY = getScrollY();
    let frameId: number | null = null;

    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const staticQuery = staticMediaQuery && typeof window.matchMedia === "function"
      ? window.matchMedia(staticMediaQuery)
      : null;

    const setScale = (scale: number) => {
      frame.style.setProperty(cssVariable, scale.toFixed(4));
    };

    const scaleForProgress = (progress: number) => {
      if (scrollMode === "element-progress") {
        return minScale + (maxScale - minScale) * clampUnitProgress(progress);
      }

      if (progress >= 0) {
        return restingScale + (maxScale - restingScale) * progress;
      }

      return restingScale + (restingScale - minScale) * progress;
    };

    const getScrollDistanceToBound = () =>
      Math.max(minScrollDistance, window.innerHeight * scrollDistanceViewports);

    const observedElement = observedAncestorSelector
      ? frame.closest(observedAncestorSelector) ?? frame
      : frame;

    const isNearViewport = () => {
      const rect = observedElement.getBoundingClientRect();
      const margin = window.innerHeight * 0.35;

      return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
    };

    const setActive = (nextActive: boolean) => {
      active = nextActive;
      frame.dataset.scrollZoomActive = active ? "true" : "false";
    };

    const isStatic = () => reducedMotion || Boolean(staticQuery?.matches);

    const stopAnimation = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    const tick = () => {
      frameId = null;
      currentScale += (targetScale - currentScale) * ease;

      if (Math.abs(targetScale - currentScale) < 0.001) {
        currentScale = targetScale;
      }

      setScale(currentScale);

      if (currentScale !== targetScale) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    const scheduleScale = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(tick);
    };

    const resetToRestingScale = () => {
      stopAnimation();
      currentScale = isStatic() ? staticScale : restingScale;
      targetScale = currentScale;
      targetProgress = 0;
      setScale(currentScale);
    };

    const syncMotionPreference = () => {
      reducedMotion = motionQuery?.matches ?? false;
      frame.dataset.scrollZoomMotion = isStatic() ? "static" : "motion";
      lastScrollY = getScrollY();

      if (isStatic()) {
        resetToRestingScale();
      }
    };

    const handleScroll = () => {
      const scrollY = getScrollY();
      const deltaY = scrollY - lastScrollY;
      lastScrollY = scrollY;
      const wasActive = active;
      const nextActive = isNearViewport();
      setActive(nextActive);

      if (scrollMode === "element-progress") {
        if (isStatic()) return;

        const rect = observedElement.getBoundingClientRect();
        const scrollableDistance = Math.max(1, rect.height - window.innerHeight);
        targetProgress = clampUnitProgress(-rect.top / scrollableDistance);
        targetScale = scaleForProgress(targetProgress);
        frame.dataset.scrollZoomProgress = targetProgress.toFixed(4);
        scheduleScale();
        return;
      }

      if (
        !nextActive ||
        !wasActive ||
        isStatic() ||
        Math.abs(deltaY) < scrollDelta
      ) {
        return;
      }

      targetProgress = clampProgress(
        targetProgress - deltaY / getScrollDistanceToBound(),
      );
      targetScale = scaleForProgress(targetProgress);
      scheduleScale();
    };

    syncMotionPreference();
    setActive(isNearViewport());
    handleScroll();

    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            setActive(entries.some((entry) => entry.isIntersecting));
            lastScrollY = getScrollY();
          },
          { rootMargin: "35% 0px", threshold: 0 },
        );

    if (observer) {
      observer.observe(observedElement);
    } else {
      setActive(true);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    motionQuery?.addEventListener("change", syncMotionPreference);
    staticQuery?.addEventListener("change", syncMotionPreference);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      motionQuery?.removeEventListener("change", syncMotionPreference);
      staticQuery?.removeEventListener("change", syncMotionPreference);
      observer?.disconnect();
      stopAnimation();
    };
  }, [
    cssVariable,
    ease,
    maxScale,
    minScale,
    minScrollDistance,
    observedAncestorSelector,
    restingScale,
    scrollDelta,
    scrollDistanceViewports,
    scrollMode,
    staticMediaQuery,
    staticScale,
  ]);

  return frameRef;
}
