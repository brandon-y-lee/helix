import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819163645_rebrand_public_catalog_content.sql",
  ),
  "utf8",
);

describe("helix Public Site catalog content migration", () => {
  it("updates only the verified active Product branding rows and fails on drift", () => {
    expect(migration).toContain("p.catalog_status = 'active'");
    expect(migration).toContain("v_product_rows <> 10");
    expect(migration).toContain("v_pdp_rows <> 1");
    expect(migration).toContain("replace(p.seo_title, 'Mei Pelle', 'helix')");
    expect(migration).toMatch(
      /replace\(\s*p\.editorial_description,\s*'Mei Pelle',\s*'helix'\s*\)/,
    );
    expect(migration).toContain(
      "replace(formula_note, 'Mei Pelle', 'helix')",
    );
    expect(migration).toMatch(
      /replace\(c\.routine_guidance, 'Mei Pelle', 'helix'\)/,
    );
    expect(migration).toContain(
      "Active Product branding still contains Mei Pelle after migration",
    );
    expect(migration).toContain(
      "Active Product Education still contains Mei Pelle after migration",
    );
    expect(migration).not.toMatch(
      /where\s+p\.catalog_status\s*<>\s*'active'/i,
    );
  });
});
