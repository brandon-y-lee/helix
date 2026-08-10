// Catalog domain types and shared formatting helpers.
//
// The catalog data itself lives in Supabase (see lib/catalog.ts and the
// "catalog"/"seed_catalog" migrations) — there is no static product list here.

import type { ProductPdpContent } from "@/lib/catalog/product-content";
import type { ProductMediaRole } from "@/lib/catalog/media-roles";
import type { SystemStepName } from "@/lib/catalog/system-steps";

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

/** Availability state driving badges and purchase controls. */
export type ProductStatus = "available" | "coming_soon" | "sold_out";

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

export type Product = {
  id: string;
  slug: string;
  /** Short authored storefront Product Display Name. */
  displayName: string;
  productType: string;
  routineGroup: CommerceRoutineGroup;
  systemStepName: SystemStepName | null;
  systemStepPosition: number | null;
  routineSort: number;
  badge: string | null;
  currency: "USD";
  sortOrder: number;
  /** Longer description shown on the detail page. */
  description: string;
  /** Key benefits / "what it does" bullets. */
  benefits: string[];
  /** How-to-use guidance. */
  howToUse: string;
  formulaNotes: string[];
  variants: Variant[];
  /** Decorative gradient stops used in place of product photography. */
  swatch: [string, string];
  media: ProductMedia[];
  cardMedia: ProductMedia | null;
  cardHoverMedia: ProductMedia | null;
  heroMedia: ProductMedia | null;
  detailMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
  searchMedia: ProductMedia | null;
  /** Availability state. */
  status: ProductStatus;
  catalogStatus: CatalogStatus;
  /** Non-claim placeholder metadata for the PDP "made for / good for / texture" grid. */
  madeFor: string | null;
  goodFor: string | null;
  texture: string | null;
  keyIngredients: string[];
  ingredients: string | null;
  cautions: string[];
  finish: string | null;
  volume: string | null;
  skinTypes: string[];
  concerns: string[];
  usageTime: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  searchKeywords: string[];
  /** Validated product-specific PDP editorial content from Supabase. */
  pdpContent?: ProductPdpContent | null;
  /** ISO timestamp; used for the "Newest first" sort. */
  createdAt: string;
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

export function productUnavailableCtaLabel(status: ProductStatus): string {
  return status === "coming_soon" ? "COMING SOON" : OUT_OF_STOCK_CTA_LABEL;
}

type PurchaseOffer = {
  available: boolean;
  inventoryStatus: Variant["inventoryStatus"];
  price: number;
};

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
  const purchasable = isVariantPurchasable(product, variant);
  return {
    label: purchasable
      ? formatBuyLabel(product.displayName, variant.price)
      : productUnavailableCtaLabel(product.status),
    purchasable,
    variant: variant ?? null,
  };
}
