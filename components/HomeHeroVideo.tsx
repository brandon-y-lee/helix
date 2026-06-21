"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const HERO_POSTER = "/media/home/mei-pelle-hero-poster.webp";
const HERO_WEBM = "/media/home/mei-pelle-hero.webm";
const HERO_MP4 = "/media/home/mei-pelle-hero.mp4";

type HeroMotionState = "pending" | "motion" | "static" | "failed";

export function HomeHeroVideo() {
  const [allowMotion, setAllowMotion] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setAllowMotion(true);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      setAllowMotion(!motionQuery.matches);
      setIsReady(false);
      setHasFailed(false);
    };

    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);

    return () => {
      motionQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  const motionState: HeroMotionState = !allowMotion
    ? "static"
    : hasFailed
      ? "failed"
      : isReady
        ? "motion"
        : "pending";

  return (
    <div
      className="home-video-hero__media"
      data-motion-state={motionState}
      data-video-ready={isReady && !hasFailed ? "true" : "false"}
    >
      <Image
        className="home-video-hero__poster"
        src={HERO_POSTER}
        alt=""
        aria-hidden="true"
        draggable={false}
        fill
        priority
        sizes="100vw"
      />
      {allowMotion ? (
        <video
          className="home-video-hero__video"
          aria-hidden="true"
          autoPlay
          disablePictureInPicture
          loop
          muted
          onCanPlay={() => setIsReady(true)}
          onError={() => {
            setHasFailed(true);
            setIsReady(false);
          }}
          onLoadedData={() => setIsReady(true)}
          playsInline
          poster={HERO_POSTER}
          preload="metadata"
          tabIndex={-1}
        >
          <source src={HERO_WEBM} type="video/webm" />
          <source src={HERO_MP4} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
