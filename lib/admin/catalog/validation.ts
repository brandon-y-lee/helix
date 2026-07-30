import { normalizeProductPdpContent } from "@/lib/catalog/product-content";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV1,
} from "@/lib/admin/catalog/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const PRODUCT_STATUSES = ["available", "coming_soon", "sold_out"] as const;
const CATALOG_STATUSES = ["active", "archived", "draft"] as const;
const ROUTINE_GROUPS = ["core", "beyond_core"] as const;
const INVENTORY_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
] as const;
const RELATIONSHIP_TYPES = [
  "complete_the_routine",
  "related",
  "routine_next",
] as const;
const MEDIA_TYPES = ["image", "video"] as const;
const MEDIA_KINDS = ["image", "video", "placeholder"] as const;
const MEDIA_ROLES = [
  "card",
  "hero",
  "gallery",
  "detail",
  "campaign",
  "card_default",
  "card_hover",
  "cart",
  "search",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "pdp_outcome",
  "pdp_application",
] as const;
const UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsReviewData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsReviewData);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      ["rating", "ratings", "review", "reviews", "product_reviews"].includes(
        key.toLowerCase(),
      ) || containsReviewData(entry),
  );
}

function issue(
  issues: CatalogValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function isInteger(value: unknown, minimum?: number): value is number {
  return (
    Number.isSafeInteger(value) &&
    (minimum === undefined || (value as number) >= minimum)
  );
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableInteger(value: unknown, minimum?: number): boolean {
  return value === null || isInteger(value, minimum);
}

function isStringRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function oneOf<T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function validateProduct(
  product: RecordValue,
  issues: CatalogValidationIssue[],
): void {
  const requiredText = [
    "blurb",
    "collection",
    "description",
    "how_to_use",
    "name",
    "slug",
    "swatch_from",
    "swatch_to",
    "tagline",
  ] as const;
  for (const field of requiredText) {
    if (typeof product[field] !== "string" || !product[field].trim()) {
      issue(
        issues,
        `product.${field}`,
        "required",
        `${field} must be a non-empty string.`,
      );
    }
  }

  if (typeof product.slug === "string" && !SLUG_PATTERN.test(product.slug)) {
    issue(
      issues,
      "product.slug",
      "invalid_slug",
      "slug must use lowercase letters, numbers, and single hyphens.",
    );
  }

  const requiredArrays = [
    "benefits",
    "cautions",
    "concerns",
    "formula_notes",
    "key_ingredients",
    "search_keywords",
    "skin_types",
    "usage_time",
  ] as const;
  for (const field of requiredArrays) {
    if (!isStringArray(product[field])) {
      issue(
        issues,
        `product.${field}`,
        "invalid_array",
        `${field} must be an array of strings.`,
      );
    }
  }

  const nullableText = [
    "action_name",
    "badge",
    "card_tagline",
    "descriptor",
    "display_name",
    "editorial_description",
    "editorial_how_to_use",
    "finish",
    "formal_title",
    "good_for",
    "ingredients",
    "legacy_routine_display_label",
    "legacy_routine_group_label",
    "made_for",
    "product_type",
    "routine_display_label",
    "routine_group_label",
    "routine_number",
    "routine_step",
    "routine_step_name",
    "seo_description",
    "seo_title",
    "subtitle",
    "texture",
    "volume",
  ] as const;
  for (const field of nullableText) {
    if (!isNullableString(product[field])) {
      issue(
        issues,
        `product.${field}`,
        "invalid_type",
        `${field} must be a string or null.`,
      );
    }
  }

  const nullableIntegers = [
    "featured_rank",
    "routine_order",
    "routine_sort",
    "routine_step_number",
    "sort_order",
  ] as const;
  for (const field of nullableIntegers) {
    if (!isNullableInteger(product[field])) {
      issue(
        issues,
        `product.${field}`,
        "invalid_integer",
        `${field} must be an integer or null.`,
      );
    }
  }

  if (!isInteger(product.position, 0)) {
    issue(
      issues,
      "product.position",
      "invalid_integer",
      "position must be a non-negative integer.",
    );
  }
  if (product.currency !== "USD") {
    issue(
      issues,
      "product.currency",
      "unsupported_currency",
      "Only USD catalog prices are supported.",
    );
  }
  if (!oneOf(product.status, PRODUCT_STATUSES)) {
    issue(
      issues,
      "product.status",
      "invalid_status",
      "Unsupported product availability status.",
    );
  }
  if (!oneOf(product.catalog_status, CATALOG_STATUSES)) {
    issue(
      issues,
      "product.catalog_status",
      "invalid_status",
      "Unsupported catalog publication status.",
    );
  }
  if (
    product.routine_group !== null &&
    !oneOf(product.routine_group, ROUTINE_GROUPS)
  ) {
    issue(
      issues,
      "product.routine_group",
      "invalid_routine_group",
      "Unsupported routine group.",
    );
  }
  if (!isStringRecord(product.product_details)) {
    issue(
      issues,
      "product.product_details",
      "invalid_object",
      "product_details must contain string values.",
    );
  }
  if (
    typeof product.seo_title === "string" &&
    product.seo_title.length > 70
  ) {
    issue(
      issues,
      "product.seo_title",
      "too_long",
      "SEO title must be 70 characters or fewer.",
    );
  }
  if (
    typeof product.seo_description === "string" &&
    product.seo_description.length > 400
  ) {
    issue(
      issues,
      "product.seo_description",
      "too_long",
      "SEO description must be 400 characters or fewer.",
    );
  }

  if (product.routine_group === "core") {
    const name = String(product.display_name ?? product.name).toUpperCase();
    if (!["CLEANSE", "TREAT", "SEAL"].includes(name)) {
      issue(
        issues,
        "product.display_name",
        "invalid_core_product",
        "Core products must be CLEANSE, TREAT, or SEAL.",
      );
    }
    if (!isInteger(product.routine_step_number, 1)) {
      issue(
        issues,
        "product.routine_step_number",
        "invalid_core_step",
        "Core products require a positive routine step number.",
      );
    }
  }
}

function validateVariants(
  variants: unknown[],
  productId: string,
  issues: CatalogValidationIssue[],
): Set<string> {
  const keys = new Set<string>();
  const ids = new Set<string>();
  variants.forEach((entry, index) => {
    const path = `variants.${index}`;
    if (!isRecord(entry)) {
      issue(issues, path, "invalid_type", "Variant must be an object.");
      return;
    }
    if (typeof entry.id !== "string" || !UUID_PATTERN.test(entry.id)) {
      issue(issues, `${path}.id`, "invalid_uuid", "Variant id must be a UUID.");
    } else if (ids.has(entry.id)) {
      issue(issues, `${path}.id`, "duplicate", "Variant ids must be unique.");
    } else {
      ids.add(entry.id);
    }
    if (typeof entry.variant_key !== "string" || !entry.variant_key.trim()) {
      issue(
        issues,
        `${path}.variant_key`,
        "required",
        "Variant key is required.",
      );
    } else if (keys.has(entry.variant_key)) {
      issue(
        issues,
        `${path}.variant_key`,
        "duplicate",
        "Variant keys must be unique per product.",
      );
    } else {
      keys.add(entry.variant_key);
    }
    if (typeof entry.label !== "string" || !entry.label.trim()) {
      issue(issues, `${path}.label`, "required", "Variant label is required.");
    }
    if (!isInteger(entry.price_cents, 0)) {
      issue(
        issues,
        `${path}.price_cents`,
        "invalid_price",
        "Variant price must be whole, non-negative cents.",
      );
    }
    if (!isNullableInteger(entry.compare_at_price_cents, 0)) {
      issue(
        issues,
        `${path}.compare_at_price_cents`,
        "invalid_price",
        "Compare-at price must be null or whole, non-negative cents.",
      );
    }
    if (!isInteger(entry.position, 0) || !isNullableInteger(entry.sort_order, 0)) {
      issue(
        issues,
        path,
        "invalid_order",
        "Variant position and sort order must be non-negative integers.",
      );
    }
    if (
      typeof entry.available !== "boolean" ||
      !oneOf(entry.inventory_status, INVENTORY_STATUSES)
    ) {
      issue(
        issues,
        path,
        "invalid_availability",
        "Variant availability fields are invalid.",
      );
    }
    if (!isStringRecord(entry.option_values)) {
      issue(
        issues,
        `${path}.option_values`,
        "invalid_object",
        "Variant option values must be strings.",
      );
    }
    for (const field of [
      "pack_count",
    ] as const) {
      if (!isNullableInteger(entry[field], 1)) {
        issue(
          issues,
          `${path}.${field}`,
          "invalid_integer",
          `${field} must be null or a positive integer.`,
        );
      }
    }
    for (const field of [
      "sku",
      "supplier_variant_id",
      "volume",
    ] as const) {
      if (!isNullableString(entry[field])) {
        issue(
          issues,
          `${path}.${field}`,
          "invalid_type",
          `${field} must be a string or null.`,
        );
      }
    }
  });

  if (!UUID_PATTERN.test(productId)) {
    issue(issues, "productId", "invalid_uuid", "Product id must be a UUID.");
  }
  return ids;
}

function allowedMediaOrigin(
  value: string,
  env: NodeJS.ProcessEnv,
): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    const allowed = [env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SITE_URL]
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => new URL(entry).origin);
    return allowed.includes(url.origin);
  } catch {
    return false;
  }
}

function validateMedia(
  media: unknown[],
  productSlug: string,
  variantIds: Set<string>,
  issues: CatalogValidationIssue[],
  env: NodeJS.ProcessEnv,
): void {
  const ids = new Set<string>();
  const placements = new Set<string>();
  media.forEach((entry, index) => {
    const path = `media.${index}`;
    if (!isRecord(entry)) {
      issue(issues, path, "invalid_type", "Media item must be an object.");
      return;
    }
    if (typeof entry.id !== "string" || !UUID_PATTERN.test(entry.id)) {
      issue(issues, `${path}.id`, "invalid_uuid", "Media id must be a UUID.");
    } else if (ids.has(entry.id)) {
      issue(issues, `${path}.id`, "duplicate", "Media ids must be unique.");
    } else {
      ids.add(entry.id);
    }
    if (!oneOf(entry.media_type, MEDIA_TYPES)) {
      issue(
        issues,
        `${path}.media_type`,
        "invalid_media_type",
        "Unsupported media type.",
      );
    }
    if (!oneOf(entry.media_kind, MEDIA_KINDS)) {
      issue(
        issues,
        `${path}.media_kind`,
        "invalid_media_kind",
        "Unsupported media kind.",
      );
    }
    if (!oneOf(entry.role, MEDIA_ROLES)) {
      issue(issues, `${path}.role`, "invalid_role", "Unsupported media role.");
    }
    if (!isInteger(entry.sort_order, 0)) {
      issue(
        issues,
        `${path}.sort_order`,
        "invalid_order",
        "Media sort order must be a non-negative integer.",
      );
    } else if (typeof entry.role === "string") {
      const placement = `${entry.role}:${entry.sort_order}`;
      if (placements.has(placement)) {
        issue(
          issues,
          path,
          "duplicate_placement",
          "Media role and sort order must be unique.",
        );
      }
      placements.add(placement);
    }
    if (typeof entry.alt !== "string" || !entry.alt.trim()) {
      issue(issues, `${path}.alt`, "required", "Media alt text is required.");
    }
    if (
      entry.variant_id !== null &&
      (typeof entry.variant_id !== "string" ||
        !variantIds.has(entry.variant_id))
    ) {
      issue(
        issues,
        `${path}.variant_id`,
        "invalid_variant",
        "Media variant must belong to this product document.",
      );
    }
    if (!isNullableInteger(entry.width, 1) || !isNullableInteger(entry.height, 1)) {
      issue(
        issues,
        path,
        "invalid_dimensions",
        "Media dimensions must be null or positive integers.",
      );
    }
    if (
      entry.url !== null &&
      (typeof entry.url !== "string" || !allowedMediaOrigin(entry.url, env))
    ) {
      issue(
        issues,
        `${path}.url`,
        "unsafe_media_origin",
        "Media URL must use a project-controlled origin.",
      );
    }
    if (
      entry.media_kind !== "placeholder" &&
      (typeof entry.url !== "string" || !entry.url)
    ) {
      issue(
        issues,
        `${path}.url`,
        "required",
        "Image and video media require a URL.",
      );
    }
    if (entry.pendingUpload !== undefined) {
      if (!isRecord(entry.pendingUpload)) {
        issue(
          issues,
          `${path}.pendingUpload`,
          "invalid_upload",
          "Pending upload metadata must be an object.",
        );
        return;
      }
      const upload = entry.pendingUpload;
      const mime = upload.mimeType;
      const sha = upload.sha256;
      const extension =
        mime === "image/jpeg"
          ? "jpg"
          : mime === "image/png"
            ? "png"
            : mime === "image/webp"
              ? "webp"
              : mime === "video/mp4"
                ? "mp4"
                : null;
      const expectedPath =
        typeof sha === "string" && extension
          ? `products/${productSlug}/drafts/${sha}.${extension}`
          : null;
      if (
        upload.bucket !== "mei-pelle-catalog" ||
        !oneOf(mime, UPLOAD_MIME_TYPES) ||
        typeof sha !== "string" ||
        !SHA256_PATTERN.test(sha) ||
        !isInteger(upload.sizeBytes, 1) ||
        typeof upload.uploadedBy !== "string" ||
        !UUID_PATTERN.test(upload.uploadedBy) ||
        upload.path !== expectedPath
      ) {
        issue(
          issues,
          `${path}.pendingUpload`,
          "invalid_upload",
          "Pending upload metadata is not internally consistent.",
        );
      }
    }
  });
}

function validateRelationships(
  relationships: unknown[],
  productId: string,
  issues: CatalogValidationIssue[],
): void {
  const identities = new Set<string>();
  relationships.forEach((entry, index) => {
    const path = `relationships.${index}`;
    if (!isRecord(entry)) {
      issue(issues, path, "invalid_type", "Relationship must be an object.");
      return;
    }
    if (
      typeof entry.related_product_id !== "string" ||
      !UUID_PATTERN.test(entry.related_product_id) ||
      entry.related_product_id === productId
    ) {
      issue(
        issues,
        `${path}.related_product_id`,
        "invalid_product",
        "Related product must be a different product UUID.",
      );
    }
    if (!oneOf(entry.relationship_type, RELATIONSHIP_TYPES)) {
      issue(
        issues,
        `${path}.relationship_type`,
        "invalid_relationship",
        "Unsupported relationship type.",
      );
    }
    if (!isInteger(entry.sort_order, 0)) {
      issue(
        issues,
        `${path}.sort_order`,
        "invalid_order",
        "Relationship sort order must be a non-negative integer.",
      );
    }
    const identity = `${entry.related_product_id}:${entry.relationship_type}`;
    if (identities.has(identity)) {
      issue(
        issues,
        path,
        "duplicate",
        "Product relationships must be unique.",
      );
    }
    identities.add(identity);
  });
}

export function validateProductEditorDocument(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): {
  document: ProductEditorDocumentV1 | null;
  issues: CatalogValidationIssue[];
} {
  const issues: CatalogValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      document: null,
      issues: [
        {
          path: "",
          code: "invalid_type",
          message: "Product editor document must be an object.",
        },
      ],
    };
  }
  if (containsReviewData(input)) {
    issue(
      issues,
      "",
      "review_data_forbidden",
      "Reviews and ratings are not part of the product editor document.",
    );
  }
  if (input.schemaVersion !== 1) {
    issue(
      issues,
      "schemaVersion",
      "unsupported_schema",
      "Only product editor schema version 1 is supported.",
    );
  }
  if (typeof input.productId !== "string" || !UUID_PATTERN.test(input.productId)) {
    issue(issues, "productId", "invalid_uuid", "Product id must be a UUID.");
  }
  if (!isRecord(input.product)) {
    issue(issues, "product", "invalid_type", "Product fields must be an object.");
  } else {
    validateProduct(input.product, issues);
  }
  if (!Array.isArray(input.variants)) {
    issue(issues, "variants", "invalid_type", "Variants must be an array.");
  }
  if (!Array.isArray(input.media)) {
    issue(issues, "media", "invalid_type", "Media must be an array.");
  }
  if (!Array.isArray(input.relationships)) {
    issue(
      issues,
      "relationships",
      "invalid_type",
      "Relationships must be an array.",
    );
  }

  const productId =
    typeof input.productId === "string" ? input.productId : "";
  const variantIds = Array.isArray(input.variants)
    ? validateVariants(input.variants, productId, issues)
    : new Set<string>();
  const productSlug =
    isRecord(input.product) && typeof input.product.slug === "string"
      ? input.product.slug
      : "";
  if (Array.isArray(input.media)) {
    validateMedia(input.media, productSlug, variantIds, issues, env);
  }
  if (Array.isArray(input.relationships)) {
    validateRelationships(input.relationships, productId, issues);
  }

  if (input.productPdpContent !== null) {
    if (!isRecord(input.productPdpContent)) {
      issue(
        issues,
        "productPdpContent",
        "invalid_type",
        "PDP content must be an object or null.",
      );
    } else {
      try {
        normalizeProductPdpContent(
          input.productPdpContent as Parameters<
            typeof normalizeProductPdpContent
          >[0],
          productSlug || "catalog-product",
        );
      } catch (error) {
        issue(
          issues,
          "productPdpContent",
          "invalid_pdp_content",
          error instanceof Error
            ? error.message
            : "PDP content has an unsupported shape.",
        );
      }
    }
  }

  return {
    document: issues.length === 0 ? (input as ProductEditorDocumentV1) : null,
    issues,
  };
}

export function assertProductEditorDocumentStructure(
  input: unknown,
): ProductEditorDocumentV1 {
  const issues: CatalogValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new CatalogAdminError(
      "invalid_document",
      "The product editor document must be an object.",
      422,
    );
  }
  if (input.schemaVersion !== 1) {
    issue(
      issues,
      "schemaVersion",
      "unsupported_schema",
      "Only product editor schema version 1 is supported.",
    );
  }
  if (typeof input.productId !== "string" || !UUID_PATTERN.test(input.productId)) {
    issue(issues, "productId", "invalid_uuid", "Product id must be a UUID.");
  }
  if (!isRecord(input.product)) {
    issue(issues, "product", "invalid_type", "Product fields must be an object.");
  }
  if (
    input.productPdpContent !== null &&
    !isRecord(input.productPdpContent)
  ) {
    issue(
      issues,
      "productPdpContent",
      "invalid_type",
      "PDP content must be an object or null.",
    );
  }
  for (const field of ["variants", "media", "relationships"] as const) {
    if (!Array.isArray(input[field])) {
      issue(
        issues,
        field,
        "invalid_type",
        `${field} must be an array.`,
      );
    }
  }
  if (containsReviewData(input)) {
    issue(
      issues,
      "",
      "review_data_forbidden",
      "Reviews and ratings are not part of the product editor document.",
    );
  }
  if (issues.length > 0) {
    throw new CatalogAdminError(
      "invalid_document",
      "The product editor document structure is invalid.",
      422,
      { issues },
    );
  }
  return input as ProductEditorDocumentV1;
}

export function assertValidProductEditorDocument(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ProductEditorDocumentV1 {
  const result = validateProductEditorDocument(input, env);
  if (!result.document) {
    throw new CatalogAdminError(
      "validation_failed",
      "The product editor document is invalid.",
      422,
      { issues: result.issues },
    );
  }
  return result.document;
}
