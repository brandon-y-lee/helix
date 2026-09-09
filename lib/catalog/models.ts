import type {
  CommerceRoutineGroup,
  ProductMedia,
  ProductStatus,
} from "@/lib/products";
import type { ProductPdpContent } from "@/lib/catalog/product-content";
import type { SystemStepName } from "@/lib/catalog/system-steps";

export const CORE_ROUTINE_PRODUCT_SLUGS = [
  "biotic-reset",
  "maxxing-serum",
  "ceramide-cushion",
] as const;

export type OfferAvailability = {
  productId: string;
  productSlug: string;
  productStatus: ProductStatus;
  id: string;
  label: string;
  price: number;
  available: boolean;
  inventoryStatus: "in_stock" | "low_stock" | "out_of_stock" | "unavailable";
  volume: string | null;
  packCount: number | null;
  sortOrder: number;
};

export type ProductOffer = {
  id: string;
  slug: string;
  currency: "USD";
  status: ProductStatus;
  variants: OfferAvailability[];
};

export type ProductFamilyMembership = {
  productId: string;
  slug: string;
  displayName: string;
  optionLabel: string;
  status: ProductStatus;
  sortOrder: number;
  isEntry: boolean;
  isCurrent: boolean;
};

export type ProductFamily = {
  id: string;
  slug: string;
  displayName: string;
  systemStepName: SystemStepName;
  memberships: ProductFamilyMembership[];
};

export type ProductFamilyCardMembership = {
  familyId: string;
  isEntry: boolean;
};

export type ProductCardContent = {
  id: string;
  slug: string;
  displayName: string;
  productType: string;
  volume: string | null;
  usageTime: string[];
  routineGroup: CommerceRoutineGroup;
  systemStepName: SystemStepName;
  systemStepPosition: number;
  routineSort: number;
  sortOrder: number;
  createdAt: string;
  swatch: [string, string];
  cardMedia: ProductMedia | null;
  cardHoverMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
  productFamily: ProductFamilyCardMembership | null;
};

export type ProductCard = ProductCardContent &
  Pick<ProductOffer, "status" | "variants">;

export type PdpProductContent = {
  id: string;
  slug: string;
  displayName: string;
  routineGroup: CommerceRoutineGroup;
  systemStepName: SystemStepName;
  systemStepPosition: number;
  routineSort: number;
  productType: string;
  description: string;
  howToUse: string;
  swatch: [string, string];
  media: ProductMedia[];
  cardMedia: ProductMedia | null;
  detailMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
  madeFor: string | null;
  goodFor: string | null;
  texture: string | null;
  keyIngredients: string[];
  ingredients: string | null;
  cautions: string[];
  finish: string | null;
  volume: string | null;
  skinTypes: string[];
  usageTime: string[];
  pdpContent: ProductPdpContent | null;
  productFamily: ProductFamily | null;
};

export type PdpProduct = PdpProductContent &
  Pick<ProductOffer, "currency" | "status" | "variants">;

export type CoreRoutineContentSummary = {
  id: string;
  slug: string;
  displayName: string;
  productType: string;
  description: string;
  benefits: string[];
  goodFor: string | null;
  texture: string | null;
  finish: string | null;
  keyIngredients: string[];
  routineGroup: "core";
  systemStepName: Extract<SystemStepName, "CLEANSE" | "TREAT" | "SEAL">;
  systemStepPosition: 1 | 3 | 5;
  routineSort: number;
  swatch: [string, string];
  textureMedia: ProductMedia;
  editorialMedia: ProductMedia | null;
  cardMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
  pdpContent: ProductPdpContent | null;
};

export type CoreRoutineSummary = CoreRoutineContentSummary &
  Pick<ProductOffer, "status" | "variants">;

export type ProductMetadata = {
  slug: string;
  displayName: string;
  productType: string;
  editorialDescription: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type ProductRoute = {
  slug: string;
};

export type ProductSlugResolution = {
  sourceSlug: string;
  targetSlug: string;
  targetProductId: string;
  routeKind: "canonical" | "rename" | "replacement";
};

export type IngredientIndexProduct = {
  slug: string;
  displayName: string;
  keyIngredients: string[];
  ingredients: string | null;
  formulaNotes: string[];
};
