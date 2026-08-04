import type { CartAddInput } from "@/lib/cart/types";
import type { ProductMedia } from "@/lib/products";

export type CartMediaSnapshot = Pick<
  CartAddInput,
  "imageUrl" | "imageAlt" | "placeholderMedia"
>;

/**
 * Captures the project-controlled product media stored with a cart line.
 * Keeping this projection shared prevents product cards and PDP purchase
 * surfaces from producing different immutable order-facing snapshots.
 */
export function cartMediaSnapshot(
  media: ProductMedia | null | undefined,
): CartMediaSnapshot {
  return {
    imageUrl: media?.kind === "image" ? media.url : null,
    imageAlt: media?.alt ?? null,
    placeholderMedia:
      media?.kind === "placeholder" && media.palette
        ? {
            kind: "placeholder",
            alt: media.alt,
            paletteId: media.paletteId,
            palette: media.palette,
          }
        : null,
  };
}
