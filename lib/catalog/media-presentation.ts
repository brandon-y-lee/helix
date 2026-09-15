import type { ProductMedia } from "@/lib/products";

type ProductPresentationMedia = {
  cardMedia: ProductMedia | null;
  cardHoverMedia: ProductMedia | null;
  detailMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
};

export function resolveProductPresentationMedia(
  media: readonly ProductMedia[],
): ProductPresentationMedia {
  const presentationMedia = media.filter(
    (item) =>
      item.kind !== "video" &&
      [
        "card_default",
        "card",
        "card_hover",
        "detail",
        "hero",
        "cart",
      ].includes(item.role),
  );
  const cardMedia =
    presentationMedia.find((item) => item.role === "card_default") ??
    presentationMedia.find((item) => item.role === "card") ??
    presentationMedia.find((item) => item.role === "detail") ??
    presentationMedia.find((item) => item.role === "hero") ??
    null;
  const cardHoverMedia =
    presentationMedia.find((item) => item.role === "card_hover") ??
    cardMedia;
  const detailMedia =
    presentationMedia.find((item) => item.role === "detail") ??
    presentationMedia.find((item) => item.role === "hero") ??
    cardMedia;

  return {
    cardMedia,
    cardHoverMedia,
    detailMedia,
    cartMedia:
      presentationMedia.find((item) => item.role === "cart") ?? cardMedia,
  };
}
