"use client";

import { useRef, useState, type Ref } from "react";
import type { ProductMedia } from "@/lib/products";

export function PdpRoutineVideo({
  productName,
  overlay,
  video,
  poster,
  rootRef,
}: {
  productName: string;
  overlay: string;
  video: ProductMedia;
  poster: ProductMedia;
  rootRef?: Ref<HTMLElement>;
}) {
  const foregroundRef = useRef<HTMLVideoElement>(null);
  const backgroundRef = useRef<HTMLVideoElement>(null);
  const [activated, setActivated] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [error, setError] = useState(false);

  if (
    video.kind !== "video" ||
    !video.url ||
    poster.kind !== "image" ||
    !poster.url
  ) {
    return null;
  }

  function syncBackgroundTime(force = false) {
    const foreground = foregroundRef.current;
    const background = backgroundRef.current;
    if (!foreground || !background || !Number.isFinite(foreground.currentTime)) {
      return;
    }
    if (
      force ||
      !Number.isFinite(background.currentTime) ||
      Math.abs(background.currentTime - foreground.currentTime) > 0.18
    ) {
      try {
        background.currentTime = foreground.currentTime;
      } catch {
        // The poster remains the background until background metadata is ready.
      }
    }
  }

  function playBackground() {
    const background = backgroundRef.current;
    if (!background) return;
    syncBackgroundTime(true);
    background.playbackRate = foregroundRef.current?.playbackRate ?? 1;
    void background.play().catch(() => {
      setBackgroundReady(false);
    });
  }

  async function handlePlayRequest() {
    const foreground = foregroundRef.current;
    if (!foreground) return;
    setError(false);
    setActivated(true);
    try {
      await foreground.play();
    } catch (playError) {
      setActivated(false);
      if (
        playError instanceof DOMException &&
        (playError.name === "NotAllowedError" ||
          playError.name === "AbortError")
      ) {
        return;
      }
      setError(true);
    }
  }

  function handleRetry() {
    const foreground = foregroundRef.current;
    const background = backgroundRef.current;
    setError(false);
    setActivated(false);
    setBackgroundReady(false);
    background?.pause();
    foreground?.load();
    background?.load();
  }

  return (
    <section
      ref={rootRef}
      className="pdp-routine-video"
      aria-label={`${productName} routine video`}
      data-activated={activated}
      data-error={error}
    >
      <div
        className="pdp-routine-video__poster-background"
        style={{ backgroundImage: `url("${poster.url}")` }}
        aria-hidden="true"
      />
      <video
        ref={backgroundRef}
        className="pdp-routine-video__background"
        src={video.url}
        poster={poster.url}
        preload="none"
        muted
        playsInline
        tabIndex={-1}
        aria-hidden="true"
        data-ready={backgroundReady}
        onCanPlay={() => setBackgroundReady(true)}
        onError={() => setBackgroundReady(false)}
      />
      <video
        ref={foregroundRef}
        className="pdp-routine-video__foreground"
        src={video.url}
        poster={poster.url}
        preload="metadata"
        playsInline
        controls
        onPlay={() => {
          setActivated(true);
          playBackground();
        }}
        onPause={() => backgroundRef.current?.pause()}
        onSeeking={() => syncBackgroundTime(true)}
        onSeeked={() => {
          syncBackgroundTime(true);
          if (!foregroundRef.current?.paused) playBackground();
        }}
        onTimeUpdate={() => syncBackgroundTime()}
        onRateChange={() => {
          if (backgroundRef.current && foregroundRef.current) {
            backgroundRef.current.playbackRate =
              foregroundRef.current.playbackRate;
          }
        }}
        onEnded={() => {
          backgroundRef.current?.pause();
          syncBackgroundTime(true);
        }}
        onError={() => {
          setError(true);
          backgroundRef.current?.pause();
        }}
      >
        Your browser does not support HTML video.
      </video>

      {!activated && !error && (
        <div className="pdp-routine-video__overlay">
          <p>{overlay}</p>
          <button
            type="button"
            className="pdp-routine-video__play"
            aria-label={`Play ${productName} routine video`}
            onClick={() => void handlePlayRequest()}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <div
          className="pdp-routine-video__error"
          role="status"
          aria-live="polite"
        >
          <p>This routine video is temporarily unavailable.</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
