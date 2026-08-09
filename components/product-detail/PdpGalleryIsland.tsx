"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import { ProductVideo } from "@/components/product/ProductVideo";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_STYLE,
  usePdpSlideTransition,
} from "@/components/product-detail/usePdpSlideTransition";
import type { ProductMedia } from "@/lib/products";

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
};

type PdpGalleryMediaProps = {
  media: ProductMedia | null | undefined;
  swatch: [string, string];
  className: string;
  mediaClassName: string;
  sizes: string;
  priority?: boolean;
  thumbnail?: boolean;
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
        controls={!thumbnail}
        muted={thumbnail}
        playsInline
        preload={thumbnail ? "none" : "metadata"}
        tabIndex={thumbnail ? -1 : undefined}
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
}: PdpGalleryIslandProps) {
  const {
    activeIndex: activePanel,
    direction,
    isTransitioning,
    select,
  } = usePdpSlideTransition({
    initialIndex: 0,
    itemCount: items.length,
    resetKey: `${productKey}:${items.map((item) => item.id).join("|")}`,
  });
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const activeItem = items[activePanel] ?? items[0];

  useEffect(() => {
    const videos = videoRefs.current;
    for (const video of videos.values()) video.pause();
    return () => {
      for (const video of videos.values()) video.pause();
    };
  }, [productKey]);

  function selectPanel(index: number) {
    if (index === activePanel) return;
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
    if (event.pointerType !== "touch") selectPanel(index);
  }

  return (
    <div className="pdp__gallery">
      <div
        className="pdp__media-frame"
        data-direction={direction}
        data-pdp-main-media
        data-pdp-slide-transitioning={isTransitioning}
        data-slide-direction={direction}
        data-transition-duration={PDP_SLIDE_DURATION_MS}
        style={PDP_SLIDE_STYLE}
      >
        <div className="pdp__media-viewport" data-pdp-slide-viewport>
          <div
            className="pdp__media-track"
            data-pdp-gallery-track
            style={{
              transform: `translate3d(${-activePanel * 100}%, 0, 0)`,
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
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="pdp__thumb"
              aria-pressed={index === activePanel}
              aria-label={`View ${item.description}, media ${index + 1} of ${items.length}`}
              data-pdp-media-thumbnail
              onClick={() => selectPanel(index)}
              onPointerEnter={(event) => selectFromPointer(event, index)}
            >
              <PdpGalleryMedia
                media={item.media}
                swatch={item.swatch}
                className="pdp__thumb-image"
                mediaClassName="pdp__thumb-img"
                sizes="64px"
                priority={index === 0}
                thumbnail
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
