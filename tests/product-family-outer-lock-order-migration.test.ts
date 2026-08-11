import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811023000_product_family_outer_lock_order.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const sessionSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/product_family_outer_lock_order.session.sql",
  ),
  "utf8",
);

describe("Product Family outer publication lock order", () => {
  it("serializes the family and locks every member before dispatch", () => {
    const advisory = sql.indexOf("pg_advisory_xact_lock");
    const memberLock = sql.indexOf("order by product.id");
    const dispatch = sql.lastIndexOf(
      "publish_catalog_product_draft_without_family_lock_order(",
    );

    expect(advisory).toBeGreaterThan(-1);
    expect(memberLock).toBeGreaterThan(advisory);
    expect(dispatch).toBeGreaterThan(memberLock);
    expect(sql.slice(0, advisory)).not.toContain("for update");
  });

  it("keeps the prior dispatcher private and the guarded entrypoint callable", () => {
    expect(sql).toContain(
      "rename to publish_catalog_product_draft_without_family_lock_order",
    );
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("ships a non-mutating two-session lock-order probe", () => {
    expect(sessionSql).toContain("pg_advisory_xact_lock");
    expect(sessionSql).toContain("order by product.id");
    expect(sessionSql).toContain("for update of product");
    expect(sessionSql).toContain("pg_sleep(1)");
    expect(sessionSql).toContain("rollback");
  });
});
