import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810160909_migrate_approved_core_portfolio.sql",
  ),
  "utf8",
);

describe("approved Core portfolio migration", () => {
  it("renames CLEANSE and TREAT in place while preserving their Product identities", () => {
    expect(migration).toContain("cleanse-01-calming-gel-cleanser");
    expect(migration).toContain("biotic-reset");
    expect(migration).toContain("treat-03-pdrn-5-ampoule");
    expect(migration).toContain("peptide-bounce");
    expect(migration).toContain("Calming Biotics Gel Cleanser");
    expect(migration).toContain("PDRN 5% Active Ampoule");
  });

  it("fails closed on missing Formula identities and unverified commerce", () => {
    expect(migration).toMatch(/count\(\*\)[\s\S]*?\)\s*<>\s*1 then/i);
    expect(migration).toContain("inventory_status = 'unavailable'");
    expect(migration).toContain("available = false");
    expect(migration).toContain("status = 'coming_soon'");
  });

  it("creates Ceramide Cushion as a distinct draft without an Offer or Green Collagen facts", () => {
    expect(migration).toContain("Ceramide Cushion");
    expect(migration).toContain("Calming Biotics Intensive Cream");
    expect(migration).toMatch(
      /insert into public\.products[\s\S]*catalog_status[\s\S]*'draft'/i,
    );
    expect(migration).toContain("leaders-calming-biotics-intensive-cream");
    expect(migration).not.toMatch(
      /insert into public\.product_variants[\s\S]*ceramide-cushion/i,
    );
  });

  it("keeps Green Collagen canonical until an eligible replacement can be published", () => {
    expect(migration).toContain("seal-05-green-collagen-cream");
    expect(migration).toMatch(/select catalog_status[\s\S]*<>\s*'active'/i);
    expect(migration).not.toContain("replace_catalog_product_slug");
  });

  it("uses additive, transactional SQL without deleting historical facts", () => {
    expect(migration).toContain("do $core_portfolio_migration$");
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bdrop\s+(table|column)\b/i);
  });
});
