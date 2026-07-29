import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedCoreRoutineProducts: vi.fn(),
  getCachedDiscoveryProducts: vi.fn(),
  getCachedProduct: vi.fn(),
  getCachedProductContent: vi.fn(),
  getCachedProducts: vi.fn(),
}));

import { generateMetadata } from "@/app/products/[slug]/page";
import {
  getCachedProduct,
  getCachedProductContent,
} from "@/lib/catalog-cache";

beforeEach(() => {
  vi.mocked(getCachedProduct).mockReset();
  vi.mocked(getCachedProductContent).mockReset();
});

describe("product metadata cache ownership", () => {
  it("uses stable product content without reading offer state", async () => {
    vi.mocked(getCachedProductContent).mockResolvedValue({
      slug: "treat-03-pdrn-5-ampoule",
      formalTitle: "TREAT 03 PDRN 5 Ampoule",
      tagline: "Bounce and glow",
      seoTitle: null,
      seoDescription: "Stable product metadata.",
    } as Awaited<ReturnType<typeof getCachedProductContent>>);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "treat-03-pdrn-5-ampoule" }),
    });

    expect(getCachedProductContent).toHaveBeenCalledWith(
      "treat-03-pdrn-5-ampoule",
    );
    expect(getCachedProduct).not.toHaveBeenCalled();
    expect(metadata).toMatchObject({
      title: "TREAT 03 PDRN 5 Ampoule | Mei Pelle",
      description: "Stable product metadata.",
    });
  });
});
