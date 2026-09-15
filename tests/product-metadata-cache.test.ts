import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductMetadata: vi.fn(),
  getCachedProductRoutes: vi.fn(),
}));

import { generateMetadata } from "@/app/products/[slug]/page";
import {
  getCachedProductMetadata,
} from "@/lib/catalog-cache";

beforeEach(() => {
  vi.mocked(getCachedProductMetadata).mockReset();
});

describe("product metadata cache ownership", () => {
  it("uses stable product content without reading offer state", async () => {
    vi.mocked(getCachedProductMetadata).mockResolvedValue({
      slug: "super-serum",
      displayName: "Super Serum",
      productType: "PDRN serum",
      editorialDescription: "A daily serum for bouncier-looking skin.",
      seoTitle: null,
      seoDescription: "Stable product metadata.",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "super-serum" }),
    });

    expect(getCachedProductMetadata).toHaveBeenCalledWith(
      "super-serum",
    );
    expect(metadata).toMatchObject({
      title: "Super Serum — PDRN serum | helix",
      description: "Stable product metadata.",
      openGraph: {
        siteName: "helix",
        url: "/products/super-serum",
      },
    });
  });

  it("uses canonical Product Education when no SEO description is authored", async () => {
    vi.mocked(getCachedProductMetadata).mockResolvedValue({
      slug: "super-serum",
      displayName: "Super Serum",
      productType: "PDRN serum",
      editorialDescription: "A daily serum for bouncier-looking skin.",
      seoTitle: null,
      seoDescription: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "super-serum" }),
    });

    expect(metadata.description).toBe(
      "A daily serum for bouncier-looking skin.",
    );
  });
});
