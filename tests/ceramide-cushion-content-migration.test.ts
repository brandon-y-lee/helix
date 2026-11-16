import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMER_BRAND_NAME } from "@/tests/helpers/former-identifiers";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811125420_prepare_ceramide_cushion_pdp_content.sql",
  ),
  "utf8",
);
const integrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/ceramide_cushion_content.integration.sql",
  ),
  "utf8",
);

describe("Ceramide Cushion PDP content preparation", () => {
  it("authors the approved cosmetic content without excluded claims", () => {
    expect(migration).toContain("A rich moisture cream");
    expect(migration).toContain("YOUR DAILY CREAM THAT:");
    expect(migration).toContain("Glycerin");
    expect(migration).toContain("Oat kernel extract");
    expect(migration).toContain("Centella asiatica");
    expect(migration).toContain("Ceramide AP");
    expect(migration).toContain("Peptides");
    expect(migration).toContain(
      `Use after TREAT as the final ${FORMER_BRAND_NAME} cream step`,
    );

    const contentInsert = migration.slice(
      migration.indexOf("insert into public.product_pdp_content"),
      migration.indexOf("insert into public.product_media"),
    );
    expect(contentInsert).not.toMatch(
      /3:1:1|100[- ]hour|barrier repair|penetrat|clinically|all skin types|hypoallergenic|dermatologist|vegan|cruelty[- ]free/i,
    );
  });

  it("copies only active URL-backed SEAL media into separate Ceramide rows", () => {
    expect(migration).toContain("v_expected_media_count constant integer := 12");
    expect(migration).toContain("green_media.archived_at is null");
    expect(migration).toContain("nullif(btrim(green_media.url), '') is not null");
    expect(migration).toContain("gen_random_uuid()");
    expect(migration).toContain("null::uuid");
    expect(migration).toContain("v_green_media_before");
    expect(migration).toContain("Green Collagen media changed during Ceramide preparation");
    expect(migration).not.toMatch(/update\s+public\.product_media/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.product_media/i);
  });

  it("fails closed on identity or commerce drift and leaves Ceramide unpublished", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("catalog_status = 'draft'");
    expect(migration).toContain("status = 'coming_soon'");
    expect(migration).toContain("Ceramide Cushion must remain without Product Variants");
    expect(migration).toContain("Ceramide Cushion Product Source changed during PDP preparation");
    expect(migration).not.toMatch(/update\s+public\.products/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.product_variants/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.product_sources/i);
  });

  it("ships a read-only exact-state integration contract", () => {
    expect(integrationSql).toContain("begin;");
    expect(integrationSql).toContain("rollback;");
    expect(integrationSql).toContain("expected_content");
    expect(integrationSql).toContain("expected_media_count constant integer := 12");
    expect(integrationSql).toContain("unsupported Ceramide Cushion claim entered PDP content");
    expect(integrationSql).toContain("Ceramide Cushion commerce isolation drifted");
    expect(integrationSql).toContain("Green Collagen media history drifted");
  });
});
