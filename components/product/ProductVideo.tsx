"use client";

import {
  forwardRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { ProductPlaceholder } from "@/components/product/ProductImage";
import type { ProductMedia } from "@/lib/products";

type ProductVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "className" | "src"
> & {
  media: ProductMedia;
  swatch: [string, string];
  className?: string;
  videoClassName?: string;
};

export const ProductVideo = forwardRef<HTMLVideoElement, ProductVideoProps>(
  function ProductVideo(
    {
      media,
      swatch,
      className,
      videoClassName,
      children,
      onError,
      ...videoProps
    },
    ref,
  ) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const available = media.kind === "video" && Boolean(media.url);
    const failed = Boolean(available && failedUrl === media.url);
    const ariaHidden = videoProps["aria-hidden"];
    const accessible = ariaHidden !== true && ariaHidden !== "true";

    return (
      <span
        className={className}
        data-media-kind={available && !failed ? "video" : "placeholder"}
        data-media-fallback={failed ? "load-error" : undefined}
      >
        {available && media.url && !failed ? (
          <video
            {...videoProps}
            ref={ref}
            src={media.url}
            className={videoClassName}
            onError={(event) => {
              onError?.(event);
              setFailedUrl(media.url);
            }}
          />
        ) : (
          <ProductPlaceholder
            colors={swatch}
            className={videoClassName}
            style={{ position: "absolute", inset: 0 }}
          />
        )}
        {children}
        {failed && accessible && media.alt && (
          <span
            className="sr-only"
            role="status"
            aria-label={`${media.alt} is temporarily unavailable.`}
          >
            {media.alt} is temporarily unavailable.
          </span>
        )}
      </span>
    );
  },
);
