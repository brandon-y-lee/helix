import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_MEDIA_ASSETS,
  CORE_MEDIA_ROLES,
  inspectAsset,
  readWebpDimensions,
  storagePathFor,
} from "@/scripts/catalog-sync-core-media";

describe("core product media sync plan", () => {
  it("targets the minimum role set required by current storefront mappers", () => {
    expect(CORE_MEDIA_ROLES).toEqual([
      "card_default",
      "detail",
      "cart",
      "search",
    ]);
  });

  it("reads the controlled replacement image dimensions", async () => {
    const dimensions = await Promise.all(
      CORE_MEDIA_ASSETS.map(async (asset) => {
        const bytes = await readFile(resolve(process.cwd(), asset.localPath));
        return [asset.slug, readWebpDimensions(bytes)] as const;
      }),
    );

    expect(dimensions).toEqual([
      [
        "cleanse-01-calming-gel-cleanser",
        { width: 1200, height: 1650 },
      ],
      ["treat-03-pdrn-5-ampoule", { width: 1400, height: 1867 }],
      ["seal-05-green-collagen-cream", { width: 1400, height: 1867 }],
    ]);
  });

  it("uses versioned content-hash Storage paths", () => {
    expect(storagePathFor("cleanse-01-calming-gel-cleanser", "abc123")).toBe(
      "products/cleanse-01-calming-gel-cleanser/primary/abc123.webp",
    );
  });

  it("computes stable public URLs for the verified Supabase project", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://erasogmsqpgiirovubjh.supabase.co";

    try {
      const inspected = await inspectAsset(CORE_MEDIA_ASSETS[0]);
      expect(inspected.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(inspected.storagePath).toMatch(
        /^products\/cleanse-01-calming-gel-cleanser\/primary\/[0-9a-f]{64}\.webp$/,
      );
      expect(inspected.publicUrl).toBe(
        `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/${inspected.storagePath}`,
      );
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
  });
});
