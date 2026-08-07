import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import globalSetup from "@/e2e/global-setup";
import {
  STOREFRONT_SNAPSHOT_ENV,
  loadStorefrontSnapshot,
} from "@/test-support/storefront-snapshot-artifact";
import type { StorefrontCatalogProduct } from "@/test-support/storefront-baseline";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalSnapshotPath = process.env[STOREFRONT_SNAPSHOT_ENV];

function product(
  overrides: Partial<StorefrontCatalogProduct> = {},
): StorefrontCatalogProduct {
  return {
    id: "core-id",
    slug: "core-product",
    display_name: "CORE",
    formal_title: "Core Product",
    card_tagline: "Public tagline",
    product_type: "Cleanser",
    badge: null,
    currency: "USD",
    catalog_status: "active",
    status: "available",
    editorial_description: "Public description",
    swatch_from: "#112233",
    swatch_to: "#445566",
    sort_order: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
    made_for: null,
    good_for: null,
    texture: null,
    key_ingredients: [],
    ingredients: null,
    concerns: [],
    usage_time: [],
    search_keywords: [],
    routine_group: "core",
    routine_step_number: 1,
    routine_step_name: "CLEANSE",
    routine_sort: 10,
    product_variants: [
      {
        variant_key: "standard",
        label: "Standard",
        price_cents: 2200,
        sort_order: 0,
        available: true,
        inventory_status: "in_stock",
      },
    ],
    product_media: [
      {
        media_type: "video",
        url: "https://cdn.example.test/routine.mp4",
        alt: "Routine video",
        width: null,
        height: null,
        role: "routine_video",
        sort_order: 0,
        palette_id: null,
        placeholder_palette: null,
      },
      {
        media_type: "image",
        url: "https://cdn.example.test/poster.webp",
        alt: "Routine poster",
        width: 1200,
        height: 1600,
        role: "routine_video_poster",
        sort_order: 1,
        palette_id: null,
        placeholder_palette: null,
      },
      {
        media_type: "image",
        url: "https://cdn.example.test/gallery.webp",
        alt: "Product bottle",
        width: 1200,
        height: 1600,
        role: "gallery",
        sort_order: 2,
        palette_id: null,
        placeholder_palette: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://erasogmsqpgiirovubjh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
  delete process.env[STOREFRONT_SNAPSHOT_ENV];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  if (originalSnapshotPath === undefined) delete process.env[STOREFRONT_SNAPSHOT_ENV];
  else process.env[STOREFRONT_SNAPSHOT_ENV] = originalSnapshotPath;
});

describe("Playwright global Storefront baseline setup", () => {
  it("writes one validated live snapshot to the shared test output", async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), "mei-pelle-global-baseline-"),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("product_relationships")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(
        JSON.stringify([
          product(),
          product({
            id: "beyond-id",
            slug: "beyond-product",
            display_name: "BEYOND",
            routine_group: "beyond_core",
            routine_step_number: 4,
            routine_step_name: "FRAME",
            routine_sort: 20,
            sort_order: 20,
            product_variants: [],
            product_media: [],
          }),
        ]),
        { status: 200 },
      );
    });

    try {
      await globalSetup({
        projects: [{ outputDir: outputDirectory }],
      } as unknown as FullConfig);

      const artifactPath = process.env[STOREFRONT_SNAPSHOT_ENV];
      expect(artifactPath).toBe(
        join(outputDirectory, "storefront-baseline.json"),
      );
      if (!artifactPath) throw new Error("Expected snapshot artifact path.");
      const snapshot = await loadStorefrontSnapshot(artifactPath);
      expect(snapshot.products.map((item) => item.slug)).toEqual([
        "core-product",
        "beyond-product",
      ]);
      expect(snapshot.journeys.richPdpProductId).toBe("core-id");
      expect(await readFile(artifactPath, "utf8")).not.toContain(
        "public-anon-key",
      );
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("fails with a targeted diagnostic when the approved project times out", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const setup = globalSetup();
    const assertion = expect(setup).rejects.toThrow(
      "e2e: the approved Supabase project did not respond within 10s",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("surfaces targeted live Catalog validation failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return new Response(
        JSON.stringify(url.includes("product_relationships") ? [] : [product()]),
        { status: 200 },
      );
    });

    await expect(globalSetup()).rejects.toThrow(
      "e2e: The active Storefront has no Product capable of the Beyond The Core collection journey",
    );
  });
});
