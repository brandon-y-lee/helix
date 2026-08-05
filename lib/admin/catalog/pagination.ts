import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import type {
  CatalogGridCursor,
  CatalogGridSort,
} from "@/lib/admin/catalog/types";

const CATALOG_GRID_DEFAULT_LIMIT = 25;
const CATALOG_GRID_MAX_LIMIT = 100;

export function parseCatalogGridLimit(value: string | null): number {
  if (value === null) return CATALOG_GRID_DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > CATALOG_GRID_MAX_LIMIT) {
    throw new CatalogAdminError(
      "invalid_limit",
      `limit must be between 1 and ${CATALOG_GRID_MAX_LIMIT}.`,
      400,
    );
  }
  return parsed;
}

export function parseCatalogGridSort(value: string | null): CatalogGridSort {
  if (value === null) return "updated_desc";
  if (
    ["name_asc", "published_desc", "routine_asc", "updated_desc"].includes(
      value,
    )
  ) {
    return value as CatalogGridSort;
  }
  throw new CatalogAdminError("invalid_sort", "Unsupported catalog sort.", 400);
}

export function encodeCatalogGridCursor(cursor: CatalogGridCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCatalogGridCursor(
  value: string | null,
): CatalogGridCursor {
  if (!value) return { offset: 0 };
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CatalogGridCursor>;
    if (!Number.isSafeInteger(parsed.offset) || (parsed.offset ?? -1) < 0) {
      throw new Error("invalid offset");
    }
    return { offset: parsed.offset! };
  } catch {
    throw new CatalogAdminError(
      "invalid_cursor",
      "The catalog cursor is invalid.",
      400,
    );
  }
}
