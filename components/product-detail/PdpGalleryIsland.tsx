"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import { ProductVideo } from "@/components/product/ProductVideo";
import { useHorizontalCarouselDrag } from "@/components/carousel/useHorizontalCarouselDrag";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_STYLE,
  usePdpSlideTransition,
} from "@/components/product-detail/usePdpSlideTransition";
import type { ProductMedia } from "@/lib/products";
import type { PdpPresentation } from "./pdp-presentation";
import { usePdpMobilePresentation } from "./usePdpMobilePresentation";
import "./pdp-gallery-mobile.css";

type PdpGalleryItem = {
  id: string;
  description: string;
  media: ProductMedia | null;
  swatch: [string, string];
};

export type PdpGalleryIslandProps = {
  productKey: string;
  detailMedia: ProductMedia | null;
  items: PdpGalleryItem[];
  presentation?: PdpPresentation;
};

type PdpGalleryMediaProps = {
  media: ProductMedia | null | undefined;
  swatch: [string, string];
  className: string;
  mediaClassName: string;
  sizes: string;
  priority?: boolean;
  thumbnail?: boolean;
  active?: boolean;
  videoRef?: (node: HTMLVideoElement | null) => void;
};

function PdpGalleryMedia({
  media,
  swatch,
  className,
  mediaClassName,
  sizes,
  priority = false,
  thumbnail = false,
  active = true,
  videoRef,
}: PdpGalleryMediaProps) {
  if (media?.kind === "video" && media.url) {
    return (
      <ProductVideo
        ref={videoRef}
        media={media}
        swatch={swatch}
        className={className}
        videoClassName={mediaClassName}
        aria-label={thumbnail ? undefined : media.alt}
        aria-hidden={thumbnail || undefined}
        controls={!thumbnail && active}
        muted={thumbnail}
        playsInline
        preload={thumbnail ? "none" : "metadata"}
        tabIndex={thumbnail || !active ? -1 : undefined}
        onPlay={(event) => {
          if (!active) event.currentTarget.pause();
        }}
      >
        {thumbnail && (
          <span className="pdp__thumb-play" aria-hidden="true">
            ▶
          </span>
        )}
      </ProductVideo>
    );
  }

  return (
    <ProductImage
      media={media}
      swatch={swatch}
      className={className}
      imageClassName={mediaClassName}
      imageAlt={thumbnail ? "" : undefined}
      sizes={sizes}
      priority={priority}
    />
  );
}

export function PdpGalleryIsland({
  productKey,
  detailMedia,
  items,
  presentation = "default",
}: PdpGalleryIslandProps) {
  const mobile = usePdpMobilePresentation(presentation);
  const galleryKey = `${productKey}:${items.map((item) => item.id).join("|")}`;
  const {
    activeIndex: activePanel,
    direction,
    isTransitioning,
    select,
  } = usePdpSlideTransition({
    initialIndex: 0,
    itemCount: items.length,
    resetKey: galleryKey,
  });
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const thumbnailRefs = useRef(new Map<number, HTMLButtonElement>());
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeItem = items[activePanel] ?? items[0];

  useEffect(() => {
    const videos = videoRefs.current;
    for (const video of videos.values()) video.pause();
    return () => {
      for (const video of videos.values()) video.pause();
    };
  }, [galleryKey]);

  function selectPanel(index: number) {
    if (index === activePanel || index < 0 || index >= items.length) return;
    const activeVideo = activeItem
      ? videoRefs.current.get(activeItem.id)
      : undefined;
    activeVideo?.pause();
    select(index);
  }

  function selectFromPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!mobile && event.pointerType !== "touch") selectPanel(index);
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!mobile || items.length < 2 || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (
      target !== viewportRef.current &&
      !(target instanceof HTMLButtonElement)
    ) return;
    const next = {
      ArrowLeft: activePanel - 1,
      ArrowRight: activePanel + 1,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const bounded = Math.max(0, Math.min(next, items.length - 1));
    selectPanel(bounded);
    thumbnailRefs.current.get(bounded)?.focus({ preventScroll: true });
  }

  const {
    dragging,
    finishDrag,
    handleClickCapture,
    handlePointerDown,
    handlePointerMove,
    resetDrag,
  } = useHorizontalCarouselDrag({
    enabled: mobile && items.length > 1,
    canStart: (target) =>
      target instanceof Element &&
      !target.closest("button, a, input, select, textarea, video, [role='slider']"),
    getRenderedDelta: (delta) => {
      const atEdge =
        (activePanel === 0 && delta > 0) ||
        (activePanel === items.length - 1 && delta < 0);
      const limit = atEdge ? 24 : (trackRef.current?.clientWidth ?? 0);
      return Math.max(-limit, Math.min(delta, limit));
    },
    onDrag: (delta) =>
      trackRef.current?.style.setProperty("--pdp-gallery-drag-x", `${delta}px`),
    onFinish: ({ committed, deltaX }) => {
      trackRef.current?.style.setProperty("--pdp-gallery-drag-x", "0px");
      if (committed) selectPanel(activePanel + (deltaX < 0 ? 1 : -1));
    },
  });

  useEffect(() => {
    resetDrag();
    trackRef.current?.style.setProperty("--pdp-gallery-drag-x", "0px");
    if (
      mobile && items.length === 1 &&
      document.activeElement === thumbnailRefs.current.get(0)
    ) {
      viewportRef.current?.focus({ preventScroll: true });
    }
  }, [galleryKey, items.length, mobile, resetDrag]);

  return (
    <div
      className="pdp__gallery"
      data-pdp-gallery-presentation={presentation}
      data-pdp-gallery-multiple={items.length > 1}
      onKeyDown={selectFromKeyboard}
    >
      <div
        className="pdp__media-frame"
        data-direction={direction}
        data-pdp-main-media
        data-pdp-slide-transitioning={isTransitioning}
        data-slide-direction={direction}
        data-transition-duration={PDP_SLIDE_DURATION_MS}
        style={PDP_SLIDE_STYLE}
      >
        <div
          ref={viewportRef}
          className="pdp__media-viewport"
          role={presentation === "mobile-pilot" ? "group" : undefined}
          aria-label={presentation === "mobile-pilot" ? "Product gallery" : undefined}
          tabIndex={presentation === "mobile-pilot" ? -1 : undefined}
          data-pdp-slide-viewport
          data-dragging={dragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={(event) => finishDrag(event, true)}
          onClickCapture={handleClickCapture}
          onDragStart={(event) => {
            if (mobile) event.preventDefault();
          }}
        >
          {mobile && items.length === 0 && (
            <p className="pdp__gallery-unavailable" role="status">
              Product images are not available yet.
            </p>
          )}
          <div
            ref={trackRef}
            className="pdp__media-track"
            data-pdp-gallery-track
            style={{
              transform: mobile && items.length > 1
                ? `translate3d(calc(${-activePanel * 100}% - ${activePanel * 4}px + ${activePanel === items.length - 1 ? 20 : 0}px + var(--pdp-gallery-drag-x, 0px)), 0, 0)`
                : `translate3d(${-activePanel * 100}%, 0, 0)`,
            }}
          >
            {items.map((item, index) => {
              const active = index === activePanel;
              const media = item.media ?? detailMedia;

              return (
                <div
                  key={`${productKey}:${item.id}`}
                  className="pdp__media pdp__media-slide"
                  aria-hidden={!active}
                  data-media-kind={media?.kind ?? "placeholder"}
                  data-pdp-gallery-slide
                  data-pdp-gallery-state={index + 1}
                  data-pdp-product-shot={index === 0}
                  data-state={active ? "active" : "inactive"}
                  inert={!active}
                >
                  <PdpGalleryMedia
                    media={media}
                    swatch={item.swatch}
                    className="pdp__media-content"
                    mediaClassName="pdp__img"
                    sizes="(max-width: 860px) 92vw, 56vw"
                    priority={index === 0}
                    active={!mobile || active}
                    videoRef={(node) => {
                      if (node) videoRefs.current.set(item.id, node);
                      else videoRefs.current.delete(item.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="pdp__thumbs"
          role="group"
          aria-label="Product media views"
          data-pdp-media-rail
          hidden={mobile && items.length < 2}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                if (node) thumbnailRefs.current.set(index, node);
                else thumbnailRefs.current.delete(index);
              }}
              type="button"
              className="pdp__thumb"
              aria-pressed={index === activePanel}
              aria-label={`View ${item.description}, media ${index + 1} of ${items.length}`}
              data-pdp-media-thumbnail
              onClick={() => selectPanel(index)}
              onPointerEnter={(event) => selectFromPointer(event, index)}
            >
              {!mobile && (
                <PdpGalleryMedia
                  media={item.media}
                  swatch={item.swatch}
                  className="pdp__thumb-image"
                  mediaClassName="pdp__thumb-img"
                  sizes="64px"
                  priority={index === 0}
                  thumbnail
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
