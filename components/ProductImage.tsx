import Image from "next/image";
import { Swatch } from "@/components/Swatch";
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
        <Swatch
          colors={placeholderColors}
          palette={media?.palette ?? null}
          className={imageClassName}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
    </span>
  );
}
