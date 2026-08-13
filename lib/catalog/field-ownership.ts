import type { Database } from "@/lib/database.types";
import { SYSTEM_STEP_NAMES } from "@/lib/catalog/system-steps";
import { PRODUCT_SLUG_MAX_LENGTH } from "@/lib/catalog/product-slug";
import { PRODUCT_STATUSES } from "@/lib/products";

type CatalogFieldOwner =
  | "supplier"
  | "editorial"
  | "commerce"
  | "system"
  | "derived";

export type CatalogEditorRole =
  | "catalog_editor"
  | "catalog_publisher"
  | "admin";
type CatalogWriterBehavior = "write" | "insert-only" | "preserve" | "never";
type CatalogInputKind =
  | "boolean"
  | "color"
  | "date-time"
  | "json"
  | "money"
  | "number"
  | "select"
  | "string-list"
  | "text"
  | "textarea"
  | "uuid";

export type CatalogEditorTable =
  | "products"
  | "product_families"
  | "product_family_memberships"
  | "product_pdp_content"
  | "product_variants"
  | "product_media"
  | "product_relationships"
  | "product_sources"
  | "product_content_drafts"
  | "catalog_product_revisions"
  | "catalog_editor_audit_log"
  | "product_slug_routes"
  | "algolia_products"
  | "next_data_cache";

type TableRows = {
  products: Database["public"]["Tables"]["products"]["Row"];
  product_families: Database["public"]["Tables"]["product_families"]["Row"];
  product_family_memberships: Database["public"]["Tables"]["product_family_memberships"]["Row"];
  product_pdp_content: Database["public"]["Tables"]["product_pdp_content"]["Row"];
  product_variants: Database["public"]["Tables"]["product_variants"]["Row"];
  product_media: Database["public"]["Tables"]["product_media"]["Row"];
  product_relationships: Database["public"]["Tables"]["product_relationships"]["Row"];
  product_sources: Database["public"]["Tables"]["product_sources"]["Row"];
  product_content_drafts: Database["public"]["Tables"]["product_content_drafts"]["Row"];
  catalog_product_revisions: Database["public"]["Tables"]["catalog_product_revisions"]["Row"];
  catalog_editor_audit_log: Database["public"]["Tables"]["catalog_editor_audit_log"]["Row"];
  product_slug_routes: Database["public"]["Tables"]["product_slug_routes"]["Row"];
};

export type CatalogFieldOwnership = {
  table: CatalogEditorTable;
  field: string;
  label: string;
  description: string;
  owner: CatalogFieldOwner;
  inputKind: CatalogInputKind;
  nullable: boolean;
  visible: boolean;
  options?: readonly string[];
  validation?: string;
  previewRelevant: boolean;
  publishMapping: string | null;
  diffFormat: "boolean" | "currency" | "date-time" | "json" | "text";
  disruptive?: boolean;
  importWarning?: string;
  readOnlyReason?: string;
  supplierImport: {
    default: CatalogWriterBehavior;
    overwriteEditorial: CatalogWriterBehavior;
  };
  editor: {
    editable: boolean;
    editableBy: readonly CatalogEditorRole[];
    readOnlySource: boolean;
    derived: boolean;
    commerceSensitive: boolean;
    requiresPublishCapability: boolean;
  };
};

type FieldEntry<T extends keyof TableRows> = {
  field: Extract<keyof TableRows[T], string>;
  inputKind: CatalogInputKind;
  nullable?: boolean;
  label?: string;
  description?: string;
  options?: readonly string[];
  validation?: string;
  previewRelevant?: boolean;
  diffFormat?: CatalogFieldOwnership["diffFormat"];
  disruptive?: boolean;
  importWarning?: string;
  readOnlyReason?: string;
};

const NORMAL_ROLES = ["catalog_editor", "catalog_publisher", "admin"] as const;
const ADMIN_ROLE = ["admin"] as const;
const NO_ROLES = [] as const;

const IMPORT_BEHAVIOR: Record<
  CatalogFieldOwner,
  CatalogFieldOwnership["supplierImport"]
> = {
  supplier: { default: "write", overwriteEditorial: "write" },
  editorial: { default: "preserve", overwriteEditorial: "write" },
  commerce: { default: "write", overwriteEditorial: "write" },
  system: { default: "insert-only", overwriteEditorial: "insert-only" },
  derived: { default: "never", overwriteEditorial: "never" },
};

function humanize(field: string) {
  const label = field.replaceAll("_", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function fields<T extends keyof TableRows>(
  table: T,
  owner: CatalogFieldOwner,
  editableBy: readonly CatalogEditorRole[],
  entries: readonly FieldEntry<T>[],
): CatalogFieldOwnership[] {
  return entries.map((entry) => ({
    table,
    field: entry.field,
    label: entry.label ?? humanize(entry.field),
    description:
      entry.description ??
      (owner === "supplier"
        ? "Supplier-owned fact. A future supplier import may replace this value."
        : owner === "commerce"
          ? "Commerce-sensitive value used by product availability and checkout."
          : owner === "system"
            ? "Operational catalog metadata."
            : "Canonical editorial value used by the storefront."),
    owner,
    inputKind: entry.inputKind,
    nullable: entry.nullable ?? false,
    visible: true,
    options: entry.options,
    validation: entry.validation,
    previewRelevant: entry.previewRelevant ?? false,
    publishMapping: `${table}.${entry.field}`,
    diffFormat:
      entry.diffFormat ??
      (entry.inputKind === "money"
        ? "currency"
        : entry.inputKind === "boolean"
          ? "boolean"
          : entry.inputKind === "date-time"
            ? "date-time"
            : entry.inputKind === "json" || entry.inputKind === "string-list"
              ? "json"
              : "text"),
    disruptive: entry.disruptive,
    importWarning: entry.importWarning,
    readOnlyReason: entry.readOnlyReason,
    supplierImport: IMPORT_BEHAVIOR[owner],
    editor: {
      editable: editableBy.length > 0,
      editableBy,
      readOnlySource: owner === "supplier" && editableBy.length === 0,
      derived: owner === "derived",
      commerceSensitive: owner === "commerce",
      requiresPublishCapability: editableBy.length > 0,
    },
  }));
}

const IMMUTABLE_IDENTITY = "Database identity is immutable.";
const IMMUTABLE_TIMESTAMP = "Database-managed timestamp is read only.";
const IMPORT_WARNING = "A future supplier import may overwrite this field.";

export const CATALOG_FIELD_OWNERSHIP: readonly CatalogFieldOwnership[] = [
  ...fields("products", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "published_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("products", "editorial", NORMAL_ROLES, [
    { field: "display_name", inputKind: "text", previewRelevant: true },
    { field: "product_type", inputKind: "text", previewRelevant: true },
    { field: "editorial_description", inputKind: "textarea", previewRelevant: true },
    { field: "editorial_how_to_use", inputKind: "textarea", previewRelevant: true },
    { field: "benefits", inputKind: "string-list", previewRelevant: true },
    { field: "made_for", inputKind: "text", nullable: true, previewRelevant: true },
    { field: "good_for", inputKind: "text", nullable: true, previewRelevant: true },
    { field: "badge", inputKind: "text", nullable: true, previewRelevant: true },
    { field: "formula_notes", inputKind: "string-list", previewRelevant: true },
    { field: "search_keywords", inputKind: "string-list" },
    { field: "seo_title", inputKind: "text", nullable: true, validation: "Maximum 70 characters." },
    { field: "seo_description", inputKind: "textarea", nullable: true, validation: "Maximum 400 characters." },
  ]),
  ...fields("products", "supplier", ADMIN_ROLE, [
    { field: "texture", inputKind: "text", nullable: true, previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "key_ingredients", inputKind: "string-list", previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "ingredients", inputKind: "textarea", nullable: true, previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "cautions", inputKind: "string-list", previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "finish", inputKind: "text", nullable: true, previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "volume", inputKind: "text", nullable: true, previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "skin_types", inputKind: "string-list", previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "concerns", inputKind: "string-list", previewRelevant: true, importWarning: IMPORT_WARNING },
    { field: "usage_time", inputKind: "string-list", previewRelevant: true, importWarning: IMPORT_WARNING },
  ]),
  ...fields("products", "commerce", NO_ROLES, [
    {
      field: "currency",
      inputKind: "select",
      options: ["USD"],
      previewRelevant: true,
      readOnlyReason: "The cart, Stripe checkout, orders, Afterpay, and database constraints support USD only.",
    },
  ]),
  ...fields("products", "commerce", ADMIN_ROLE, [
    { field: "status", inputKind: "select", options: PRODUCT_STATUSES, previewRelevant: true },
  ]),
  ...fields("products", "system", ADMIN_ROLE, [
    {
      field: "slug",
      inputKind: "text",
      validation: `Maximum ${PRODUCT_SLUG_MAX_LENGTH} characters.`,
      previewRelevant: true,
      disruptive: true,
      importWarning:
        "A permanent redirect will be created: the old public URL will permanently redirect to the new Product URL.",
    },
    { field: "catalog_status", inputKind: "select", options: ["draft", "active", "archived"], previewRelevant: true, disruptive: true },
    { field: "sort_order", inputKind: "number" },
    { field: "routine_group", inputKind: "select", options: ["core", "beyond_core"], previewRelevant: true, disruptive: true },
    {
      field: "system_step_name",
      inputKind: "select",
      nullable: true,
      options: SYSTEM_STEP_NAMES,
      previewRelevant: true,
      disruptive: true,
    },
    { field: "routine_sort", inputKind: "number", previewRelevant: true },
    { field: "swatch_from", inputKind: "color", previewRelevant: true },
    { field: "swatch_to", inputKind: "color", previewRelevant: true },
  ]),

  ...fields("product_slug_routes", "system", NO_ROLES, [
    {
      field: "source_slug",
      inputKind: "text",
      readOnlyReason: "Historical Product URL route records cannot be changed or deleted.",
    },
    {
      field: "source_product_id",
      inputKind: "uuid",
      readOnlyReason: IMMUTABLE_IDENTITY,
    },
    {
      field: "target_product_id",
      inputKind: "uuid",
      readOnlyReason: "Redirect targets can only change through the controlled replacement workflow.",
    },
    {
      field: "route_kind",
      inputKind: "select",
      options: ["canonical", "rename", "replacement"],
      readOnlyReason: "Route provenance is immutable history.",
    },
    {
      field: "created_at",
      inputKind: "date-time",
      readOnlyReason: IMMUTABLE_TIMESTAMP,
    },
  ]),

  ...fields("product_families", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("product_families", "system", ADMIN_ROLE, [
    { field: "slug", inputKind: "text", disruptive: true },
    { field: "display_name", inputKind: "text", previewRelevant: true },
    {
      field: "system_step_name",
      inputKind: "select",
      options: SYSTEM_STEP_NAMES,
      disruptive: true,
      previewRelevant: true,
    },
  ]),
  ...fields("product_family_memberships", "system", NO_ROLES, [
    { field: "family_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("product_family_memberships", "system", ADMIN_ROLE, [
    { field: "product_id", inputKind: "uuid", disruptive: true },
    { field: "option_label", inputKind: "text", previewRelevant: true },
    { field: "sort_order", inputKind: "number", previewRelevant: true },
    { field: "is_entry", inputKind: "boolean", disruptive: true, previewRelevant: true },
  ]),

  ...fields("product_pdp_content", "system", NO_ROLES, [
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "schema_version", inputKind: "number", readOnlyReason: "PDP schema version is application-managed." },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("product_pdp_content", "editorial", NORMAL_ROLES, [
    { field: "profile_title_tokens", inputKind: "json", nullable: true, previewRelevant: true },
    { field: "routine_overlay", inputKind: "textarea", nullable: true, previewRelevant: true },
    { field: "outcome_heading", inputKind: "textarea", nullable: true, previewRelevant: true },
    { field: "outcome_labels", inputKind: "string-list", nullable: true, previewRelevant: true },
    { field: "how_to_use_steps", inputKind: "string-list", nullable: true, previewRelevant: true },
    { field: "application_steps", inputKind: "string-list", nullable: true, previewRelevant: true },
    { field: "ingredient_cards", inputKind: "json", nullable: true, previewRelevant: true },
    { field: "ingredient_story", inputKind: "json", nullable: true, previewRelevant: true },
    { field: "routine_guidance", inputKind: "textarea", nullable: true, previewRelevant: true },
  ]),

  ...fields("product_variants", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "archived_at", inputKind: "date-time", nullable: true, readOnlyReason: "Set atomically by the archive or restore action." },
  ]),
  ...fields("product_variants", "commerce", ADMIN_ROLE, [
    { field: "variant_key", inputKind: "text" },
    { field: "label", inputKind: "text", previewRelevant: true },
    {
      field: "price_cents",
      inputKind: "money",
      label: "Price (USD)",
      previewRelevant: true,
    },
    {
      field: "compare_at_price_cents",
      inputKind: "money",
      label: "Compare-at price (USD)",
      nullable: true,
      previewRelevant: true,
    },
    { field: "sku", inputKind: "text", nullable: true },
    { field: "available", inputKind: "boolean", previewRelevant: true },
    { field: "inventory_status", inputKind: "select", options: ["in_stock", "low_stock", "out_of_stock", "unavailable"], previewRelevant: true },
    { field: "option_values", inputKind: "json", previewRelevant: true },
    { field: "volume", inputKind: "text", nullable: true, previewRelevant: true },
    { field: "pack_count", inputKind: "number", nullable: true, previewRelevant: true },
    { field: "sort_order", inputKind: "number", previewRelevant: true },
  ]),
  ...fields("product_variants", "supplier", ADMIN_ROLE, [
    { field: "supplier_variant_id", inputKind: "text", nullable: true, importWarning: IMPORT_WARNING },
  ]),

  ...fields("product_media", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "archived_at", inputKind: "date-time", nullable: true, readOnlyReason: "Set atomically when the media association is removed or restored." },
    { field: "media_type", inputKind: "select", options: ["image", "video"], readOnlyReason: "Derived from the validated uploaded object." },
    { field: "url", inputKind: "text", nullable: true, previewRelevant: true, readOnlyReason: "Assigned by the protected media upload boundary." },
    { field: "width", inputKind: "number", nullable: true, readOnlyReason: "Measured from the uploaded media." },
    { field: "height", inputKind: "number", nullable: true, readOnlyReason: "Measured from the uploaded media." },
    { field: "source_filename", inputKind: "text", nullable: true, readOnlyReason: "Captured from the immutable uploaded object." },
  ]),
  ...fields("product_media", "editorial", NORMAL_ROLES, [
    { field: "variant_id", inputKind: "uuid", nullable: true, previewRelevant: true },
    { field: "alt", inputKind: "text", previewRelevant: true },
    { field: "role", inputKind: "select", previewRelevant: true },
    { field: "sort_order", inputKind: "number", previewRelevant: true },
    { field: "palette_id", inputKind: "text", nullable: true, previewRelevant: true },
    { field: "placeholder_palette", inputKind: "json", previewRelevant: true },
  ]),
  ...fields("product_media", "supplier", ADMIN_ROLE, [
    { field: "original_source_url", inputKind: "text", nullable: true, importWarning: IMPORT_WARNING },
  ]),

  ...fields("product_relationships", "system", NO_ROLES, [
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "archived_at", inputKind: "date-time", nullable: true, readOnlyReason: "Set atomically by the remove or restore action." },
  ]),
  ...fields("product_relationships", "editorial", NORMAL_ROLES, [
    { field: "related_product_id", inputKind: "uuid", previewRelevant: true },
    { field: "relationship_type", inputKind: "select", options: ["complete_the_routine", "related", "routine_next"], previewRelevant: true },
    { field: "sort_order", inputKind: "number", previewRelevant: true },
  ]),

  ...fields("product_sources", "system", NO_ROLES, [
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("product_sources", "supplier", ADMIN_ROLE, [
    { field: "supplier_title", inputKind: "text", importWarning: IMPORT_WARNING },
    { field: "supplier_url", inputKind: "text", importWarning: IMPORT_WARNING },
    {
      field: "original_source_price_cents",
      inputKind: "money",
      label: "Original source price (USD)",
      nullable: true,
      importWarning: IMPORT_WARNING,
    },
    { field: "formulation_version_notes", inputKind: "textarea", nullable: true, importWarning: IMPORT_WARNING },
  ]),
  ...fields("product_sources", "supplier", NO_ROLES, [
    { field: "supplier", inputKind: "text", readOnlyReason: "Canonical writer identity used by reconciliation." },
    { field: "supplier_handle", inputKind: "text", readOnlyReason: "Provider handle used by reconciliation." },
    { field: "supplier_product_id", inputKind: "text", nullable: true, readOnlyReason: "Provider-generated identifier used by reconciliation." },
    { field: "source_inspected_at", inputKind: "date-time", readOnlyReason: "Recorded by the supplier inspection writer." },
    { field: "source_content_hash", inputKind: "text", nullable: true, readOnlyReason: "Content hash is cryptographic reconciliation metadata." },
    { field: "raw_source", inputKind: "json", readOnlyReason: "Raw supplier snapshot is immutable provenance." },
  ]),

  ...fields("product_content_drafts", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "schema_version", inputKind: "number", readOnlyReason: "Editor contract version is application-managed." },
    { field: "base_revision", inputKind: "number", readOnlyReason: "Optimistic publication boundary." },
    { field: "version", inputKind: "number", readOnlyReason: "Optimistic save boundary." },
    { field: "document", inputKind: "json", readOnlyReason: "Displayed for auditability; edit through typed fields above." },
    { field: "status", inputKind: "text", readOnlyReason: "Changed only by workflow actions." },
    { field: "validation_errors", inputKind: "json", readOnlyReason: "Produced by server validation." },
    { field: "created_by", inputKind: "uuid", readOnlyReason: "Security ownership metadata." },
    { field: "updated_by", inputKind: "uuid", readOnlyReason: "Security ownership metadata." },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "updated_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "ready_at", inputKind: "date-time", nullable: true, readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "published_at", inputKind: "date-time", nullable: true, readOnlyReason: IMMUTABLE_TIMESTAMP },
    { field: "discarded_at", inputKind: "date-time", nullable: true, readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("catalog_product_revisions", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "product_id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "revision_number", inputKind: "number", readOnlyReason: "Immutable revision sequence." },
    { field: "schema_version", inputKind: "number", readOnlyReason: "Historical document contract version." },
    { field: "document", inputKind: "json", readOnlyReason: "Immutable revision snapshot." },
    { field: "source_draft_id", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable revision lineage." },
    { field: "published_by", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable audit actor." },
    { field: "published_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  ...fields("catalog_editor_audit_log", "system", NO_ROLES, [
    { field: "id", inputKind: "uuid", readOnlyReason: IMMUTABLE_IDENTITY },
    { field: "action", inputKind: "text", readOnlyReason: "Append-only audit event." },
    { field: "actor_id", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable audit actor." },
    { field: "product_id", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable audit subject." },
    { field: "draft_id", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable audit lineage." },
    { field: "revision_id", inputKind: "uuid", nullable: true, readOnlyReason: "Immutable audit lineage." },
    { field: "metadata", inputKind: "json", readOnlyReason: "Append-only event metadata." },
    { field: "created_at", inputKind: "date-time", readOnlyReason: IMMUTABLE_TIMESTAMP },
  ]),
  {
    table: "algolia_products",
    field: "*",
    label: "Algolia projection",
    description: "Derived search record, rebuilt from canonical catalog data.",
    owner: "derived",
    inputKind: "json",
    nullable: false,
    visible: false,
    previewRelevant: false,
    publishMapping: null,
    diffFormat: "json",
    readOnlyReason: "Derived data is not part of the editor document.",
    supplierImport: IMPORT_BEHAVIOR.derived,
    editor: { editable: false, editableBy: NO_ROLES, readOnlySource: false, derived: true, commerceSensitive: false, requiresPublishCapability: false },
  },
  {
    table: "next_data_cache",
    field: "*",
    label: "Next.js cache",
    description: "Derived cache entry invalidated from canonical catalog changes.",
    owner: "derived",
    inputKind: "json",
    nullable: false,
    visible: false,
    previewRelevant: false,
    publishMapping: null,
    diffFormat: "json",
    readOnlyReason: "Derived data is not part of the editor document.",
    supplierImport: IMPORT_BEHAVIOR.derived,
    editor: { editable: false, editableBy: NO_ROLES, readOnlySource: false, derived: true, commerceSensitive: false, requiresPublishCapability: false },
  },
] as const;

export function getCatalogFieldOwnership(
  table: string,
  field: string,
): CatalogFieldOwnership | undefined {
  return CATALOG_FIELD_OWNERSHIP.find(
    (entry) => entry.table === table && (entry.field === field || entry.field === "*"),
  );
}

function getCatalogEditorFieldPolicy(table: string, field: string) {
  return getCatalogFieldOwnership(table, field)?.editor;
}

export function canCatalogRoleEditField(
  role: CatalogEditorRole,
  table: string,
  field: string,
) {
  return getCatalogEditorFieldPolicy(table, field)?.editableBy.includes(role) === true;
}

export function catalogFieldsForTable(table: CatalogEditorTable) {
  return CATALOG_FIELD_OWNERSHIP.filter(
    (entry) => entry.table === table && entry.visible,
  );
}
