import type { PdpGalleryIslandProps } from "@/components/PdpGalleryIsland";
import type { PdpPurchaseAccordionsProps } from "@/components/PdpPurchaseAccordions";
import type {
  PdpPurchaseIslandProps,
  PdpPurchaseVariant,
} from "@/components/PdpPurchaseIsland";
import type { PdpCoreDetailsItem } from "@/components/PdpCoreDetailsRoutine";
import type { CartAddInput } from "@/components/CartProvider";
import type { ProductPdpContent } from "@/lib/catalog/product-content";
import type {
  PdpProduct,
} from "@/lib/catalog/models";
import type { CartPlaceholderMedia } from "@/lib/cart/types";
import {
  corePdpStepForProduct,
  type CorePdpPresentation,
} from "@/lib/content/core-pdp";
import { PDP_CORE_DETAILS_PRESENTATIONS } from "@/lib/content/pdp-core-details";
import {
  firstPurchasableVariant,
  productPurchaseCta,
  type ProductMedia,
  type ProductStatus,
} from "@/lib/products";

type CoreDetailsSource = {
  benefits: string[];
  cardMedia: ProductMedia | null;
  cardTagline: string;
  cartMedia: ProductMedia | null;
  description: string;
  displayName: string;
  finish: string | null;
  goodFor: string | null;
  keyIngredients: string[];
  pdpContent?: ProductPdpContent | null;
  productType: string | null;
  routineGroup?: "core" | "beyond_core" | null;
  routineStepName?: string | null;
  slug: string;
  status: ProductStatus;
  swatch: [string, string];
  texture: string | null;
  variants: CoreDetailsOffer[];
};

type CoreDetailsOffer = {
  available: boolean;
  id: string;
  inventoryStatus: "in_stock" | "low_stock" | "out_of_stock" | "unavailable";
  label: string;
  price: number;
};

function fallbackGalleryPanels(
  swatch: [string, string],
): Array<[string, string]> {
  const [a, b] = swatch;
  return [
    [a, b],
    [b, a],
    [a, a],
    [b, b],
  ];
}

function galleryRoleRank(role: ProductMedia["role"]) {
  if (role === "detail" || role === "hero") return 0;
  if (role === "gallery") return 1;
  if (role === "card_default" || role === "card") return 2;
  return 3;
}

function normalizedMediaUrl(url: string) {
  try {
    const base = "https://mei-pelle.invalid";
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

function fallbackGalleryIdentity(productName: string, sortOrder: number) {
  return `placeholder:${productName}:${sortOrder}`;
}

function selectGalleryMedia(media: ProductMedia[]) {
  const identities = new Set<string>();

  return media
    .filter((item) =>
      ["detail", "gallery", "hero", "card_default"].includes(item.role),
    )
    .slice()
    .sort(
      (a, b) =>
        galleryRoleRank(a.role) - galleryRoleRank(b.role) ||
        a.sortOrder - b.sortOrder,
    )
    .filter((item) => {
      const identity = galleryMediaIdentity(item);
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
}

function cartPlaceholderMedia(
  media: ProductMedia | null | undefined,
): CartPlaceholderMedia {
  if (media?.kind !== "placeholder" || !media.palette) return null;
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.paletteId,
    palette: media.palette,
  };
}

function cartImageUrl(media: ProductMedia | null | undefined) {
  return media?.kind === "image" ? media.url : null;
}

function cartItemFor(
  product: Pick<
    CoreDetailsSource,
    "cardMedia" | "cartMedia" | "displayName" | "slug" | "swatch"
  >,
  variant: CoreDetailsOffer,
): CartAddInput {
  const media = product.cartMedia ?? product.cardMedia;
  return {
    slug: product.slug,
    name: product.displayName,
    variantId: variant.id,
    variantLabel: variant.label,
    price: variant.price,
    swatch: product.swatch,
    imageUrl: cartImageUrl(media),
    imageAlt: media?.alt ?? null,
    placeholderMedia: cartPlaceholderMedia(media),
  };
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
  const fallbackPanels = fallbackGalleryPanels(product.swatch);
  const gallery = selectGalleryMedia(product.media);
  const items = (
    gallery.length
      ? gallery.map((media, index) => ({
          id: `${galleryMediaIdentity(media)}:${index}`,
          description:
            media.alt.trim() || `${product.displayName} product hue`,
          media,
          swatch: fallbackPanels[index % fallbackPanels.length],
        }))
      : fallbackPanels.map((swatch, index) => ({
          id: fallbackGalleryIdentity(product.displayName, index),
          description: `${product.displayName} product hue`,
          media: null,
          swatch,
        }))
  );

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
): PdpPurchaseData {
  const media = product.cartMedia ?? product.cardMedia;
  const variants: PdpPurchaseVariant[] = product.variants.map((variant) => {
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
      imageUrl: cartImageUrl(media),
      imageAlt: media?.alt ?? null,
      placeholderMedia: cartPlaceholderMedia(media),
    },
    currency: product.currency,
    productKey: product.slug,
    productName: product.displayName,
    productType: product.productType,
    routineLabel,
    stickyMedia: media,
    stripePublishableKey,
    variants,
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

export function coreDetailsIslandItems(
  products: CoreDetailsSource[],
): PdpCoreDetailsItem[] {
  return PDP_CORE_DETAILS_PRESENTATIONS.flatMap((presentation) => {
    const product = products.find(
      (candidate) =>
        corePdpStepForProduct(candidate) === presentation.step &&
        Boolean(candidate.pdpContent?.routineGuidance),
    );
    if (!product) return [];

    const variant =
      firstPurchasableVariant(product) ?? product.variants[0] ?? null;
    const cta = productPurchaseCta(product, variant);
    return [
      {
        slug: product.slug,
        displayName: product.displayName,
        productType: product.productType,
        benefits: product.benefits,
        goodFor: product.goodFor,
        cardTagline: product.cardTagline,
        finish: product.finish,
        texture: product.texture,
        description: product.description,
        keyIngredients: product.keyIngredients,
        presentation: {
          step: presentation.step,
          routineFit: product.pdpContent!.routineGuidance!,
          placeholder: presentation.placeholder,
        },
        purchase: {
          label: cta.label,
          purchasable: cta.purchasable,
          item: variant ? cartItemFor(product, variant) : null,
        },
      },
    ];
  });
}
