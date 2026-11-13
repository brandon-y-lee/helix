import Image from "next/image";
import type { HomeThreePrinciple } from "@/lib/content/home";

export function HomePrinciplesPortrait({ activeIndex, principles }: {
  activeIndex: number;
  principles: readonly HomeThreePrinciple[];
}) {
  return (
    <div className="home-three-principles-visual" aria-hidden="true">
      <div
        className="home-three-principles-visual__rail"
        data-active-principle={principles[activeIndex]?.id}
        style={{
          transform: `translate3d(0, calc(${-activeIndex * 100}% - var(--home-principles-slide-gap) * ${activeIndex}), 0)`,
        }}
      >
        {principles.map((principle) => (
          <div
            key={principle.id}
            className={`home-three-principles-visual__slide${principle.image.fit === "contain" ? " home-three-principles-visual__slide--contained" : ""}`}
          >
            <Image
              src={principle.image.src}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              className="home-three-principles-visual__image"
              style={{
                objectPosition: principle.image.position,
                objectFit: principle.image.fit ?? "cover",
              }}
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  );
}
