"use client";

import Link from "next/link";
import { useRef } from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { useScrollLinkedScale } from "@/components/motion/useScrollLinkedScale";

export function FooterWordmark() {
  const bandRef = useRef<HTMLDivElement | null>(null);

  useScrollLinkedScale(bandRef, "--site-footer-wordmark");

  return (
    <div
      ref={bandRef}
      className="site-footer__wordmark-band"
      data-scroll-zoom-mode="pending"
    >
      <div className="site-footer__wordmark">
        <h2 id="site-footer-heading">
          <Link href="/" aria-label="helix">
            <HelixIdentity decorative />
          </Link>
        </h2>
      </div>
    </div>
  );
}
