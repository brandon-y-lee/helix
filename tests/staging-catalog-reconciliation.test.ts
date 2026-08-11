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
  });

  it("rejects premature Green Collagen archival directly", () => {
    expect(sql).toContain("replacement.catalog_status = 'draft'");
    expect(sql).toContain("green.catalog_status is distinct from 'active'");
    expect(sql).toContain("replacement.catalog_status is distinct from 'active'");
    expect(sql).toContain("eligible Green Collagen replacement lacks one durable route");
  });
});
