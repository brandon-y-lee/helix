import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730034330_catalog_editor_backend.sql",
  ),
  "utf8",
);
const bootstrapMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730045500_atomic_admin_membership_bootstrap.sql",
  ),
  "utf8",
);

describe("catalog editor database boundary", () => {
  it("keeps editor tables browser-inaccessible and history append-only", () => {
    for (const table of [
      "admin_memberships",
      "product_content_drafts",
      "catalog_product_revisions",
      "catalog_editor_audit_log",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(`table public.${table}`);
    }
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("catalog_product_revisions_append_only");
    expect(migration).toContain("catalog_editor_audit_log_append_only");
  });

  it("uses narrowly granted fixed-search-path transaction functions", () => {
    expect(migration).toContain(
      "function public.publish_catalog_product_draft",
    );
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain(
      "from public, anon, authenticated;\ngrant execute",
    );
    expect(migration).toContain("to service_role");
  });

  it("guards both optimistic save and publication revision conflicts", () => {
    expect(migration).toContain("v_draft.version <> p_expected_version");
    expect(migration).toContain("'version_conflict'");
    expect(migration).toContain(
      "v_draft.base_revision <> v_latest_revision",
    );
    expect(migration).toContain("'revision_conflict'");
  });

  it("publishes normalized tables before one immutable revision", () => {
    const revision = migration.indexOf(
      "insert into public.catalog_product_revisions",
    );
    expect(migration.indexOf("update public.products p")).toBeLessThan(revision);
    expect(
      migration.indexOf("insert into public.product_pdp_content"),
    ).toBeLessThan(revision);
    expect(
      migration.indexOf("update public.product_variants v"),
    ).toBeLessThan(revision);
    expect(migration.indexOf("update public.product_media m")).toBeLessThan(
      revision,
    );
    expect(
      migration.indexOf("update public.product_relationships r"),
    ).toBeLessThan(revision);
    expect(migration).not.toMatch(/\breviews?\b/i);
  });

  it("bootstraps verified memberships and audit records atomically", () => {
    expect(bootstrapMigration).toContain(
      "function public.bootstrap_catalog_admin_membership",
    );
    expect(bootstrapMigration).toContain("security definer\nset search_path = ''");
    expect(bootstrapMigration).toContain(
      "insert into public.admin_memberships",
    );
    expect(bootstrapMigration).toContain(
      "insert into public.catalog_editor_audit_log",
    );
    expect(bootstrapMigration).toContain(
      "from public, anon, authenticated;\ngrant execute",
    );
    expect(bootstrapMigration).toContain("to service_role");
  });
});
