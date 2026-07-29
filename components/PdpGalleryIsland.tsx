"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductImage } from "@/components/ProductImage";
import type { ProductMedia } from "@/lib/products";

export type PdpGalleryItem = {
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
};

function PdpGalleryMedia({
  media,
  swatch,
  className,
  mediaClassName,
  sizes,
  priority = false,
  thumbnail = false,
}: PdpGalleryMediaProps) {
  if (media?.kind === "video" && media.url) {
    return (
      <span className={className} data-media-kind="video">
        <video
          src={media.url}
          className={mediaClassName}
          aria-label={thumbnail ? undefined : media.alt}
          aria-hidden={thumbnail || undefined}
          controls={!thumbnail}
          muted={thumbnail}
          playsInline
          preload={thumbnail ? "none" : "metadata"}
          tabIndex={thumbnail ? -1 : undefined}
        />
        {thumbnail && (
          <span className="pdp__thumb-play" aria-hidden="true">
            ▶
          </span>
        )}
      </span>
    );
  }

  return (
    <ProductImage
      media={media}
      swatch={swatch}
      className={className}
      imageClassName={mediaClassName}
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
  const [activePanel, setActivePanel] = useState(0);
  const activeItem = items[activePanel] ?? items[0];
  const activeMedia = activeItem?.media ?? detailMedia;

  useEffect(() => {
    setActivePanel(0);
  }, [productKey]);

  function selectFromPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.pointerType !== "touch") setActivePanel(index);
  }

  return (
    <div className="pdp__gallery">
      <div className="pdp__media-frame" data-pdp-main-media>
        {activeItem && (
          <PdpGalleryMedia
            key={`${productKey}:${activeItem.id}`}
            media={activeMedia}
            swatch={activeItem.swatch}
            className="pdp__media"
            mediaClassName="pdp__img"
            sizes="(max-width: 860px) 92vw, 56vw"
            priority
          />
        )}
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
              onClick={() => setActivePanel(index)}
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
