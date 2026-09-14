import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/catalog-cache", () => catalogCache);
vi.mock("@/components/product-detail/ProductDetail", () => ({
  ProductDetail: ({ presentation }: { presentation?: string }) => (
    <div data-testid="canonical-pdp" data-presentation={presentation}>Canonical PDP</div>
  ),
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
  generateMetadata,
} from "@/app/products/[slug]/page";

const canonicalSlug = "super-serum";
const metadata = {
  slug: canonicalSlug,
  displayName: "Super Serum",
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

describe("current Product URLs", () => {
  it.each([
    ["super-serum", "mobile-pilot"],
    ["biotic-reset", "default"],
    ["new-canonical-product", "default"],
  ])("renders the current Product without a public history lookup: %s", async (slug, expected) => {
    catalogCache.getCachedPdpProduct.mockResolvedValue({ id: "product-id", slug, routineGroup: "core", systemStepName: "TREAT" });
    const page = await ProductDetailPage({ params: Promise.resolve({ slug }) });
    const { container } = render(page);
    expect(catalogCache.getCachedPdpProduct).toHaveBeenCalledWith(slug);
    expect(container.querySelector(".storefront-shell")).toHaveAttribute("data-pdp-presentation", expected);
    expect(screen.getByTestId("canonical-pdp")).toHaveAttribute("data-presentation", expected);
    expect(navigation.permanentRedirect).not.toHaveBeenCalled();
  });

  it.each(["Invalid_Product", "a".repeat(121)])("rejects invalid inbound slug %s before a cached read", async (slug) => {
    await expect(ProductDetailPage({ params: Promise.resolve({ slug }) })).rejects.toThrow("NOT_FOUND");
    expect(catalogCache.getCachedPdpProduct).not.toHaveBeenCalled();
    const result = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(result.title).toBe("Product | helix");
    expect(catalogCache.getCachedProductMetadata).not.toHaveBeenCalled();
  });

  it.each([
    "reset-01-calming-gel-cleanser", "cleanse-01-calming-gel-cleanser",
    "recode-03-pdrn-5-ampoule", "treat-03-pdrn-5-ampoule",
    "peptide-bounce", "maxxing-serum", "refine-02-pore-treatment-pads",
    "frame-04-pdrn-eye-cream", "lift-06-pdrn-mask-system",
    "seal-05-green-collagen-cream", "future-retired-product", "unpublished-product",
  ])("returns not found without forwarding unavailable current slug %s", async (slug) => {
    catalogCache.getCachedPdpProduct.mockResolvedValue(undefined);
    catalogCache.getCachedProductMetadata.mockResolvedValue(undefined);
    await expect(ProductDetailPage({ params: Promise.resolve({ slug }) })).rejects.toThrow("NOT_FOUND");
    expect(catalogCache.getCachedPdpProduct).toHaveBeenCalledWith(slug);
    expect(navigation.permanentRedirect).not.toHaveBeenCalled();
    const result = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(catalogCache.getCachedProductMetadata).toHaveBeenCalledWith(slug);
    expect(result.alternates).toBeUndefined();
  });

  it("uses only current metadata for the canonical URL", async () => {
    const result = await generateMetadata({ params: Promise.resolve({ slug: canonicalSlug }) });
    expect(catalogCache.getCachedProductMetadata).toHaveBeenCalledWith(canonicalSlug);
    expect(result.alternates).toEqual({ canonical: "/products/super-serum" });
  });
});
