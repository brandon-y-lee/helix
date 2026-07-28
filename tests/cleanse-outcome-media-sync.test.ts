import { describe, expect, it } from "vitest";
import {
  CLEANSE_SLUG,
  OUTCOME_MEDIA_ASSETS,
  OUTCOME_MEDIA_ROLE,
  planOutcomeRows,
  storagePathForOutcomeAsset,
} from "@/scripts/catalog-sync-cleanse-outcome-media";

const inspectedAssets = OUTCOME_MEDIA_ASSETS.map((asset) => ({
  ...asset,
  absolutePath: `/tmp/${asset.filename}`,
  sha256: `checksum-${asset.sortOrder}`,
  storagePath: storagePathForOutcomeAsset(`checksum-${asset.sortOrder}`),
  publicUrl: `https://example.supabase.co/${asset.sortOrder}.webp`,
  bytes: Buffer.from(`asset-${asset.sortOrder}`),
}));

describe("CLEANSE outcome media sync contract", () => {
  it("uses positional filenames, one shared role, and deterministic numeric order", () => {
    const rows = planOutcomeRows("cleanse-product-id", inspectedAssets);

    expect(OUTCOME_MEDIA_ASSETS.map((asset) => asset.filename)).toEqual([
      "outcome-01.webp",
      "outcome-02.webp",
      "outcome-03.webp",
    ]);
    expect(rows.map((row) => row.role)).toEqual([
      OUTCOME_MEDIA_ROLE,
      OUTCOME_MEDIA_ROLE,
      OUTCOME_MEDIA_ROLE,
    ]);
    expect(rows.map((row) => row.sort_order)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.source_filename)).toEqual([
      "outcome-01.webp",
      "outcome-02.webp",
      "outcome-03.webp",
    ]);
  });

  it("produces the same content-addressed rows on repeated planning", () => {
    expect(planOutcomeRows("cleanse-product-id", inspectedAssets)).toEqual(
      planOutcomeRows("cleanse-product-id", [...inspectedAssets].reverse()),
    );
    expect(storagePathForOutcomeAsset("abc123")).toBe(
      `products/${CLEANSE_SLUG}/outcomes/abc123.webp`,
    );
  });
});
