"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type HomeVideoSource = {
  src: string;
  type: string;
};

export type HomeBackgroundVideoPlacement = "hero" | "plug" | "final";

type HomeVideoConfig = {
  eager: boolean;
  frameClassName: string;
  poster: string;
  posterClassName: string;
  posterPriority: boolean;
  posterSizes: string;
  sources: readonly HomeVideoSource[];
  videoClassName: string;
};

type HomeVideoState = "pending" | "motion" | "paused" | "static" | "failed";

const HOME_VIDEO_CONFIG = {
  hero: {
    eager: true,
    frameClassName: "home-video-hero__media",
    poster: "/media/home/helix-hero-poster.webp",
    posterClassName: "home-video-hero__poster",
    posterPriority: true,
    posterSizes: "100vw",
    sources: [
      {
        src: "/media/home/helix-hero.webm?v=469b5c0022c8",
        type: "video/webm",
      },
      {
        src: "/media/home/helix-hero.mp4?v=7048d1daaa75",
        type: "video/mp4",
      },
    ],
    videoClassName: "home-video-hero__video",
  },
  plug: {
    eager: false,
    frameClassName: "home-plug-media__frame",
    poster: "/media/home/plug-and-play-poster.webp",
    posterClassName: "home-plug-media__poster",
    posterPriority: false,
    posterSizes: "(max-width: 900px) 100vw, 65vw",
    sources: [
      {
        src: "/media/home/plug-and-play-loop.webm?v=72384950eb3e",
        type: "video/webm",
      },
      {
        src: "/media/home/plug-and-play-loop.mp4?v=4907f7e08e94",
        type: "video/mp4",
      },
    ],
    videoClassName: "home-plug-media__video",
  },
  final: {
    eager: false,
    frameClassName: "home-final-media",
    poster: "/media/home/final-cta-poster.webp",
    posterClassName: "home-final-media__poster",
    posterPriority: false,
    posterSizes: "100vw",
    sources: [
      {
        src: "/media/home/final-cta-loop.webm?v=8de3ea79725b",
        type: "video/webm",
      },
      {
        src: "/media/home/final-cta-loop.mp4?v=0fc8a75fd1c4",
        type: "video/mp4",
      },
    ],
    videoClassName: "home-final-media__video",
  },
} as const satisfies Record<HomeBackgroundVideoPlacement, HomeVideoConfig>;

function pauseVideo(video: HTMLVideoElement | null) {
  if (video) {
    video.pause();
  }
}

function useDocumentVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const syncVisibility = () => {
      setVisible(document.visibilityState !== "hidden");
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return visible;
}

function useReducedMotionPreference() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setPrefersReducedMotion(false);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      setPrefersReducedMotion(motionQuery.matches);
    };

    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);
    return () => motionQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  return prefersReducedMotion;
}

function observeViewport(
  element: HTMLElement,
  onVisibilityChange: (isVisible: boolean) => void,
) {
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        onVisibilityChange(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "0px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }

  let frameId: number | null = null;
  const updateVisibility = () => {
    frameId = null;
    const rect = element.getBoundingClientRect();
    onVisibilityChange(rect.bottom > 0 && rect.top < window.innerHeight);
  };
  const scheduleVisibilityUpdate = () => {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(updateVisibility);
  };

  updateVisibility();
  window.addEventListener("scroll", scheduleVisibilityUpdate, { passive: true });
  window.addEventListener("resize", scheduleVisibilityUpdate);

  return () => {
    window.removeEventListener("scroll", scheduleVisibilityUpdate);
    window.removeEventListener("resize", scheduleVisibilityUpdate);
    if (frameId !== null) window.cancelAnimationFrame(frameId);
  };
}

export function HomeBackgroundVideo({
  placement,
}: {
  placement: HomeBackgroundVideoPlacement;
}) {
  const {
    eager,
    frameClassName,
    poster,
    posterClassName,
    posterPriority,
    posterSizes,
    sources,
    videoClassName,
  } = HOME_VIDEO_CONFIG[placement];
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(eager);
  const [isNearViewport, setIsNearViewport] = useState(eager);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const documentVisible = useDocumentVisibility();
  const allowMotion = !useReducedMotionPreference();

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (video) {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
    }
  }, []);

  useEffect(() => {
    setHasFailed(false);
    setHasPlayed(false);
    setIsPlaying(false);

    if (!allowMotion) {
      setIsNearViewport(false);
      pauseVideo(videoRef.current);
    } else if (eager) {
      setIsNearViewport(true);
    }
  }, [allowMotion, eager]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!allowMotion || eager || !frame) return;

    return observeViewport(frame, (nextIsNearViewport) => {
      setIsNearViewport(nextIsNearViewport);
      if (nextIsNearViewport) setHasEnteredViewport(true);
    });
  }, [allowMotion, eager]);

  const shouldRenderVideo = allowMotion && (eager || hasEnteredViewport);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!allowMotion || !documentVisible || !isNearViewport || hasFailed || manuallyPaused) {
      pauseVideo(video);
      setIsPlaying(false);
      return;
    }

    let cancelled = false;

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          if (!cancelled) {
            setIsPlaying(false);
          }
        });
      }
    } catch {
      setIsPlaying(false);
    }

    return () => {
      cancelled = true;
    };
  }, [
    allowMotion,
    documentVisible,
    hasFailed,
    manuallyPaused,
    isNearViewport,
    shouldRenderVideo,
  ]);

  const motionState: HomeVideoState = !allowMotion
    ? "static"
    : hasFailed
      ? "failed"
      : manuallyPaused
        ? "paused"
        : isPlaying
          ? "motion"
          : "pending";

  return (
    <div
      ref={frameRef}
      className={frameClassName}
      data-motion-state={motionState}
      data-video-ready={hasPlayed && !hasFailed ? "true" : "false"}
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
          autoPlay={!manuallyPaused}
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
            setHasPlayed(true);
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
      {placement !== "final" && shouldRenderVideo && !hasFailed ? (
        <button
          type="button"
          className="home-video-control"
          aria-label={manuallyPaused ? "Play background video" : "Pause background video"}
          aria-pressed={manuallyPaused}
          onClick={() => setManuallyPaused((paused) => !paused)}
        >
          <span aria-hidden="true">{manuallyPaused ? "Play" : "Pause"}</span>
        </button>
      ) : null}
    </div>
  );
}
