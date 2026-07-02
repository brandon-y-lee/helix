"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const MIN_SCALE = 1.03;
const RESTING_SCALE = 1.05;
const MAX_SCALE = 1.11;
const SCROLL_DELTA_Y = 8;
const SCROLL_DISTANCE_TO_BOUND_VIEWPORTS = 1.8;
const MIN_SCROLL_DISTANCE_TO_BOUND = 720;
const EASE = 0.14;

function getScrollY() {
  if (typeof window === "undefined") {
    return 0;
  }

  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(-1, value));
}

function scaleForProgress(progress: number) {
  if (progress >= 0) {
    return RESTING_SCALE + (MAX_SCALE - RESTING_SCALE) * progress;
  }

  return RESTING_SCALE + (RESTING_SCALE - MIN_SCALE) * progress;
}

export function HomeWhyPortrait() {
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let active = false;
    let compactViewport = false;
    let reducedMotion = false;
    let currentScale = RESTING_SCALE;
    let targetScale = RESTING_SCALE;
    let targetProgress = 0;
    let lastScrollY = getScrollY();
    let frameId: number | null = null;

    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const compactQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)")
      : null;

    const setScale = (scale: number) => {
      frame.style.setProperty("--home-why-image-scale", scale.toFixed(4));
    };

    const getScrollDistanceToBound = () =>
      Math.max(
        MIN_SCROLL_DISTANCE_TO_BOUND,
        window.innerHeight * SCROLL_DISTANCE_TO_BOUND_VIEWPORTS,
      );

    const observedElement = frame.closest(".home-section--why") ?? frame;

    const isNearViewport = () => {
      const rect = observedElement.getBoundingClientRect();
      const margin = window.innerHeight * 0.35;

      return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
    };

    const setActive = (nextActive: boolean) => {
      active = nextActive;
      frame.dataset.scrollZoomActive = active ? "true" : "false";
    };

    const isStatic = () => reducedMotion || compactViewport;

    const stopAnimation = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    const tick = () => {
      frameId = null;
      currentScale += (targetScale - currentScale) * EASE;

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
      currentScale = RESTING_SCALE;
      targetScale = RESTING_SCALE;
      targetProgress = 0;
      setScale(RESTING_SCALE);
    };

    const syncMotionPreference = () => {
      reducedMotion = motionQuery?.matches ?? false;
      compactViewport = compactQuery?.matches ?? false;
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

      if (
        !nextActive ||
        !wasActive ||
        isStatic() ||
        Math.abs(deltaY) < SCROLL_DELTA_Y
      ) {
        return;
      }

      targetProgress = clampProgress(
        targetProgress - deltaY / getScrollDistanceToBound(),
      );
      targetScale = clampScale(scaleForProgress(targetProgress));
      scheduleScale();
    };

    syncMotionPreference();
    setActive(isNearViewport());

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
    motionQuery?.addEventListener("change", syncMotionPreference);
    compactQuery?.addEventListener("change", syncMotionPreference);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      motionQuery?.removeEventListener("change", syncMotionPreference);
      compactQuery?.removeEventListener("change", syncMotionPreference);
      observer?.disconnect();
      stopAnimation();
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="home-why-visual__zoom"
      data-scroll-zoom-active="false"
      data-scroll-zoom-motion="static"
    >
      <Image
        src="/media/home/why-three.webp"
        alt="Black-and-white editorial portrait."
        fill
        sizes="(max-width: 900px) 100vw, 50vw"
        className="home-why-visual__image"
        unoptimized
      />
    </div>
  );
}
