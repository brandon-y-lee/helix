"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  validFamiliarFaceMedia,
  type FamiliarFaceMedia,
} from "@/lib/content/product-endorsements";

export function ProductEndorsementRail({
  items,
}: {
  items: readonly FamiliarFaceMedia[];
}) {
  const familiarFaces = useMemo(() => validFamiliarFaceMedia(items), [items]);
  const railRef = useRef<HTMLUListElement>(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(familiarFaces.length > 1);

  const syncControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setCanPrevious(rail.scrollLeft > 2);
    setCanNext(rail.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    syncControls();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncControls);
    observer?.observe(rail);
    rail.addEventListener("scroll", syncControls, { passive: true });
    window.addEventListener("resize", syncControls);
    return () => {
      observer?.disconnect();
      rail.removeEventListener("scroll", syncControls);
      window.removeEventListener("resize", syncControls);
    };
  }, [syncControls]);

  if (familiarFaces.length === 0) return null;

  function move(direction: "previous" | "next") {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: (direction === "previous" ? -1 : 1) * rail.clientWidth * 0.82,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <section
      className="pdp-endorsements"
      aria-labelledby="pdp-endorsements-heading"
    >
      <div className="pdp-endorsements__head">
        <h2 id="pdp-endorsements-heading">Endorsed by familiar faces</h2>
        <div className="pdp-endorsements__controls">
          {canPrevious && (
            <button
              type="button"
              onClick={() => move("previous")}
              aria-label="Previous endorsement images"
            >
              <span aria-hidden="true">←</span>
            </button>
          )}
          {canNext && (
            <button
              type="button"
              onClick={() => move("next")}
              aria-label="Next endorsement images"
            >
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
      <ul
        ref={railRef}
        className="pdp-endorsements__rail"
        tabIndex={0}
        aria-label="Familiar faces editorial images"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && canPrevious) {
            event.preventDefault();
            move("previous");
          } else if (event.key === "ArrowRight" && canNext) {
            event.preventDefault();
            move("next");
          }
        }}
      >
        {familiarFaces.map((item) => {
          const media = (
            <Image
              src={item.src}
              alt={item.alt}
              width={item.width}
              height={item.height}
              loading="lazy"
              sizes="(max-width: 620px) 78vw, (max-width: 980px) 42vw, 30vw"
              style={{ objectPosition: item.focalPosition }}
            />
          );
          return (
            <li key={item.id} className="pdp-endorsements__item">
              {item.href ? <Link href={item.href}>{media}</Link> : media}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
