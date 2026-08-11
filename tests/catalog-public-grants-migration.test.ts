import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811031349_tighten_public_catalog_grants.sql",
  ),
  "utf8",
);

describe("public Catalog least-privilege migration", () => {
  it("leaves browser roles with read-only table privileges", () => {
    for (const table of ["products", "product_variants", "product_media"]) {
      expect(sql).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated`,
      );
      expect(sql).toContain(
        `grant select on table public.${table} to anon, authenticated`,
      );
    }

    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete|truncate|references|trigger|all)\b[\s\S]*?\bto\s+(?:anon|authenticated)/i,
    );
  });

  it("preserves the server role's explicit Catalog read and write boundary", () => {
    for (const table of ["products", "product_variants", "product_media"]) {
      expect(sql).toContain(
        `grant select, insert, update, delete on table public.${table} to service_role`,
      );
    }
  });
});
