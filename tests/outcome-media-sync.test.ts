import { describe, expect, it } from "vitest";
import {
  CLEANSE_SLUG,
  OUTCOME_MEDIA_ASSETS,
  OUTCOME_MEDIA_ROLE,
  TREAT_SLUG,
  assertCleanseMutationsAreProvenanceOnly,
  assertCleanseRowsPreserved,
  assertOutcomeAssetManifest,
  canonicalOutcomeFilename,
  parseOutcomeFilename,
  planOutcomeRowMutations,
  planOutcomeRows,
  storagePathForOutcomeAsset,
  type ExistingOutcomeRow,
  type InspectedOutcomeAsset,
} from "@/scripts/catalog-sync-outcome-media";

const productIds = new Map([
  [CLEANSE_SLUG, "cleanse-product-id"],
  [TREAT_SLUG, "treat-product-id"],
]);

const inspectedAssets: InspectedOutcomeAsset[] = OUTCOME_MEDIA_ASSETS.map(
  (asset) => ({
    ...asset,
    absolutePath: `/tmp/${asset.filename}`,
    sha256: `checksum-${asset.prefix}-${asset.sortOrder}`,
    storagePath: storagePathForOutcomeAsset(
      asset,
      `checksum-${asset.prefix}-${asset.sortOrder}`,
    ),
    publicUrl: `https://example.supabase.co/${asset.prefix}-${asset.sortOrder}.webp`,
    bytes: Buffer.from(`asset-${asset.prefix}-${asset.sortOrder}`),
  }),
);

function existingRow(
  row: ReturnType<typeof planOutcomeRows>[number],
  overrides: Partial<ExistingOutcomeRow> = {},
): ExistingOutcomeRow {
  return {
    id: `${row.product_id}-${row.sort_order}`,
    product_id: row.product_id,
    variant_id: null,
    media_type: "image",
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    role: row.role,
    sort_order: row.sort_order,
    palette_id: null,
    placeholder_palette: {},
    original_source_url: null,
    source_filename: row.source_filename,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

describe("outcome media sync contract", () => {
  it("requires all six canonical product-prefixed positions", () => {
    expect(OUTCOME_MEDIA_ASSETS.map((asset) => asset.filename)).toEqual([
      "cleanse-pdp-outcomes-01.webp",
      "cleanse-pdp-outcomes-02.webp",
      "cleanse-pdp-outcomes-03.webp",
      "treat-pdp-outcomes-01.webp",
      "treat-pdp-outcomes-02.webp",
      "treat-pdp-outcomes-03.webp",
    ]);
    expect(() => assertOutcomeAssetManifest(OUTCOME_MEDIA_ASSETS)).not.toThrow();
    expect(() =>
      assertOutcomeAssetManifest(OUTCOME_MEDIA_ASSETS.slice(1)),
    ).toThrow(/missing \[cleanse:1\]/);
    expect(() =>
      assertOutcomeAssetManifest([
        ...OUTCOME_MEDIA_ASSETS,
        OUTCOME_MEDIA_ASSETS[0],
      ]),
    ).toThrow(/Duplicate outcome input/);
  });

  it("extracts only canonical two-digit numeric orders", () => {
    expect(parseOutcomeFilename("treat-pdp-outcomes-03.webp")).toEqual({
      prefix: "treat",
      sortOrder: 3,
    });
    expect(canonicalOutcomeFilename("cleanse", 1)).toBe(
      "cleanse-pdp-outcomes-01.webp",
    );
    expect(() => parseOutcomeFilename("treat-pdp-outcomes-3.webp")).toThrow(
      /Invalid outcome basename/,
    );
    expect(() => parseOutcomeFilename("treat-pdp-outcomes-04.webp")).toThrow(
      /expected 01, 02, or 03/,
    );
  });

  it("plans one shared role in deterministic product and numeric order", () => {
    const rows = planOutcomeRows(productIds, [...inspectedAssets].reverse());

    expect(rows.map((row) => row.role)).toEqual(
      Array(6).fill(OUTCOME_MEDIA_ROLE),
    );
    expect(rows.map((row) => [row.product_id, row.sort_order])).toEqual([
      ["cleanse-product-id", 1],
      ["cleanse-product-id", 2],
      ["cleanse-product-id", 3],
      ["treat-product-id", 1],
      ["treat-product-id", 2],
      ["treat-product-id", 3],
    ]);
    expect(storagePathForOutcomeAsset(OUTCOME_MEDIA_ASSETS[3], "abc123")).toBe(
      `products/${TREAT_SLUG}/outcomes/abc123.webp`,
    );
  });

  it("normalizes CLEANSE provenance without replacing its rows or URLs", () => {
    const rows = planOutcomeRows(productIds, inspectedAssets);
    const cleanseRows = rows
      .filter((row) => row.product_id === "cleanse-product-id")
      .map((row) =>
        existingRow(row, {
          source_filename: `outcome-0${row.sort_order}.webp`,
        }),
      );
    const plan = planOutcomeRowMutations(cleanseRows, rows);

    expect(() =>
      assertCleanseMutationsAreProvenanceOnly(
        cleanseRows,
        plan,
        "cleanse-product-id",
      ),
    ).not.toThrow();

    expect(plan.updates.map((item) => item.id)).toEqual([
      "cleanse-product-id-1",
      "cleanse-product-id-2",
      "cleanse-product-id-3",
    ]);
    expect(plan.archives).toEqual([]);
    expect(plan.inserts).toHaveLength(3);
    expect(plan.inserts.every((row) => row.product_id === "treat-product-id")).toBe(
      true,
    );

    const normalizedCleanse = cleanseRows.map((row, index) => ({
      ...row,
      source_filename: rows[index].source_filename,
      updated_at: "2026-08-01T00:00:00.000Z",
    }));
    expect(
      assertCleanseRowsPreserved(
        cleanseRows,
        normalizedCleanse,
        "cleanse-product-id",
      ),
    ).toBe(true);
  });

  it("rejects CLEANSE changes beyond source filename provenance", () => {
    const rows = planOutcomeRows(productIds, inspectedAssets);
    const cleanseRows = rows
      .filter((row) => row.product_id === "cleanse-product-id")
      .map((row) =>
        existingRow(row, {
          alt: row.sort_order === 1 ? "Unexpected alt change" : row.alt,
          source_filename: `outcome-0${row.sort_order}.webp`,
        }),
      );
    const plan = planOutcomeRowMutations(cleanseRows, rows);

    expect(() =>
      assertCleanseMutationsAreProvenanceOnly(
        cleanseRows,
        plan,
        "cleanse-product-id",
      ),
    ).toThrow(/differs beyond source_filename/);
  });

  it("is unchanged on a second plan and archives only changed asset identities", () => {
    const rows = planOutcomeRows(productIds, inspectedAssets);
    const canonical = rows.map((row) => existingRow(row));
    const secondPlan = planOutcomeRowMutations(canonical, rows);

    expect(secondPlan.unchanged).toHaveLength(6);
    expect(secondPlan.updates).toEqual([]);
    expect(secondPlan.archives).toEqual([]);
    expect(secondPlan.inserts).toEqual([]);

    const replaced = [...canonical];
    replaced[3] = { ...replaced[3], url: "https://example.supabase.co/old.webp" };
    const replacementPlan = planOutcomeRowMutations(replaced, rows);
    expect(replacementPlan.archives.map((item) => item.id)).toEqual([
      "treat-product-id-1",
    ]);
    expect(replacementPlan.inserts).toEqual([rows[3]]);
  });
});
