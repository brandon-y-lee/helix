import type { Database } from "@/lib/database.types";
import type { AdminCapability } from "@/lib/admin/capabilities";
import type {
  PdpIngredientCard,
  PdpIngredientStory,
  PdpProfileTitleToken,
} from "@/lib/catalog/product-content";
import type { RealProductMediaVerificationReport } from "@/lib/catalog/real-product-media-verification";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductVariantRow =
  Database["public"]["Tables"]["product_variants"]["Row"];
type ProductMediaRow =
  Database["public"]["Tables"]["product_media"]["Row"];
type ProductPdpContentRow =
  Database["public"]["Tables"]["product_pdp_content"]["Row"];
type ProductRelationshipRow =
  Database["public"]["Tables"]["product_relationships"]["Row"];
type ProductSourceRow =
  Database["public"]["Tables"]["product_sources"]["Row"];
type ProductDraftRow =
  Database["public"]["Tables"]["product_content_drafts"]["Row"];
type ProductRevisionRow =
  Database["public"]["Tables"]["catalog_product_revisions"]["Row"];
type CatalogAuditRow =
  Database["public"]["Tables"]["catalog_editor_audit_log"]["Row"];

export const PRODUCT_EDITOR_SCHEMA_VERSION = 3 as const;

type DraftMediaUpload = {
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

export type CatalogProductFields = ProductRow;

export type CatalogProductPdpContentFields = Omit<
  ProductPdpContentRow,
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

export type CatalogProductVariant = ProductVariantRow;

export type CatalogProductMedia = ProductMediaRow & {
  pendingUpload?: DraftMediaUpload;
};

export type CatalogProductRelationship = ProductRelationshipRow;
export type CatalogProductSource = ProductSourceRow;

export type ProductEditorDocumentV3 = {
  schemaVersion: typeof PRODUCT_EDITOR_SCHEMA_VERSION;
  productId: string;
  product: CatalogProductFields;
  productPdpContent: CatalogProductPdpContentFields | null;
  variants: CatalogProductVariant[];
  media: CatalogProductMedia[];
  relationships: CatalogProductRelationship[];
  productSource: CatalogProductSource | null;
};

type CatalogDraftStatus =
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
  document: ProductEditorDocumentV3;
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

type CatalogChangedTables = {
  products: boolean;
  productPdpContent: boolean;
  variants: boolean;
  media: boolean;
  relationships: boolean;
  productSource: boolean;
};

export type CatalogPublishTransactionSuccess = {
  ok: true;
  draft: CatalogDraftRecord;
  revision: CatalogRevisionRecord;
  changedTables: CatalogChangedTables;
};

export type CatalogPublishMediaVerification =
  | Readonly<{
      status: "healthy";
      report: RealProductMediaVerificationReport;
    }>
  | Readonly<{
      status: "warning";
      report: RealProductMediaVerificationReport | null;
      message: string;
    }>;

export type CatalogPublishSuccess = CatalogPublishTransactionSuccess & {
  mediaVerification: CatalogPublishMediaVerification;
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
  canonical: ProductEditorDocumentV3;
  draft: CatalogDraftRecord | null;
  latestRevision: number;
  role: "admin" | "catalog_publisher" | "catalog_editor";
  permissions: Partial<Record<AdminCapability, boolean>>;
  relationshipTargets: Array<{
    id: string;
    displayName: string;
    slug: string;
  }>;
  systemMetadata: {
    drafts: ProductDraftRow[];
    revisions: ProductRevisionRow[];
    audit: CatalogAuditRow[];
  };
};
