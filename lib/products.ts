// Catalog domain types and shared formatting helpers.
//
// Catalog data lives in Supabase and is read through purpose-specific
// projections in lib/catalog/storefront.ts. There is no static product list.

import type { ProductMediaRole } from "@/lib/catalog/media-roles";

export type { ProductMediaRole } from "@/lib/catalog/media-roles";

export type Variant = {
  id: string;
  label: string;
  /** Price in whole USD cents. */
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  available: boolean;
  inventoryStatus: "in_stock" | "low_stock" | "out_of_stock" | "unavailable";
  volume: string | null;
  packCount: number | null;
  optionValues: Record<string, string>;
  sortOrder: number;
};

/** Availability states driving badges and purchase controls. */
export const PRODUCT_STATUSES = [
  "available",
  "coming_soon",
  "sold_out",
  "waitlist",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export function isProductStatus(value: unknown): value is ProductStatus {
  return (
    typeof value === "string" &&
    (PRODUCT_STATUSES as readonly string[]).includes(value)
  );
}

export type CatalogStatus = "active" | "draft" | "archived";

export type CommerceRoutineGroup = "core" | "beyond_core";

export type PlaceholderPalette = {
  start: string;
  end: string;
  accent?: string;
  surface?: string;
  ink?: string;
  highlight?: string;
};

export type ProductMedia = {
  kind: "image" | "video" | "placeholder";
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  role: ProductMediaRole;
  sortOrder: number;
  paletteId: string | null;
  palette: PlaceholderPalette | null;
};

export function composeProductTitle(
  displayName: string,
  productType: string,
): string {
  return `${displayName} — ${productType}`;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatBuyLabel(productName: string, cents: number): string {
  return `BUY ${productName} - ${formatPrice(cents)}`;
}

const OUT_OF_STOCK_CTA_LABEL = "OUT OF STOCK";
const COMING_SOON_CTA_LABEL = "COMING SOON";

export function productUnavailableCtaLabel(status: ProductStatus): string {
  return status === "coming_soon"
    ? COMING_SOON_CTA_LABEL
    : OUT_OF_STOCK_CTA_LABEL;
}

type PurchaseOffer = {
  available: boolean;
  inventoryStatus: Variant["inventoryStatus"];
  price: number;
};

type OfferFact = Pick<PurchaseOffer, "inventoryStatus" | "price">;

export function isOfferPresentable<TOffer extends OfferFact>(
  offer: TOffer,
): boolean {
  return (
    Number.isSafeInteger(offer.price) &&
    offer.price >= 0 &&
    offer.inventoryStatus !== "unavailable"
  );
}

export function productOfferPresentation<TOffer extends OfferFact>(
  offers: readonly TOffer[],
) {
  const presentableOffers = offers.filter(isOfferPresentable);
  return {
    offers: presentableOffers,
    hasMultipleOffers: presentableOffers.length > 1,
    showPrice: presentableOffers.length > 0,
    showVariantOptions: presentableOffers.length > 0,
  } as const;
}

type PurchaseProduct<TOffer extends PurchaseOffer> = {
  displayName: string;
  status: ProductStatus;
  variants: readonly TOffer[];
};

export function isVariantPurchasable<TOffer extends PurchaseOffer>(
  product: Pick<PurchaseProduct<TOffer>, "status">,
  variant: TOffer | null | undefined,
): variant is TOffer {
  return Boolean(
    product.status === "available" &&
      variant?.available &&
      variant.inventoryStatus !== "out_of_stock" &&
      variant.inventoryStatus !== "unavailable",
  );
}

export function firstPurchasableVariant<TOffer extends PurchaseOffer>(
  product: PurchaseProduct<TOffer>,
): TOffer | null {
  return (
    product.variants.find((variant) =>
      isVariantPurchasable(product, variant),
    ) ?? null
  );
}

export function productPurchaseCta<TOffer extends PurchaseOffer>(
  product: PurchaseProduct<TOffer>,
  variant: TOffer | null | undefined,
) {
  if (product.status === "waitlist") {
    return {
      label: "Join the waitlist",
      purchasable: false,
      variant: variant ?? null,
    };
  }
  const purchasable = isVariantPurchasable(product, variant);
  return {
    label: purchasable
      ? formatBuyLabel(product.displayName, variant.price)
      : productUnavailableCtaLabel(product.status),
    purchasable,
    variant: variant ?? null,
  };
}
