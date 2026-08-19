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
  const value: StorefrontCatalogProduct = {
    id: "core-id",
    slug: "core-product",
    display_name: "CORE",
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
    system_step_name: "CLEANSE",
    system_steps: { name: "CLEANSE", position: 1, routine_group: "core" },
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
        url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/routine.mp4",
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
        url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/poster.webp",
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
        url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/gallery.webp",
        alt: "Product bottle",
        width: 1200,
        height: 1600,
        role: "gallery",
        sort_order: 2,
        palette_id: null,
        placeholder_palette: null,
      },
    ],
    product_family_memberships: null,
    ...overrides,
  };
  if (!("system_steps" in overrides)) {
    value.system_steps = value.routine_group === "beyond_core"
      ? { name: "FRAME", position: 4, routine_group: "beyond_core" }
      : { name: "CLEANSE", position: 1, routine_group: "core" };
  }
  return value;
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
    const storefrontReads: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:3000")) {
        const pathname = new URL(url).pathname;
        storefrontReads.push(pathname);
        const products = pathname === "/collections/core"
          ? [["core-product", "CORE"]]
          : pathname === "/collections/beyond-the-core"
            ? [["beyond-product", "BEYOND"]]
            : [["core-product", "CORE"], ["beyond-product", "BEYOND"]];
        if (pathname.startsWith("/collections/")) {
          return new Response(`<!doctype html><html><body>
            <span class="product-count">${products.length} ${products.length === 1 ? "product" : "products"}</span>
            ${products.map(([slug, name]) => `<div data-product-card-slug="${slug}"><span class="product-card__display-name">${name}</span>${slug === "core-product" ? '<span class="product-card__price">$22.00</span>' : ""}<button class="product-card__quick-trigger">${slug === "core-product" ? "BUY CORE - $22.00" : "OUT OF STOCK"}</button></div>`).join("")}
          </body></html>`, { status: 200 });
        }
        if (pathname === "/products/core-product") {
          return new Response(`<!doctype html><html><body>
            <h1>CORE</h1>
            <p class="pdp__price">$22.00</p>
            <div class="variant-options"><button>Standard</button></div>
            <button data-pdp-buy-button>BUY CORE - $22.00</button>
            <section aria-label="CORE routine video"></section>
            <button data-pdp-media-thumbnail aria-label="View Product bottle, media 1 of 1"></button>
          </body></html>`, { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }
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
            system_step_name: "FRAME",
            routine_sort: 20,
            sort_order: 20,
            status: "sold_out",
            product_variants: [],
            product_media: [],
          }),
        ]),
        { status: 200 },
      );
    });

    try {
      await globalSetup({
        projects: [{
          outputDir: outputDirectory,
          use: { baseURL: "http://127.0.0.1:3000" },
        }],
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
      expect(storefrontReads).toEqual([
        "/collections/shop",
        "/collections/core",
        "/collections/beyond-the-core",
        "/products/core-product",
      ]);
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
      "e2e: The active Storefront has no Product capable of the Beyond The Core Routine Group journey",
    );
  });
});
