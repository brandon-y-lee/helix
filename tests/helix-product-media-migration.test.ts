import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMER_CATALOG_BUCKET } from "@/tests/helpers/former-identifiers";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819041246_rename_catalog_product_media_to_helix.sql",
  ),
  "utf8",
);

const verification = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/helix_product_media.integration.sql",
  ),
  "utf8",
);

describe("helix Product Media migration", () => {
  it("switches canonical Product Media and Storage policies after a verified provider copy", () => {
    expect(migration).toContain("v_expected_media_rows constant integer := 60");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("update public.product_media");
    expect(migration).toContain(
      "drop constraint product_media_core_routine_editorial_shape_check",
    );
    expect(migration).toContain(
      "add constraint product_media_core_routine_editorial_shape_check",
    );
    expect(migration).toContain("/storage/v1/object/public/helix-catalog/");
    expect(migration).toContain("Public read helix catalog assets");
    expect(migration).toContain("Service role manages helix catalog assets");
    expect(migration).toContain("to anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+)?storage\.(?:buckets|objects)/i);
  });

  it("ships a read-only post-cutover contract for bucket integrity and least privilege", () => {
    expect(verification).toContain("begin;");
    expect(verification).toContain("rollback;");
    expect(verification).toContain("helix-catalog");
    expect(verification).toContain(
      `'${FORMER_CATALOG_BUCKET.split("-")[0]}' || '-${FORMER_CATALOG_BUCKET.split("-").slice(1).join("-")}'`,
    );
    expect(verification).toContain("set local role anon");
    expect(verification).toContain("set local role authenticated");
    expect(verification).toContain("insert into storage.objects");
    expect(verification).toContain("Product Media URL does not resolve to a stored object");
    expect(verification).toContain(
      "Product Media shape constraint still uses an old bucket",
    );
  });
});
