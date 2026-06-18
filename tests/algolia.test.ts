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
}));
vi.mock("@/lib/algolia/server", () => ({
  upsertSearchRecord: vi.fn(() => Promise.resolve()),
  deleteSearchRecord: vi.fn(() => Promise.resolve()),
}));

import { fetchSearchRecordById } from "@/lib/algolia/source";
import { upsertSearchRecord, deleteSearchRecord } from "@/lib/algolia/server";
import {
  applyCatalogWebhookEvent,
  verifyWebhookSecret,
} from "@/lib/algolia/sync";

const mockedFetch = fetchSearchRecordById as unknown as Mock;
const mockedUpsert = upsertSearchRecord as unknown as Mock;
const mockedDelete = deleteSearchRecord as unknown as Mock;

const sourceRow: CatalogProductSource = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "northpoint-renewal-serum",
  name: "Northpoint Renewal Serum",
  tagline: "Overnight resurfacing concentrate",
  collection: "Treat",
  blurb: "A nightly serum that refines tone.",
  status: "available",
  swatch_from: "#e3ddea",
  swatch_to: "#c2b5d6",
  position: 2,
  created_at: "2026-06-14T00:00:00.000Z",
  made_for: "Uneven texture or tone",
  good_for: "Nighttime routine",
  texture: "Silky serum",
  product_variants: [
    { variant_key: "50ml", label: "50 ml", price_cents: 7800, position: 1 },
    { variant_key: "30ml", label: "30 ml", price_cents: 5400, position: 0 },
  ],
};

describe("buildAlgoliaRecord", () => {
  it("maps a catalog row to a storefront-safe record", () => {
    const r = buildAlgoliaRecord(sourceRow);

    expect(r.objectID).toBe(sourceRow.id);
    expect(r.productId).toBe(sourceRow.id);
    expect(r.slug).toBe("northpoint-renewal-serum");
    expect(r.title).toBe("Northpoint Renewal Serum");
    expect(r.subtitle).toBe("Overnight resurfacing concentrate");
    expect(r.descriptor).toBe("A nightly serum that refines tone.");
    expect(r.collection).toBe("Treat");
    expect(r.category).toBe("Treat");
    expect(r.currency).toBe("USD");
    // Price range derived from variants (min/max in cents).
    expect(r.priceMin).toBe(5400);
    expect(r.priceMax).toBe(7800);
    // Variants summarized in catalog (position) order.
    expect(r.variantCount).toBe(2);
    expect(r.variantNames).toEqual(["30 ml", "50 ml"]);
    expect(r.available).toBe(true);
    expect(r.waitlist).toBe(false);
    expect(r.badge).toBeNull();
    expect(r.featuredRank).toBe(2);
    // Keywords pull from safe descriptive fields + variant labels.
    expect(r.keywords).toContain("Treat");
    expect(r.keywords).toContain("Silky serum");
    expect(r.keywords).toContain("30 ml");
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
    expect(INDEX_SETTINGS.searchableAttributes).toContain("title");
    expect(INDEX_SETTINGS.customRanking).toContain("asc(featuredRank)");
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
