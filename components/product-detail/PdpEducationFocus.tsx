"use client";

import { useEffect } from "react";
import { PDP_MOBILE_PILOT_QUERY } from "./pdp-presentation";

export function PdpEducationFocus() {
  useEffect(() => {
    let frame: number | null = null;
    let width = window.innerWidth;

    function revealFocusedEducation() {
      frame = null;
      const focused = document.activeElement;
      if (
        !(focused instanceof HTMLElement) ||
        document.body.hasAttribute("data-sheet-scroll-lock") ||
        focused.closest('[hidden], [inert], [aria-hidden="true"], [aria-modal="true"]') ||
        !focused.closest(".pdp-sections")?.closest('[data-pdp-presentation="mobile-pilot"]')
      ) return;

      const bounds = focused.getBoundingClientRect();
      const style = window.getComputedStyle(focused);
      if (!bounds.width || !bounds.height || style.visibility !== "visible") return;
      const sticky = document.querySelector<HTMLElement>('.pdp-sticky-purchase[data-visible="true"]');
      const clearTop = 64 + 8;
      const clearBottom = window.innerHeight - (sticky?.getBoundingClientRect().height ?? 0) - 8;
      const top = bounds.top < clearTop
        ? bounds.top - clearTop
        : bounds.bottom > clearBottom
          ? bounds.bottom - clearBottom
          : 0;
      if (top) window.scrollBy({ top, behavior: "instant" });
    }

    function scheduleReveal() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      // Let responsive effects and native focus scrolling settle before measuring.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(revealFocusedEducation);
      });
    }

    function onFocusIn() {
      if (window.matchMedia?.(PDP_MOBILE_PILOT_QUERY).matches) scheduleReveal();
    }

    function onResize() {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      scheduleReveal();
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocusIn);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
