import { syntheticSupabaseKey } from "./helpers/supabase-target";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseStorefrontCatalogAdapter } from "@/test-support/supabase-storefront-catalog";

describe("Supabase Storefront Catalog adapter", () => {
  it("rejects both swapped job URLs before sending the API key", () => {
    const fetchImpl = vi.fn();
    for (const [target, url] of [
      ["development", "https://erasogmsqpgiirovubjh.supabase.co"],
      ["production", "https://zyfkunnpnlmgvrojmrbg.supabase.co"],
    ] as const) {
      expect(() => createSupabaseStorefrontCatalogAdapter({ target, url, anonKey: syntheticSupabaseKey("development", "anon"), fetchImpl })).toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a parent credential at the child URL without transmitting it", () => {
    const fetchImpl = vi.fn();
    expect(() => createSupabaseStorefrontCatalogAdapter({
      url: "https://zyfkunnpnlmgvrojmrbg.supabase.co",
      anonKey: syntheticSupabaseKey("production", "anon"),
      fetchImpl,
    })).toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("can read the production Catalog with its own public key in the explicit media job", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    const adapter = createSupabaseStorefrontCatalogAdapter({
      target: "production",
      url: "https://erasogmsqpgiirovubjh.supabase.co",
      anonKey: syntheticSupabaseKey("production", "anon"),
      fetchImpl,
    });
    await expect(adapter.readCatalog()).resolves.toEqual({ products: [], routineComplements: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

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
      url: "https://zyfkunnpnlmgvrojmrbg.supabase.co",
      anonKey: syntheticSupabaseKey("development", "anon"),
      fetchImpl: fetchMock,
    });

    await expect(adapter.readCatalog()).resolves.toEqual({
      products: [product],
      routineComplements: [relationship],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requests.some((url) => url.includes("products?"))).toBe(true);
    expect(
      requests.some((url) => url.includes("product_family_memberships")),
    ).toBe(true);
    expect(requests.some((url) => url.includes("product_relationships?"))).toBe(true);
    expect(requests.join(" ")).not.toMatch(
      /supplier|raw_source|catalog_editor|draft|audit/i,
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        headers: {
          apikey: syntheticSupabaseKey("development", "anon"),
          Authorization: `Bearer ${syntheticSupabaseKey("development", "anon")}`,
        },
      });
    }
  });

  it("sends a verified publishable key only as apikey and rejects credential-bearing redirects", async () => {
    const key = "sb_publishable_synthetic";
    const fetchImpl = vi.fn(async (_url: URL, _init?: RequestInit) => new Response("[]", { status: 200 }));
    const adapter = createSupabaseStorefrontCatalogAdapter({
      url: "https://zyfkunnpnlmgvrojmrbg.supabase.co",
      anonKey: key,
      env: { HELIX_DEVELOPMENT_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update(key).digest("hex") },
      fetchImpl: fetchImpl as typeof fetch,
    });
    await adapter.readCatalog();
    for (const [, request] of fetchImpl.mock.calls) {
      expect(request?.headers).toEqual({ apikey: key });
      expect(request?.redirect).toBe("error");
    }
  });

  it("reports an HTTP failure without exposing the provider response", async () => {
    const adapter = createSupabaseStorefrontCatalogAdapter({
      url: "https://zyfkunnpnlmgvrojmrbg.supabase.co",
      anonKey: syntheticSupabaseKey("development", "anon"),
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
