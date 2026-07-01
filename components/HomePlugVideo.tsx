"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const PLUG_POSTER = "/media/home/plug-and-play-poster.webp";
const PLUG_MP4 = "/media/home/plug-and-play-loop.mp4";

type PlugVideoState = "pending" | "motion" | "static" | "failed";

export function HomePlugVideo() {
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

  const motionState: PlugVideoState = !allowMotion
    ? "static"
    : hasFailed
      ? "failed"
      : isReady
        ? "motion"
        : "pending";

  return (
    <div
      className="home-plug-media__frame"
      data-motion-state={motionState}
      data-video-ready={isReady && !hasFailed ? "true" : "false"}
    >
      <Image
        className="home-plug-media__poster"
        src={PLUG_POSTER}
        alt=""
        aria-hidden="true"
        draggable={false}
        fill
        sizes="(max-width: 900px) 100vw, 65vw"
      />
      {allowMotion ? (
        <video
          ref={videoRef}
          className="home-plug-media__video"
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
          poster={PLUG_POSTER}
          preload="metadata"
          tabIndex={-1}
        >
          <source src={PLUG_MP4} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
