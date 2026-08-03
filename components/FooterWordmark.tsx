"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const START_SCALE = 1.05;
const END_SCALE = 0.92;
const STATIC_SCALE = 0.96;

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function FooterWordmark() {
  const bandRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const band = bandRef.current;
    const heading = headingRef.current;
    if (!band || !heading) return;

    const supportsNativeTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()") &&
      CSS.supports("animation-range: entry 0% cover 62%");

    if (supportsNativeTimeline) {
      band.dataset.scrollZoomMode = "view-timeline";
      return;
    }

    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frameId: number | null = null;

    const setScale = (scale: number) => {
      heading.style.setProperty("--site-footer-wordmark-scale", scale.toFixed(4));
    };

    const updateScale = () => {
      frameId = null;

      if (motionQuery?.matches) {
        band.dataset.scrollZoomMode = "static";
        setScale(STATIC_SCALE);
        return;
      }

      const rect = band.getBoundingClientRect();
      const distance = Math.max(1, window.innerHeight + rect.height * 0.62);
      const progress = clampProgress((window.innerHeight - rect.top) / distance);
      const scale = START_SCALE + (END_SCALE - START_SCALE) * progress;

      band.dataset.scrollZoomMode = "javascript";
      setScale(scale);
    };

    const scheduleScale = () => {
      if (frameId !== null) return;

      if (typeof window.requestAnimationFrame !== "function") {
        updateScale();
        return;
      }

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
        <h2 ref={headingRef} id="site-footer-heading">
          <Link href="/">Mei Pelle</Link>
        </h2>
      </div>
    </div>
  );
}
