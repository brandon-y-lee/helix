import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductMetadata: vi.fn(),
  getCachedProductRoutes: vi.fn(),
  getCachedProductSlugResolution: vi.fn(),
}));

import { generateMetadata } from "@/app/products/[slug]/page";
import {
  getCachedProductMetadata,
  getCachedProductSlugResolution,
} from "@/lib/catalog-cache";

beforeEach(() => {
  vi.mocked(getCachedProductMetadata).mockReset();
  vi.mocked(getCachedProductSlugResolution).mockReset();
  vi.mocked(getCachedProductSlugResolution).mockImplementation(
    async (slug) => ({
      sourceSlug: slug,
      targetSlug: slug,
      targetProductId: "11111111-1111-1111-1111-111111111111",
      routeKind: "canonical",
    }),
  );
});

describe("product metadata cache ownership", () => {
  it("uses stable product content without reading offer state", async () => {
    vi.mocked(getCachedProductMetadata).mockResolvedValue({
      slug: "peptide-bounce",
      displayName: "Peptide Bounce",
      productType: "PDRN serum",
      editorialDescription: "A daily serum for bouncier-looking skin.",
      seoTitle: null,
      seoDescription: "Stable product metadata.",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "peptide-bounce" }),
    });

    expect(getCachedProductMetadata).toHaveBeenCalledWith(
      "peptide-bounce",
    );
    expect(metadata).toMatchObject({
      title: "Peptide Bounce — PDRN serum | helix",
      description: "Stable product metadata.",
      openGraph: {
        siteName: "helix",
        url: "/products/peptide-bounce",
      },
    });
  });

  it("uses canonical Product Education when no SEO description is authored", async () => {
    vi.mocked(getCachedProductMetadata).mockResolvedValue({
      slug: "peptide-bounce",
      displayName: "Peptide Bounce",
      productType: "PDRN serum",
      editorialDescription: "A daily serum for bouncier-looking skin.",
      seoTitle: null,
      seoDescription: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "peptide-bounce" }),
    });

    expect(metadata.description).toBe(
      "A daily serum for bouncier-looking skin.",
    );
  });
});
