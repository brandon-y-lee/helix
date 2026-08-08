"use client";

import Image from "next/image";
import {
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ProductMedia } from "@/lib/products";

function swatchFromMedia(
  media: ProductMedia | null | undefined,
  fallback: [string, string],
): [string, string] {
  if (media?.kind === "placeholder" && media.palette) {
    return [media.palette.start, media.palette.end];
  }
  return fallback;
}

export function ProductPlaceholder({
  colors,
  palette,
  className,
  style,
}: {
  colors: [string, string];
  palette?: ProductMedia["palette"];
  className?: string;
  style?: CSSProperties;
}) {
  const start = palette?.start ?? colors[0];
  const end = palette?.end ?? colors[1];
  const accent = palette?.accent ?? colors[1];
  const highlight = palette?.highlight ?? colors[0];

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        background: [
          `radial-gradient(circle at 22% 18%, ${highlight} 0%, transparent 28%)`,
          `radial-gradient(circle at 82% 82%, ${accent} 0%, transparent 32%)`,
          `linear-gradient(150deg, ${start} 0%, ${end} 100%)`,
        ].join(", "),
        ...style,
      }}
    />
  );
}

export function useProductMediaLoadFailure(url: string | null | undefined) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return {
    failed: Boolean(url && failedUrl === url),
    markFailed: () => {
      if (url) setFailedUrl(url);
    },
  };
}

export function ProductMediaUnavailableStatus({
  description,
}: {
  description: string;
}) {
  return (
    <span
      className="sr-only"
      role="status"
      aria-label={`${description} could not be loaded.`}
    >
      {description} could not be loaded.
    </span>
  );
}

type ProductImageProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children" | "className" | "style"
> & {
  media: ProductMedia | null | undefined;
  swatch: [string, string];
  className?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  imageAlt?: string;
  imageDataAttributes?: Record<`data-${string}`, string | number>;
  sizes: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  fallback?: ReactNode;
  style?: CSSProperties;
};

export function ProductImage({
  media,
  swatch,
  className,
  imageClassName,
  imageStyle,
  imageAlt,
  imageDataAttributes,
  sizes,
  priority = false,
  loading,
  fallback,
  style,
  ...wrapperProps
}: ProductImageProps) {
  const placeholderColors = swatchFromMedia(media, swatch);
  const imageUrl = media?.kind === "image" ? media.url : null;
  const { failed, markFailed } = useProductMediaLoadFailure(imageUrl);
  const mediaKind = failed ? "placeholder" : (media?.kind ?? "placeholder");
  const accessibleAlt = imageAlt ?? media?.alt ?? "";

  return (
    <span
      {...wrapperProps}
      className={className}
      style={style}
      data-media-kind={mediaKind}
      data-media-fallback={failed ? "load-error" : undefined}
    >
      {media?.kind === "image" && media.url && !failed ? (
        <Image
          {...imageDataAttributes}
          src={media.url}
          alt={accessibleAlt}
          fill
          sizes={sizes}
          priority={priority}
          loading={loading}
          className={imageClassName}
          style={imageStyle}
          onError={markFailed}
        />
      ) : fallback !== undefined ? (
        fallback
      ) : (
        <ProductPlaceholder
          colors={placeholderColors}
          palette={media?.palette ?? null}
          className={imageClassName}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      {failed && accessibleAlt && (
        <ProductMediaUnavailableStatus description={accessibleAlt} />
      )}
    </span>
  );
}
