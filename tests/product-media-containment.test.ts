import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page, Route } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontSnapshot } from "@/test-support/storefront-baseline";
import { createProductMediaContainment } from "@/test-support/product-media-containment";

const mediaOrigin = "https://erasogmsqpgiirovubjh.supabase.co";
const imageUrl = `${mediaOrigin}/storage/v1/object/public/helix-catalog/card.webp`;
const posterUrl = `${mediaOrigin}/storage/v1/object/public/helix-catalog/poster.webp`;
const videoUrl = `${mediaOrigin}/storage/v1/object/public/helix-catalog/routine.mp4`;
const sameSiteImageUrl = "/media/catalog/local-product.webp";
const approvedOriginImageUrl = `${mediaOrigin}/catalog-assets/alternate-product.webp`;

const snapshot = {
  schemaVersion: 1,
  products: [
    {
      id: "product-id",
      slug: "product",
      path: "/products/product",
      displayName: "PRODUCT",
      productType: "Cleanser",
      badge: null,
      currency: "USD",
      catalogStatus: "active",
      merchandisingStatus: "available",
      editorialDescription: "Description",
      swatch: ["#111111", "#222222"],
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      madeFor: null,
      goodFor: null,
      texture: null,
      keyIngredients: [],
      ingredients: null,
      concerns: [],
      usageTime: [],
      searchKeywords: [],
      routineGroup: "core",
      systemPosition: 1,
      systemStepName: "CLEANSE",
      routineSort: 0,
      familyId: null,
      familyIsEntry: null,
      variants: [],
      media: [
        {
          kind: "image",
          url: imageUrl,
          alt: "Product card",
          width: 1200,
          height: 1600,
          role: "card_default",
          sortOrder: 0,
          paletteId: null,
          placeholderPalette: null,
        },
        {
          kind: "image",
          url: posterUrl,
          alt: "Routine poster",
          width: 1200,
          height: 1600,
          role: "routine_video_poster",
          sortOrder: 1,
          paletteId: null,
          placeholderPalette: null,
        },
        {
          kind: "video",
          url: videoUrl,
          alt: "Routine video",
          width: null,
          height: null,
          role: "routine_video",
          sortOrder: 2,
          paletteId: null,
          placeholderPalette: null,
        },
        {
          kind: "image",
          url: sameSiteImageUrl,
          alt: "Same-site Product image",
          width: 1200,
          height: 1600,
          role: "gallery",
          sortOrder: 3,
          paletteId: null,
          placeholderPalette: null,
        },
        {
          kind: "image",
          url: approvedOriginImageUrl,
          alt: "Approved-origin Product image",
          width: 1200,
          height: 1600,
          role: "gallery",
          sortOrder: 4,
          paletteId: null,
          placeholderPalette: null,
        },
      ],
      offer: null,
    },
  ],
  routineComplements: [],
  journeys: {
    coreProductId: "product-id",
    beyondCoreProductId: "product-id",
    purchasableProductId: "product-id",
    richPdpProductId: "product-id",
    searchableProductId: "product-id",
  },
} as const satisfies StorefrontSnapshot;

type RouteHandler = (route: Route) => Promise<void>;

function pageHarness() {
  let handler: RouteHandler | undefined;
  const page = {
    route: vi.fn(async (_pattern: string, routeHandler: RouteHandler) => {
      handler = routeHandler;
    }),
  } as unknown as Page;

  function route(requestUrl: string) {
    const fulfilledBodies: Buffer[] = [];
    const fulfill = vi.fn(async (response?: { body?: Buffer }) => {
      if (response?.body) fulfilledBodies.push(response.body);
    });
    const fallback = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    return {
      route: {
        request: () => ({ url: () => requestUrl }),
        fulfill,
        fallback,
        abort,
      } as unknown as Route,
      fulfill,
      fulfilledBodies,
      fallback,
      abort,
    };
  }

  return {
    page,
    async dispatch(requestUrl: string) {
      if (!handler) throw new Error("Containment was not installed.");
      const request = route(requestUrl);
      await handler(request.route);
      return request;
    },
  };
}

describe("routine Product Media containment", () => {
  it("contains exact live Product Media while application media remains real", async () => {
    const harness = pageHarness();
    const containment = createProductMediaContainment(snapshot, {
      approvedMediaOrigin: mediaOrigin,
    });
    await containment.install(harness.page);

    const optimized = await harness.dispatch(
      `http://127.0.0.1:3000/_next/image?url=${encodeURIComponent(imageUrl)}&w=640&q=75`,
    );
    expect(optimized.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png", status: 200 }),
    );
    expect(optimized.fulfilledBodies[0]?.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );

    const poster = await harness.dispatch(posterUrl);
    expect(poster.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png", status: 200 }),
    );

    const video = await harness.dispatch(videoUrl);
    expect(video.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "video/mp4", status: 200 }),
    );
    expect(video.fulfilledBodies[0]?.subarray(4, 8).toString("ascii")).toBe(
      "ftyp",
    );

    const homepage = await harness.dispatch(
      "http://127.0.0.1:3000/media/home/mei-pelle-hero.mp4",
    );
    expect(homepage.fallback).toHaveBeenCalledOnce();

    expect(containment.report()).toEqual({
      containedRequests: 3,
      imageRequests: 2,
      videoRequests: 1,
      posterRequests: 1,
      optimizedImageRequests: 1,
      rejectedRequests: 0,
    });
  });

  it("contains same-site and approved-origin Product Media listed in the Storefront snapshot", async () => {
    const harness = pageHarness();
    const containment = createProductMediaContainment(snapshot, {
      approvedMediaOrigin: mediaOrigin,
    });
    await containment.install(harness.page);

    const sameSite = await harness.dispatch(
      `http://127.0.0.1:3000/_next/image?url=${encodeURIComponent(sameSiteImageUrl)}&w=640&q=75`,
    );
    expect(sameSite.fulfill).toHaveBeenCalledOnce();

    const approvedOrigin = await harness.dispatch(approvedOriginImageUrl);
    expect(approvedOrigin.fulfill).toHaveBeenCalledOnce();
  });

  it("blocks an unclassified request to the approved Product Media bucket", async () => {
    const harness = pageHarness();
    const containment = createProductMediaContainment(snapshot, {
      approvedMediaOrigin: mediaOrigin,
    });
    await containment.install(harness.page);
    const unexpectedUrl =
      `${mediaOrigin}/storage/v1/object/public/helix-catalog/unexpected.webp`;

    await expect(harness.dispatch(unexpectedUrl)).rejects.toThrow(
      `Product Media request is absent from the live Storefront: ${unexpectedUrl}`,
    );
    expect(containment.report().rejectedRequests).toBe(1);
  });

  it("blocks an unclassified public Storage request outside known buckets", async () => {
    const harness = pageHarness();
    const containment = createProductMediaContainment(snapshot, {
      approvedMediaOrigin: mediaOrigin,
    });
    await containment.install(harness.page);
    const unexpectedUrl =
      `${mediaOrigin}/storage/v1/object/public/new-catalog/unexpected.webp`;

    await expect(harness.dispatch(unexpectedUrl)).rejects.toThrow(
      `Product Media request is absent from the live Storefront: ${unexpectedUrl}`,
    );
    expect(containment.report().rejectedRequests).toBe(1);
  });

  it("is mandatory for every routine Playwright specification", async () => {
    const e2eDirectory = join(process.cwd(), "e2e");
    const specFiles = (await readdir(e2eDirectory))
      .filter((file) => file.endsWith(".spec.ts"))
      .sort();
    const bypasses: string[] = [];
    for (const file of specFiles) {
      const contents = await readFile(join(e2eDirectory, file), "utf8");
      if (!contents.match(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']\.\/storefront-fixture["']/s)) {
        bypasses.push(file);
      }
    }

    expect(bypasses).toEqual([]);
  });
});
