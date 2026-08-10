import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810135417_durable_product_slug_routes.sql",
  ),
  "utf8",
);
const auditMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810142223_durable_product_slug_route_audit_actions.sql",
  ),
  "utf8",
);

describe("durable Product slug route migration", () => {
  it("extends the immutable Catalog audit allowlist for both route events", () => {
    expect(auditMigration).toContain("slug.rename.published");
    expect(auditMigration).toContain("slug.replacement.published");
    expect(auditMigration).toContain("catalog_editor_audit_log_action_check");
  });

  it("creates one append-only registry for canonical, rename, and replacement routes", () => {
    expect(migration).toContain("create table public.product_slug_routes");
    expect(migration).toContain("'canonical', 'rename', 'replacement'");
    expect(migration).toContain("source_slug text primary key");
    expect(migration).toContain("product_slug_routes_source_product_id_idx");
    expect(migration).toContain("product_slug_routes_target_product_id_idx");
    expect(migration).toContain("product_slug_routes_canonical_product_uidx");
    expect(migration).toContain("product_slug_routes is append-only");
  });

  it("backfills canonical public routes and the retired static Product redirects", () => {
    expect(migration).toContain("insert into public.product_slug_routes");
    expect(migration).toContain("reset-01-calming-gel-cleanser");
    expect(migration).toContain("recode-03-pdrn-5-ampoule");
    expect(migration).toContain("cleanse-01-calming-gel-cleanser");
    expect(migration).toContain("treat-03-pdrn-5-ampoule");
  });

  it("keeps slug changes and explicit replacements inside privileged atomic functions", () => {
    expect(migration).toContain("private.sync_product_slug_route");
    expect(migration).toContain("public.replace_catalog_product_slug");
    expect(migration).toContain("public.publish_catalog_product_draft");
    expect(migration).toContain("{changedTables,productSlugRoutes}");
    expect(migration).toContain("'product_slug_routes', true");
    expect(migration).toContain("set search_path = ''");
  });

  it("exposes only safe active route resolution and denies public writes", () => {
    expect(migration).toContain("alter table public.product_slug_routes enable row level security");
    expect(migration).toContain("create policy \"Public read active Product slug routes\"");
    expect(migration).toContain("public.resolve_product_slug");
    expect(migration).toContain("revoke all on table public.product_slug_routes");
    expect(migration).toContain("grant select on table public.product_slug_routes");
    expect(migration).toContain("grant execute on function public.resolve_product_slug(text)");
    expect(migration).not.toMatch(/\bdrop\s+(table|column)\b/i);
  });
});
