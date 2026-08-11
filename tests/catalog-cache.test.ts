import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CoreRoutineContentSummary,
  PdpProductContent,
  ProductCardContent,
  ProductOffer,
} from "@/lib/catalog/models";
import type { Product } from "@/lib/products";

type CacheRegistration = {
  keyParts: string[];
  options: { revalidate?: number | false; tags?: string[] };
};

const cacheRegistrations = vi.hoisted(() => [] as CacheRegistration[]);

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn(
    <T extends (...args: never[]) => unknown>(
      callback: T,
      keyParts: string[],
      options: CacheRegistration["options"],
    ) => {
      cacheRegistrations.push({ keyParts, options });
      return callback;
    },
  ),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(callback: T) => callback };
});

vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalog")>();
  return { ...actual, getProducts: vi.fn() };
});

vi.mock("@/lib/catalog/storefront", () => ({
  getCoreRoutineContentSummaries: vi.fn(),
  getDiscoveryProductCardContents: vi.fn(),
  getIngredientIndexProducts: vi.fn(),
  getPdpProductContent: vi.fn(),
  getProductCardContents: vi.fn(),
  getProductMetadata: vi.fn(),
  getProductOffer: vi.fn(),
  getProductOffers: vi.fn(),
  getProductRoutes: vi.fn(),
  getProductSlugResolution: vi.fn(),
}));

import { getProducts } from "@/lib/catalog";
import {
  getCoreRoutineContentSummaries,
  getDiscoveryProductCardContents,
  getPdpProductContent,
  getProductCardContents,
  getProductOffer,
  getProductOffers,
  getProductSlugResolution,
} from "@/lib/catalog/storefront";
import {
  CORE_ROUTINE_CACHE_TAG,
  CORE_ROUTINE_REVALIDATE_SECONDS,
  DISCOVERY_CACHE_TAG,
  getCachedCoreRoutineSummaries,
  getCachedDiscoveryProductCards,
  getCachedPdpProduct,
  getCachedProductCards,
  getCachedProducts,
  getCachedProductSlugResolution,
  PRODUCT_CARD_COLLECTION_CACHE_TAG,
  PRODUCT_CARD_REVALIDATE_SECONDS,
  PRODUCT_CONTENT_REVALIDATE_SECONDS,
  PRODUCT_OFFER_COLLECTION_CACHE_TAG,
  PRODUCT_OFFER_REVALIDATE_SECONDS,
  productContentCacheTag,
  productOfferCacheTag,
  productSlugRouteCacheTag,
  PRODUCT_SLUG_ROUTE_COLLECTION_CACHE_TAG,
} from "@/lib/catalog-cache";

const slug = "treat-03-pdrn-5-ampoule";
const offer = {
  id: "product-id",
  slug,
  currency: "USD",
  status: "available",
  variants: [
    {
      productId: "product-id",
      productSlug: slug,
      productStatus: "available",
      id: "30ml",
      label: "30 mL",
      price: 2500,
      available: true,
      inventoryStatus: "in_stock",
      volume: "30 mL",
      packCount: null,
      sortOrder: 0,
    },
  ],
} satisfies ProductOffer;

const card = {
  id: "product-id",
  slug,
  displayName: "TREAT",
  productType: "PDRN serum",
  volume: "30 mL",
  usageTime: ["AM", "PM"],
  routineGroup: "core",
  systemStepName: "TREAT",
  systemStepPosition: 3,
  routineSort: 30,
  sortOrder: 3,
  createdAt: "2026-06-14T00:00:00.000Z",
  swatch: ["#f1e8df", "#c8b6a6"],
  cardMedia: null,
  cardHoverMedia: null,
  cartMedia: null,
  productFamily: null,
} satisfies ProductCardContent;

const pdp = {
  id: "product-id",
  slug,
  displayName: "TREAT",
  description: "Stable editorial content",
  pdpContent: { schemaVersion: 1, routineGuidance: "After CLEANSE." },
} as PdpProductContent;

const core = {
  ...card,
  description: "Stable editorial content",
  benefits: [],
  keyIngredients: [],
  routineGroup: "core",
  pdpContent: { schemaVersion: 1, routineGuidance: "After CLEANSE." },
} as unknown as CoreRoutineContentSummary;

function registration(key: string) {
  const match = cacheRegistrations.find(
    (entry) => entry.keyParts[0] === key,
  );
  expect(match).toBeDefined();
  return match as CacheRegistration;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPdpProductContent).mockResolvedValue(pdp);
  vi.mocked(getProductOffer).mockResolvedValue(offer);
  vi.mocked(getProductOffers).mockResolvedValue([offer]);
  vi.mocked(getProductCardContents).mockResolvedValue([card]);
  vi.mocked(getDiscoveryProductCardContents).mockResolvedValue([card]);
  vi.mocked(getCoreRoutineContentSummaries).mockResolvedValue([core]);
  vi.mocked(getProductSlugResolution).mockResolvedValue({
    sourceSlug: slug,
    targetSlug: slug,
    targetProductId: "product-id",
    routeKind: "canonical",
  });
});

describe("catalog cache domains", () => {
  it("composes a PDP only after independently caching stable content and offers", async () => {
    const product = await getCachedPdpProduct(slug);

    expect(product).toMatchObject({
      slug,
      description: "Stable editorial content",
      status: "available",
      variants: [{ price: 2500 }],
    });
    expect(registration("catalog-pdp-content-v4").options).toEqual({
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [productContentCacheTag(slug), "catalog-product-family"],
    });
    expect(registration("catalog-pdp-offer-v2").options).toEqual({
      revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
      tags: [productOfferCacheTag(slug)],
    });
  });

  it("uses narrow card and Core readers while sharing the volatile offer cache", async () => {
    const [cards, discovery, summaries] = await Promise.all([
      getCachedProductCards(),
      getCachedDiscoveryProductCards(slug),
      getCachedCoreRoutineSummaries(),
    ]);

    expect(cards[0]).toMatchObject({ slug, variants: [{ price: 2500 }] });
    expect(discovery[0]).toMatchObject({ slug, status: "available" });
    expect(summaries[0]).toMatchObject({
      slug,
      systemStepName: "TREAT",
      variants: [{ price: 2500 }],
    });
    expect(getProductCardContents).toHaveBeenCalled();
    expect(getDiscoveryProductCardContents).toHaveBeenCalledWith(slug, 3);
    expect(getCoreRoutineContentSummaries).toHaveBeenCalled();
    expect(registration("catalog-product-cards-v3").options).toEqual({
      revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
      tags: expect.arrayContaining([PRODUCT_CARD_COLLECTION_CACHE_TAG]),
    });
    expect(registration("catalog-purpose-offers-v1").options).toEqual({
      revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
      tags: expect.arrayContaining([PRODUCT_OFFER_COLLECTION_CACHE_TAG]),
    });
    expect(registration("catalog-core-routine-content-v5").options).toEqual({
      revalidate: CORE_ROUTINE_REVALIDATE_SECONDS,
      tags: expect.arrayContaining([CORE_ROUTINE_CACHE_TAG]),
    });
    expect(registration("catalog-discovery-cards-v5").options.tags).toEqual(
      expect.arrayContaining([DISCOVERY_CACHE_TAG]),
    );
  });

  it("keeps the remaining complete /system reader stratified by domain", async () => {
    vi.mocked(getProducts).mockResolvedValue([
      {
        id: "product-id",
        slug,
        media: [],
        variants: [],
        currency: "USD",
        status: "available",
        catalogStatus: "active",
        badge: null,
        featuredRank: null,
        sortOrder: 1,
      } as unknown as Product,
    ]);

    await expect(getCachedProducts()).resolves.toHaveLength(1);
    expect(registration("catalog-products-content-v3").options.revalidate).toBe(
      PRODUCT_CONTENT_REVALIDATE_SECONDS,
    );
    expect(registration("catalog-products-offer-v2").options.revalidate).toBe(
      PRODUCT_OFFER_REVALIDATE_SECONDS,
    );
    expect(registration("catalog-products-card-v3").options.revalidate).toBe(
      PRODUCT_CARD_REVALIDATE_SECONDS,
    );
  });

  it("caches route resolution by source slug with ledger-wide invalidation", async () => {
    await expect(getCachedProductSlugResolution(slug)).resolves.toMatchObject({
      sourceSlug: slug,
      targetSlug: slug,
      routeKind: "canonical",
    });
    expect(getProductSlugResolution).toHaveBeenCalledWith(slug);
    expect(registration("catalog-product-slug-route-v1").options).toEqual({
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [
        PRODUCT_SLUG_ROUTE_COLLECTION_CACHE_TAG,
        productSlugRouteCacheTag(slug),
      ],
    });
  });
});
