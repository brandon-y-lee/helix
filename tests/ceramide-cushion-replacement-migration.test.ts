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
});
