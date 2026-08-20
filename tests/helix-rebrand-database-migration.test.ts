import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260819233842_complete_helix_rebrand_database_audit.sql",
);

describe("complete Helix rebrand database migration", () => {
  it("renames only active implementation values while preserving object identity", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const oldFamilyLock = ["mei", "pelle", "product", "family"].join("-");
    const newFamilyLock = ["helix", "product", "family"].join("-");
    const oldActorSetting = ["mei", "pelle"].join("_") + ".catalog_actor_id";
    const oldSlugLock = ["mei", "pelle", "product", "slug", "routes"].join("-");
    const oldTrustpilotDefault = `${["Mei", "Pelle"].join(" ")} does not incentivize`;

    expect(sql).toContain("pg_catalog.pg_get_functiondef");
    expect(sql).toContain("execute pg_catalog.replace");
    expect(sql).toContain(`'${oldFamilyLock}:'`);
    expect(sql).toContain(`'${newFamilyLock}:'`);
    expect(sql).toContain(`'${oldActorSetting}'`);
    expect(sql).toContain("'helix.catalog_actor_id'");
    expect(sql).toContain(`'${oldSlugLock}'`);
    expect(sql).toContain("'helix-product-slug-routes'");
    expect(sql).toContain("comment on table public.admin_memberships");
    expect(sql).toContain(oldTrustpilotDefault);
    expect(sql).toContain("helix does not incentivize");
    expect(sql).not.toMatch(/drop\s+function/i);
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });
});
