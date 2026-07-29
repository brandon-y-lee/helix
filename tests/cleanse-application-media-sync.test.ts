import { describe, expect, it } from "vitest";
import {
  APPLICATION_MEDIA_ASSETS,
  APPLICATION_MEDIA_ROLE,
  CLEANSE_SLUG,
  planApplicationRows,
  readPngDimensions,
  storagePathForApplicationAsset,
} from "@/scripts/catalog-sync-cleanse-application-media";

describe("CLEANSE application media sync", () => {
  it("defines one complete ordered PNG set with unique canonical identities", () => {
    expect(APPLICATION_MEDIA_ROLE).toBe("pdp_application");
    expect(APPLICATION_MEDIA_ASSETS.map((asset) => asset.filename)).toEqual([
      "cleanse-application-01.png",
      "cleanse-application-02.png",
      "cleanse-application-03.png",
    ]);
    expect(APPLICATION_MEDIA_ASSETS.map((asset) => asset.sortOrder)).toEqual([
      1, 2, 3,
    ]);
    expect(
      new Set(APPLICATION_MEDIA_ASSETS.map((asset) => asset.filename)).size,
    ).toBe(3);
  });

  it("reads PNG dimensions and creates content-hashed application paths", () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1122, 16);
    png.writeUInt32BE(1402, 20);

    expect(readPngDimensions(png)).toEqual({ width: 1122, height: 1402 });
    expect(storagePathForApplicationAsset("abc123")).toBe(
      `products/${CLEANSE_SLUG}/application/abc123.png`,
    );
  });

  it("plans deterministic positional upserts without using copy or filenames", () => {
    const assets = [3, 1, 2].map((sortOrder) => ({
      filename: `input-${sortOrder}.png`,
      sortOrder,
      alt: `Unrelated alt ${sortOrder}`,
      width: 1000,
      height: 1200,
      absolutePath: `/tmp/input-${sortOrder}.png`,
      sha256: `hash-${sortOrder}`,
      storagePath: `products/${CLEANSE_SLUG}/application/hash-${sortOrder}.png`,
      publicUrl: `https://example.supabase.co/application/hash-${sortOrder}.png`,
      bytes: Buffer.from(`asset-${sortOrder}`),
    })) as Parameters<typeof planApplicationRows>[1];

    const first = planApplicationRows("cleanse-product", assets);
    const second = planApplicationRows("cleanse-product", assets);
    expect(first).toEqual(second);
    expect(first.map((row) => row.sort_order)).toEqual([1, 2, 3]);
    expect(first.every((row) => row.role === "pdp_application")).toBe(true);
    expect(first.every((row) => row.product_id === "cleanse-product")).toBe(
      true,
    );
  });
});
