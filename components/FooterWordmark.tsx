"use client";

import Link from "next/link";
import { useScrollDirectionZoom } from "@/components/useScrollDirectionZoom";

const MIN_SCALE = 0.96;
const RESTING_SCALE = 1;
const MAX_SCALE = 1.06;

export function FooterWordmark() {
  const wordmarkRef = useScrollDirectionZoom<HTMLDivElement>({
    cssVariable: "--site-footer-wordmark-scale",
    minScale: MIN_SCALE,
    restingScale: RESTING_SCALE,
    maxScale: MAX_SCALE,
    observedAncestorSelector: ".site-footer",
  });

  return (
    <div
      ref={wordmarkRef}
      className="site-footer__wordmark"
      data-scroll-zoom-active="false"
      data-scroll-zoom-motion="static"
    >
      <h2 id="site-footer-heading">
        <Link href="/">Mei Pelle</Link>
      </h2>
    </div>
  );
}
