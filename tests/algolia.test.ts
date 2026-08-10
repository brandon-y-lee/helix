import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

import {
  buildAlgoliaRecord,
  INDEX_SETTINGS,
  type CatalogProductSource,
} from "@/lib/algolia/record";

// Mock the Supabase reader and the Algolia write client so the dispatch logic
// is exercised without any network or real credentials.
vi.mock("@/lib/algolia/source", () => ({
  fetchSearchRecordById: vi.fn(),
  fetchAllSearchRecords: vi.fn(),
}));
vi.mock("@/lib/algolia/server", () => ({
  upsertSearchRecord: vi.fn(() => Promise.resolve()),
  deleteSearchRecord: vi.fn(() => Promise.resolve()),
  getIndexName: vi.fn(() => "mei_pelle_products_test"),
  reindexAllSearchRecords: vi.fn(),
}));

import {
  fetchAllSearchRecords,
  fetchSearchRecordById,
} from "@/lib/algolia/source";
import {
  upsertSearchRecord,
  deleteSearchRecord,
  reindexAllSearchRecords,
} from "@/lib/algolia/server";
import {
  applyCatalogWebhookEvent,
  validateCatalogWebhookPayload,
  verifyWebhookSecret,
} from "@/lib/algolia/sync";
import { runSearchBackfill } from "@/lib/algolia/backfill";
import { getCatalogInvalidationTargets } from "@/lib/catalog-invalidation";
import { SHOP_COLLECTION_PATHS } from "@/lib/catalog/collection-routes";

const mockedFetch = fetchSearchRecordById as unknown as Mock;
const mockedUpsert = upsertSearchRecord as unknown as Mock;
const mockedDelete = deleteSearchRecord as unknown as Mock;
const mockedFetchAll = fetchAllSearchRecords as unknown as Mock;
const mockedReindex = reindexAllSearchRecords as unknown as Mock;

const sourceRow: CatalogProductSource = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "northpoint-renewal-serum",
  display_name: "NORTHPOINT",
  routine_group: "core",
  system_step_name: "TREAT",
  system_steps: {
    name: "TREAT",
    position: 4,
    routine_group: "core",
  },
  routine_sort: 20,
  product_type: "Serum",
  badge: "Night step",
  catalog_status: "active",
  editorial_description: "A nightly serum for smoother-looking tone.",
  status: "available",
  swatch_from: "#e3ddea",
  swatch_to: "#c2b5d6",
  sort_order: 2,
  created_at: "2026-06-14T00:00:00.000Z",
  published_at: "2026-06-14T00:00:00.000Z",
  updated_at: "2026-06-15T00:00:00.000Z",
  made_for: "Uneven texture or tone",
  good_for: "Nighttime routine",
  texture: "Silky serum",
  key_ingredients: ["Niacinamide"],
  ingredients: "Water, Niacinamide",
  concerns: ["Texture"],
  usage_time: ["PM"],
  search_keywords: ["serum"],
  product_slug_routes: [
    {
      source_slug: "old-northpoint-serum",
      route_kind: "rename",
    },
    {
      source_slug: "northpoint-renewal-serum",
      route_kind: "canonical",
    },
  ],
  product_variants: [
    {
      variant_key: "50ml",
      label: "50 ml",
      price_cents: 7800,
      sort_order: 1,
      available: true,
      inventory_status: "in_stock",
    },
    {
      variant_key: "30ml",
      label: "30 ml",
      price_cents: 5400,
      sort_order: 0,
      available: true,
      inventory_status: "in_stock",
    },
  ],
  product_media: [
    {
      media_type: "image",
      url: null,
      alt: "Northpoint product",
      width: null,
      height: null,
      role: "search",
      sort_order: 0,
      palette_id: "northpoint-search",
      placeholder_palette: {
        start: "#e3ddea",
        end: "#c2b5d6",
        accent: "#735f86",
      },
    },
  ],
};

describe("buildAlgoliaRecord", () => {
  it("maps a catalog row to a storefront-safe record", () => {
    const r = buildAlgoliaRecord(sourceRow);

    expect(r.objectID).toBe(sourceRow.id);
    expect(r.productId).toBe(sourceRow.id);
    expect(r.slug).toBe("northpoint-renewal-serum");
    expect(r.slugAliases).toEqual(["old-northpoint-serum"]);
    expect(r.displayName).toBe("NORTHPOINT");
    expect(r.editorialDescription).toBe(
      "A nightly serum for smoother-looking tone.",
    );
    expect(r.routineGroup).toBe("core");
    expect(r.systemStepPosition).toBe(4);
    expect(r.systemStepName).toBe("TREAT");
    expect(r.routineSort).toBe(20);
    expect(r.productType).toBe("Serum");
    expect(r.currency).toBe("USD");
    // Price range derived from variants (min/max in cents).
    expect(r.priceMin).toBe(5400);
    expect(r.priceMax).toBe(7800);
    // Variants summarized in canonical sort order.
    expect(r.variantCount).toBe(2);
    expect(r.variantNames).toEqual(["30 ml", "50 ml"]);
    expect(r.available).toBe(true);
    expect(r.waitlist).toBe(false);
    expect(r.badge).toBe("Night step");
    expect(r.sortOrder).toBe(20);
    // Keywords pull from safe descriptive fields + variant labels.
    expect(r.keywords).toContain("The Core");
    expect(r.keywords).toContain("TREAT");
    expect(r.keywords).toContain("Silky serum");
    expect(r.keywords).toContain("30 ml");
    expect(r.keywords).toContain("old-northpoint-serum");
    expect(r.placeholderMedia).toMatchObject({
      kind: "placeholder",
      paletteId: "northpoint-search",
      palette: { start: "#e3ddea", end: "#c2b5d6" },
    });
    expect(r.imageMedia).toBeNull();
    expect(JSON.stringify(r)).not.toContain("shopify");
  });

  it("maps canonical image media into a search-safe image payload", () => {
    const r = buildAlgoliaRecord({
      ...sourceRow,
      product_media: [
        {
          media_type: "image",
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/primary/hash.webp",
          alt: "Northpoint serum",
          width: 1200,
          height: 1650,
          role: "search",
          sort_order: 0,
          palette_id: null,
          placeholder_palette: null,
        },
      ],
    });

    expect(r.imageMedia).toEqual({
      kind: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/primary/hash.webp",
      alt: "Northpoint serum",
      width: 1200,
      height: 1650,
      role: "search",
    });
    expect(r.placeholderMedia).toBeNull();
  });

  it("never promotes PDP-only media into search", () => {
    const searchImage = {
      media_type: "image",
      url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/search.webp",
      alt: "Northpoint serum",
      width: 1200,
      height: 1650,
      role: "search",
      sort_order: 6,
      palette_id: null,
      placeholder_palette: null,
    };
    const r = buildAlgoliaRecord({
      ...sourceRow,
      product_media: [
        {
          ...searchImage,
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/gallery.webp",
          role: "gallery",
          sort_order: -10,
        },
        {
          ...searchImage,
          media_type: "video",
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/routine/video.mp4",
          role: "routine_video",
          sort_order: -10,
        },
        {
          ...searchImage,
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/profile.webp",
          role: "profile_editorial",
          sort_order: -9,
        },
        {
          ...searchImage,
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/ingredients-texture.webp",
          role: "ingredients_texture",
          sort_order: -8,
        },
        {
          ...searchImage,
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/core-routine-texture.webp",
          role: "core_routine_texture",
          sort_order: -7,
        },
        {
          ...searchImage,
          url: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/northpoint/core-routine-editorial.webp",
          role: "core_routine_editorial",
          sort_order: -8,
        },
        searchImage,
      ],
    });

    expect(r.imageMedia?.url).toBe(searchImage.url);
    expect(r.imageMedia?.role).toBe("search");
  });

  it("flags availability/waitlist and badge from status", () => {
    const coming = buildAlgoliaRecord({ ...sourceRow, status: "coming_soon" });
    expect(coming.available).toBe(false);
    expect(coming.waitlist).toBe(true);
    expect(coming.badge).toBe("Coming soon");

    const soldOut = buildAlgoliaRecord({ ...sourceRow, status: "sold_out" });
    expect(soldOut.available).toBe(false);
    expect(soldOut.waitlist).toBe(false);
    expect(soldOut.badge).toBe("Sold out");
  });

  it("handles a product with no variants", () => {
    const r = buildAlgoliaRecord({ ...sourceRow, product_variants: null });
    expect(r.variantCount).toBe(0);
    expect(r.priceMin).toBe(0);
    expect(r.priceMax).toBe(0);
    expect(r.variantNames).toEqual([]);
  });

  it("never indexes a raw status outside the known set", () => {
    const r = buildAlgoliaRecord({ ...sourceRow, status: "draft" });
    expect(r.status).toBe("available");
  });

  it("exposes index settings driven by existing fields only", () => {
    expect(INDEX_SETTINGS.searchableAttributes).toContain("displayName");
    expect(INDEX_SETTINGS.searchableAttributes).toContain("productType");
    expect(INDEX_SETTINGS.searchableAttributes).not.toContain("formalTitle");
    expect(INDEX_SETTINGS.searchableAttributes).not.toContain("cardTagline");
    expect(INDEX_SETTINGS.customRanking).toContain("asc(sortOrder)");
    expect(INDEX_SETTINGS.attributesForFaceting).toContain(
      "filterOnly(routineGroup)",
    );
    expect(INDEX_SETTINGS.attributesForFaceting).toContain(
      "filterOnly(productType)",
    );
    expect(INDEX_SETTINGS.attributesForFaceting).not.toContain(
      "filterOnly(routineStep)",
    );
  });
});

describe("verifyWebhookSecret", () => {
  const ORIGINAL = process.env.SUPABASE_CATALOG_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.SUPABASE_CATALOG_WEBHOOK_SECRET = "s3cret-value";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_CATALOG_WEBHOOK_SECRET;
    else process.env.SUPABASE_CATALOG_WEBHOOK_SECRET = ORIGINAL;
  });

  it("accepts a matching secret", () => {
    expect(verifyWebhookSecret("s3cret-value")).toBe(true);
  });

  it("rejects a wrong, empty, or missing secret", () => {
    expect(verifyWebhookSecret("wrong")).toBe(false);
    expect(verifyWebhookSecret("")).toBe(false);
    expect(verifyWebhookSecret(null)).toBe(false);
    expect(verifyWebhookSecret(undefined)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    delete process.env.SUPABASE_CATALOG_WEBHOOK_SECRET;
    expect(verifyWebhookSecret("anything")).toBe(false);
  });
});

describe("validateCatalogWebhookPayload", () => {
  it("accepts catalog authority events with the required row shape", () => {
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "UPDATE",
        table: "product_media",
        record: { id: "m-2", product_id: sourceRow.id },
        old_record: { id: "m-1", product_id: sourceRow.id },
      }),
    ).not.toThrow();
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "INSERT",
        table: "product_slug_routes",
        record: {
          source_slug: "old-northpoint-serum",
          target_product_id: sourceRow.id,
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "UPDATE",
        table: "product_pdp_content",
        record: { product_id: sourceRow.id, schema_version: 1 },
        old_record: { product_id: sourceRow.id, schema_version: 1 },
      }),
    ).not.toThrow();
  });

  it("rejects unsupported schemas, tables, and event types", () => {
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "auth",
        type: "INSERT",
        table: "products",
        record: { id: sourceRow.id },
      }),
    ).toThrow(/unsupported schema/);
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "INSERT",
        table: "orders",
        record: { id: "order-1" },
      }),
    ).toThrow(/unsupported table/);
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "UPSERT",
        table: "products",
        record: { id: sourceRow.id },
      }),
    ).toThrow(/unsupported event type/);
  });

  it("requires old_record for updates and deletes", () => {
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "UPDATE",
        table: "products",
        record: { id: sourceRow.id },
      }),
    ).toThrow(/UPDATE requires record and old_record/);
    expect(() =>
      validateCatalogWebhookPayload({
        schema: "public",
        type: "DELETE",
        table: "products",
        record: null,
      }),
    ).toThrow(/DELETE requires old_record/);
  });
});

describe("applyCatalogWebhookEvent", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedUpsert.mockReset().mockResolvedValue(undefined);
    mockedDelete.mockReset().mockResolvedValue(undefined);
  });

  it("upserts on product INSERT/UPDATE by rebuilding from Supabase", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "UPDATE",
      table: "products",
      record: { id: sourceRow.id },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).toHaveBeenCalledWith(built);
    expect(outcome).toMatchObject({ action: "upsert", objectID: sourceRow.id });
  });

  it("deletes the record on product UPDATE when it is no longer public", async () => {
    mockedFetch.mockResolvedValue(null);

    const outcome = await applyCatalogWebhookEvent({
      type: "UPDATE",
      table: "products",
      record: { id: sourceRow.id },
    });

    expect(mockedDelete).toHaveBeenCalledWith(sourceRow.id);
    expect(outcome).toMatchObject({
      action: "delete",
      objectID: sourceRow.id,
      reason: "product no longer public",
    });
  });

  it("upserts on product INSERT", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    await applyCatalogWebhookEvent({
      type: "INSERT",
      table: "products",
      record: { id: sourceRow.id },
    });

    expect(mockedUpsert).toHaveBeenCalledWith(built);
  });

  it("deletes the record on product DELETE using old_record.id", async () => {
    const outcome = await applyCatalogWebhookEvent({
      type: "DELETE",
      table: "products",
      old_record: { id: sourceRow.id },
    });

    expect(mockedDelete).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ action: "delete", objectID: sourceRow.id });
  });

  it("rebuilds the parent product on a variant change", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "INSERT",
      table: "product_variants",
      record: { id: "v-1", product_id: sourceRow.id },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).toHaveBeenCalledWith(built);
    expect(outcome).toMatchObject({ action: "upsert", objectID: sourceRow.id });
  });

  it("rebuilds the parent product on a media change", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "UPDATE",
      table: "product_media",
      record: { id: "m-1", product_id: sourceRow.id },
      old_record: { id: "m-1", product_id: sourceRow.id },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).toHaveBeenCalledWith(built);
    expect(outcome).toMatchObject({ action: "upsert", objectID: sourceRow.id });
  });

  it.each([
    "gallery",
    "routine_video",
    "ingredients_texture",
    "core_routine_texture",
    "core_routine_editorial",
    "pdp_outcome",
    "pdp_application",
  ])(
    "resolves but does not reindex PDP-only media role %s",
    async (role) => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "INSERT",
      table: "product_media",
      record: {
        id: "m-editorial",
        product_id: sourceRow.id,
        role,
      },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      action: "noop",
      slug: sourceRow.slug,
      reason: "PDP-only media role is not indexed",
    });
    },
  );

  it("resolves PDP content updates without reindexing Algolia", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "UPDATE",
      table: "product_pdp_content",
      record: { product_id: sourceRow.id, schema_version: 1 },
      old_record: { product_id: sourceRow.id, schema_version: 1 },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      action: "noop",
      slug: sourceRow.slug,
      routineGroup: sourceRow.routine_group,
      reason: "PDP content is not indexed",
    });
  });

  it("rebuilds the direct target when a historical slug route changes", async () => {
    const built = buildAlgoliaRecord(sourceRow);
    mockedFetch.mockResolvedValue(built);

    const outcome = await applyCatalogWebhookEvent({
      type: "INSERT",
      table: "product_slug_routes",
      record: {
        source_slug: "old-northpoint-serum",
        target_product_id: sourceRow.id,
      },
    });

    expect(mockedFetch).toHaveBeenCalledWith(sourceRow.id);
    expect(mockedUpsert).toHaveBeenCalledWith(built);
    expect(outcome).toMatchObject({
      action: "upsert",
      objectID: sourceRow.id,
      slug: sourceRow.slug,
      oldSlug: "old-northpoint-serum",
    });
  });

  it("removes the parent record if a variant change finds no parent", async () => {
    mockedFetch.mockResolvedValue(null); // parent gone (cascade delete)

    const outcome = await applyCatalogWebhookEvent({
      type: "DELETE",
      table: "product_variants",
      old_record: { id: "v-1", product_id: sourceRow.id },
    });

    expect(mockedDelete).toHaveBeenCalledWith(sourceRow.id);
    expect(outcome).toMatchObject({ action: "delete", objectID: sourceRow.id });
  });

  it("no-ops for an unhandled table", async () => {
    const outcome = await applyCatalogWebhookEvent({
      type: "INSERT",
      table: "orders",
      record: { id: "x" },
    });
    expect(outcome.action).toBe("noop");
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});

describe("runSearchBackfill", () => {
  const originalEnvironment = process.env.SEARCH_BACKFILL_ENVIRONMENT;
  const originalProductionFlag = process.env.ALLOW_PRODUCTION_SEARCH_REINDEX;

  beforeEach(() => {
    process.env.SEARCH_BACKFILL_ENVIRONMENT = "development";
    delete process.env.ALLOW_PRODUCTION_SEARCH_REINDEX;
    mockedFetchAll.mockReset();
    mockedReindex.mockReset();
  });

  afterEach(() => {
    if (originalEnvironment === undefined) {
      delete process.env.SEARCH_BACKFILL_ENVIRONMENT;
    } else {
      process.env.SEARCH_BACKFILL_ENVIRONMENT = originalEnvironment;
    }
    if (originalProductionFlag === undefined) {
      delete process.env.ALLOW_PRODUCTION_SEARCH_REINDEX;
    } else {
      process.env.ALLOW_PRODUCTION_SEARCH_REINDEX = originalProductionFlag;
    }
  });

  it("reads, submits, and verifies every transformed product", async () => {
    const record = buildAlgoliaRecord(sourceRow);
    mockedFetchAll.mockResolvedValue([record]);
    mockedReindex.mockResolvedValue({ submitted: 1, verified: 1 });

    await expect(runSearchBackfill()).resolves.toMatchObject({
      indexName: "mei_pelle_products_test",
      read: 1,
      transformed: 1,
      upserted: 1,
      skipped: 0,
      failed: 0,
      verified: 1,
    });
    expect(mockedReindex).toHaveBeenCalledWith([record]);
  });

  it("reports the complete derived projection without writing during dry run", async () => {
    const record = buildAlgoliaRecord(sourceRow);
    mockedFetchAll.mockResolvedValue([record]);

    await expect(runSearchBackfill({ apply: false })).resolves.toMatchObject({
      dryRun: true,
      read: 1,
      transformed: 1,
      upserted: 0,
      skipped: 1,
      verified: 0,
    });
    expect(mockedReindex).not.toHaveBeenCalled();
  });

  it("refuses to silently replace the index from an empty catalog", async () => {
    mockedFetchAll.mockResolvedValue([]);

    await expect(runSearchBackfill()).rejects.toMatchObject({
      name: "SearchBackfillError",
      report: { read: 0, failed: 1 },
    });
    expect(mockedReindex).not.toHaveBeenCalled();
  });

  it("requires an explicit opt-in for production", async () => {
    process.env.SEARCH_BACKFILL_ENVIRONMENT = "production";
    await expect(runSearchBackfill()).rejects.toThrow(/Production search reindex/);
  });
});

describe("catalog cache invalidation", () => {
  it("invalidates both route lookup and Product paths for a historical slug change", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "INSERT",
        table: "product_slug_routes",
        record: {
          source_slug: "old-northpoint-serum",
          target_product_id: sourceRow.id,
        },
      },
      {
        action: "upsert",
        table: "product_slug_routes",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        oldSlug: "old-northpoint-serum",
      },
    );

    expect(targets.tags).toEqual(
      expect.arrayContaining([
        "catalog-product-slug-route",
        "catalog-product-slug-route:old-northpoint-serum",
        `catalog-product-slug-route:${sourceRow.slug}`,
      ]),
    );
    expect(targets.paths).toEqual(
      expect.arrayContaining([
        "/products/old-northpoint-serum",
        `/products/${sourceRow.slug}`,
      ]),
    );
  });

  it("targets stable content and Core routine caches for PDP content changes", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "product_pdp_content",
        record: { product_id: sourceRow.id, schema_version: 1 },
        old_record: { product_id: sourceRow.id, schema_version: 1 },
      },
      {
        action: "noop",
        table: "product_pdp_content",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: "core",
      },
    );

    expect(targets.tags).toEqual(
      expect.arrayContaining([
        `catalog-product-content:${sourceRow.slug}`,
        "catalog-product-content",
        "catalog-core-routine",
      ]),
    );
    expect(targets.tags).not.toContain(
      `catalog-product-offer:${sourceRow.slug}`,
    );
    expect(targets.tags).not.toContain(
      `catalog-product-card:${sourceRow.slug}`,
    );
  });

  it("targets only offer caches for variant changes", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "product_variants",
        record: { product_id: sourceRow.id },
      },
      {
        action: "upsert",
        table: "product_variants",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        oldSlug: "old-northpoint-serum",
        routineGroup: sourceRow.routine_group,
        oldRoutineGroup: "core",
      },
    );

    expect(targets.tags).toEqual(
      expect.arrayContaining([
        `catalog-product-offer:${sourceRow.slug}`,
        "catalog-product-offer:old-northpoint-serum",
        "catalog-product-offer",
      ]),
    );
    expect(targets.tags).not.toContain(
      `catalog-product-content:${sourceRow.slug}`,
    );
    expect(targets.tags).not.toContain(
      `catalog-product-card:${sourceRow.slug}`,
    );
    expect(targets.paths).toContain(`/products/${sourceRow.slug}`);
    expect(targets.paths).toContain("/products/old-northpoint-serum");
  });

  it("invalidates derived collection and discovery membership when a product moves", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "products",
        record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          routine_group: "beyond_core",
        },
        old_record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          routine_group: "core",
        },
      },
      {
        action: "upsert",
        table: "products",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: "beyond_core",
        oldRoutineGroup: "core",
      },
    );

    expect(targets.tags).toEqual(
      expect.arrayContaining([
        "catalog-products",
        "catalog-discovery",
        "collection:beyond-the-core",
        "collection:the-core",
      ]),
    );
  });

  it("keeps an offer-only product status update out of editorial caches", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "products",
        record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          status: "sold_out",
          updated_at: "2026-07-29T10:01:00.000Z",
        },
        old_record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          status: "available",
          updated_at: "2026-07-29T10:00:00.000Z",
        },
      },
      {
        action: "upsert",
        table: "products",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
      },
    );

    expect(targets.tags).toEqual([
      `catalog-product-offer:${sourceRow.slug}`,
      "catalog-product-offer",
    ]);
    expect(targets.tags).not.toContain(
      `catalog-product-content:${sourceRow.slug}`,
    );
  });

  it("limits PDP-only media invalidation to the affected product", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "product_media",
        record: {
          product_id: sourceRow.id,
          role: "ingredients_texture",
        },
        old_record: {
          product_id: sourceRow.id,
          role: "ingredients_texture",
        },
      },
      {
        action: "noop",
        table: "product_media",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: sourceRow.routine_group,
      },
    );

    expect(targets).toEqual({
      tags: [
        `catalog-product-content:${sourceRow.slug}`,
        "catalog-product-content",
      ],
      paths: [`/products/${sourceRow.slug}`],
    });
  });

  it.each(["core_routine_texture", "core_routine_editorial"])(
    "invalidates the shared routine cache and all three Core PDPs for %s",
    (role) => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "product_media",
        record: {
          product_id: sourceRow.id,
          role,
        },
        old_record: {
          product_id: sourceRow.id,
          role,
        },
      },
      {
        action: "noop",
        table: "product_media",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: "core",
      },
    );

    expect(targets.tags).toEqual(
      expect.arrayContaining([
        "catalog-core-routine",
        `catalog-product-content:${sourceRow.slug}`,
        "catalog-product-content",
      ]),
    );
    expect(targets.paths).toEqual(
      expect.arrayContaining([
        "/products/cleanse-01-calming-gel-cleanser",
        "/products/treat-03-pdrn-5-ampoule",
        "/products/seal-05-green-collagen-cream",
      ]),
    );
    expect(targets.tags).not.toContain("catalog-product-card");
    for (const path of SHOP_COLLECTION_PATHS) {
      expect(targets.paths).not.toContain(path);
    }
    },
  );

  it("invalidates all three Core PDPs when shared product metadata changes", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "products",
        record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          routine_group: "core",
        },
        old_record: {
          id: sourceRow.id,
          slug: sourceRow.slug,
          routine_group: "core",
        },
      },
      {
        action: "upsert",
        table: "products",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: "core",
        oldRoutineGroup: "core",
      },
    );

    expect(targets.tags).toContain("catalog-core-routine");
    expect(targets.paths).toContain(
      "/products/cleanse-01-calming-gel-cleanser",
    );
    expect(targets.paths).toContain("/products/treat-03-pdrn-5-ampoule");
    expect(targets.paths).toContain("/products/seal-05-green-collagen-cream");
  });

  it("invalidates only the owning PDP for outcome media on a Core product", () => {
    const targets = getCatalogInvalidationTargets(
      {
        type: "UPDATE",
        table: "product_media",
        record: {
          product_id: sourceRow.id,
          role: "pdp_outcome",
        },
        old_record: {
          product_id: sourceRow.id,
          role: "pdp_outcome",
        },
      },
      {
        action: "noop",
        table: "product_media",
        objectID: sourceRow.id,
        slug: sourceRow.slug,
        routineGroup: "core",
      },
    );

    expect(targets).toEqual({
      tags: [
        `catalog-product-content:${sourceRow.slug}`,
        "catalog-product-content",
      ],
      paths: [`/products/${sourceRow.slug}`],
    });
  });
});
