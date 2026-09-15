import { beforeEach, describe, expect, it, vi } from "vitest";

// The provider and Next cache are external boundaries. This test retains real
// page readers, cache keys/tags, webhook validation and invalidation decisions.
// It does not claim to emulate Next's full route cache or an actual SQL Publish.
const state = vi.hoisted(() => ({
  publishedSlug: "first-serum" as string | null,
  cache: new Map<string, { value: Promise<unknown>; tags: string[] }>(),
  sync: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    read: (...args: unknown[]) => Promise<unknown>,
    key: string[],
    options: { tags?: string[] },
  ) => (...args: unknown[]) => {
    const identity = JSON.stringify([key, args]);
    if (!state.cache.has(identity)) {
      state.cache.set(identity, { value: read(...args), tags: options.tags ?? [] });
    }
    return state.cache.get(identity)!.value;
  },
  revalidateTag: (tag: string) => {
    for (const [key, entry] of state.cache) {
      if (entry.tags.includes(tag)) state.cache.delete(key);
    }
  },
  revalidatePath: () => {},
}));

vi.mock("@/lib/catalog/storefront", () => ({
  getPdpProductContent: async (slug: string) => slug === state.publishedSlug ? {
    id: "10000000-0000-4000-8000-000000000101", slug,
    displayName: "Current Serum", routineGroup: "beyond_core",
  } : undefined,
  getProductOffer: async (slug: string) => slug === state.publishedSlug ? {
    id: "10000000-0000-4000-8000-000000000101", slug,
    currency: "USD", status: "available", variants: [],
  } : undefined,
  getProductMetadata: async (slug: string) => slug === state.publishedSlug ? {
    slug, displayName: "Current Serum", productType: "Daily serum",
    editorialDescription: "Reviewed current content.", seoTitle: null, seoDescription: null,
  } : undefined,
  getCoreRoutineContentSummaries: async () => [],
  getDiscoveryProductCardContents: async () => [],
  getIngredientIndexProducts: async () => [],
  getProductCardContents: async () => [],
  getProductOffers: async () => [],
  getProductRoutes: async () => [],
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/components/product-detail/ProductDetail", () => ({ ProductDetail: () => null }));
vi.mock("@/components/product/ProductCarousel", () => ({ ProductCarousel: () => null }));
vi.mock("@/lib/catalog/product-structured-data", () => ({
  buildProductStructuredData: () => ({}), serializeStructuredData: () => "{}",
}));
vi.mock("@/lib/checkout/config", () => ({ stripeMessagingPublishableKey: () => null }));
vi.mock("@/lib/algolia/server", () => ({ getIndexName: () => "helix_products" }));
vi.mock("@/lib/algolia/sync", async (original) => ({
  ...await original<typeof import("@/lib/algolia/sync")>(),
  applyCatalogWebhookEvent: state.sync,
  verifyWebhookSecret: (secret: string | null) => secret === "synthetic-webhook-secret",
}));

import ProductDetailPage, { generateMetadata } from "@/app/products/[slug]/page";
import { getCachedPdpProduct } from "@/lib/catalog-cache";
import { POST } from "@/app/api/webhooks/supabase/catalog-search-sync/route";

const pageInput = (slug: string) => ({ params: Promise.resolve({ slug }) });
function webhook(type: "INSERT" | "UPDATE", oldSlug: string | null, slug: string) {
  return new Request("https://helix.test/api/webhooks/supabase/catalog-search-sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "synthetic-webhook-secret" },
    body: JSON.stringify({
      schema: "public", table: "products", type,
      record: { id: "10000000-0000-4000-8000-000000000101", slug, routine_group: "beyond_core" },
      old_record: oldSlug ? {
        id: "10000000-0000-4000-8000-000000000101", slug: oldSlug, routine_group: "beyond_core",
      } : null,
    }),
  });
}

beforeEach(() => {
  state.cache.clear();
  state.publishedSlug = "first-serum";
  state.sync.mockReset();
  state.sync.mockResolvedValue({ action: "upsert", table: "products", slug: "current-serum", oldSlug: "first-serum" });
});

describe("canonical publication across cached reads and the Catalog webhook", () => {
  it.each(["healthy", "unavailable"] as const)(
    "evicts the former page and a cached new-slug miss when Search is %s",
    async (search) => {
      await expect(ProductDetailPage(pageInput("first-serum"))).resolves.toBeDefined();
      expect((await generateMetadata(pageInput("first-serum"))).alternates?.canonical).toBe("/products/first-serum");
      await expect(ProductDetailPage(pageInput("current-serum"))).rejects.toThrow("NOT_FOUND");
      expect((await generateMetadata(pageInput("current-serum"))).alternates).toBeUndefined();

      // Independent canonical storage has advanced; both prior positive data
      // and the negative new-slug lookup must remain cached until invalidation.
      state.publishedSlug = "current-serum";
      expect((await getCachedPdpProduct("first-serum"))?.slug).toBe("first-serum");
      expect(await getCachedPdpProduct("current-serum")).toBeUndefined();
      if (search === "unavailable") state.sync.mockRejectedValue(new Error("Synthetic Search outage"));
      const response = await POST(webhook("UPDATE", "first-serum", "current-serum"));
      expect(response.status).toBe(search === "healthy" ? 200 : 502);

      await expect(ProductDetailPage(pageInput("first-serum"))).rejects.toThrow("NOT_FOUND");
      expect((await generateMetadata(pageInput("first-serum"))).alternates).toBeUndefined();
      await expect(ProductDetailPage(pageInput("current-serum"))).resolves.toBeDefined();
      expect((await getCachedPdpProduct("current-serum"))?.status).toBe("available");
      expect((await generateMetadata(pageInput("current-serum"))).alternates?.canonical).toBe("/products/current-serum");
    },
  );

  it("makes a newly published canonical Product available after its earlier cached absence", async () => {
    state.publishedSlug = null;
    await expect(ProductDetailPage(pageInput("current-serum"))).rejects.toThrow("NOT_FOUND");
    expect((await generateMetadata(pageInput("current-serum"))).alternates).toBeUndefined();
    state.publishedSlug = "current-serum";
    expect(await getCachedPdpProduct("current-serum")).toBeUndefined();
    expect((await POST(webhook("INSERT", null, "current-serum"))).status).toBe(200);
    await expect(ProductDetailPage(pageInput("current-serum"))).resolves.toBeDefined();
    expect((await generateMetadata(pageInput("current-serum"))).alternates?.canonical).toBe("/products/current-serum");
  });
});
