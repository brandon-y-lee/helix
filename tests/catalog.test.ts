import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { getSupabaseClient } from "@/lib/supabase";

// Mock the Supabase boundary so these tests are deterministic and never touch
// the network. The catalog layer's behavior (mapping, error propagation, empty
// handling) is exercised against controlled query results.
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  SupabaseConfigError: class SupabaseConfigError extends Error {},
}));

import {
  getProducts,
} from "@/lib/catalog";

const mockedGetClient = getSupabaseClient as unknown as Mock;

type QueryResult = { data: unknown; error: unknown };

// Minimal thenable query-builder stand-in. getProducts awaits `.order()`;
// getProduct awaits `.maybeSingle()`. Both resolve to the configured result.
function makeClient(result: QueryResult) {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  return { from: () => builder };
}

const sampleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "northpoint-renewal-serum",
  display_name: "NORTHPOINT",
  formal_title: "NORTHPOINT 02 Renewal Serum",
  card_tagline: "Overnight resurfacing concentrate",
  routine_group: "core",
  routine_step_number: 2,
  routine_step_name: "Treat",
  routine_sort: 20,
  product_type: "Serum",
  badge: null,
  currency: "USD",
  sort_order: 2,
  editorial_description: "Long description.",
  benefits: ["Refines tone", "Softens fine lines"],
  editorial_how_to_use: "Apply at night.",
  formula_notes: [],
  swatch_from: "#e3ddea",
  swatch_to: "#c2b5d6",
  status: "available",
  catalog_status: "active",
  made_for: "Uneven texture or tone",
  good_for: "Nighttime routine",
  texture: "Silky serum",
  key_ingredients: ["Niacinamide"],
  ingredients: "Water, Niacinamide",
  cautions: [],
  finish: "Soft",
  volume: "30 ml",
  skin_types: ["Combination"],
  concerns: ["Texture"],
  usage_time: ["PM"],
  seo_title: "Northpoint Renewal Serum | Mei Pelle",
  seo_description: "Overnight resurfacing concentrate",
  search_keywords: ["serum"],
  created_at: "2026-06-14T00:00:00.000Z",
  // Intentionally out of order to verify canonical variant sorting.
  product_variants: [
    {
      variant_key: "50ml",
      label: "50 ml",
      price_cents: 7800,
      compare_at_price_cents: null,
      sku: null,
      available: true,
      inventory_status: "in_stock",
      option_values: { size: "50 ml" },
      volume: "50 ml",
      pack_count: null,
      sort_order: 1,
    },
    {
      variant_key: "30ml",
      label: "30 ml",
      price_cents: 5400,
      compare_at_price_cents: null,
      sku: null,
      available: true,
      inventory_status: "in_stock",
      option_values: { size: "30 ml" },
      volume: "30 ml",
      pack_count: null,
      sort_order: 0,
    },
  ],
  product_media: [
    {
      media_type: "image",
      url: "https://example.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/card.jpg",
      alt: "Northpoint product",
      width: 1000,
      height: 1000,
      role: "card",
      sort_order: 0,
    },
  ],
};

beforeEach(() => {
  mockedGetClient.mockReset();
});

describe("catalog data access (Supabase-backed)", () => {
  it("getProducts maps canonical rows and orders variants by sort order", async () => {
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
      compareAtPrice: null,
      sku: null,
      available: true,
      inventoryStatus: "in_stock",
      volume: "30 ml",
      packCount: null,
      optionValues: { size: "30 ml" },
      sortOrder: 0,
    });
    expect(products[0].status).toBe("available");
    expect(products[0].madeFor).toBe("Uneven texture or tone");
    expect(products[0].goodFor).toBe("Nighttime routine");
    expect(products[0].texture).toBe("Silky serum");
    expect(products[0].cardMedia?.role).toBe("card");
    expect(products[0].routineGroup).toBe("core");
    expect(products[0].routineStepNumber).toBe(2);
    expect(products[0].routineStepName).toBe("Treat");
    expect(products[0].routineSort).toBe(20);
    expect(products[0].createdAt).toBe("2026-06-14T00:00:00.000Z");
  });

  it("getProducts coerces an unknown status to 'available'", async () => {
    mockedGetClient.mockReturnValue(
      makeClient({
        data: [{ ...sampleRow, status: "bogus" }],
        error: null,
      }),
    );
    const products = await getProducts();
    expect(products[0].status).toBe("available");
  });

  it("maps editorial media without promoting it into utility image roles", async () => {
    mockedGetClient.mockReturnValue(
      makeClient({
        data: [
          {
            ...sampleRow,
            product_media: [
              {
                media_type: "video",
                url: "https://example.supabase.co/routine.mp4",
                alt: "Routine video",
                width: 720,
                height: 1280,
                role: "routine_video",
                sort_order: -2,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/profile.webp",
                alt: "Profile image",
                width: 1122,
                height: 1402,
                role: "profile_editorial",
                sort_order: -1,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/ingredients-texture.webp",
                alt: "Formula texture",
                width: 1254,
                height: 1254,
                role: "ingredients_texture",
                sort_order: 0,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/core-routine-texture.webp",
                alt: "Core routine texture",
                width: 1024,
                height: 1024,
                role: "core_routine_texture",
                sort_order: 1,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/core-routine-editorial.webp",
                alt: "Core routine editorial",
                width: 1200,
                height: 1500,
                role: "core_routine_editorial",
                sort_order: 1,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/outcome-02.webp",
                alt: "Outcome visual two",
                width: 1254,
                height: 1254,
                role: "pdp_outcome",
                sort_order: 2,
              },
              {
                media_type: "image",
                url: "https://example.supabase.co/application-01.png",
                alt: "Application visual one",
                width: 1122,
                height: 1402,
                role: "pdp_application",
                sort_order: 1,
              },
              {
                ...sampleRow.product_media[0],
                media_type: "image",
              },
            ],
          },
        ],
        error: null,
      }),
    );

    const [product] = await getProducts();

    expect(
      product.media.find((media) => media.role === "routine_video")?.kind,
    ).toBe("video");
    expect(
      product.media.find((media) => media.role === "ingredients_texture"),
    ).toEqual(
      expect.objectContaining({
        kind: "image",
        url: "https://example.supabase.co/ingredients-texture.webp",
      }),
    );
    expect(
      product.media.find((media) => media.role === "core_routine_texture"),
    ).toEqual(
      expect.objectContaining({
        kind: "image",
        url: "https://example.supabase.co/core-routine-texture.webp",
      }),
    );
    expect(
      product.media.find((media) => media.role === "core_routine_editorial"),
    ).toEqual(
      expect.objectContaining({
        kind: "image",
        url: "https://example.supabase.co/core-routine-editorial.webp",
      }),
    );
    expect(
      product.media.find((media) => media.role === "pdp_outcome"),
    ).toEqual(
      expect.objectContaining({
        kind: "image",
        url: "https://example.supabase.co/outcome-02.webp",
        sortOrder: 2,
      }),
    );
    expect(
      product.media.find((media) => media.role === "pdp_application"),
    ).toEqual(
      expect.objectContaining({
        kind: "image",
        url: "https://example.supabase.co/application-01.png",
        sortOrder: 1,
      }),
    );
    expect(product.cardMedia?.role).toBe("card");
    expect(product.heroMedia?.role).toBe("card");
    expect(product.cartMedia?.role).toBe("card");
    expect(product.searchMedia?.role).toBe("card");
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
    await expect(getProducts()).rejects.toThrow(
      /Failed to load canonical System products/,
    );
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
