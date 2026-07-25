// Catalog domain types and shared formatting helpers.
//
// The catalog data itself lives in Supabase (see lib/catalog.ts and the
// "catalog"/"seed_catalog" migrations) — there is no static product list here.

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

/** Availability state driving badges and the buy/waitlist CTA. */
export type ProductStatus = "available" | "coming_soon" | "sold_out";

export type CatalogStatus = "active" | "draft" | "archived";

export type CommerceRoutineGroup = "core" | "beyond_core";

export type ProductMediaRole =
  | "card"
  | "hero"
  | "gallery"
  | "detail"
  | "campaign"
  | "card_default"
  | "card_hover"
  | "cart"
  | "search"
  | "routine_video"
  | "routine_video_poster"
  | "profile_editorial"
  | "ingredients_texture"
  | "core_routine_texture";

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

export type CoreRoutineProduct = {
  id: string;
  slug: string;
  displayName: string;
  formalTitle: string;
  productType: string;
  routineStepNumber: number;
  routineStepName: string;
  routineSort: number;
  swatch: [string, string];
  textureMedia: ProductMedia;
};

export type Product = {
  id: string;
  slug: string;
  /** Short storefront display name, e.g. CLEANSE. */
  displayName: string;
  /** Formal catalog title, e.g. CLEANSE 01 Calming Gel Cleanser. */
  formalTitle: string;
  name: string;
  tagline: string;
  cardTagline: string;
  collection: string;
  actionName: string | null;
  routineNumber: string | null;
  routineGroup?: CommerceRoutineGroup | null;
  routineGroupLabel?: string | null;
  routineStepNumber?: number | null;
  routineStepName?: string | null;
  routineDisplayLabel?: string | null;
  routineSort?: number | null;
  legacyRoutineGroupLabel?: string | null;
  legacyRoutineDisplayLabel?: string | null;
  subtitle: string | null;
  descriptor: string | null;
  productType: string | null;
  badge: string | null;
  currency: "USD";
  featuredRank: number | null;
  sortOrder: number;
  /** Short marketing blurb shown on cards. */
  blurb: string;
  /** Longer description shown on the detail page. */
  description: string;
  editorialDescription: string;
  /** Key benefits / "what it does" bullets. */
  benefits: string[];
  /** How-to-use guidance. */
  howToUse: string;
  editorialHowToUse: string;
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
  productDetails: Record<string, string>;
  cautions: string[];
  finish: string | null;
  volume: string | null;
  skinTypes: string[];
  concerns: string[];
  routineStep: string | null;
  routineOrder: number | null;
  usageTime: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  searchKeywords: string[];
  /** ISO timestamp; used for the "Newest first" sort. */
  createdAt: string;
};

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
