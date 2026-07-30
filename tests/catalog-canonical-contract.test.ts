import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASE_TWO_MEDIA_DROP_COLUMNS,
  PHASE_TWO_PRODUCT_DROP_COLUMNS,
  PHASE_TWO_VARIANT_DROP_COLUMNS,
} from "@/lib/catalog/field-ownership";

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
  "scripts/db/catalog-data-audit.ts",
] as const;

const UNIQUE_LEGACY_FIELDS = [
  "action_name",
  "routine_number",
  "featured_rank",
  "product_details",
  "routine_step",
  "routine_order",
  "routine_group_label",
  "routine_display_label",
  "legacy_routine_group_label",
  "legacy_routine_display_label",
] as const;

describe("canonical catalog source contract", () => {
  it("keeps runtime queries and mappers free of unambiguous Phase 2 fields", () => {
    for (const path of QUERY_AND_MAPPER_FILES) {
      const contents = source(path);
      expect(contents, `${path} contains a broad select`).not.toMatch(
        /\.select\(\s*["']\*["']\s*\)/,
      );
      for (const field of [
        ...UNIQUE_LEGACY_FIELDS,
        ...PHASE_TWO_MEDIA_DROP_COLUMNS,
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

    for (const field of PHASE_TWO_PRODUCT_DROP_COLUMNS.filter(
      (candidate) => candidate !== "description",
    )) {
      expect(modelSource, `domain model exposes ${field}`).not.toMatch(
        new RegExp(`\\b${field}\\s*:`),
      );
    }
  });

  it("keeps import write payloads free of Phase 2 product, variant, and media keys", () => {
    const importer = source("scripts/catalog-import-leaders.ts");
    const writerSections = [
      importer.slice(
        importer.indexOf("function sourceProductValues"),
        importer.indexOf("async function ensureBucket"),
      ),
      importer.slice(
        importer.indexOf("async function upsertVariants"),
        importer.indexOf("async function upsertSource"),
      ),
    ].join("\n");

    for (const field of [
      ...PHASE_TWO_PRODUCT_DROP_COLUMNS,
      ...PHASE_TWO_VARIANT_DROP_COLUMNS,
      ...PHASE_TWO_MEDIA_DROP_COLUMNS,
    ]) {
      expect(writerSections, `import payload writes ${field}`).not.toMatch(
        new RegExp(`(?:^|\\n)\\s*${field}\\s*:`, "m"),
      );
    }
  });
});
