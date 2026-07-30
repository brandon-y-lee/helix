import type { Database, Json } from "@/lib/database.types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductVariantRow =
  Database["public"]["Tables"]["product_variants"]["Row"];
type ProductMediaRow =
  Database["public"]["Tables"]["product_media"]["Row"];
type ProductPdpContentRow =
  Database["public"]["Tables"]["product_pdp_content"]["Row"];
type ProductRelationshipRow =
  Database["public"]["Tables"]["product_relationships"]["Row"];

export const PRODUCT_EDITOR_SCHEMA_VERSION = 1 as const;

export type EditableProductFields = Omit<
  ProductRow,
  "id" | "created_at" | "updated_at" | "published_at"
>;

export type EditableProductPdpContentFields = Omit<
  ProductPdpContentRow,
  "product_id" | "created_at" | "updated_at"
>;

export type EditableProductVariant = Omit<
  ProductVariantRow,
  "product_id" | "updated_at" | "archived_at"
>;

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
  "product_id" | "created_at" | "updated_at" | "archived_at"
> & {
  pendingUpload?: DraftMediaUpload;
};

export type EditableProductRelationship = Omit<
  ProductRelationshipRow,
  "product_id" | "created_at" | "archived_at"
>;

export type ProductEditorDocumentV1 = {
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
  document: ProductEditorDocumentV1;
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
  document: ProductEditorDocumentV1;
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
  activeDraft: {
    id: string;
    status: CatalogDraftStatus;
    version: number;
    updatedAt: string;
    updatedBy: string;
  } | null;
  latestRevision: number;
};

export type CatalogAuditMetadata = Record<string, Json | undefined>;
