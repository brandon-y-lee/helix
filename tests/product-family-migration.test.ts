import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811002745_product_families.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Product Family migration", () => {
  it("models families and their ordered Product memberships as separate governed identities", () => {
    expect(sql).toContain("create table public.product_families");
    expect(sql).toContain("create table public.product_family_memberships");
    expect(sql).toContain("unique (product_id)");
    expect(sql).toContain("unique (family_id, sort_order)");
    expect(sql).toContain(
      "create unique index product_family_single_entry_uidx",
    );
    expect(sql).toContain("create trigger product_families_set_updated_at");
    expect(sql).toContain(
      "create trigger product_family_memberships_set_updated_at",
    );
    expect(sql).toContain("comment on table public.product_families");
    expect(sql).toContain("comment on table public.product_family_memberships");
  });

  it("exposes only eligible family reads while keeping every family write privileged", () => {
    expect(sql).toContain(
      "revoke all on table public.product_families from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "revoke all on table public.product_family_memberships from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant select on table public.product_families to anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant select on table public.product_family_memberships to anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant insert, update, delete on table public.product_families to service_role",
    );
    expect(sql).toContain(
      "grant insert, update, delete on table public.product_family_memberships to service_role",
    );
    expect(sql).toContain(
      "alter table public.product_families enable row level security",
    );
    expect(sql).toContain(
      "alter table public.product_family_memberships enable row level security",
    );
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.product_famil(?:ies|y_memberships)\s+to\s+(?:anon|authenticated)/,
    );
  });

  it("defers exactly-one-entry and shared-System-Step enforcement until the family transaction completes", () => {
    expect(sql).toContain(
      "create function private.enforce_product_family_invariants()",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(
      /count\(\*\) filter \(where membership\.is_entry\)[\s\S]*?<> 1/,
    );
    expect(sql).toContain(
      "product.system_step_name is distinct from family.system_step_name",
    );
    expect(sql.match(/create constraint trigger/g)).toHaveLength(3);
    expect(sql.match(/deferrable initially deferred/g)).toHaveLength(3);
  });

  it("carries governed family state into current V4 drafts and future immutable revisions", () => {
    expect(sql).toMatch(
      /create function private\.catalog_editor_product_family\(p_product_id uuid\)/,
    );
    expect(sql).toContain(
      "create or replace function private.catalog_editor_document_v4",
    );
    expect(sql).toContain("'productFamily'");
    expect(sql).toContain(
      "alter function private.catalog_editor_upgrade_to_v4(jsonb)",
    );
    expect(sql).toContain(
      "rename to catalog_editor_upgrade_to_v4_without_family",
    );
    expect(sql).toMatch(
      /update public\.product_content_drafts[\s\S]*?jsonb_build_object\([\s\S]*?'productFamily'/,
    );
  });

  it("keeps family edits administrator-only and publishes them atomically with revision and audit state", () => {
    expect(sql).toMatch(
      /alter function public\.save_catalog_product_draft\([\s\S]*?rename to save_catalog_product_draft_without_family/,
    );
    expect(sql).toContain(
      "catalog actor cannot save Product Family fields",
    );
    expect(sql).toMatch(
      /alter function public\.publish_catalog_product_draft_v4\([\s\S]*?rename to publish_catalog_product_draft_v4_without_family/,
    );
    expect(sql).toContain("'family.published'");
    expect(sql).toContain("catalog_editor_audit_log_action_check");
    expect(sql).toContain("'{changedTables,productFamily}'");
    expect(sql).toContain(
      "private.catalog_editor_product_family(v_draft.product_id)",
    );
  });

  it("publishes the approved REFINE portfolio with separate products and truthful offers", () => {
    expect(sql).toContain("'balancing-prep'");
    expect(sql).toContain("'polishing-prep'");
    expect(sql).toContain("'beaming-prep'");
    expect(sql).toContain("'chilling-prep'");
    expect(sql).toMatch(
      /'General'[\s\S]*?'Exfoliating'[\s\S]*?'Brightening'[\s\S]*?'Cooling'/,
    );
    expect(sql).toContain("'PHA + LHA exfoliating pads'");
    expect(sql).toContain("'Niacinamide brightening pads'");
    expect(sql).toContain("'TECA cooling pads'");
    expect(sql).toContain("'official-page-does-not-publish-complete-inci'");
    expect(sql).toContain("placeholder_palette");
    expect(sql).toContain("private.catalog_editor_document_v4");
  });
});
