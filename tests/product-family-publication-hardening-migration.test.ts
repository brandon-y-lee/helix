import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811012500_harden_product_family_publication.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Product Family publication hardening migration", () => {
  it("indexes the family System Step foreign key reported by the database advisor", () => {
    expect(sql).toContain(
      "create index product_families_system_step_name_idx",
    );
    expect(sql).toContain(
      "on public.product_families (system_step_name)",
    );
  });

  it("records the durable Balancing Prep rename against the immutable family revision", () => {
    expect(sql).toContain("'refine-02-pore-treatment-pads'");
    expect(sql).toContain("'balancing-prep'");
    expect(sql).toContain("route.route_kind = 'rename'");
    expect(sql).toContain("'slug.rename.published'");
    expect(sql).toContain("'family.published'");
    expect(sql).toContain("'migration-143-hardening'");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("fails closed unless the exact family, route, revision, and prior audit exist", () => {
    expect(sql).toContain("REFINE family hardening preconditions failed");
    expect(sql).toContain("REFINE family hardening expected one audit event");
    expect(sql).toContain("get diagnostics v_changed = row_count");
  });
});
