import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

import { listCatalogProducts } from "@/lib/admin/catalog/service";

type QueryCall = { method: string; args: unknown[] };

function queryResult<T>(data: T[]) {
  const calls: QueryCall[] = [];
  const query = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return query;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return query;
    },
    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return query;
    },
    is(...args: unknown[]) {
      calls.push({ method: "is", args });
      return query;
    },
    or(...args: unknown[]) {
      calls.push({ method: "or", args });
      return query;
    },
    not(...args: unknown[]) {
      calls.push({ method: "not", args });
      return query;
    },
    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return query;
    },
    range(...args: unknown[]) {
      calls.push({ method: "range", args });
      return query;
    },
    then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
      onFulfilled?:
        | ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) {
      return Promise.resolve({ data, error: null }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return { query, calls };
}

describe("catalog editor product grid service", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
  });

  it("uses one narrow batched query per summary domain", async () => {
    const productId = "123e4567-e89b-42d3-a456-426614174000";
    const products = queryResult([
      {
        id: productId,
        slug: "cleanse-01-calming-gel-cleanser",
        display_name: "CLEANSE",
        formal_title: "CLEANSE 01 Calming Gel Cleanser",
        catalog_status: "active",
        status: "available",
        routine_group: "core",
        routine_sort: 1,
        published_at: "2026-07-20T12:00:00.000Z",
        updated_at: "2026-07-21T12:00:00.000Z",
      },
    ]);
    const drafts = queryResult([
      {
        id: "123e4567-e89b-42d3-a456-426614174004",
        product_id: productId,
        status: "draft",
        version: 4,
        updated_at: "2026-07-22T12:00:00.000Z",
        updated_by: "123e4567-e89b-42d3-a456-426614174005",
      },
    ]);
    const revisions = queryResult([
      { product_id: productId, revision_number: 3 },
      { product_id: productId, revision_number: 2 },
    ]);
    const variants = queryResult([
      { product_id: productId, price_cents: 2200 },
      { product_id: productId, price_cents: 3600 },
    ]);
    const media = queryResult([
      {
        product_id: productId,
        url: "https://example.test/detail.webp",
        alt: "Detail",
        role: "detail",
        sort_order: 0,
        media_type: "image",
      },
      {
        product_id: productId,
        url: "https://example.test/card.webp",
        alt: "Card",
        role: "card_default",
        sort_order: 4,
        media_type: "image",
      },
    ]);
    const queries = {
      products,
      product_content_drafts: drafts,
      catalog_product_revisions: revisions,
      product_variants: variants,
      product_media: media,
    };
    const from = vi.fn((table: keyof typeof queries) => queries[table].query);
    createSupabaseAdminClient.mockReturnValue({ from });

    const result = await listCatalogProducts(
      new URL("https://example.test/api/admin/catalog/products?sort=name_asc"),
    );

    expect(result.items[0]).toMatchObject({
      id: productId,
      primaryMedia: {
        url: "https://example.test/card.webp",
        alt: "Card",
      },
      variantCount: 2,
      minimumPriceCents: 2200,
      maximumPriceCents: 3600,
      latestRevision: 3,
      activeDraft: { status: "draft", version: 4 },
    });
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "products",
      "product_content_drafts",
      "catalog_product_revisions",
      "product_variants",
      "product_media",
    ]);
    expect(products.calls.find((call) => call.method === "select")?.args[0])
      .toBe(
        "id, slug, display_name, formal_title, catalog_status, status, routine_group, routine_sort, published_at, updated_at",
      );
    expect(variants.calls.find((call) => call.method === "select")?.args[0])
      .toBe("product_id, price_cents");
    expect(media.calls.find((call) => call.method === "select")?.args[0])
      .toBe(
        "product_id, url, alt, role, sort_order, media_type",
      );
  });
});
