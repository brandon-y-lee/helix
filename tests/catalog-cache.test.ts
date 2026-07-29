import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/products";

type CacheRegistration = {
  keyParts: string[];
  options: {
    revalidate?: number | false;
    tags?: string[];
  };
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
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(callback: T) => {
      const values = new Map<string, ReturnType<T>>();
      return (...args: Parameters<T>) => {
        const key = JSON.stringify(args);
        if (!values.has(key)) values.set(key, callback(...args) as ReturnType<T>);
        return values.get(key) as ReturnType<T>;
      };
    },
  };
});

vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalog")>();
  return {
    ...actual,
    getCoreRoutineProducts: vi.fn(),
    getDiscoveryProductSlugs: vi.fn(),
    getProduct: vi.fn(),
    getProducts: vi.fn(),
    getRelatedProductSlugs: vi.fn(),
  };
});

import {
  getDiscoveryProductSlugs,
  getProduct,
  getProducts,
} from "@/lib/catalog";
import {
  CATALOG_PRODUCTS_CACHE_TAG,
  CORE_ROUTINE_CACHE_TAG,
  CORE_ROUTINE_PRODUCT_SLUGS,
  CORE_ROUTINE_REVALIDATE_SECONDS,
  DISCOVERY_CACHE_TAG,
  getCachedDiscoveryProducts,
  getCachedProduct,
  getCachedProductContent,
  getCachedProductOffer,
  getCachedProducts,
  PRODUCT_CARD_REVALIDATE_SECONDS,
  PRODUCT_CONTENT_REVALIDATE_SECONDS,
  PRODUCT_OFFER_REVALIDATE_SECONDS,
  productCardCacheTag,
  productContentCacheTag,
  productOfferCacheTag,
} from "@/lib/catalog-cache";

const product: Product = {
  id: "product-id",
  slug: "treat-03-pdrn-5-ampoule",
  displayName: "TREAT",
  formalTitle: "TREAT 03 PDRN 5 Ampoule",
  name: "TREAT",
  tagline: "Bounce and glow",
  cardTagline: "Daily bounce support",
  collection: "The Core",
  actionName: "TREAT",
  routineNumber: "03",
  routineGroup: "core",
  routineGroupLabel: "The Core",
  routineStepNumber: 2,
  routineStepName: "Treat",
  routineDisplayLabel: "02 — The Core",
  routineSort: 20,
  subtitle: "Bounce and glow",
  descriptor: "A daily ampoule.",
  productType: "Ampoule",
  badge: null,
  currency: "USD",
  featuredRank: 1,
  sortOrder: 3,
  blurb: "A daily ampoule.",
  description: "Stable editorial description.",
  editorialDescription: "Stable editorial description.",
  benefits: ["Supports smoother-looking skin"],
  howToUse: "Apply after cleansing.",
  editorialHowToUse: "Apply after cleansing.",
  formulaNotes: [],
  variants: [
    {
      id: "15ml",
      label: "15 mL",
      price: 2500,
      compareAtPrice: null,
      sku: null,
      available: true,
      inventoryStatus: "in_stock",
      volume: "15 mL",
      packCount: null,
      optionValues: { size: "15 mL" },
      sortOrder: 0,
    },
  ],
  swatch: ["#edf4f5", "#87a3aa"],
  media: [
    {
      kind: "image",
      url: "https://example.test/card.webp",
      alt: "TREAT bottle",
      width: 1200,
      height: 1600,
      role: "card_default",
      sortOrder: 0,
      paletteId: null,
      palette: null,
    },
    {
      kind: "image",
      url: "https://example.test/editorial.webp",
      alt: "TREAT texture",
      width: 1200,
      height: 1600,
      role: "ingredients_texture",
      sortOrder: 1,
      paletteId: null,
      palette: null,
    },
  ],
  cardMedia: null,
  cardHoverMedia: null,
  heroMedia: null,
  detailMedia: null,
  cartMedia: null,
  searchMedia: null,
  status: "available",
  catalogStatus: "active",
  madeFor: "All skin types",
  goodFor: "Daily use",
  texture: "Lightweight serum",
  keyIngredients: ["PDRN"],
  ingredients: "Water, PDRN",
  productDetails: {},
  cautions: [],
  finish: "Clean",
  volume: "15 mL",
  skinTypes: ["All skin types"],
  concerns: ["Dullness"],
  routineStep: "Treat",
  routineOrder: 3,
  usageTime: ["AM", "PM"],
  seoTitle: "TREAT | Mei Pelle",
  seoDescription: "Stable metadata.",
  searchKeywords: ["serum"],
  createdAt: "2026-06-14T00:00:00.000Z",
};

function registration(key: string) {
  const match = cacheRegistrations.find(
    (entry) => entry.keyParts[0] === key,
  );
  expect(match).toBeDefined();
  return match as CacheRegistration;
}

beforeEach(() => {
  vi.mocked(getProduct).mockReset();
  vi.mocked(getProducts).mockReset();
  vi.mocked(getDiscoveryProductSlugs).mockReset();
  vi.mocked(getProduct).mockResolvedValue(product);
  vi.mocked(getProducts).mockResolvedValue([product]);
  vi.mocked(getDiscoveryProductSlugs).mockResolvedValue([product.slug]);
});

describe("catalog cache domains", () => {
  it("uses separate content, offer, and card policies without overlapping cached fields", async () => {
    const content = await getCachedProductContent(product.slug);
    const offer = await getCachedProductOffer(product.slug);
    const composed = await getCachedProduct(product.slug);

    expect(content).toMatchObject({
      slug: product.slug,
      description: "Stable editorial description.",
    });
    expect(content).not.toHaveProperty("variants");
    expect(content).not.toHaveProperty("status");
    expect(content).not.toHaveProperty("cardTagline");
    expect(content?.media.map((media) => media.role)).toEqual([
      "ingredients_texture",
    ]);
    expect(offer).toEqual({
      id: product.id,
      slug: product.slug,
      currency: "USD",
      variants: product.variants,
      status: "available",
      catalogStatus: "active",
    });
    expect(offer).not.toHaveProperty("description");
    expect(offer).not.toHaveProperty("media");
    expect(composed?.cardTagline).toBe("Daily bounce support");
    expect(composed?.variants[0].price).toBe(2500);
    expect(composed?.media).toHaveLength(2);

    expect(registration("catalog-product-content-v1").options).toEqual({
      revalidate: PRODUCT_CONTENT_REVALIDATE_SECONDS,
      tags: [productContentCacheTag(product.slug)],
    });
    expect(registration("catalog-product-offer-v1").options).toEqual({
      revalidate: PRODUCT_OFFER_REVALIDATE_SECONDS,
      tags: [productOfferCacheTag(product.slug)],
    });
    expect(registration("catalog-product-card-v1").options).toEqual({
      revalidate: PRODUCT_CARD_REVALIDATE_SECONDS,
      tags: [productCardCacheTag(product.slug)],
    });
    expect(vi.mocked(getProduct)).toHaveBeenCalledTimes(1);
  });

  it("composes collection domains from one request read and keeps discovery membership separate", async () => {
    const products = await getCachedProducts();
    const discovery = await getCachedDiscoveryProducts(product.slug);

    expect(products).toEqual([expect.objectContaining({ slug: product.slug })]);
    expect(discovery).toEqual([
      expect.objectContaining({ slug: product.slug }),
    ]);
    expect(vi.mocked(getProducts)).toHaveBeenCalledTimes(1);
    expect(registration("catalog-products-content-v1").options.revalidate).toBe(
      PRODUCT_CONTENT_REVALIDATE_SECONDS,
    );
    expect(registration("catalog-products-offer-v1").options.revalidate).toBe(
      PRODUCT_OFFER_REVALIDATE_SECONDS,
    );
    expect(registration("catalog-products-card-v1").options.revalidate).toBe(
      PRODUCT_CARD_REVALIDATE_SECONDS,
    );
    expect(
      registration("catalog-discovery-membership-v1").options.tags,
    ).toEqual([CATALOG_PRODUCTS_CACHE_TAG, DISCOVERY_CACHE_TAG]);
    expect(registration("catalog-core-routine-v2").options).toEqual({
      revalidate: CORE_ROUTINE_REVALIDATE_SECONDS,
      tags: [
        CORE_ROUTINE_CACHE_TAG,
        ...CORE_ROUTINE_PRODUCT_SLUGS.map(productContentCacheTag),
      ],
    });
  });
});
