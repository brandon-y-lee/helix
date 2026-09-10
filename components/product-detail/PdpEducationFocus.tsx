"use client";

import { useEffect } from "react";

export function PdpEducationFocus() {
  useEffect(() => {
    let frame: number | null = null;

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

    function onResize() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      // Let responsive effects transfer focus before measuring its new position.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(revealFocusedEducation);
      });
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
