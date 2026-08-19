import type { PdpGalleryIslandProps } from "@/components/product-detail/PdpGalleryIsland";
import type { PdpPurchaseAccordionsProps } from "@/components/product-detail/PdpPurchaseAccordions";
import type {
  PdpPurchaseIslandProps,
  PdpPurchaseVariant,
} from "@/components/product-detail/PdpPurchaseIsland";
import { cartMediaSnapshot } from "@/lib/cart/media";
import type { ProductPdpContent } from "@/lib/catalog/product-content";
import type { PdpProduct } from "@/lib/catalog/models";
import type { CorePdpPresentation } from "@/lib/content/core-pdp";
import {
  productOfferPresentation,
  productPurchaseCta,
  productUnavailableCtaLabel,
  type ProductMedia,
} from "@/lib/products";

function galleryRoleRank(role: ProductMedia["role"]) {
  if (role === "detail" || role === "hero") return 0;
  if (role === "gallery") return 1;
  if (role === "card_default" || role === "card") return 2;
  return 3;
}

function normalizedMediaUrl(url: string) {
  try {
    const base = "https://helix.invalid";
    const parsed = new URL(url, base);
    const origin = parsed.origin === base ? "" : parsed.origin.toLowerCase();
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return `${origin}${pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
}

function galleryMediaIdentity(media: ProductMedia) {
  if (media.url) {
    return `${media.kind}:${normalizedMediaUrl(media.url)}`;
  }

  const palette = media.palette;
  return [
    media.kind,
    media.paletteId ?? "",
    palette?.start ?? "",
    palette?.end ?? "",
    palette?.accent ?? "",
    palette?.surface ?? "",
    palette?.ink ?? "",
    palette?.highlight ?? "",
  ].join(":");
}

function isCanonicalGalleryMedia(
  media: ProductMedia | null | undefined,
): media is ProductMedia {
  return Boolean(
    media?.url && (media.kind === "image" || media.kind === "video"),
  );
}

function selectGalleryMedia(product: PdpProduct) {
  const identities = new Set<string>();
  const primary = isCanonicalGalleryMedia(product.detailMedia)
    ? product.detailMedia
    : product.media
        .filter(
          (item) =>
            isCanonicalGalleryMedia(item) &&
            ["detail", "hero", "card_default", "card"].includes(item.role),
        )
        .slice()
        .sort(
          (a, b) =>
            galleryRoleRank(a.role) - galleryRoleRank(b.role) ||
            a.sortOrder - b.sortOrder,
        )[0];
  const gallery = product.media
    .filter(
      (item) => item.role === "gallery" && isCanonicalGalleryMedia(item),
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return [primary, ...gallery]
    .filter(isCanonicalGalleryMedia)
    .filter((item) => {
      const identity = galleryMediaIdentity(item);
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
}

function selectRoleMedia(
  media: readonly ProductMedia[],
  role: ProductMedia["role"],
  kind: ProductMedia["kind"],
) {
  return media
    .filter(
      (item) => item.role === role && item.kind === kind && Boolean(item.url),
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function galleryIslandProps(
  product: PdpProduct,
): PdpGalleryIslandProps {
  const gallery = selectGalleryMedia(product);
  const items = gallery.map((media, index) => ({
    id: `${galleryMediaIdentity(media)}:${index}`,
    description: media.alt.trim() || `${product.displayName} product media`,
    media,
    swatch: product.swatch,
  }));

  return {
    productKey: product.slug,
    detailMedia: product.detailMedia,
    items,
  };
}

export type PdpPurchaseData = Omit<
  PdpPurchaseIslandProps,
  "accordions" | "children"
>;

export function purchaseIslandProps(
  product: PdpProduct,
  routineLabel: string,
  stripePublishableKey: string | null,
  commerceDisabled = false,
): PdpPurchaseData {
  const media = product.cartMedia ?? product.cardMedia;
  const offerPresentation = productOfferPresentation(product.variants);
  const presentedVariants = offerPresentation.showVariantOptions
    ? offerPresentation.offers
    : product.variants.slice(0, 1);
  const variants: PdpPurchaseVariant[] = presentedVariants.map((variant) => {
    const cta = productPurchaseCta(product, variant);
    return {
      id: variant.id,
      label: variant.label,
      price: variant.price,
      available: variant.available,
      purchaseLabel: cta.label,
      purchasable: cta.purchasable,
    };
  });

  return {
    cartItem: {
      slug: product.slug,
      name: product.displayName,
      swatch: product.swatch,
      ...cartMediaSnapshot(media),
    },
    currency: product.currency,
    productId: product.id,
    productKey: product.slug,
    productName: product.displayName,
    productType: product.productType,
    productFamily: product.productFamily,
    status: product.status,
    routineLabel,
    stickyMedia: media,
    stripePublishableKey,
    unavailableLabel: productUnavailableCtaLabel(product.status),
    variants,
    showPrice: offerPresentation.showPrice,
    showVariantOptions: offerPresentation.showVariantOptions,
    commerceDisabled,
  };
}

export function purchaseAccordionProps(
  product: PdpProduct,
  content: ProductPdpContent | null,
  steps: string[],
  corePresentation: CorePdpPresentation | null,
): PdpPurchaseAccordionsProps {
  const hasStructuredIngredients = Boolean(
    corePresentation && content?.ingredientStory,
  );
  return {
    ingredientHref: hasStructuredIngredients
      ? `#pdp-ingredients-${product.slug}`
      : "#full-ingredients",
    ingredientLinkLabel: hasStructuredIngredients
      ? "Explore ingredients"
      : "View full ingredients",
    keyIngredients: product.keyIngredients.slice(0, 5),
    productName: product.displayName,
    showCautionNote: product.cautions.length > 0,
    steps,
  };
}

export function outcomeIslandProps(
  product: PdpProduct,
  presentation: CorePdpPresentation,
) {
  return {
    productName: product.displayName,
    heading: presentation.outcomeHeading,
    options: presentation.outcomeOptions,
    media: selectRoleMedia(product.media, "pdp_outcome", "image"),
  };
}

export function applicationIslandProps(
  product: PdpProduct,
  presentation: CorePdpPresentation,
) {
  return {
    productName: product.displayName,
    steps: presentation.applicationSteps,
    media: selectRoleMedia(product.media, "pdp_application", "image"),
  };
}
