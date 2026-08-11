import { describe, expect, it } from "vitest";
import type { CatalogProductSource } from "@/lib/algolia/record";
import { buildPublicSearchRecords } from "@/lib/algolia/source";

const ceramide: CatalogProductSource = {
  id: "496caac9-f54a-4392-84ff-01c26d396f8d",
  slug: "ceramide-cushion",
  display_name: "Ceramide Cushion",
  product_type: "Intensive moisture cream",
  badge: null,
  catalog_status: "active",
  editorial_description:
    "A rich, non-greasy final moisture layer with a soft, composed finish.",
  status: "coming_soon",
  swatch_from: "#dfe5df",
  swatch_to: "#c8d0c8",
  sort_order: 30,
  created_at: "2026-08-10T00:00:00.000Z",
  published_at: null,
  updated_at: "2026-08-11T00:00:00.000Z",
  made_for: "Dry-feeling skin",
  good_for: "Final moisture layer",
  texture: "Rich cream",
  key_ingredients: ["Glycerin", "Ceramide AP"],
  ingredients: "Water, Glycerin, Ceramide AP",
  concerns: ["Dryness"],
  usage_time: ["Morning", "Night"],
  search_keywords: ["ceramide cushion"],
  product_slug_routes: [
    {
      source_slug: "seal-05-green-collagen-cream",
      route_kind: "replacement",
    },
    { source_slug: "ceramide-cushion", route_kind: "canonical" },
  ],
  product_family_memberships: null,
  routine_group: "core",
  system_step_name: "SEAL",
  system_steps: { name: "SEAL", position: 5, routine_group: "core" },
  routine_sort: 30,
  product_variants: [],
  product_media: [],
};

const archivedGreen: CatalogProductSource = {
  ...ceramide,
  id: "33333333-3333-4333-8333-333333333333",
  slug: "seal-05-green-collagen-cream",
  display_name: "SEAL",
  catalog_status: "archived",
  status: "available",
  product_slug_routes: [],
  product_variants: [
    {
      variant_key: "50ml",
      label: "50 mL",
      price_cents: 5800,
      sort_order: 0,
      available: true,
      inventory_status: "in_stock",
    },
  ],
};

describe("Ceramide Cushion search replacement projection", () => {
  it("indexes only Ceramide with the Green alias and no commerce or excluded claims", () => {
    const records = buildPublicSearchRecords([ceramide, archivedGreen]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      slug: "ceramide-cushion",
      slugAliases: ["seal-05-green-collagen-cream"],
      status: "coming_soon",
      available: false,
      variantCount: 0,
      variantNames: [],
    });
    expect(records[0]).not.toHaveProperty("priceMin");
    expect(records[0]).not.toHaveProperty("priceMax");
    expect(JSON.stringify(records[0])).not.toMatch(
      /3:1:1|\d+(?:\.\d+)?\s*(?:hours?|hrs?|days?|weeks?|months?|%|percent|[x×]|(?:mg|mcg|µg|μg|g)\s*\/\s*(?:ml|g)|ppm)|twice|double|triple|barrier|penetrat|clinically|hypoallergenic|vegan|cruelty[- ]free/i,
    );
  });
});
