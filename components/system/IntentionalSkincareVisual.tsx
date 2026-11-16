"use client";

import Image from "next/image";
import { useRef } from "react";
import { useScrollLinkedScale } from "@/components/motion/useScrollLinkedScale";

export function IntentionalSkincareVisual() {
  const visualRef = useRef<HTMLDivElement | null>(null);

  useScrollLinkedScale(visualRef, "--system-intentional-image");

  return (
    <div
      ref={visualRef}
      className="system-intentional__visual"
      data-scroll-zoom-mode="pending"
      aria-hidden="true"
    >
      <Image
        src="/media/system/intentional-skincare-portrait-01.webp"
        alt=""
        fill
        className="system-intentional__image"
        sizes="(max-width: 820px) 100vw, 50vw"
      />
    </div>
  );
}
