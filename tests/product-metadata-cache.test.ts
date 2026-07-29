import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductMetadata: vi.fn(),
  getCachedProductRoutes: vi.fn(),
}));

import { generateMetadata } from "@/app/products/[slug]/page";
import { getCachedProductMetadata } from "@/lib/catalog-cache";

beforeEach(() => {
  vi.mocked(getCachedProductMetadata).mockReset();
});

describe("product metadata cache ownership", () => {
  it("uses stable product content without reading offer state", async () => {
    vi.mocked(getCachedProductMetadata).mockResolvedValue({
      slug: "treat-03-pdrn-5-ampoule",
      formalTitle: "TREAT 03 PDRN 5 Ampoule",
      cardTagline: "Bounce and glow",
      seoTitle: null,
      seoDescription: "Stable product metadata.",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "treat-03-pdrn-5-ampoule" }),
    });

    expect(getCachedProductMetadata).toHaveBeenCalledWith(
      "treat-03-pdrn-5-ampoule",
    );
    expect(metadata).toMatchObject({
      title: "TREAT 03 PDRN 5 Ampoule | Mei Pelle",
      description: "Stable product metadata.",
    });
  });
});
