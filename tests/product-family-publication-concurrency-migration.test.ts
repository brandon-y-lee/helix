import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811020500_product_family_publication_concurrency.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Product Family publication concurrency migration", () => {
  it("serializes the shared aggregate before checking Product revisions", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("mei-pelle-product-family:");
    expect(sql).toContain("order by product.id");
    expect(sql).toContain("for update");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      sql.indexOf("v_draft.base_revision <> v_latest_revision"),
    );
  });

  it("creates immutable sibling revisions in the same transaction", () => {
    expect(sql).toContain("insert into public.catalog_product_revisions");
    expect(sql).toContain("private.catalog_editor_document_v4(product.id)");
    expect(sql).toContain("product.id <> v_draft.product_id");
    expect(sql).toContain("'shared-family-publication'");
    expect(sql).toContain("'originDraftId'");
  });

  it("keeps the unsafe implementation private behind the guarded wrapper", () => {
    expect(sql).toContain(
      "rename to publish_catalog_product_draft_v4_without_family_concurrency",
    );
    expect(sql).toContain(
      "public.publish_catalog_product_draft_v4_without_family_concurrency(",
    );
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain(
      "create function public.publish_catalog_product_draft_v4(",
    );
  });
});
