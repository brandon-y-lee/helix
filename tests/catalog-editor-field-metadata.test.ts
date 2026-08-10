import { describe, expect, it } from "vitest";
import {
  CATALOG_FIELD_OWNERSHIP,
  canCatalogRoleEditField,
  catalogFieldsForTable,
  type CatalogEditorTable,
} from "@/lib/catalog/field-ownership";

const schemaFields = {
  products: [
    "id", "slug", "display_name",
    "product_type", "catalog_status", "badge", "currency", "sort_order",
    "editorial_description", "benefits", "editorial_how_to_use",
    "formula_notes", "swatch_from", "swatch_to", "status", "made_for",
    "good_for", "texture", "key_ingredients", "ingredients", "cautions",
    "finish", "volume", "skin_types", "concerns", "usage_time",
    "seo_title", "seo_description", "search_keywords", "routine_group",
    "system_step_name", "routine_sort", "created_at",
    "published_at", "updated_at",
  ],
  product_pdp_content: [
    "product_id", "schema_version", "profile_title_tokens", "routine_overlay",
    "outcome_heading", "outcome_labels", "how_to_use_steps",
    "application_steps", "ingredient_cards", "ingredient_story",
    "routine_guidance", "created_at", "updated_at",
  ],
  product_variants: [
    "id", "product_id", "variant_key", "label", "price_cents", "sku",
    "supplier_variant_id", "option_values", "compare_at_price_cents",
    "available", "inventory_status", "volume", "pack_count", "sort_order",
    "updated_at", "archived_at",
  ],
  product_media: [
    "id", "product_id", "variant_id", "media_type", "url", "alt", "width",
    "height", "role", "sort_order", "original_source_url", "source_filename",
    "palette_id", "placeholder_palette", "created_at", "updated_at",
    "archived_at",
  ],
  product_relationships: [
    "product_id", "related_product_id", "relationship_type", "sort_order",
    "created_at", "archived_at",
  ],
  product_sources: [
    "product_id", "supplier", "supplier_title", "supplier_url",
    "supplier_handle", "supplier_product_id", "source_inspected_at",
    "source_content_hash", "original_source_price_cents",
    "formulation_version_notes", "raw_source", "created_at", "updated_at",
  ],
  product_content_drafts: [
    "id", "product_id", "schema_version", "base_revision", "version",
    "document", "status", "validation_errors", "created_by", "updated_by",
    "created_at", "updated_at", "ready_at", "published_at", "discarded_at",
  ],
  catalog_product_revisions: [
    "id", "product_id", "revision_number", "schema_version", "document",
    "source_draft_id", "published_by", "published_at",
  ],
  catalog_editor_audit_log: [
    "id", "action", "actor_id", "product_id", "draft_id", "revision_id",
    "metadata", "created_at",
  ],
} as const satisfies Partial<Record<CatalogEditorTable, readonly string[]>>;

describe("catalog editor field metadata", () => {
  it("covers every current normalized and system-history field exactly once", () => {
    for (const [table, expectedFields] of Object.entries(schemaFields)) {
      const actual = catalogFieldsForTable(table as CatalogEditorTable).map(
        (entry) => entry.field,
      );
      expect(new Set(actual), table).toEqual(new Set(expectedFields));
      expect(actual, `${table} duplicate field metadata`).toHaveLength(
        new Set(actual).size,
      );
    }
  });

  it("gives every mutable field an authorized role and every immutable field a reason", () => {
    for (const field of CATALOG_FIELD_OWNERSHIP.filter(
      (entry) => entry.visible && !entry.editor.derived,
    )) {
      if (field.editor.editable) {
        expect(field.editor.editableBy.length, `${field.table}.${field.field}`).toBeGreaterThan(0);
        expect(field.publishMapping).toBe(`${field.table}.${field.field}`);
      } else {
        expect(field.readOnlyReason, `${field.table}.${field.field}`).toBeTruthy();
      }
    }
  });

  it("keeps system identity constraints immutable and advanced mutations admin-only", () => {
    for (const field of ["id", "slug", "currency", "created_at", "updated_at"] as const) {
      expect(canCatalogRoleEditField("admin", "products", field)).toBe(false);
    }
    expect(canCatalogRoleEditField("catalog_editor", "products", "display_name")).toBe(true);
    expect(canCatalogRoleEditField("catalog_publisher", "products", "display_name")).toBe(true);
    expect(canCatalogRoleEditField("catalog_editor", "products", "texture")).toBe(false);
    expect(canCatalogRoleEditField("admin", "products", "texture")).toBe(true);
    expect(canCatalogRoleEditField("catalog_editor", "product_variants", "price_cents")).toBe(false);
    expect(canCatalogRoleEditField("admin", "product_variants", "price_cents")).toBe(true);
  });

  it("allows only safe source corrections and preserves reconciliation provenance", () => {
    const editable = catalogFieldsForTable("product_sources")
      .filter((field) => field.editor.editable)
      .map((field) => field.field);
    expect(editable).toEqual([
      "supplier_title",
      "supplier_url",
      "original_source_price_cents",
      "formulation_version_notes",
    ]);
    for (const field of [
      "supplier",
      "supplier_handle",
      "supplier_product_id",
      "source_inspected_at",
      "source_content_hash",
      "raw_source",
    ]) {
      expect(canCatalogRoleEditField("admin", "product_sources", field)).toBe(false);
    }
    expect(
      catalogFieldsForTable("product_sources")
        .filter((field) => field.editor.editable)
        .every((field) => field.importWarning),
    ).toBe(true);
  });

  it("never makes derived cache or search projections editable", () => {
    for (const field of CATALOG_FIELD_OWNERSHIP.filter(
      (entry) => entry.table === "algolia_products" || entry.table === "next_data_cache",
    )) {
      expect(field.visible).toBe(false);
      expect(field.editor.derived).toBe(true);
      expect(field.editor.editable).toBe(false);
      expect(field.publishMapping).toBeNull();
    }
  });
});
