import { describe, expect, it } from "vitest";
import {
  createStorefrontBaseline,
  serializeStorefrontSnapshot,
  type StorefrontCatalogProduct,
} from "@/test-support/storefront-baseline";

function product(
  overrides: Partial<StorefrontCatalogProduct> = {},
): StorefrontCatalogProduct {
  return {
    id: "core-alpha-id",
    slug: "core-alpha",
    display_name: "CORE ALPHA",
    formal_title: "Core Alpha Cleanser",
    card_tagline: "A calm daily cleanse.",
    product_type: "Cleanser",
    badge: null,
    currency: "USD",
    catalog_status: "active",
    status: "available",
    editorial_description: "A public Storefront description.",
    swatch_from: "#112233",
    swatch_to: "#445566",
    sort_order: 20,
    created_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
    made_for: "Daily care",
    good_for: "Comfort",
    texture: "Gel",
    key_ingredients: ["Glycerin"],
    ingredients: "Water, Glycerin",
    concerns: ["Dryness"],
    usage_time: ["Morning", "Night"],
    search_keywords: ["cleanser"],
    routine_group: "core",
    routine_step_number: 1,
    routine_step_name: "CLEANSE",
    routine_sort: 20,
    product_variants: [
      {
        variant_key: "standard",
        label: "100 mL",
        price_cents: 2200,
        sort_order: 0,
        available: true,
        inventory_status: "in_stock",
      },
    ],
    product_media: [
      {
        media_type: "video",
        url: "https://cdn.example.test/routine.mp4",
        alt: "Routine video",
        width: null,
        height: null,
        role: "routine_video",
        sort_order: 0,
        palette_id: null,
        placeholder_palette: null,
      },
      {
        media_type: "image",
        url: "https://cdn.example.test/routine-poster.webp",
        alt: "Routine video poster",
        width: 1200,
        height: 1600,
        role: "routine_video_poster",
        sort_order: 1,
        palette_id: null,
        placeholder_palette: null,
      },
      {
        media_type: "image",
        url: "https://cdn.example.test/gallery.webp",
        alt: "Core Alpha bottle",
        width: 1200,
        height: 1600,
        role: "gallery",
        sort_order: 2,
        palette_id: null,
        placeholder_palette: null,
      },
    ],
    ...overrides,
  };
}

describe("Storefront Baseline", () => {
  it("returns one immutable snapshot with deterministic journey Products", async () => {
    const snapshot = await createStorefrontBaseline({
      readCatalog: async () => ({
        products: [
          product(),
          product({
            id: "core-first-id",
            slug: "core-first",
            display_name: "CORE FIRST",
            routine_sort: 40,
            sort_order: 10,
            product_media: [],
          }),
          product({
            id: "beyond-id",
            slug: "beyond-product",
            display_name: "BEYOND",
            routine_group: "beyond_core",
            routine_step_number: 4,
            routine_step_name: "FRAME",
            routine_sort: 30,
            sort_order: 30,
            product_variants: [],
            product_media: [],
          }),
        ],
        routineComplements: [
          {
            product_id: "beyond-id",
            related_product_id: "core-alpha-id",
            relationship_type: "complete_the_routine",
            sort_order: 0,
          },
        ],
      }),
    });

    expect(snapshot.products.map((item) => item.path)).toEqual([
      "/products/core-first",
      "/products/core-alpha",
      "/products/beyond-product",
    ]);
    expect(snapshot.journeys).toEqual({
      coreProductId: "core-first-id",
      beyondCoreProductId: "beyond-id",
      purchasableProductId: "core-first-id",
      richPdpProductId: "core-alpha-id",
      searchableProductId: "core-first-id",
    });
    expect(snapshot.products[0]?.offer?.variantId).toBe("standard");
    expect(snapshot.routineComplements).toEqual([
      {
        productId: "beyond-id",
        relatedProductId: "core-alpha-id",
        sortOrder: 0,
      },
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.products)).toBe(true);
    expect(Object.isFrozen(snapshot.products[0]?.variants)).toBe(true);
  });

  it("rejects duplicate Product identities and Storefront paths", async () => {
    const readCatalog = async () => ({
      products: [
        product(),
        product({ id: "core-alpha-id", slug: "other-path" }),
        product({ id: "other-id", slug: "core-alpha" }),
      ],
      routineComplements: [],
    });

    await expect(createStorefrontBaseline({ readCatalog })).rejects.toMatchObject({
      code: "duplicate-product-identity",
      message: expect.stringContaining("core-alpha-id"),
    });
  });

  it("rejects a duplicate Storefront path independently of Product identity", async () => {
    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [product(), product({ id: "other-id" })],
          routineComplements: [],
        }),
      }),
    ).rejects.toMatchObject({
      code: "duplicate-product-path",
      message: expect.stringContaining("/products/core-alpha"),
    });
  });

  it("rejects a self-referencing Routine Complement", async () => {
    const readCatalog = async () => ({
      products: [
        product(),
        product({
          id: "beyond-id",
          slug: "beyond-product",
          routine_group: "beyond_core",
          routine_sort: 30,
          sort_order: 30,
        }),
      ],
      routineComplements: [
        {
          product_id: "core-alpha-id",
          related_product_id: "core-alpha-id",
          relationship_type: "complete_the_routine",
          sort_order: 0,
        },
      ],
    });

    await expect(createStorefrontBaseline({ readCatalog })).rejects.toMatchObject({
      code: "invalid-routine-complement",
      message: expect.stringContaining("cannot reference itself"),
    });
  });

  it("rejects duplicate directed Routine Complements", async () => {
    const complement = {
      product_id: "core-alpha-id",
      related_product_id: "beyond-id",
      relationship_type: "complete_the_routine",
      sort_order: 0,
    };
    const readCatalog = async () => ({
      products: [
        product(),
        product({
          id: "beyond-id",
          slug: "beyond-product",
          routine_group: "beyond_core",
          routine_sort: 30,
          sort_order: 30,
        }),
      ],
      routineComplements: [complement, { ...complement, sort_order: 1 }],
    });

    await expect(createStorefrontBaseline({ readCatalog })).rejects.toMatchObject({
      code: "duplicate-routine-complement",
      message: expect.stringContaining("core-alpha-id"),
    });
  });

  it("rejects invalid Routine Complement ordering", async () => {
    const readCatalog = async () => ({
      products: [
        product(),
        product({
          id: "beyond-id",
          slug: "beyond-product",
          routine_group: "beyond_core",
          routine_sort: 30,
          sort_order: 30,
        }),
      ],
      routineComplements: [
        {
          product_id: "core-alpha-id",
          related_product_id: "beyond-id",
          relationship_type: "complete_the_routine",
          sort_order: -1,
        },
      ],
    });

    await expect(createStorefrontBaseline({ readCatalog })).rejects.toMatchObject({
      code: "invalid-routine-complement",
      message: expect.stringContaining("sort order"),
    });
  });

  it("rejects duplicate Product Variant identities within a Product", async () => {
    const variant = product().product_variants?.[0];
    const readCatalog = async () => ({
      products: [
        product({ product_variants: variant ? [variant, { ...variant }] : [] }),
        product({
          id: "beyond-id",
          slug: "beyond-product",
          routine_group: "beyond_core",
          routine_sort: 30,
          sort_order: 30,
        }),
      ],
      routineComplements: [],
    });

    await expect(createStorefrontBaseline({ readCatalog })).rejects.toMatchObject({
      code: "duplicate-product-variant",
      message: expect.stringContaining("standard"),
    });
  });

  it("serializes the same Catalog deterministically regardless of read order", async () => {
    const core = product({
      product_variants: [
        {
          variant_key: "large",
          label: "Large",
          price_cents: 3000,
          sort_order: 20,
          available: true,
          inventory_status: "in_stock",
        },
        {
          variant_key: "small",
          label: "Small",
          price_cents: 2000,
          sort_order: 10,
          available: true,
          inventory_status: "in_stock",
        },
      ],
      product_media: [...(product().product_media ?? [])].reverse(),
    });
    const beyond = product({
      id: "beyond-id",
      slug: "beyond-product",
      routine_group: "beyond_core",
      routine_sort: 30,
      sort_order: 30,
      product_media: [],
    });
    const complement = {
      product_id: "core-alpha-id",
      related_product_id: "beyond-id",
      relationship_type: "complete_the_routine",
      sort_order: 0,
    };
    const first = await createStorefrontBaseline({
      readCatalog: async () => ({
        products: [beyond, core],
        routineComplements: [complement],
      }),
    });
    const second = await createStorefrontBaseline({
      readCatalog: async () => ({
        products: [core, beyond],
        routineComplements: [complement],
      }),
    });

    expect(serializeStorefrontSnapshot(first)).toBe(
      serializeStorefrontSnapshot(second),
    );
    expect(serializeStorefrontSnapshot(first)).toMatch(/\n$/);
  });

  it("allows several Products per System Step and selects the first valid Product Offer", async () => {
    const snapshot = await createStorefrontBaseline({
      readCatalog: async () => ({
        products: [
          product({
            product_variants: [
              {
                variant_key: "unavailable",
                label: "Unavailable",
                price_cents: 1000,
                sort_order: 0,
                available: true,
                inventory_status: "out_of_stock",
              },
              {
                variant_key: "small",
                label: "Small",
                price_cents: 2000,
                sort_order: 10,
                available: true,
                inventory_status: "in_stock",
              },
              {
                variant_key: "large",
                label: "Large",
                price_cents: 3000,
                sort_order: 20,
                available: true,
                inventory_status: "low_stock",
              },
            ],
          }),
          product({
            id: "core-sibling-id",
            slug: "core-sibling",
            routine_step_number: 1,
            routine_step_name: "CLEANSE",
            routine_sort: 25,
            sort_order: 25,
            product_variants: [],
            product_media: [],
          }),
          product({
            id: "beyond-id",
            slug: "beyond-product",
            routine_group: "beyond_core",
            routine_step_number: 4,
            routine_step_name: "FRAME",
            routine_sort: 30,
            sort_order: 30,
            product_variants: [],
            product_media: [],
          }),
        ],
        routineComplements: [],
      }),
    });

    expect(
      snapshot.products.filter((item) => item.systemPosition === 1),
    ).toHaveLength(2);
    expect(snapshot.products[0]?.variants).toHaveLength(3);
    expect(snapshot.products[0]?.offer).toMatchObject({
      variantId: "small",
      label: "Small",
      price: 2000,
    });
  });

  it("reports the missing journey capability by name", async () => {
    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [product()],
          routineComplements: [],
        }),
      }),
    ).rejects.toMatchObject({
      code: "missing-journey-capability",
      message: expect.stringContaining("Beyond The Core Routine Group"),
    });
  });

  it("accepts supported non-active Catalog Status values without adding them to the Storefront", async () => {
    const snapshot = await createStorefrontBaseline({
      readCatalog: async () => ({
        products: [
          product(),
          product({
            id: "beyond-id",
            slug: "beyond-product",
            routine_group: "beyond_core",
            routine_sort: 30,
            sort_order: 30,
          }),
          product({
            id: "draft-id",
            slug: "draft-product",
            catalog_status: "draft",
            product_variants: [],
            product_media: [],
          }),
          product({
            id: "archived-id",
            slug: "archived-product",
            catalog_status: "archived",
            product_variants: [],
            product_media: [],
          }),
        ],
        routineComplements: [],
      }),
    });

    expect(snapshot.products.map((item) => item.slug)).toEqual([
      "core-alpha",
      "beyond-product",
    ]);
  });

  it.each([
    ["catalog_status", "deleted", "unsupported-catalog-status"],
    ["status", "hidden", "unsupported-merchandising-status"],
    ["routine_group", "seasonal", "unsupported-routine-group"],
    ["routine_sort", -1, "invalid-ordering"],
    ["routine_step_number", -1, "invalid-ordering"],
  ] as const)(
    "rejects an invalid %s value",
    async (field, value, code) => {
      await expect(
        createStorefrontBaseline({
          readCatalog: async () => ({
            products: [product({ [field]: value })],
            routineComplements: [],
          }),
        }),
      ).rejects.toMatchObject({ code });
    },
  );

  it("rejects Routine Complements whose endpoints are not active Products", async () => {
    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [
            product(),
            product({
              id: "beyond-id",
              slug: "beyond-product",
              routine_group: "beyond_core",
              routine_sort: 30,
              sort_order: 30,
            }),
          ],
          routineComplements: [
            {
              product_id: "core-alpha-id",
              related_product_id: "missing-id",
              relationship_type: "complete_the_routine",
              sort_order: 0,
            },
          ],
        }),
      }),
    ).rejects.toMatchObject({
      code: "invalid-routine-complement",
      message: expect.stringContaining("active Products"),
    });
  });

  it("wraps adapter failures without exposing raw provider payloads", async () => {
    const error = await createStorefrontBaseline({
      readCatalog: async () => {
        throw new Error("secret provider payload");
      },
    }).catch((cause: unknown) => cause);

    expect(error).toMatchObject({ code: "catalog-read-failed" });
    expect((error as Error).message).not.toContain("secret provider payload");
  });

  it("returns a targeted failure for malformed live-shaped Product rows", async () => {
    const malformed = {
      ...product(),
      product_variants: {},
    } as unknown as StorefrontCatalogProduct;

    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [malformed],
          routineComplements: [],
        }),
      }),
    ).rejects.toMatchObject({
      code: "invalid-catalog-shape",
      message: expect.stringContaining("malformed public Storefront data"),
    });
  });

  it("rejects an invalid Product Offer price with a targeted diagnostic", async () => {
    const variant = product().product_variants?.[0];
    expect(variant).toBeDefined();

    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [
            product({
              product_variants: variant
                ? [{ ...variant, price_cents: -1 }]
                : [],
            }),
          ],
          routineComplements: [],
        }),
      }),
    ).rejects.toMatchObject({
      code: "invalid-product-offer",
      message: expect.stringContaining("invalid price"),
    });
  });

  it("rejects unsupported public media roles", async () => {
    const [firstMedia, ...media] = product().product_media ?? [];
    expect(firstMedia).toBeDefined();

    await expect(
      createStorefrontBaseline({
        readCatalog: async () => ({
          products: [
            product({
              product_media: firstMedia
                ? [{ ...firstMedia, role: "supplier_private" }, ...media]
                : [],
            }),
          ],
          routineComplements: [],
        }),
      }),
    ).rejects.toMatchObject({
      code: "invalid-product-media",
      message: expect.stringContaining("supplier_private"),
    });
  });
});
