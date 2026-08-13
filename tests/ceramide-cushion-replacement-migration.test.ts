import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811133638_publish_ceramide_cushion_replacement.sql",
  ),
  "utf8",
);
const integrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/ceramide_cushion_replacement.integration.sql",
  ),
  "utf8",
);
const claimsHardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811141153_harden_ceramide_claim_exclusion.sql",
  ),
  "utf8",
);
const completeClaimsHardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811142003_complete_ceramide_claim_exclusion.sql",
  ),
  "utf8",
);

describe("Ceramide Cushion replacement publication", () => {
  it("atomically activates Ceramide and archives Green without commerce transfer", () => {
    expect(migration).toContain("do $publish_ceramide_cushion_replacement$");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("catalog_status = 'active'");
    expect(migration).toContain("catalog_status = 'archived'");
    expect(migration).toContain("status = 'coming_soon'");
    expect(migration).toContain("Ceramide Cushion must remain without Product Variants");
    expect(migration).not.toMatch(/insert\s+into\s+public\.product_variants/i);
    expect(migration).not.toMatch(/update\s+public\.product_variants/i);
    expect(migration).not.toMatch(/delete\s+from/i);
  });

  it("publishes one replacement route and preserves Green history", () => {
    expect(migration).toContain("route_kind = 'replacement'");
    expect(migration).toContain("slug.replacement.published");
    expect(migration).toContain("v_green_history_before");
    expect(migration).toContain("Green Collagen history changed during replacement");
    expect(migration).toContain("private.catalog_editor_document_v4(v_ceramide_id)");
  });

  it("repoints active inbound Routine Complements without rewriting old rows", () => {
    expect(migration).toContain("relationship_type = 'complete_the_routine'");
    expect(migration).toContain("v_now constant timestamptz := statement_timestamp()");
    expect(migration).toContain("set archived_at = v_now");
    expect(migration).toContain("target_product_id = v_ceramide_id");
    expect(migration).toContain("No Active Product may point to archived Green Collagen");
  });

  it("ships a read-only exact post-publication verification contract", () => {
    expect(integrationSql).toContain("begin;");
    expect(integrationSql).toContain("rollback;");
    expect(integrationSql).toContain("replacement:ceramide-cushion");
    expect(integrationSql).toContain("expected_green_history_hash");
    expect(integrationSql).toContain("Ceramide Cushion inbound Routine Complement graph drifted");
    expect(integrationSql).toContain("unsupported claim entered published Ceramide Cushion content");
  });

  it("excludes every claim family withheld by the approved dossier", () => {
    expect(claimsHardeningMigration).toContain("to_jsonb(product) - 'formula_notes'");
    expect(completeClaimsHardeningMigration).toContain(
      "to_jsonb(product) - 'formula_notes'",
    );
    expect(integrationSql).toContain("to_jsonb(product) - 'formula_notes'");

    for (const claimPattern of [
      "3:1:1",
      "hours?|hrs?|days?|weeks?|months?",
      "all[- ]day",
      "repair|restore|rebuild",
      "penetrat",
      "deliver",
      "layer[- ]specific",
      "clinically",
      "before[ /-]?after",
      "x|×",
      "twice|double|triple",
      "all skin types",
      "sensitive[- ]skin",
      "hypoallergenic",
      "non[- ]irritating",
      "dermatologist[- ]tested",
      "percent",
      "mg|mcg|µg|μg|g",
      "ppm",
      "concentration[- ]led",
      "vegan",
      "cruelty[- ]free",
      "clean",
      "sustainab",
      "sourcing",
      "certif",
    ]) {
      expect(completeClaimsHardeningMigration).toContain(claimPattern);
      expect(integrationSql).toContain(claimPattern);
    }
  });
});
