import Image from "next/image";
import type { CSSProperties } from "react";
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

function ProductPlaceholder({
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
    <div
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

export function ProductImage({
  media,
  swatch,
  className,
  imageClassName,
  sizes,
  priority = false,
}: {
  media: ProductMedia | null | undefined;
  swatch: [string, string];
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
}) {
  const placeholderColors = swatchFromMedia(media, swatch);

  return (
    <span className={className} data-media-kind={media?.kind ?? "placeholder"}>
      {media?.kind === "image" && media.url ? (
        <Image
          src={media.url}
          alt={media.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={imageClassName}
        />
      ) : (
        <ProductPlaceholder
          colors={placeholderColors}
          palette={media?.palette ?? null}
          className={imageClassName}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
    </span>
  );
}
