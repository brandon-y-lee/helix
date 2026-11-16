"use client";

import { useEffect, type RefObject } from "react";

const PERCENTAGE_BASE = 100;

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function readCssNumber(styles: CSSStyleDeclaration, property: `--${string}`) {
  const value = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : null;
}

export function useScrollLinkedScale<T extends HTMLElement>(
  elementRef: RefObject<T | null>,
  cssVariablePrefix: `--${string}`,
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const styles = window.getComputedStyle(element);
    const startScale = readCssNumber(
      styles,
      `${cssVariablePrefix}-start-scale`,
    );
    const endScale = readCssNumber(styles, `${cssVariablePrefix}-end-scale`);
    const staticScale = readCssNumber(
      styles,
      `${cssVariablePrefix}-static-scale`,
    );
    const coverPercent = readCssNumber(
      styles,
      `${cssVariablePrefix}-cover`,
    );

    if (
      startScale === null ||
      endScale === null ||
      staticScale === null ||
      coverPercent === null ||
      coverPercent <= 0
    ) {
      element.dataset.scrollZoomMode = "static";
      return;
    }

    const scaleProperty = `${cssVariablePrefix}-scale`;
    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const setScale = (scale: number) => {
      element.style.setProperty(scaleProperty, scale.toFixed(4));
    };
    const supportsNativeTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()") &&
      CSS.supports(`animation-range: entry 0% cover ${coverPercent}%`);

    if (supportsNativeTimeline) {
      const updateMode = () => {
        if (motionQuery?.matches) {
          element.dataset.scrollZoomMode = "static";
          setScale(staticScale);
          return;
        }

        element.dataset.scrollZoomMode = "view-timeline";
        element.style.removeProperty(scaleProperty);
      };

      updateMode();
      motionQuery?.addEventListener("change", updateMode);
      return () => motionQuery?.removeEventListener("change", updateMode);
    }

    let frameId: number | null = null;
    const updateScale = () => {
      frameId = null;

      if (motionQuery?.matches) {
        element.dataset.scrollZoomMode = "static";
        setScale(staticScale);
        return;
      }

      const rect = element.getBoundingClientRect();
      const coverRatio = coverPercent / PERCENTAGE_BASE;
      const distance = Math.max(1, window.innerHeight + rect.height * coverRatio);
      const progress = clampProgress((window.innerHeight - rect.top) / distance);
      const scale = startScale + (endScale - startScale) * progress;

      element.dataset.scrollZoomMode = "javascript";
      setScale(scale);
    };
    const scheduleScale = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateScale);
    };

    scheduleScale();
    window.addEventListener("scroll", scheduleScale, { passive: true });
    window.addEventListener("resize", scheduleScale);
    motionQuery?.addEventListener("change", scheduleScale);

    return () => {
      window.removeEventListener("scroll", scheduleScale);
      window.removeEventListener("resize", scheduleScale);
      motionQuery?.removeEventListener("change", scheduleScale);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [cssVariablePrefix, elementRef]);
}
