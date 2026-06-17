import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { getSupabaseClient } from "@/lib/supabase";

// Mock the Supabase boundary so these tests are deterministic and never touch
// the network. The catalog layer's behavior (mapping, error propagation, empty
// handling) is exercised against controlled query results.
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  SupabaseConfigError: class SupabaseConfigError extends Error {},
}));

import { getProducts, getProduct } from "@/lib/catalog";

const mockedGetClient = getSupabaseClient as unknown as Mock;

type QueryResult = { data: unknown; error: unknown };

// Minimal thenable query-builder stand-in. getProducts awaits `.order()`;
// getProduct awaits `.maybeSingle()`. Both resolve to the configured result.
function makeClient(result: QueryResult) {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  return { from: () => builder };
}

const sampleRow = {
  slug: "northpoint-renewal-serum",
  name: "Northpoint Renewal Serum",
  tagline: "Overnight resurfacing concentrate",
  collection: "Treat",
  blurb: "A nightly serum that refines tone.",
  description: "Long description.",
  benefits: ["Refines tone", "Softens fine lines"],
  how_to_use: "Apply at night.",
  swatch_from: "#e3ddea",
  swatch_to: "#c2b5d6",
  // Intentionally out of order to verify sort-by-position.
  product_variants: [
    { variant_key: "50ml", label: "50 ml", price_cents: 7800, position: 1 },
    { variant_key: "30ml", label: "30 ml", price_cents: 5400, position: 0 },
  ],
};

beforeEach(() => {
  mockedGetClient.mockReset();
});

describe("catalog data access (Supabase-backed)", () => {
  it("getProducts maps rows and orders variants by position", async () => {
    mockedGetClient.mockReturnValue(makeClient({ data: [sampleRow], error: null }));

    const products = await getProducts();

    expect(products).toHaveLength(1);
    expect(products[0].slug).toBe("northpoint-renewal-serum");
    expect(products[0].swatch).toEqual(["#e3ddea", "#c2b5d6"]);
    expect(products[0].variants.map((v) => v.id)).toEqual(["30ml", "50ml"]);
    expect(products[0].variants[0]).toEqual({
      id: "30ml",
      label: "30 ml",
      price: 5400,
    });
  });

  it("getProducts returns [] for a reachable but empty catalog", async () => {
    mockedGetClient.mockReturnValue(makeClient({ data: [], error: null }));
    expect(await getProducts()).toEqual([]);
  });

  it("getProducts throws a clear error when the query fails", async () => {
    mockedGetClient.mockReturnValue(
      makeClient({
        data: null,
        error: { message: 'relation "public.products" does not exist' },
      }),
    );
    await expect(getProducts()).rejects.toThrow(/Failed to load products/);
  });

  it("getProduct maps a single row by slug", async () => {
    mockedGetClient.mockReturnValue(makeClient({ data: sampleRow, error: null }));

    const product = await getProduct("northpoint-renewal-serum");

    expect(product?.name).toBe("Northpoint Renewal Serum");
    expect(product?.variants.length).toBeGreaterThan(0);
  });

  it("getProduct returns undefined when no row matches", async () => {
    mockedGetClient.mockReturnValue(makeClient({ data: null, error: null }));
    expect(await getProduct("does-not-exist")).toBeUndefined();
  });

  it("getProduct throws a clear error when the query fails", async () => {
    mockedGetClient.mockReturnValue(
      makeClient({ data: null, error: { message: "connection refused" } }),
    );
    await expect(getProduct("x")).rejects.toThrow(/Failed to load product "x"/);
  });
});

describe("Supabase config validation (fail fast)", () => {
  it("getSupabaseClient throws SupabaseConfigError when env vars are missing", async () => {
    // Use the real module (bypassing the mock) with env vars unset.
    const actual =
      await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      expect(() => actual.getSupabaseClient()).toThrow(actual.SupabaseConfigError);
    } finally {
      if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
    }
  });
});
