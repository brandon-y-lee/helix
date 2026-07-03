"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const FINAL_CTA_POSTER = "/media/home/final-cta-poster.webp";
const FINAL_CTA_MP4 = "/media/home/final-cta-loop.mp4";

type FinalVideoState = "pending" | "motion" | "static" | "failed";

export function HomeFinalVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!allowMotion || !video) return;
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return;

    const playResult = video.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        setHasFailed(true);
        setIsReady(false);
      });
    }
  }, [allowMotion]);

  const motionState: FinalVideoState = !allowMotion
    ? "static"
    : hasFailed
      ? "failed"
      : isReady
        ? "motion"
        : "pending";

  return (
    <div
      className="home-final-media"
      data-motion-state={motionState}
      data-video-ready={isReady && !hasFailed ? "true" : "false"}
      aria-hidden="true"
    >
      <Image
        className="home-final-media__poster"
        src={FINAL_CTA_POSTER}
        alt=""
        aria-hidden="true"
        draggable={false}
        fill
        sizes="100vw"
      />
      {allowMotion ? (
        <video
          ref={videoRef}
          className="home-final-media__video"
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
          poster={FINAL_CTA_POSTER}
          preload="metadata"
          tabIndex={-1}
        >
          <source src={FINAL_CTA_MP4} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
