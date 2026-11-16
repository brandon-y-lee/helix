import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMER_BRAND_NAME } from "@/tests/helpers/former-identifiers";

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
    expect(migration).toContain(
      `replace(p.seo_title, '${FORMER_BRAND_NAME}', 'helix')`,
    );
    expect(migration).toContain(
      `replace(\n      p.editorial_description,\n      '${FORMER_BRAND_NAME}',\n      'helix'\n    )`,
    );
    expect(migration).toContain(
      `replace(formula_note, '${FORMER_BRAND_NAME}', 'helix')`,
    );
    expect(migration).toContain(
      `replace(c.routine_guidance, '${FORMER_BRAND_NAME}', 'helix')`,
    );
    expect(migration).toContain(
      `Active Product branding still contains ${FORMER_BRAND_NAME} after migration`,
    );
    expect(migration).toContain(
      `Active Product Education still contains ${FORMER_BRAND_NAME} after migration`,
    );
    expect(migration).not.toMatch(
      /where\s+p\.catalog_status\s*<>\s*'active'/i,
    );
  });
});
