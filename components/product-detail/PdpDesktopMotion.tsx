"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PDP_MOBILE_PILOT_QUERY } from "./pdp-presentation";

function layoutTop(element: HTMLElement) {
  // Layout offsets exclude photographic scale and the row's entrance translation.
  let top = 0;
  let ancestor: HTMLElement | null = element;
  while (ancestor) {
    top += ancestor.offsetTop;
    ancestor = ancestor.offsetParent as HTMLElement | null;
  }
  return top;
}

export function PdpDesktopMotion({
  children,
  label,
  productSlug,
}: {
  children: ReactNode;
  label: string;
  productSlug: string;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || productSlug !== "super-serum" || typeof window.matchMedia !== "function") return;

    const mobileQuery = window.matchMedia(PDP_MOBILE_PILOT_QUERY);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-pdp-reveal-row]")).map((element) => ({
      element,
      seen: layoutTop(element) <= window.scrollY + window.innerHeight,
      animation: null as Animation | null,
    }));

    const frames = Array.from(root.querySelectorAll<HTMLElement>("[data-pdp-zoom-frame]")).map((element) => ({
      element,
      media: Array.from(element.querySelectorAll<HTMLElement>("[data-pdp-zoom-media]")),
      top: 0,
      height: 0,
      scale: 1,
      from: 1,
      target: 1,
    }));
    let animation: number | null = null;
    let startedAt = 0;
    let enabled = false;

    function releaseEntrance(row: (typeof rows)[number]) {
      row.animation?.cancel();
      row.animation = null;
      row.element.style.removeProperty("will-change");
    }

    function skipVisibleEntrances() {
      const viewportBottom = window.scrollY + window.innerHeight;
      for (const row of rows) {
        if (layoutTop(row.element) <= viewportBottom) row.seen = true;
      }
    }

    function onRevealScroll() {
      const viewportBottom = window.scrollY + window.innerHeight;
      for (const row of rows) {
        if (row.seen) continue;
        const top = layoutTop(row.element);
        if (top > viewportBottom) continue;
        row.seen = true;
        if (!enabled || top + row.element.offsetHeight <= window.scrollY || typeof row.element.animate !== "function") continue;
        row.element.style.willChange = "transform";
        row.animation = row.element.animate(
          [{ transform: "translate3d(0, 5%, 0)" }, { transform: "translate3d(0, 0, 0)" }],
          { duration: 1000, easing: "cubic-bezier(0.333333, 0.666667, 0.666667, 1)" },
        );
        row.animation.onfinish = () => releaseEntrance(row);
      }
    }

    function targetScale(frame: (typeof frames)[number]) {
      const start = frame.top - window.innerHeight - frame.height * 0.1;
      const distance = window.innerHeight + frame.height * 1.2;
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
      return 1 + 0.2 * (1 - progress) ** 2;
    }

    function paint(frame: (typeof frames)[number], scale: number) {
      frame.scale = scale;
      for (const media of frame.media) {
        media.style.transform = `scale(${scale.toFixed(5)})`;
      }
    }

    function tick(now: number) {
      animation = null;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 100));
      for (const frame of frames) {
        paint(frame, frame.from + (frame.target - frame.from) * progress);
      }
      if (progress < 1) animation = window.requestAnimationFrame(tick);
    }

    function onScroll() {
      const now = performance.now();
      // Scroll events precede RAF in a browser frame. Advance the previous
      // trajectory before retargeting so continuous input cannot stall it.
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 100));
      for (const frame of frames) {
        if (animation !== null) {
          frame.scale = frame.from + (frame.target - frame.from) * progress;
        }
        frame.from = frame.scale;
        frame.target = targetScale(frame);
      }
      startedAt = now;
      if (animation === null) animation = window.requestAnimationFrame(tick);
    }

    function stop() {
      for (const row of rows) releaseEntrance(row);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", refreshLayout);
      resizeObserver?.disconnect();
      if (animation !== null) window.cancelAnimationFrame(animation);
      animation = null;
      for (const frame of frames) {
        for (const media of frame.media) {
          media.style.removeProperty("transform");
          media.style.removeProperty("will-change");
        }
      }
    }

    function refreshLayout() {
      skipVisibleEntrances();
      if (!enabled) return;
      if (animation !== null) window.cancelAnimationFrame(animation);
      animation = null;
      for (const frame of frames) {
        frame.top = layoutTop(frame.element);
        frame.height = frame.element.offsetHeight;
      }
      for (const frame of frames) paint(frame, targetScale(frame));
    }

    function syncMode() {
      skipVisibleEntrances();
      const nextEnabled = !mobileQuery.matches && !reducedMotionQuery.matches;
      if (nextEnabled === enabled) return;
      enabled = nextEnabled;
      if (!enabled) {
        stop();
        return;
      }
      // Keep large photographs composited while scrolling instead of repainting
      // their full-resolution pixels at every scale update.
      for (const frame of frames) {
        for (const media of frame.media) media.style.willChange = "transform";
      }
      refreshLayout();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", refreshLayout);
      resizeObserver?.observe(root!);
      resizeObserver?.observe(document.body);
      for (const frame of frames) resizeObserver?.observe(frame.element);
    }

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(refreshLayout)
      : null;
    syncMode();
    window.addEventListener("scroll", onRevealScroll, { passive: true });
    window.addEventListener("resize", skipVisibleEntrances);
    mobileQuery.addEventListener("change", syncMode);
    reducedMotionQuery.addEventListener("change", syncMode);
    return () => {
      stop();
      window.removeEventListener("scroll", onRevealScroll);
      window.removeEventListener("resize", skipVisibleEntrances);
      mobileQuery.removeEventListener("change", syncMode);
      reducedMotionQuery.removeEventListener("change", syncMode);
    };
  }, [productSlug]);

  return (
    <section ref={rootRef} className="pdp-sections" aria-label={label} data-pdp-panel-sequence>
      {children}
    </section>
  );
}
