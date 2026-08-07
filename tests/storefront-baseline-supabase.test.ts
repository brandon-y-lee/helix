import { describe, expect, it, vi } from "vitest";
import { createSupabaseStorefrontCatalogAdapter } from "@/test-support/supabase-storefront-catalog";

describe("Supabase Storefront Catalog adapter", () => {
  it("reads only public Storefront facts from Products and Routine Complements", async () => {
    const product = {
      id: "product-id",
      slug: "public-product",
      product_variants: [],
      product_media: [],
    };
    const relationship = {
      product_id: "product-id",
      related_product_id: "related-id",
      relationship_type: "complete_the_routine",
      sort_order: 0,
    };
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      const url = String(input);
      return new Response(
        JSON.stringify(url.includes("product_relationships") ? [relationship] : [product]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const adapter = createSupabaseStorefrontCatalogAdapter({
      url: "https://erasogmsqpgiirovubjh.supabase.co",
      anonKey: "public-anon-key",
      fetchImpl: fetchMock,
    });

    await expect(adapter.readCatalog()).resolves.toEqual({
      products: [product],
      routineComplements: [relationship],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requests.some((url) => url.includes("products?"))).toBe(true);
    expect(requests.some((url) => url.includes("product_relationships?"))).toBe(true);
    expect(requests.join(" ")).not.toMatch(
      /supplier|raw_source|catalog_editor|draft|audit/i,
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        headers: {
          apikey: "public-anon-key",
          Authorization: "Bearer public-anon-key",
        },
      });
    }
  });

  it("reports an HTTP failure without exposing the provider response", async () => {
    const adapter = createSupabaseStorefrontCatalogAdapter({
      url: "https://erasogmsqpgiirovubjh.supabase.co",
      anonKey: "public-anon-key",
      fetchImpl: vi.fn(async () =>
        new Response("private provider payload", { status: 503 }),
      ),
    });

    const error = await adapter.readCatalog().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "catalog-read-failed" });
    expect((error as Error).message).toContain("HTTP 503");
    expect((error as Error).message).not.toContain("private provider payload");
  });
});
