import {
  getCatalogFieldOwnership,
} from "@/lib/catalog/field-ownership";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV2,
} from "@/lib/admin/catalog/types";
import { isCoreRoutineMediaRole } from "@/lib/catalog/media-roles";

type EditorTable =
  | "products"
  | "product_pdp_content"
  | "product_variants"
  | "product_media"
  | "product_relationships";

type JsonObject = Record<string, unknown>;

const NEW_ROW_SYSTEM_FIELDS: Readonly<Record<EditorTable, ReadonlySet<string>>> = {
  products: new Set(),
  product_pdp_content: new Set(["schema_version"]),
  product_variants: new Set(["id"]),
  product_media: new Set(["id"]),
  product_relationships: new Set(),
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      valuesEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => valuesEqual(left[key], right[key]))
    );
  }
  return false;
}

function ownershipIssue(
  path: string,
  code: "field_ownership_undefined" | "field_read_only",
  message: string,
): CatalogValidationIssue {
  return { path, code, message };
}

function validateObjectOwnership({
  table,
  path,
  candidate,
  canonical,
}: {
  table: EditorTable;
  path: string;
  candidate: JsonObject;
  canonical?: JsonObject;
}): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  for (const [field, value] of Object.entries(candidate)) {
    if (
      table === "product_media" &&
      field === "role" &&
      canonical &&
      typeof value === "string" &&
      typeof canonical.role === "string" &&
      value !== canonical.role &&
      (isCoreRoutineMediaRole(value) ||
        isCoreRoutineMediaRole(canonical.role))
    ) {
      issues.push(
        ownershipIssue(
          `${path}.role`,
          "field_read_only",
          "Dedicated Core routine media roles cannot be reassigned.",
        ),
      );
      continue;
    }
    const ownership = getCatalogFieldOwnership(table, field);
    if (!ownership) {
      issues.push(
        ownershipIssue(
          `${path}.${field}`,
          "field_ownership_undefined",
          `${table}.${field} is not part of the catalog editor contract.`,
        ),
      );
      continue;
    }
    const changedReadOnlyField =
      !ownership.editor.editable &&
      (canonical
        ? !valuesEqual(value, canonical[field])
        : value !== null && !NEW_ROW_SYSTEM_FIELDS[table].has(field));
    if (changedReadOnlyField) {
      issues.push(
        ownershipIssue(
          `${path}.${field}`,
          "field_read_only",
          `${table}.${field} is ${ownership.owner}-owned and read only in the catalog editor.`,
        ),
      );
    }
  }
  return issues;
}

function validateCollectionOwnership({
  table,
  path,
  candidate,
  canonical,
}: {
  table: EditorTable;
  path: string;
  candidate: JsonObject[];
  canonical: JsonObject[];
}) {
  const canonicalById = new Map(
    canonical
      .filter((row) => typeof row.id === "string")
      .map((row) => [row.id as string, row]),
  );
  return candidate.flatMap((row, index) =>
    validateObjectOwnership({
      table,
      path: `${path}.${index}`,
      candidate: row,
      canonical:
        typeof row.id === "string" ? canonicalById.get(row.id) : undefined,
    }),
  );
}

export function validateCatalogEditorOwnership(
  candidate: ProductEditorDocumentV2,
  canonical: ProductEditorDocumentV2,
): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  if (candidate.productId !== canonical.productId) {
    issues.push(
      ownershipIssue(
        "productId",
        "field_read_only",
        "The draft cannot be reassigned to another product.",
      ),
    );
  }

  issues.push(
    ...validateObjectOwnership({
      table: "products",
      path: "product",
      candidate: candidate.product as JsonObject,
      canonical: canonical.product as JsonObject,
    }),
  );

  if (candidate.productPdpContent) {
    issues.push(
      ...validateObjectOwnership({
        table: "product_pdp_content",
        path: "productPdpContent",
        candidate: candidate.productPdpContent as JsonObject,
        canonical:
          (canonical.productPdpContent as JsonObject | null) ?? undefined,
      }),
    );
  }

  issues.push(
    ...validateCollectionOwnership({
      table: "product_variants",
      path: "variants",
      candidate: candidate.variants as JsonObject[],
      canonical: canonical.variants as JsonObject[],
    }),
    ...validateCollectionOwnership({
      table: "product_media",
      path: "media",
      candidate: candidate.media as JsonObject[],
      canonical: canonical.media as JsonObject[],
    }),
    ...validateCollectionOwnership({
      table: "product_relationships",
      path: "relationships",
      candidate: candidate.relationships as JsonObject[],
      canonical: canonical.relationships as JsonObject[],
    }),
  );

  return issues;
}
