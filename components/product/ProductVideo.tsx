"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
} from "react";
import {
  ProductMediaUnavailableStatus,
  ProductPlaceholder,
  useProductMediaLoadFailure,
} from "@/components/product/ProductImage";
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
    const available = media.kind === "video" && Boolean(media.url);
    const { failed, markFailed } = useProductMediaLoadFailure(
      available ? media.url : null,
    );
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
              markFailed();
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
          <ProductMediaUnavailableStatus description={media.alt} />
        )}
      </span>
    );
  },
);
