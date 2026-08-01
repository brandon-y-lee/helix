import {
  canCatalogRoleEditField,
  getCatalogFieldOwnership,
  type CatalogEditorRole,
} from "@/lib/catalog/field-ownership";
import type {
  CatalogValidationIssue,
  ProductEditorDocumentV3,
} from "@/lib/admin/catalog/types";
import { isCoreRoutineMediaRole } from "@/lib/catalog/media-roles";

type EditorTable =
  | "products"
  | "product_pdp_content"
  | "product_variants"
  | "product_media"
  | "product_relationships"
  | "product_sources";

type JsonObject = Record<string, unknown>;

const NEW_ROW_SYSTEM_FIELDS: Readonly<Record<EditorTable, ReadonlySet<string>>> = {
  products: new Set(),
  product_pdp_content: new Set([
    "product_id",
    "schema_version",
    "created_at",
    "updated_at",
  ]),
  product_variants: new Set([
    "id",
    "product_id",
    "updated_at",
    "archived_at",
  ]),
  product_media: new Set([
    "id",
    "product_id",
    "created_at",
    "updated_at",
    "archived_at",
    "media_type",
    "url",
    "width",
    "height",
    "source_filename",
  ]),
  product_relationships: new Set([
    "product_id",
    "created_at",
    "archived_at",
  ]),
  product_sources: new Set(),
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
  role,
}: {
  table: EditorTable;
  path: string;
  candidate: JsonObject;
  canonical?: JsonObject;
  role: CatalogEditorRole;
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
      !canCatalogRoleEditField(role, table, field) &&
      (canonical
        ? !valuesEqual(value, canonical[field])
        : value !== null && !NEW_ROW_SYSTEM_FIELDS[table].has(field));
    if (changedReadOnlyField) {
      issues.push(
        ownershipIssue(
          `${path}.${field}`,
          "field_read_only",
          `${table}.${field} cannot be changed by the ${role} role.`,
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
  role,
}: {
  table: EditorTable;
  path: string;
  candidate: JsonObject[];
  canonical: JsonObject[];
  role: CatalogEditorRole;
}) {
  const identity = (row: JsonObject) =>
    typeof row.id === "string"
      ? row.id
      : table === "product_relationships" &&
          typeof row.related_product_id === "string" &&
          typeof row.relationship_type === "string"
        ? `${row.related_product_id}:${row.relationship_type}`
        : null;
  const canonicalById = new Map(
    canonical
      .map((row) => [identity(row), row] as const)
      .filter((entry): entry is [string, JsonObject] => Boolean(entry[0])),
  );
  const candidateIdentities = new Set(
    candidate.map(identity).filter((value): value is string => Boolean(value)),
  );
  const issues = candidate.flatMap((row, index) =>
    validateObjectOwnership({
      table,
      path: `${path}.${index}`,
      candidate: row,
      canonical: canonicalById.get(identity(row) ?? ""),
      role,
    }),
  );
  if (
    table === "product_variants" &&
    role !== "admin" &&
    canonical.some((row) => {
      const rowIdentity = identity(row);
      return rowIdentity !== null && !candidateIdentities.has(rowIdentity);
    })
  ) {
    issues.push(
      ownershipIssue(
        path,
        "field_read_only",
        "Only an admin can archive product variants.",
      ),
    );
  }
  return issues;
}

export function validateCatalogEditorOwnership(
  candidate: ProductEditorDocumentV3,
  canonical: ProductEditorDocumentV3,
  role: CatalogEditorRole,
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
      role,
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
        role,
      }),
    );
  }

  issues.push(
    ...validateCollectionOwnership({
      table: "product_variants",
      path: "variants",
      candidate: candidate.variants as JsonObject[],
      canonical: canonical.variants as JsonObject[],
      role,
    }),
    ...validateCollectionOwnership({
      table: "product_media",
      path: "media",
      candidate: candidate.media as JsonObject[],
      canonical: canonical.media as JsonObject[],
      role,
    }),
    ...validateCollectionOwnership({
      table: "product_relationships",
      path: "relationships",
      candidate: candidate.relationships as JsonObject[],
      canonical: canonical.relationships as JsonObject[],
      role,
    }),
  );

  if (candidate.productSource) {
    issues.push(
      ...validateObjectOwnership({
        table: "product_sources",
        path: "productSource",
        candidate: candidate.productSource as JsonObject,
        canonical: (canonical.productSource as JsonObject | null) ?? undefined,
        role,
      }),
    );
  } else if (canonical.productSource) {
    issues.push(
      ownershipIssue(
        "productSource",
        "field_read_only",
        "Supplier provenance records cannot be removed in the catalog editor.",
      ),
    );
  }

  return issues;
}
