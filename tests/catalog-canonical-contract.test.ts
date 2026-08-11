import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

const QUERY_AND_MAPPER_FILES = [
  "lib/catalog.ts",
  "lib/catalog/storefront.ts",
  "lib/algolia/source.ts",
  "lib/algolia/record.ts",
  "lib/cart/server.ts",
  "lib/admin/catalog/service.ts",
  "lib/catalog-cache.ts",
  "lib/catalog-invalidation.ts",
  "lib/catalog-editor/preview-projection.ts",
  "lib/admin/catalog/validation.ts",
  "lib/catalog/field-ownership.ts",
  "test-support/storefront-baseline.ts",
  "test-support/storefront-search-projection.ts",
  "test-support/supabase-storefront-catalog.ts",
] as const;

const PRESENTATION_FILES = [
  "components/product/ProductCard.tsx",
  "components/search/SearchResultCard.tsx",
  "components/product-detail/ProductDetail.tsx",
  "components/product-detail/ProductDetail.adapters.ts",
  "components/product-detail/PdpCoreRoutineSection.tsx",
  "components/system/MethodExperience.tsx",
  "lib/content/core-pdp.ts",
] as const;

const RETIRED_PRODUCT_COLUMNS = [
  "name",
  "tagline",
  "collection",
  "blurb",
  "description",
  "how_to_use",
  "position",
  "action_name",
  "routine_number",
  "subtitle",
  "descriptor",
  "featured_rank",
  "product_details",
  "routine_step",
  "routine_order",
  "routine_group_label",
  "routine_display_label",
  "legacy_routine_group_label",
  "legacy_routine_display_label",
  "formal_title",
  "card_tagline",
  "routine_step_number",
  "routine_step_name",
] as const;
const RETIRED_MEDIA_COLUMNS = ["media_kind"] as const;

const UNIQUE_RETIRED_FIELDS = RETIRED_PRODUCT_COLUMNS.filter(
  (field) =>
    ![
      "name",
      "tagline",
      "collection",
      "blurb",
      "description",
      "how_to_use",
      "position",
      "subtitle",
      "descriptor",
    ].includes(field),
);

describe("canonical catalog source contract", () => {
  it("keeps runtime queries and mappers free of unambiguous Phase 2 fields", () => {
    for (const path of QUERY_AND_MAPPER_FILES) {
      const contents = source(path);
      expect(contents, `${path} contains a broad select`).not.toMatch(
        /\.select\(\s*["']\*["']\s*\)/,
      );
      for (const field of [
        ...UNIQUE_RETIRED_FIELDS,
        ...RETIRED_MEDIA_COLUMNS,
      ]) {
        expect(contents, `${path} references ${field}`).not.toMatch(
          new RegExp(`\\b${field}\\b`),
        );
      }
    }
  });

  it("does not expose compatibility properties in product domain models", () => {
    const modelSource = [
      source("lib/products.ts"),
      source("lib/catalog/models.ts"),
    ].join("\n");

    for (const field of RETIRED_PRODUCT_COLUMNS.filter(
      (candidate) => candidate !== "description",
    )) {
      expect(modelSource, `domain model exposes ${field}`).not.toMatch(
        new RegExp(`\\b${field}\\s*:`),
      );
    }

    for (const field of [
      "formalTitle",
      "cardTagline",
      "routineStepNumber",
      "routineStepName",
    ]) {
      expect(modelSource, `domain model exposes ${field}`).not.toMatch(
        new RegExp(`\\b${field}\\s*:`),
      );
    }
  });

  it("keeps current presentation boundaries free of retired identity properties", () => {
    for (const path of PRESENTATION_FILES) {
      const contents = source(path);
      for (const field of [
        "formalTitle",
        "cardTagline",
        "routineStepNumber",
        "routineStepName",
      ]) {
        expect(contents, `${path} references ${field}`).not.toMatch(
          new RegExp(`\\b${field}\\b`),
        );
      }
    }
  });

});
