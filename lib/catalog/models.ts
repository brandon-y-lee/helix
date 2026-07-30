import type {
  CommerceRoutineGroup,
  ProductMedia,
  ProductStatus,
} from "@/lib/products";
import type { ProductPdpContent } from "@/lib/catalog/product-content";

export const CORE_ROUTINE_PRODUCT_SLUGS = [
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
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

export type ProductCardContent = {
  id: string;
  slug: string;
  displayName: string;
  cardTagline: string;
  productType: string;
  volume: string | null;
  usageTime: string[];
  routineGroup: CommerceRoutineGroup;
  routineStepNumber: number | null;
  routineSort: number;
  sortOrder: number;
  createdAt: string;
  swatch: [string, string];
  cardMedia: ProductMedia | null;
  cardHoverMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
};

export type ProductCard = ProductCardContent &
  Pick<ProductOffer, "status" | "variants">;

export type PdpProductContent = {
  id: string;
  slug: string;
  displayName: string;
  cardTagline: string;
  routineGroup: CommerceRoutineGroup;
  routineStepNumber: number | null;
  routineStepName: string | null;
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
};

export type PdpProduct = PdpProductContent &
  Pick<ProductOffer, "currency" | "status" | "variants">;

export type CoreRoutineContentSummary = {
  id: string;
  slug: string;
  displayName: string;
  formalTitle: string;
  productType: string;
  cardTagline: string;
  description: string;
  benefits: string[];
  goodFor: string | null;
  texture: string | null;
  finish: string | null;
  keyIngredients: string[];
  routineGroup: "core";
  routineStepNumber: number;
  routineStepName: string;
  routineSort: number;
  swatch: [string, string];
  textureMedia: ProductMedia;
  cardMedia: ProductMedia | null;
  cartMedia: ProductMedia | null;
  pdpContent: ProductPdpContent | null;
};

export type CoreRoutineSummary = CoreRoutineContentSummary &
  Pick<ProductOffer, "status" | "variants">;

export type ProductMetadata = {
  slug: string;
  formalTitle: string;
  cardTagline: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type ProductRoute = {
  slug: string;
};

export type IngredientIndexProduct = {
  slug: string;
  displayName: string;
  keyIngredients: string[];
  ingredients: string | null;
  formulaNotes: string[];
};
