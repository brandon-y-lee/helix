import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import {
  catalogFieldsForTable,
  type CatalogEditorTable,
} from "@/lib/catalog/field-ownership";

export type CatalogDocumentTable =
  | "products"
  | "product_pdp_content"
  | "product_variants"
  | "product_media"
  | "product_relationships"
  | "product_sources";

export type CatalogDocumentDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
  disruptive: boolean;
  adminOnly: boolean;
};

export type CatalogDocumentDiff = {
  diff: Partial<Record<CatalogDocumentTable, CatalogDocumentDiffEntry[]>>;
  affectedTables: CatalogDocumentTable[];
  advancedChanges: Array<
    CatalogDocumentDiffEntry & { table: CatalogDocumentTable }
  >;
};

function different(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function objectEntries(
  table: CatalogDocumentTable,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  const entries: CatalogDocumentDiffEntry[] = [];
  for (const metadata of catalogFieldsForTable(table as CatalogEditorTable)) {
    const previous = before?.[metadata.field];
    const next = after?.[metadata.field];
    if (!different(previous, next)) continue;
    entries.push({
      field: metadata.field,
      before: previous,
      after: next,
      disruptive: metadata.disruptive === true,
      adminOnly:
        metadata.editor.editableBy.length === 1 &&
        metadata.editor.editableBy[0] === "admin",
    });
  }
  return entries;
}

function rowIdentity(table: CatalogDocumentTable, row: Record<string, unknown>) {
  if (typeof row.id === "string") return row.id;
  if (
    table === "product_relationships" &&
    typeof row.related_product_id === "string" &&
    typeof row.relationship_type === "string"
  ) {
    return `${row.related_product_id}:${row.relationship_type}`;
  }
  return "row";
}

function collectionEntries(
  table: CatalogDocumentTable,
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
) {
  const beforeRows = new Map(before.map((row) => [rowIdentity(table, row), row]));
  const afterRows = new Map(after.map((row) => [rowIdentity(table, row), row]));
  const entries: CatalogDocumentDiffEntry[] = [];
  for (const identity of new Set([...beforeRows.keys(), ...afterRows.keys()])) {
    const previous = beforeRows.get(identity);
    const next = afterRows.get(identity);
    if (!previous || !next) {
      const removedPrimaryMedia =
        table === "product_media" &&
        previous !== undefined &&
        ["card", "cart", "detail"].includes(String(previous.role));
      entries.push({
        field: `${identity} record`,
        before: previous ?? null,
        after: next ?? null,
        disruptive: table === "product_variants" || removedPrimaryMedia,
        adminOnly: table === "product_variants",
      });
      continue;
    }
    for (const entry of objectEntries(table, previous, next)) {
      entries.push({ ...entry, field: `${identity}.${entry.field}` });
    }
  }
  return entries;
}

export function catalogDocumentDiff(
  before: ProductEditorDocumentV4,
  after: ProductEditorDocumentV4,
): CatalogDocumentDiff {
  const groups: Array<{
    table: CatalogDocumentTable;
    entries: CatalogDocumentDiffEntry[];
  }> = [
    {
      table: "products",
      entries: objectEntries("products", before.product, after.product),
    },
    {
      table: "product_pdp_content",
      entries: objectEntries(
        "product_pdp_content",
        before.productPdpContent,
        after.productPdpContent,
      ),
    },
    {
      table: "product_variants",
      entries: collectionEntries(
        "product_variants",
        before.variants,
        after.variants,
      ),
    },
    {
      table: "product_media",
      entries: collectionEntries("product_media", before.media, after.media),
    },
    {
      table: "product_relationships",
      entries: collectionEntries(
        "product_relationships",
        before.relationships,
        after.relationships,
      ),
    },
    {
      table: "product_sources",
      entries: objectEntries(
        "product_sources",
        before.productSource,
        after.productSource,
      ),
    },
  ];
  if (
    before.variants.some((variant) => variant.available) &&
    after.variants.every((variant) => !variant.available)
  ) {
    const variantChanges = groups.find(
      (group) => group.table === "product_variants",
    )?.entries;
    const availabilityChange = variantChanges?.find((entry) =>
      entry.field.endsWith(".available"),
    );
    if (availabilityChange) availabilityChange.disruptive = true;
  }
  const changed = groups.filter((group) => group.entries.length > 0);
  return {
    diff: Object.fromEntries(changed.map((group) => [group.table, group.entries])),
    affectedTables: changed.map((group) => group.table),
    advancedChanges: changed.flatMap((group) =>
      group.entries
        .filter((entry) => entry.adminOnly)
        .map((entry) => ({ ...entry, table: group.table })),
    ),
  };
}
