import type { Database, Json } from "@/lib/database.types";
import type { AdminCapability } from "@/lib/admin/capabilities";
import type {
  PdpIngredientCard,
  PdpIngredientStory,
  PdpProfileTitleToken,
} from "@/lib/catalog/product-content";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductVariantRow =
  Database["public"]["Tables"]["product_variants"]["Row"];
type ProductMediaRow =
  Database["public"]["Tables"]["product_media"]["Row"];
type ProductPdpContentRow =
  Database["public"]["Tables"]["product_pdp_content"]["Row"];
type ProductRelationshipRow =
  Database["public"]["Tables"]["product_relationships"]["Row"];

export const PRODUCT_EDITOR_SCHEMA_VERSION = 2 as const;

type EditableProductFieldSelection = Pick<
  ProductRow,
  | "slug"
  | "display_name"
  | "formal_title"
  | "card_tagline"
  | "product_type"
  | "catalog_status"
  | "badge"
  | "currency"
  | "sort_order"
  | "editorial_description"
  | "benefits"
  | "editorial_how_to_use"
  | "formula_notes"
  | "swatch_from"
  | "swatch_to"
  | "status"
  | "made_for"
  | "good_for"
  | "texture"
  | "key_ingredients"
  | "ingredients"
  | "cautions"
  | "finish"
  | "volume"
  | "skin_types"
  | "concerns"
  | "usage_time"
  | "seo_title"
  | "seo_description"
  | "search_keywords"
  | "routine_group"
  | "routine_step_number"
  | "routine_step_name"
  | "routine_sort"
>;

type RequiredEditableProductFields = {
  slug: string;
  display_name: string;
  formal_title: string;
  card_tagline: string;
  product_type: string;
  catalog_status: string;
  currency: string;
  sort_order: number;
  editorial_description: string;
  benefits: string[];
  editorial_how_to_use: string;
  formula_notes: string[];
  swatch_from: string;
  swatch_to: string;
  status: string;
  key_ingredients: string[];
  cautions: string[];
  skin_types: string[];
  concerns: string[];
  usage_time: string[];
  search_keywords: string[];
  routine_group: string;
  routine_sort: number;
};

export type EditableProductFields = Omit<
  EditableProductFieldSelection,
  keyof RequiredEditableProductFields
> &
  RequiredEditableProductFields;

type GeneratedProductPdpContentFields = Omit<
  ProductPdpContentRow,
  "product_id" | "created_at" | "updated_at"
>;

export type EditableProductPdpContentFields = Omit<
  GeneratedProductPdpContentFields,
  | "ingredient_cards"
  | "ingredient_story"
  | "outcome_labels"
  | "profile_title_tokens"
> & {
  ingredient_cards: PdpIngredientCard[] | null;
  ingredient_story: PdpIngredientStory | null;
  outcome_labels: [string, string, string] | null;
  profile_title_tokens: PdpProfileTitleToken[] | null;
};

export type EditableProductVariant = Omit<
  ProductVariantRow,
  | "product_id"
  | "sort_order"
  | "updated_at"
  | "archived_at"
> & {
  sort_order: number;
};

export type DraftMediaUpload = {
  bucket: "mei-pelle-catalog";
  path: string;
  sha256: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4";
  sizeBytes: number;
  uploadedBy: string;
};

export type EditableProductMedia = Omit<
  ProductMediaRow,
  | "product_id"
  | "created_at"
  | "updated_at"
  | "archived_at"
> & {
  pendingUpload?: DraftMediaUpload;
};

export type EditableProductRelationship = Omit<
  ProductRelationshipRow,
  "product_id" | "created_at" | "archived_at"
>;

export type ProductEditorDocumentV2 = {
  schemaVersion: typeof PRODUCT_EDITOR_SCHEMA_VERSION;
  productId: string;
  product: EditableProductFields;
  productPdpContent: EditableProductPdpContentFields | null;
  variants: EditableProductVariant[];
  media: EditableProductMedia[];
  relationships: EditableProductRelationship[];
};

export type CatalogDraftStatus =
  | "draft"
  | "ready"
  | "published"
  | "discarded";

export type CatalogValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type CatalogDraftRecord = {
  id: string;
  product_id: string;
  schema_version: number;
  base_revision: number;
  version: number;
  document: ProductEditorDocumentV2;
  status: CatalogDraftStatus;
  validation_errors: CatalogValidationIssue[];
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  published_at: string | null;
  discarded_at: string | null;
};

export type CatalogRevisionRecord = {
  id: string;
  product_id: string;
  revision_number: number;
  schema_version: number;
  document: unknown;
  source_draft_id: string | null;
  published_by: string | null;
  published_at: string;
};

export type CatalogRpcConflict = {
  ok: false;
  code:
    | "active_draft_exists"
    | "draft_closed"
    | "draft_not_ready"
    | "revision_conflict"
    | "validation_failed"
    | "version_conflict";
  stored?: {
    id?: string;
    version: number;
    status: CatalogDraftStatus;
    updatedAt: string;
    updatedBy: string;
  };
  baseRevision?: number;
  latestRevision?: number;
  validationErrors?: CatalogValidationIssue[];
};

export type CatalogChangedTables = {
  products: boolean;
  productPdpContent: boolean;
  variants: boolean;
  media: boolean;
  relationships: boolean;
};

export type CatalogPublishSuccess = {
  ok: true;
  draft: CatalogDraftRecord;
  revision: CatalogRevisionRecord;
  changedTables: CatalogChangedTables;
};

export type CatalogGridSort =
  | "name_asc"
  | "published_desc"
  | "routine_asc"
  | "updated_desc";

export type CatalogGridCursor = {
  offset: number;
};

export type CatalogGridRow = {
  id: string;
  slug: string;
  displayName: string;
  formalTitle: string;
  catalogStatus: string;
  productStatus: string;
  routineGroup: string | null;
  routineSort: number | null;
  publishedAt: string;
  updatedAt: string;
  primaryMedia: {
    url: string | null;
    alt: string;
  } | null;
  variantCount: number;
  minimumPriceCents: number | null;
  maximumPriceCents: number | null;
  activeDraft: {
    id: string;
    status: CatalogDraftStatus;
    version: number;
    updatedAt: string;
    updatedBy: string;
  } | null;
  latestRevision: number;
};

export type CatalogEditorResponse = {
  canonical: ProductEditorDocumentV2;
  draft: CatalogDraftRecord | null;
  latestRevision: number;
  permissions: Partial<Record<AdminCapability, boolean>>;
};

export type CatalogAuditMetadata = Record<string, Json | undefined>;
