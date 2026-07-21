"use client";

import Image from "next/image";
import { useScrollDirectionZoom } from "@/components/useScrollDirectionZoom";

const MIN_SCALE = 1.01;
const RESTING_SCALE = 1.07;
const MAX_SCALE = 1.16;

export function HomePrinciplesPortrait() {
  const frameRef = useScrollDirectionZoom<HTMLDivElement>({
    cssVariable: "--home-principles-image-scale",
    minScale: MIN_SCALE,
    restingScale: RESTING_SCALE,
    maxScale: MAX_SCALE,
    observedAncestorSelector: ".home-section--principles",
    staticMediaQuery: "(max-width: 900px)",
  });

  return (
    <div
      ref={frameRef}
      className="home-three-principles-visual__zoom"
      data-scroll-zoom-active="false"
      data-scroll-zoom-motion="static"
    >
      <Image
        src="/media/home/why-three.webp"
        alt="Black-and-white editorial portrait."
        fill
        sizes="(max-width: 900px) 100vw, 50vw"
        className="home-three-principles-visual__image"
        unoptimized
      />
    </div>
  );
}
