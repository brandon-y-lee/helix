import { normalizeProductPdpContent } from "@/lib/catalog/product-content";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV4,
} from "@/lib/admin/catalog/types";
import { CATALOG_MEDIA_BUCKET } from "@/lib/catalog/media-storage";
import { PRODUCT_EDITOR_SCHEMA_VERSION } from "@/lib/admin/catalog/types";
import { PRODUCT_MEDIA_ROLES } from "@/lib/catalog/media-roles";
import {
  PRODUCT_SLUG_MAX_LENGTH,
  PRODUCT_SLUG_PATTERN,
} from "@/lib/catalog/product-slug";
import { systemStepByName } from "@/lib/catalog/system-steps";
import { PRODUCT_STATUSES } from "@/lib/products";
import {
  catalogFieldsForTable,
  type CatalogEditorTable,
} from "@/lib/catalog/field-ownership";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

function validateRecordShape(
  table: CatalogEditorTable,
  path: string,
  value: RecordValue,
  issues: CatalogValidationIssue[],
  allowedExtras: readonly string[] = [],
) {
  const expected = new Set(catalogFieldsForTable(table).map((field) => field.field));
  for (const field of expected) {
    if (!(field in value)) {
      issue(
        issues,
        `${path}.${field}`,
        "missing_field",
        `${table}.${field} is required by the current editor contract.`,
      );
    }
  }
  for (const field of Object.keys(value)) {
    if (!expected.has(field) && !allowedExtras.includes(field)) {
      issue(
        issues,
        `${path}.${field}`,
        "unknown_field",
        `${table}.${field} is not part of the current editor contract.`,
      );
    }
  }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateProduct(
  product: RecordValue,
  issues: CatalogValidationIssue[],
): void {
  validateRecordShape("products", "product", product, issues);
  if (typeof product.id !== "string" || !UUID_PATTERN.test(product.id)) {
    issue(issues, "product.id", "invalid_uuid", "Product row id must be a UUID.");
  }
  for (const field of ["created_at", "published_at", "updated_at"] as const) {
    if (!isTimestamp(product[field])) {
      issue(issues, `product.${field}`, "invalid_timestamp", `${field} must be an ISO timestamp.`);
    }
  }
  const requiredText = [
    "display_name",
    "editorial_description",
    "editorial_how_to_use",
    "product_type",
    "slug",
    "swatch_from",
    "swatch_to",
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

  if (
    typeof product.slug === "string" &&
    !PRODUCT_SLUG_PATTERN.test(product.slug)
  ) {
    issue(
      issues,
      "product.slug",
      "invalid_slug",
      "slug must use lowercase letters, numbers, and single hyphens.",
    );
  }
  if (
    typeof product.slug === "string" &&
    product.slug.length > PRODUCT_SLUG_MAX_LENGTH
  ) {
    issue(
      issues,
      "product.slug",
      "too_long",
      `slug must be at most ${PRODUCT_SLUG_MAX_LENGTH} characters.`,
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
    "badge",
    "finish",
    "good_for",
    "ingredients",
    "made_for",
    "seo_description",
    "seo_title",
    "system_step_name",
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

  for (const field of ["sort_order", "routine_sort"] as const) {
    if (isInteger(product[field], 0)) continue;
    issue(
      issues,
      `product.${field}`,
      "invalid_integer",
      `${field} must be a non-negative integer.`,
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
  if (!oneOf(product.routine_group, ROUTINE_GROUPS)) {
    issue(
      issues,
      "product.routine_group",
      "invalid_routine_group",
      "Unsupported routine group.",
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

  const systemStep = systemStepByName(product.system_step_name);
  if (product.catalog_status === "active" && !systemStep) {
    issue(
      issues,
      "product.system_step_name",
      "system_step_required",
      "Active Products must fulfill a governed System Step.",
    );
  } else if (
    product.system_step_name !== null &&
    !systemStep
  ) {
    issue(
      issues,
      "product.system_step_name",
      "invalid_system_step",
      "System Step Name must use one of the seven canonical uppercase values.",
    );
  } else if (
    systemStep &&
    oneOf(product.routine_group, ROUTINE_GROUPS) &&
    systemStep.routineGroup !== product.routine_group
  ) {
    issue(
      issues,
      "product.system_step_name",
      "routine_group_mismatch",
      "System Step and Routine Group must agree.",
    );
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
    validateRecordShape("product_variants", path, entry, issues);
    if (entry.product_id !== productId) {
      issue(issues, `${path}.product_id`, "product_mismatch", "Variant must belong to this product document.");
    }
    if (!isTimestamp(entry.updated_at)) {
      issue(issues, `${path}.updated_at`, "invalid_timestamp", "Variant updated_at must be an ISO timestamp.");
    }
    if (entry.archived_at !== null) {
      issue(issues, `${path}.archived_at`, "active_row_required", "Archived variants are represented by removing the active association.");
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
    if (!isInteger(entry.sort_order, 0)) {
      issue(
        issues,
        `${path}.sort_order`,
        "invalid_order",
        "Variant sort order must be a non-negative integer.",
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

function approvedCatalogStorageUrl(
  value: unknown,
  env: NodeJS.ProcessEnv,
): boolean {
  if (typeof value !== "string" || !env.NEXT_PUBLIC_SUPABASE_URL) return false;
  try {
    const url = new URL(value);
    const projectUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    const productMediaPrefix =
      `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/`;
    return (
      url.origin === projectUrl.origin &&
      url.pathname.startsWith(productMediaPrefix) &&
      url.pathname.length > productMediaPrefix.length &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function validateMedia(
  media: unknown[],
  productId: string,
  productSlug: string,
  routineGroup: unknown,
  variantIds: Set<string>,
  issues: CatalogValidationIssue[],
  env: NodeJS.ProcessEnv,
): void {
  const ids = new Set<string>();
  const placements = new Set<string>();
  let coreRoutineEditorialCount = 0;
  media.forEach((entry, index) => {
    const path = `media.${index}`;
    if (!isRecord(entry)) {
      issue(issues, path, "invalid_type", "Media item must be an object.");
      return;
    }
    validateRecordShape("product_media", path, entry, issues, ["pendingUpload"]);
    if (entry.product_id !== productId) {
      issue(issues, `${path}.product_id`, "product_mismatch", "Media must belong to this product document.");
    }
    for (const field of ["created_at", "updated_at"] as const) {
      if (!isTimestamp(entry[field])) {
        issue(issues, `${path}.${field}`, "invalid_timestamp", `Media ${field} must be an ISO timestamp.`);
      }
    }
    if (entry.archived_at !== null) {
      issue(issues, `${path}.archived_at`, "active_row_required", "Archived media is represented by removing the active association.");
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
    if (!oneOf(entry.role, PRODUCT_MEDIA_ROLES)) {
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
      entry.media_type === "video" &&
      (typeof entry.url !== "string" || !entry.url)
    ) {
      issue(
        issues,
        `${path}.url`,
        "required",
        "Video media requires a URL.",
      );
    }
    if (
      entry.media_type === "image" &&
      entry.url === null &&
      (!isRecord(entry.placeholder_palette) ||
        typeof entry.placeholder_palette.start !== "string" ||
        typeof entry.placeholder_palette.end !== "string")
    ) {
      issue(
        issues,
        `${path}.placeholder_palette`,
        "required",
        "Placeholder images require a start and end palette.",
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
        upload.bucket !== CATALOG_MEDIA_BUCKET ||
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

    if (entry.role === "core_routine_editorial") {
      coreRoutineEditorialCount += 1;
      if (routineGroup !== "core") {
        issue(
          issues,
          `${path}.role`,
          "core_product_required",
          "Core routine editorial media is available only for Core products.",
        );
      }
      if (entry.media_type !== "image") {
        issue(
          issues,
          `${path}.media_type`,
          "image_required",
          "Core routine editorial media must be an image.",
        );
      }
      if (entry.variant_id !== null) {
        issue(
          issues,
          `${path}.variant_id`,
          "variant_forbidden",
          "Core routine editorial media cannot be assigned to a variant.",
        );
      }
      if (entry.sort_order !== 1) {
        issue(
          issues,
          `${path}.sort_order`,
          "fixed_order",
          "Core routine editorial media must use sort order 1.",
        );
      }
      if (
        !isInteger(entry.width, 1) ||
        !isInteger(entry.height, 1)
      ) {
        issue(
          issues,
          path,
          "dimensions_required",
          "Core routine editorial media requires positive intrinsic dimensions.",
        );
      }
      if (!approvedCatalogStorageUrl(entry.url, env)) {
        issue(
          issues,
          `${path}.url`,
          "approved_storage_required",
          "Core routine editorial media must use the approved catalog Storage origin.",
        );
      }
      if (
        isRecord(entry.pendingUpload) &&
        typeof entry.pendingUpload.mimeType === "string" &&
        !entry.pendingUpload.mimeType.startsWith("image/")
      ) {
        issue(
          issues,
          `${path}.pendingUpload.mimeType`,
          "image_required",
          "Core routine editorial uploads must be images.",
        );
      }
    }
  });
  if (coreRoutineEditorialCount > 1) {
    issue(
      issues,
      "media",
      "duplicate_core_routine_editorial",
      "A product can have only one Core routine editorial image.",
    );
  }
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
    validateRecordShape("product_relationships", path, entry, issues);
    if (entry.product_id !== productId) {
      issue(issues, `${path}.product_id`, "product_mismatch", "Relationship must belong to this product document.");
    }
    if (!isTimestamp(entry.created_at)) {
      issue(issues, `${path}.created_at`, "invalid_timestamp", "Relationship created_at must be an ISO timestamp.");
    }
    if (entry.archived_at !== null) {
      issue(issues, `${path}.archived_at`, "active_row_required", "Archived relationships are represented by removing the active association.");
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

function validateProductSource(
  source: RecordValue,
  productId: string,
  issues: CatalogValidationIssue[],
) {
  validateRecordShape("product_sources", "productSource", source, issues);
  if (source.product_id !== productId) {
    issue(issues, "productSource.product_id", "product_mismatch", "Product source must belong to this product document.");
  }
  for (const field of ["supplier", "supplier_title", "supplier_url", "supplier_handle"] as const) {
    if (typeof source[field] !== "string" || !source[field].trim()) {
      issue(issues, `productSource.${field}`, "required", `${field} must be non-empty text.`);
    }
  }
  for (const field of ["supplier_product_id", "source_content_hash", "formulation_version_notes"] as const) {
    if (!isNullableString(source[field])) {
      issue(issues, `productSource.${field}`, "invalid_type", `${field} must be text or null.`);
    }
  }
  if (!isNullableInteger(source.original_source_price_cents, 0)) {
    issue(issues, "productSource.original_source_price_cents", "invalid_price", "Original source price must be null or whole non-negative cents.");
  }
  if (!isRecord(source.raw_source)) {
    issue(issues, "productSource.raw_source", "invalid_object", "Raw source must be an object.");
  }
  for (const field of ["source_inspected_at", "created_at", "updated_at"] as const) {
    if (!isTimestamp(source[field])) {
      issue(issues, `productSource.${field}`, "invalid_timestamp", `${field} must be an ISO timestamp.`);
    }
  }
}

function validateProductFamily(
  value: RecordValue,
  productId: string,
  productStepName: unknown,
  issues: CatalogValidationIssue[],
) {
  const family = value.family;
  const memberships = value.memberships;
  if (!isRecord(family)) {
    issue(
      issues,
      "productFamily.family",
      "invalid_type",
      "Product Family fields must be an object.",
    );
    return;
  }
  if (!Array.isArray(memberships)) {
    issue(
      issues,
      "productFamily.memberships",
      "invalid_type",
      "Product Family memberships must be an array.",
    );
    return;
  }

  const familyId = typeof family.id === "string" ? family.id : "";
  if (!UUID_PATTERN.test(familyId)) {
    issue(
      issues,
      "productFamily.family.id",
      "invalid_uuid",
      "Product Family id must be a UUID.",
    );
  }
  if (
    typeof family.slug !== "string" ||
    !PRODUCT_SLUG_PATTERN.test(family.slug)
  ) {
    issue(
      issues,
      "productFamily.family.slug",
      "invalid_slug",
      "Product Family slug must use lowercase letters, numbers, and single hyphens.",
    );
  }
  if (
    typeof family.display_name !== "string" ||
    !family.display_name.trim()
  ) {
    issue(
      issues,
      "productFamily.family.display_name",
      "required",
      "Product Family display name is required.",
    );
  }
  if (
    typeof family.system_step_name !== "string" ||
    !systemStepByName(family.system_step_name)
  ) {
    issue(
      issues,
      "productFamily.family.system_step_name",
      "invalid_system_step",
      "Product Family System Step must be governed.",
    );
  } else if (family.system_step_name !== productStepName) {
    issue(
      issues,
      "productFamily.family.system_step_name",
      "family_step_mismatch",
      "Product Family and current Product must fulfill the same System Step.",
    );
  }
  for (const field of ["created_at", "updated_at"] as const) {
    if (!isTimestamp(family[field])) {
      issue(
        issues,
        `productFamily.family.${field}`,
        "invalid_timestamp",
        `Product Family ${field} must be an ISO timestamp.`,
      );
    }
  }

  const productIds = new Set<string>();
  const orders = new Set<number>();
  let entryCount = 0;
  let includesCurrentProduct = false;
  memberships.forEach((membership, index) => {
    const path = `productFamily.memberships.${index}`;
    if (!isRecord(membership)) {
      issue(issues, path, "invalid_type", "Family membership must be an object.");
      return;
    }
    if (membership.family_id !== familyId) {
      issue(
        issues,
        `${path}.family_id`,
        "family_mismatch",
        "Family membership must belong to this Product Family.",
      );
    }
    if (
      typeof membership.product_id !== "string" ||
      !UUID_PATTERN.test(membership.product_id)
    ) {
      issue(
        issues,
        `${path}.product_id`,
        "invalid_uuid",
        "Family member Product id must be a UUID.",
      );
    } else if (productIds.has(membership.product_id)) {
      issue(
        issues,
        `${path}.product_id`,
        "duplicate_family_product",
        "A Product can appear only once in a Product Family.",
      );
    } else {
      productIds.add(membership.product_id);
      includesCurrentProduct ||= membership.product_id === productId;
    }
    if (
      typeof membership.option_label !== "string" ||
      !membership.option_label.trim()
    ) {
      issue(
        issues,
        `${path}.option_label`,
        "required",
        "Family option label is required.",
      );
    }
    if (!isInteger(membership.sort_order, 0)) {
      issue(
        issues,
        `${path}.sort_order`,
        "invalid_order",
        "Family sort order must be a non-negative integer.",
      );
    } else if (orders.has(membership.sort_order)) {
      issue(
        issues,
        `${path}.sort_order`,
        "duplicate_family_order",
        "Family sort order must be unique.",
      );
    } else {
      orders.add(membership.sort_order);
    }
    if (typeof membership.is_entry !== "boolean") {
      issue(
        issues,
        `${path}.is_entry`,
        "invalid_type",
        "Family entry state must be boolean.",
      );
    } else if (membership.is_entry) {
      entryCount += 1;
    }
    for (const field of ["created_at", "updated_at"] as const) {
      if (!isTimestamp(membership[field])) {
        issue(
          issues,
          `${path}.${field}`,
          "invalid_timestamp",
          `Family membership ${field} must be an ISO timestamp.`,
        );
      }
    }
  });

  if (entryCount !== 1) {
    issue(
      issues,
      "productFamily.memberships",
      "family_entry_required",
      "A Product Family must contain exactly one entry Product.",
    );
  }
  if (!includesCurrentProduct) {
    issue(
      issues,
      "productFamily.memberships",
      "current_product_membership_required",
      "The current Product must belong to its Product Family aggregate.",
    );
  }
}

export function validateProductEditorDocument(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): {
  document: ProductEditorDocumentV4 | null;
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
  if (input.schemaVersion !== PRODUCT_EDITOR_SCHEMA_VERSION) {
    issue(
      issues,
      "schemaVersion",
      "unsupported_schema",
      `Only product editor schema version ${PRODUCT_EDITOR_SCHEMA_VERSION} is supported.`,
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
  if (
    isRecord(input.product) &&
    input.product.status === "waitlist" &&
    Array.isArray(input.variants) &&
    input.variants.length > 0
  ) {
    issue(
      issues,
      "variants",
      "waitlist_offer_forbidden",
      "A Waitlist Product cannot publish a Product Offer.",
    );
  }
  const productSlug =
    isRecord(input.product) && typeof input.product.slug === "string"
      ? input.product.slug
      : "";
  const routineGroup =
    isRecord(input.product) ? input.product.routine_group : undefined;
  if (Array.isArray(input.media)) {
    validateMedia(
      input.media,
      productId,
      productSlug,
      routineGroup,
      variantIds,
      issues,
      env,
    );
  }
  if (Array.isArray(input.relationships)) {
    validateRelationships(input.relationships, productId, issues);
  }

  if (input.productSource !== null) {
    if (!isRecord(input.productSource)) {
      issue(issues, "productSource", "invalid_type", "Product source must be an object or null.");
    } else {
      validateProductSource(input.productSource, productId, issues);
    }
  }

  if (input.productFamily !== null) {
    if (!isRecord(input.productFamily)) {
      issue(
        issues,
        "productFamily",
        "invalid_type",
        "Product Family must be an object or null.",
      );
    } else {
      validateProductFamily(
        input.productFamily,
        productId,
        isRecord(input.product) ? input.product.system_step_name : undefined,
        issues,
      );
    }
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
      validateRecordShape(
        "product_pdp_content",
        "productPdpContent",
        input.productPdpContent,
        issues,
      );
      if (input.productPdpContent.product_id !== productId) {
        issue(issues, "productPdpContent.product_id", "product_mismatch", "PDP content must belong to this product document.");
      }
      if (input.productPdpContent.schema_version !== 1) {
        issue(issues, "productPdpContent.schema_version", "unsupported_schema", "Only PDP content schema version 1 is supported.");
      }
      for (const field of ["created_at", "updated_at"] as const) {
        if (!isTimestamp(input.productPdpContent[field])) {
          issue(issues, `productPdpContent.${field}`, "invalid_timestamp", `${field} must be an ISO timestamp.`);
        }
      }
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
    document: issues.length === 0 ? (input as ProductEditorDocumentV4) : null,
    issues,
  };
}

export function assertProductEditorDocumentStructure(
  input: unknown,
): ProductEditorDocumentV4 {
  const issues: CatalogValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new CatalogAdminError(
      "invalid_document",
      "The product editor document must be an object.",
      422,
    );
  }
  if (input.schemaVersion !== PRODUCT_EDITOR_SCHEMA_VERSION) {
    issue(
      issues,
      "schemaVersion",
      "unsupported_schema",
      `Only product editor schema version ${PRODUCT_EDITOR_SCHEMA_VERSION} is supported.`,
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
  if (input.productSource !== null && !isRecord(input.productSource)) {
    issue(issues, "productSource", "invalid_type", "Product source must be an object or null.");
  }
  if (input.productFamily !== null && !isRecord(input.productFamily)) {
    issue(
      issues,
      "productFamily",
      "invalid_type",
      "Product Family must be an object or null.",
    );
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
  return input as ProductEditorDocumentV4;
}

export function assertValidProductEditorDocument(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ProductEditorDocumentV4 {
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
