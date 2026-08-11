import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/staging_catalog_reconciliation.integration.sql",
  ),
  "utf8",
);

describe("staging Catalog reconciliation contract", () => {
  it("pins every selected Product's exact public evidence projection", () => {
    for (const slug of [
      "biotic-reset",
      "peptide-bounce",
      "ceramide-cushion",
      "mineral-guard",
      "balancing-prep",
      "polishing-prep",
      "beaming-prep",
      "chilling-prep",
      "peptide-eye-cream",
      "peptide-nourish-mask",
    ]) {
      expect(sql).toContain(`('${slug}',`);
    }

    expect(sql).toContain("selected Product provenance/content evidence drifted");
    expect(sql).toContain("actual.relationships_hash");
    expect(sql).toContain("actual.offers_hash");

    for (const field of [
      "badge",
      "texture",
      "finish",
      "volume",
      "swatch_from",
      "swatch_to",
      "sort_order",
      "routine_sort",
      "currency",
      "seo_title",
    ]) {
      expect(sql).toContain(`'${field}', product.${field}`);
    }
    expect(sql).toContain("'usage_time', to_jsonb(product.usage_time)");
    expect(sql).toContain(
      "'search_keywords', to_jsonb(product.search_keywords)",
    );

    for (const field of [
      "width",
      "height",
      "placeholder_palette",
      "variant_id",
    ]) {
      expect(sql).toContain(`'${field}', item.${field}`);
    }
  });

  it("pins the completed Green Collagen replacement lifecycle directly", () => {
    expect(sql).toContain("green.catalog_status = 'archived'");
    expect(sql).toContain("replacement.catalog_status = 'active'");
    expect(sql).toContain("replacement.status = 'coming_soon'");
    expect(sql).toContain("Green Collagen replacement lifecycle drifted");
    expect(sql).toContain("an Active Product still points to archived Green Collagen");
  });
});
