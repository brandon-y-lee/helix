import type { ProductPdpContent } from "@/lib/catalog/product-content";
import type {
  CommerceRoutineGroup,
  PlaceholderPalette,
  ProductMediaRole,
  ProductStatus,
} from "@/lib/products";

export const PRODUCT_EDITOR_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type ProductEditorProductV1 = {
  slug: string;
  name?: string | null;
  displayName?: string | null;
  formalTitle?: string | null;
  tagline?: string | null;
  cardTagline?: string | null;
  collection?: string | null;
  routineNumber?: string | null;
  routineGroup?: CommerceRoutineGroup | null;
  routineGroupLabel?: string | null;
  routineStepNumber?: number | null;
  routineStepName?: string | null;
  routineDisplayLabel?: string | null;
  productType?: string | null;
  description?: string | null;
  editorialDescription?: string | null;
  howToUse?: string | null;
  editorialHowToUse?: string | null;
  swatch?: [string, string] | null;
  madeFor?: string | null;
  goodFor?: string | null;
  texture?: string | null;
  benefits?: string[] | null;
  keyIngredients?: string[] | null;
  ingredients?: string | null;
  productDetails?: Record<string, string> | null;
  cautions?: string[] | null;
  finish?: string | null;
  volume?: string | null;
  skinTypes?: string[] | null;
  usageTime?: string[] | null;
  status?: ProductStatus | null;
};

export type ProductEditorVariantV1 = {
  id: string;
  label: string;
  price: number;
  available: boolean;
  inventoryStatus: "in_stock" | "low_stock" | "out_of_stock" | "unavailable";
  volume?: string | null;
  packCount?: number | null;
  sortOrder: number;
};

export type ProductEditorMediaV1 = {
  kind: "image" | "video" | "placeholder";
  url: string | null;
  alt: string;
  width?: number | null;
  height?: number | null;
  role: ProductMediaRole;
  sortOrder: number;
  paletteId?: string | null;
  palette?: PlaceholderPalette | null;
};

export type ProductEditorRelationshipV1 = {
  type: string;
  productId: string;
  sortOrder?: number | null;
};

export type ProductEditorDocumentV1 = {
  schemaVersion: typeof PRODUCT_EDITOR_DOCUMENT_SCHEMA_VERSION;
  productId: string;
  product: ProductEditorProductV1;
  productPdpContent: ProductPdpContent | null;
  variants: ProductEditorVariantV1[];
  media: ProductEditorMediaV1[];
  relationships: ProductEditorRelationshipV1[];
};

export type CatalogDraftStatus = "draft" | "discarded" | "published";

export type CatalogDraftPreviewRecord = {
  draftId: string;
  status: CatalogDraftStatus;
  version: number;
  lastSavedAt: string;
  editorPath: string;
  publishedSlug: string | null;
  document: unknown;
};
