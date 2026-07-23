"use client";

import Link from "next/link";
import { useScrollDirectionZoom } from "@/components/useScrollDirectionZoom";

const MIN_SCALE = 0.52;
const MAX_SCALE = 1;

export function FooterWordmark() {
  const wordmarkRef = useScrollDirectionZoom<HTMLDivElement>({
    cssVariable: "--site-footer-wordmark-scale",
    minScale: MIN_SCALE,
    restingScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    observedAncestorSelector: ".site-footer__wordmark-runway",
    scrollMode: "element-progress",
    staticScale: MAX_SCALE,
  });

  return (
    <div className="site-footer__wordmark-runway">
      <div className="site-footer__wordmark-stage">
        <div
          ref={wordmarkRef}
          className="site-footer__wordmark"
          data-scroll-zoom-active="false"
          data-scroll-zoom-mode="element-progress"
          data-scroll-zoom-motion="static"
        >
          <h2 id="site-footer-heading">
            <Link href="/">Mei Pelle</Link>
          </h2>
        </div>
      </div>
    </div>
  );
}
