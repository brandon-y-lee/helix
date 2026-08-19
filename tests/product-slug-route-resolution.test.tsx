import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  permanentRedirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

const catalogCache = vi.hoisted(() => ({
  getCachedCoreRoutineSummaries: vi.fn(),
  getCachedDiscoveryProductCards: vi.fn(),
  getCachedPdpProduct: vi.fn(),
  getCachedProductMetadata: vi.fn(),
  getCachedProductSlugResolution: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/catalog-cache", () => catalogCache);
vi.mock("@/components/product-detail/ProductDetail", () => ({
  ProductDetail: () => <div>Canonical PDP</div>,
}));
vi.mock("@/components/product/ProductCarousel", () => ({
  ProductCarousel: () => null,
}));
vi.mock("@/lib/catalog/product-structured-data", () => ({
  buildProductStructuredData: () => ({ "@type": "Product" }),
  serializeStructuredData: () => "{}",
}));
vi.mock("@/lib/checkout/config", () => ({
  stripeMessagingPublishableKey: () => null,
}));

import ProductDetailPage, {
  dynamic,
  generateMetadata,
} from "@/app/products/[slug]/page";

const canonicalSlug = "peptide-bounce";
const historicalSlug = "treat-03-pdrn-5-ampoule";
const metadata = {
  slug: canonicalSlug,
  displayName: "Peptide Bounce",
  productType: "PDRN serum",
  editorialDescription: "A daily serum for bouncier-looking skin.",
  seoTitle: null,
  seoDescription: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  catalogCache.getCachedCoreRoutineSummaries.mockResolvedValue([]);
  catalogCache.getCachedDiscoveryProductCards.mockResolvedValue([]);
  catalogCache.getCachedPdpProduct.mockResolvedValue({
    id: "product-id",
    slug: canonicalSlug,
    routineGroup: "beyond_core",
  });
  catalogCache.getCachedProductMetadata.mockResolvedValue(metadata);
});

describe("durable Product slug route resolution", () => {
  it("resolves canonical and future alias paths only after a real request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each(["Invalid_Product", "a".repeat(121)])(
    "rejects invalid inbound slug %s before creating a cached lookup",
    async (slug) => {
      await expect(
        ProductDetailPage({
          params: Promise.resolve({ slug }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow("NOT_FOUND");

      expect(catalogCache.getCachedProductSlugResolution).not.toHaveBeenCalled();
      expect(catalogCache.getCachedPdpProduct).not.toHaveBeenCalled();

      const result = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(result.title).toBe("Product | helix");
      expect(catalogCache.getCachedProductSlugResolution).not.toHaveBeenCalled();
    },
  );

  it("renders a canonical Product only after resolving its canonical ledger row", async () => {
    catalogCache.getCachedProductSlugResolution.mockResolvedValue({
      sourceSlug: canonicalSlug,
      targetSlug: canonicalSlug,
      targetProductId: "product-id",
      routeKind: "canonical",
    });

    await ProductDetailPage({
      params: Promise.resolve({ slug: canonicalSlug }),
      searchParams: Promise.resolve({}),
    });

    expect(catalogCache.getCachedProductSlugResolution).toHaveBeenCalledWith(
      canonicalSlug,
    );
    expect(catalogCache.getCachedPdpProduct).toHaveBeenCalledWith(canonicalSlug);
    expect(navigation.permanentRedirect).not.toHaveBeenCalled();
  });

  it.each(["rename", "replacement"] as const)(
    "permanently redirects a %s route directly to the current canonical slug",
    async (routeKind) => {
      catalogCache.getCachedProductSlugResolution.mockResolvedValue({
        sourceSlug: historicalSlug,
        targetSlug: canonicalSlug,
        targetProductId: "product-id",
        routeKind,
      });

      await expect(
        ProductDetailPage({
          params: Promise.resolve({ slug: historicalSlug }),
          searchParams: Promise.resolve({
            campaign: "launch / core",
            filter: ["one", "two"],
            next: "https://example.com/offsite",
          }),
        }),
      ).rejects.toThrow(
        "REDIRECT:/products/peptide-bounce?campaign=launch+%2F+core&filter=one&filter=two&next=https%3A%2F%2Fexample.com%2Foffsite",
      );

      expect(catalogCache.getCachedPdpProduct).not.toHaveBeenCalled();
      expect(navigation.permanentRedirect).toHaveBeenCalledOnce();
    },
  );

  it("returns not found when Supabase has no active canonical target", async () => {
    catalogCache.getCachedProductSlugResolution.mockResolvedValue(undefined);

    await expect(
      ProductDetailPage({
        params: Promise.resolve({ slug: "missing-product" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NOT_FOUND");

    expect(catalogCache.getCachedPdpProduct).not.toHaveBeenCalled();
  });

  it("emits only the target Product canonical URL for historical metadata", async () => {
    catalogCache.getCachedProductSlugResolution.mockResolvedValue({
      sourceSlug: historicalSlug,
      targetSlug: canonicalSlug,
      targetProductId: "product-id",
      routeKind: "rename",
    });

    const result = await generateMetadata({
      params: Promise.resolve({ slug: historicalSlug }),
    });

    expect(catalogCache.getCachedProductMetadata).toHaveBeenCalledWith(
      canonicalSlug,
    );
    expect(result.alternates).toEqual({
      canonical: "/products/peptide-bounce",
    });
  });
});
