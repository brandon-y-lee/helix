import { describe, expect, it } from "vitest";
import { getCatalogInvalidationTargets } from "@/lib/catalog-invalidation";

describe("System Catalog freshness", () => {
  it.each([
    ["routine_sort", 10, 20],
    ["volume", "30 mL", "50 mL"],
    ["usage_time", ["AM"], ["AM", "PM"]],
    ["created_at", "2026-06-01", "2026-06-02"],
  ])("refreshes cards and content when %s changes", (field, before, after) => {
    const targets = getCatalogInvalidationTargets({
      schema: "public",
      table: "products",
      type: "UPDATE",
      record: { id: "product-id", slug: "super-serum", routine_group: "core", [field]: after },
      old_record: { id: "product-id", slug: "super-serum", routine_group: "core", [field]: before },
    });

    expect(targets.tags).toEqual(expect.arrayContaining([
      "catalog-product-card", "catalog-product-card:super-serum",
      "catalog-product-content", "catalog-product-content:super-serum",
      "catalog-core-routine",
    ]));
    expect(targets.tags).not.toContain("catalog-product-offer");
    expect(targets.paths).toContain("/system");
    if (field === "routine_sort") expect(targets.tags).toContain("catalog-discovery");
  });

  it.each(["card_default", "card", "detail", "hero", "cart"])(
    "refreshes both presentation readers for shared %s media",
    (role) => {
      for (const type of ["INSERT", "DELETE"] as const) {
        const media = { id: "media-id", product_id: "product-id", role };
        const targets = getCatalogInvalidationTargets({
          schema: "public", table: "product_media", type,
          record: type === "INSERT" ? media : null,
          old_record: type === "DELETE" ? media : null,
        }, { action: "noop", table: "product_media", slug: "super-serum", routineGroup: "core" });
        expect(targets.tags).toEqual(expect.arrayContaining([
          "catalog-product-card", "catalog-product-content:super-serum",
        ]));
        expect(targets.tags).not.toContain("catalog-product-offer");
        expect(targets.paths).toContain("/system");
      }
    },
  );

  it("refreshes the old content role when an image becomes hover-only", () => {
    const targets = getCatalogInvalidationTargets({
      schema: "public", table: "product_media", type: "UPDATE",
      record: { id: "media-id", product_id: "product-id", role: "card_hover" },
      old_record: { id: "media-id", product_id: "product-id", role: "detail" },
    }, { action: "noop", table: "product_media", slug: "super-serum", routineGroup: "core" });
    expect(targets.tags).toEqual(expect.arrayContaining([
      "catalog-product-card", "catalog-product-content:super-serum",
    ]));
  });

  it("refreshes the System for hover-only media without refreshing editorial content", () => {
    const targets = getCatalogInvalidationTargets({
      schema: "public", table: "product_media", type: "INSERT",
      record: { id: "media-id", product_id: "product-id", role: "card_hover" },
    }, { action: "noop", table: "product_media", slug: "super-serum", routineGroup: "core" });
    expect(targets.tags).toContain("catalog-product-card");
    expect(targets.tags).not.toContain("catalog-product-content");
    expect(targets.tags).not.toContain("catalog-product-offer");
    expect(targets.paths).toContain("/system");
  });

  it.each([undefined, "future-role"])("conservatively refreshes content for unknown role %s", (role) => {
    const targets = getCatalogInvalidationTargets({
      schema: "public", table: "product_media", type: "INSERT",
      record: { id: "media-id", product_id: "product-id", role },
    }, { action: "noop", table: "product_media", slug: "super-serum" });
    expect(targets.tags).toContain("catalog-product-content:super-serum");
  });

});
