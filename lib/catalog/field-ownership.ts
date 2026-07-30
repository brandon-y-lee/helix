export type CatalogFieldOwner =
  | "supplier"
  | "editorial"
  | "commerce"
  | "system"
  | "derived";

export type CatalogWriterBehavior = "write" | "insert-only" | "preserve" | "never";

export type CatalogFieldOwnership = {
  table: string;
  field: string;
  owner: CatalogFieldOwner;
  supplierImport: {
    default: CatalogWriterBehavior;
    overwriteEditorial: CatalogWriterBehavior;
  };
  editor: {
    editable: boolean;
    readOnlySource: boolean;
    derived: boolean;
    commerceSensitive: boolean;
    requiresPublishCapability: boolean;
  };
};

const EDITOR_METADATA: Record<
  CatalogFieldOwner,
  CatalogFieldOwnership["editor"]
> = {
  supplier: {
    editable: false,
    readOnlySource: true,
    derived: false,
    commerceSensitive: false,
    requiresPublishCapability: false,
  },
  editorial: {
    editable: true,
    readOnlySource: false,
    derived: false,
    commerceSensitive: false,
    requiresPublishCapability: true,
  },
  commerce: {
    editable: false,
    readOnlySource: false,
    derived: false,
    commerceSensitive: true,
    requiresPublishCapability: false,
  },
  system: {
    editable: false,
    readOnlySource: false,
    derived: false,
    commerceSensitive: false,
    requiresPublishCapability: false,
  },
  derived: {
    editable: false,
    readOnlySource: false,
    derived: true,
    commerceSensitive: false,
    requiresPublishCapability: false,
  },
};

function fields(
  table: string,
  owner: CatalogFieldOwner,
  fieldNames: readonly string[],
  supplierImport: CatalogFieldOwnership["supplierImport"],
): CatalogFieldOwnership[] {
  return fieldNames.map((field) => ({
    table,
    field,
    owner,
    supplierImport,
    editor: EDITOR_METADATA[owner],
  }));
}

export const PRODUCT_SUPPLIER_FIELDS = [
  "name",
  "tagline",
  "subtitle",
  "descriptor",
  "blurb",
  "description",
  "how_to_use",
  "product_type",
  "texture",
  "key_ingredients",
  "ingredients",
  "product_details",
  "cautions",
  "finish",
  "volume",
  "skin_types",
  "concerns",
  "usage_time",
] as const;

export const PRODUCT_EDITORIAL_FIELDS = [
  "display_name",
  "formal_title",
  "card_tagline",
  "editorial_description",
  "editorial_how_to_use",
  "benefits",
  "made_for",
  "good_for",
  "badge",
  "formula_notes",
  "search_keywords",
  "seo_title",
  "seo_description",
] as const;

export const PRODUCT_COMMERCE_FIELDS = [
  "currency",
  "status",
] as const;

export const PRODUCT_SYSTEM_FIELDS = [
  "id",
  "slug",
  "catalog_status",
  "action_name",
  "collection",
  "position",
  "sort_order",
  "featured_rank",
  "routine_number",
  "routine_step",
  "routine_order",
  "routine_group",
  "routine_group_label",
  "routine_step_number",
  "routine_step_name",
  "routine_display_label",
  "routine_sort",
  "legacy_routine_group_label",
  "legacy_routine_display_label",
  "swatch_from",
  "swatch_to",
  "created_at",
  "published_at",
  "updated_at",
] as const;

export const PRODUCT_PDP_EDITORIAL_FIELDS = [
  "profile_title_tokens",
  "routine_overlay",
  "outcome_heading",
  "outcome_labels",
  "how_to_use_steps",
  "application_steps",
  "ingredient_cards",
  "ingredient_story",
  "routine_guidance",
] as const;

export const CATALOG_FIELD_OWNERSHIP: readonly CatalogFieldOwnership[] = [
  ...fields("products", "supplier", PRODUCT_SUPPLIER_FIELDS, {
    default: "write",
    overwriteEditorial: "write",
  }),
  ...fields("products", "editorial", PRODUCT_EDITORIAL_FIELDS, {
    default: "preserve",
    overwriteEditorial: "write",
  }),
  ...fields("products", "commerce", PRODUCT_COMMERCE_FIELDS, {
    default: "write",
    overwriteEditorial: "write",
  }),
  ...fields("products", "system", PRODUCT_SYSTEM_FIELDS, {
    default: "insert-only",
    overwriteEditorial: "insert-only",
  }),
  ...fields("product_variants", "commerce", [
    "variant_key",
    "label",
    "price_cents",
    "compare_at_price_cents",
    "sku",
    "supplier_variant_id",
    "available",
    "inventory_status",
    "option_values",
    "volume",
    "pack_count",
    "position",
    "sort_order",
  ], {
    default: "write",
    overwriteEditorial: "write",
  }),
  ...fields("product_variants", "system", [
    "id",
    "product_id",
    "updated_at",
  ], {
    default: "insert-only",
    overwriteEditorial: "insert-only",
  }),
  ...fields("product_sources", "supplier", [
    "supplier",
    "supplier_title",
    "supplier_url",
    "supplier_handle",
    "supplier_product_id",
    "source_inspected_at",
    "source_content_hash",
    "original_source_price_cents",
    "formulation_version_notes",
    "raw_source",
  ], {
    default: "write",
    overwriteEditorial: "write",
  }),
  ...fields("product_sources", "system", [
    "product_id",
    "created_at",
    "updated_at",
  ], {
    default: "insert-only",
    overwriteEditorial: "insert-only",
  }),
  ...fields("product_media", "editorial", [
    "product_id",
    "variant_id",
    "media_type",
    "media_kind",
    "url",
    "alt",
    "width",
    "height",
    "role",
    "sort_order",
    "palette_id",
    "placeholder_palette",
  ], {
    default: "insert-only",
    overwriteEditorial: "write",
  }),
  ...fields("product_media", "supplier", [
    "original_source_url",
    "source_filename",
  ], {
    default: "insert-only",
    overwriteEditorial: "write",
  }),
  ...fields("product_media", "system", [
    "id",
    "created_at",
    "updated_at",
  ], {
    default: "insert-only",
    overwriteEditorial: "insert-only",
  }),
  ...fields("product_pdp_content", "editorial", PRODUCT_PDP_EDITORIAL_FIELDS, {
    default: "never",
    overwriteEditorial: "never",
  }),
  ...fields("product_pdp_content", "system", [
    "product_id",
    "schema_version",
    "created_at",
    "updated_at",
  ], {
    default: "never",
    overwriteEditorial: "never",
  }),
  ...fields("product_relationships", "system", [
    "product_id",
    "related_product_id",
    "relationship_type",
    "sort_order",
    "created_at",
  ], {
    default: "preserve",
    overwriteEditorial: "preserve",
  }),
  ...fields("collections", "system", [
    "id",
    "slug",
    "name",
    "description",
    "sort_order",
    "is_active",
    "created_at",
    "updated_at",
  ], {
    default: "preserve",
    overwriteEditorial: "preserve",
  }),
  ...fields("algolia_products", "derived", ["*"], {
    default: "never",
    overwriteEditorial: "never",
  }),
  ...fields("next_data_cache", "derived", ["*"], {
    default: "never",
    overwriteEditorial: "never",
  }),
] as const;

export function getCatalogFieldOwnership(
  table: string,
  field: string,
): CatalogFieldOwnership | undefined {
  return CATALOG_FIELD_OWNERSHIP.find(
    (entry) =>
      entry.table === table && (entry.field === field || entry.field === "*"),
  );
}

export type CatalogPrecedenceResolution<T> = {
  value: T;
  sourceField: string;
  usedFallback: boolean;
};

/**
 * Resolves a canonical editor-owned value before its legacy/source fallback.
 * The returned source metadata makes compatibility fallback use observable to
 * tests and controlled diagnostics without adding production log noise.
 */
export function resolveCatalogPrecedence<T>({
  canonicalField,
  canonicalValue,
  fallbackField,
  fallbackValue,
}: {
  canonicalField: string;
  canonicalValue: T | null | undefined;
  fallbackField: string;
  fallbackValue: T;
}): CatalogPrecedenceResolution<T> {
  if (canonicalValue !== null && canonicalValue !== undefined) {
    return {
      value: canonicalValue,
      sourceField: canonicalField,
      usedFallback: false,
    };
  }

  return {
    value: fallbackValue,
    sourceField: fallbackField,
    usedFallback: true,
  };
}

export function canonicalCatalogValue<T>(
  canonicalField: string,
  canonicalValue: T | null | undefined,
  fallbackField: string,
  fallbackValue: T,
): T {
  return resolveCatalogPrecedence({
    canonicalField,
    canonicalValue,
    fallbackField,
    fallbackValue,
  }).value;
}
