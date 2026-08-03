"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type HomeVideoSource = {
  src: string;
  type: string;
};

type HomeBackgroundVideoProps = {
  eager?: boolean;
  frameClassName: string;
  poster: string;
  posterClassName: string;
  posterPriority?: boolean;
  posterSizes: string;
  sources: readonly HomeVideoSource[];
  videoClassName: string;
};

type HomeVideoState = "pending" | "motion" | "static" | "failed";

function isJsdomRuntime() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
}

function pauseVideo(video: HTMLVideoElement | null) {
  if (video && !isJsdomRuntime()) {
    video.pause();
  }
}

export function HomeBackgroundVideo({
  eager = false,
  frameClassName,
  poster,
  posterClassName,
  posterPriority = false,
  posterSizes,
  sources,
  videoClassName,
}: HomeBackgroundVideoProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [allowMotion, setAllowMotion] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(eager);
  const [isNearViewport, setIsNearViewport] = useState(eager);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (video) {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setAllowMotion(true);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      const nextAllowMotion = !motionQuery.matches;

      setAllowMotion(nextAllowMotion);
      setHasFailed(false);
      setIsPlaying(false);

      if (!nextAllowMotion) {
        setIsNearViewport(false);
        pauseVideo(videoRef.current);
      } else if (eager) {
        setIsNearViewport(true);
      }
    };

    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);

    return () => {
      motionQuery.removeEventListener("change", syncMotionPreference);
    };
  }, [eager]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!allowMotion || eager || !frame) return;

    if (typeof IntersectionObserver === "undefined") {
      setHasEnteredViewport(true);
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextIsNearViewport = entries.some((entry) => entry.isIntersecting);

        setIsNearViewport(nextIsNearViewport);
        if (nextIsNearViewport) {
          setHasEnteredViewport(true);
        }
      },
      { rootMargin: "0px", threshold: 0 },
    );

    observer.observe(frame);
    return () => observer.disconnect();
  }, [allowMotion, eager]);

  const shouldRenderVideo = allowMotion && (eager || hasEnteredViewport);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!allowMotion || !isNearViewport || hasFailed) {
      pauseVideo(video);
      setIsPlaying(false);
      return;
    }

    if (isJsdomRuntime()) {
      return;
    }

    let cancelled = false;

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          if (!cancelled) {
            setHasFailed(true);
            setIsPlaying(false);
          }
        });
      }
    } catch {
      setHasFailed(true);
      setIsPlaying(false);
    }

    return () => {
      cancelled = true;
    };
  }, [allowMotion, hasFailed, isNearViewport, shouldRenderVideo]);

  const motionState: HomeVideoState = !allowMotion
    ? "static"
    : hasFailed
      ? "failed"
      : isPlaying
        ? "motion"
        : "pending";

  return (
    <div
      ref={frameRef}
      className={frameClassName}
      data-motion-state={motionState}
      data-video-ready={isPlaying && !hasFailed ? "true" : "false"}
      aria-hidden="true"
    >
      <Image
        className={posterClassName}
        src={poster}
        alt=""
        aria-hidden="true"
        draggable={false}
        fill
        priority={posterPriority}
        sizes={posterSizes}
      />
      {shouldRenderVideo ? (
        <video
          ref={setVideoElement}
          className={videoClassName}
          aria-hidden="true"
          autoPlay
          disablePictureInPicture
          loop
          muted
          onError={() => {
            setHasFailed(true);
            setIsPlaying(false);
          }}
          onPause={() => setIsPlaying(false)}
          onPlaying={() => {
            setHasFailed(false);
            setIsPlaying(true);
          }}
          onStalled={() => setIsPlaying(false)}
          onWaiting={() => setIsPlaying(false)}
          playsInline
          poster={poster}
          preload={eager ? "metadata" : "none"}
          tabIndex={-1}
        >
          {sources.map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
        </video>
      ) : null}
    </div>
  );
}
