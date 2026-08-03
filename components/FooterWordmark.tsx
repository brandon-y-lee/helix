"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const PERCENTAGE_BASE = 100;

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function readCssNumber(styles: CSSStyleDeclaration, property: `--${string}`) {
  const value = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : null;
}

export function FooterWordmark() {
  const bandRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) return;

    const styles = window.getComputedStyle(band);
    const startScale = readCssNumber(
      styles,
      "--site-footer-wordmark-start-scale",
    );
    const endScale = readCssNumber(
      styles,
      "--site-footer-wordmark-end-scale",
    );
    const staticScale = readCssNumber(
      styles,
      "--site-footer-wordmark-static-scale",
    );
    const coverPercent = readCssNumber(
      styles,
      "--site-footer-wordmark-cover",
    );

    if (
      startScale === null ||
      endScale === null ||
      staticScale === null ||
      coverPercent === null ||
      coverPercent <= 0
    ) {
      band.dataset.scrollZoomMode = "static";
      return;
    }

    const supportsNativeTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()") &&
      CSS.supports(
        `animation-range: entry 0% cover ${coverPercent}%`,
      );

    if (supportsNativeTimeline) {
      band.dataset.scrollZoomMode = "view-timeline";
      return;
    }

    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let frameId: number | null = null;

    const setScale = (scale: number) => {
      band.style.setProperty("--site-footer-wordmark-scale", scale.toFixed(4));
    };

    const updateScale = () => {
      frameId = null;

      if (motionQuery?.matches) {
        band.dataset.scrollZoomMode = "static";
        setScale(staticScale);
        return;
      }

      const rect = band.getBoundingClientRect();
      const coverRatio = coverPercent / PERCENTAGE_BASE;
      const distance = Math.max(1, window.innerHeight + rect.height * coverRatio);
      const progress = clampProgress((window.innerHeight - rect.top) / distance);
      const scale = startScale + (endScale - startScale) * progress;

      band.dataset.scrollZoomMode = "javascript";
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

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div
      ref={bandRef}
      className="site-footer__wordmark-band"
      data-scroll-zoom-mode="pending"
    >
      <div className="site-footer__wordmark">
        <h2 id="site-footer-heading">
          <Link href="/">Mei Pelle</Link>
        </h2>
      </div>
    </div>
  );
}
