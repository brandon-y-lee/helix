"use client";

import { useCallback, useRef, useState, type Ref } from "react";
import { ProductImage } from "@/components/product/ProductImage";
import type { ProductMedia } from "@/lib/products";
import type { PdpPresentation } from "./pdp-presentation";
import { usePdpMobilePresentation } from "./usePdpMobilePresentation";

export function PdpRoutineVideo({
  productName,
  overlay,
  video,
  poster,
  swatch,
  rootRef,
  pdpPresentation = "default",
}: {
  productName: string;
  overlay: string;
  video: ProductMedia;
  poster: ProductMedia;
  swatch: [string, string];
  rootRef?: Ref<HTMLElement>;
  pdpPresentation?: PdpPresentation;
}) {
  const isMobile = usePdpMobilePresentation(pdpPresentation);
  const foregroundRef = useRef<HTMLVideoElement>(null);
  const backgroundRef = useRef<HTMLVideoElement>(null);
  const [activated, setActivated] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [error, setError] = useState(false);

  const syncBackgroundTime = useCallback((force = false) => {
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
  }, []);

  const playBackground = useCallback(() => {
    const background = backgroundRef.current;
    if (!background) return;
    syncBackgroundTime(true);
    background.playbackRate = foregroundRef.current?.playbackRate ?? 1;
    void background.play().catch(() => {
      setBackgroundReady(false);
    });
  }, [syncBackgroundTime]);

  const attachBackground = useCallback(
    (background: HTMLVideoElement | null) => {
      if (!background) return;
      backgroundRef.current = background;
      setBackgroundReady(false);
      const foreground = foregroundRef.current;
      if (foreground && !foreground.paused && !foreground.ended) {
        playBackground();
      }
      return () => {
        background.pause();
        backgroundRef.current = null;
      };
    },
    [playBackground],
  );

  if (
    video.kind !== "video" ||
    !video.url ||
    poster.kind !== "image" ||
    !poster.url
  ) {
    return null;
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
      data-pdp-panel-row="routine-video"
      data-pdp-panel-mode="single"
      data-pdp-panel
      data-pdp-panel-kind="media"
      data-activated={activated}
      data-error={error}
    >
      <ProductImage
        media={poster}
        swatch={swatch}
        sizes="100vw"
        className="pdp-routine-video__poster-background"
        imageClassName="pdp-routine-video__poster-background-image"
        imageAlt=""
        aria-hidden
      />
      <ProductImage
        media={poster}
        swatch={swatch}
        sizes="100vw"
        className="pdp-routine-video__poster-foreground"
        imageClassName="pdp-routine-video__poster-foreground-image"
      />
      {!isMobile && (
        <video
          ref={attachBackground}
          className="pdp-routine-video__background"
          src={video.url}
          preload="none"
          muted
          playsInline
          tabIndex={-1}
          aria-hidden="true"
          data-ready={backgroundReady}
          onCanPlay={() => setBackgroundReady(true)}
          onError={() => setBackgroundReady(false)}
        />
      )}
      <video
        ref={foregroundRef}
        className="pdp-routine-video__foreground"
        src={video.url}
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
          <p>This routine video could not be loaded.</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
