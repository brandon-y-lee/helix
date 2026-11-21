import { describe, expect, it } from "vitest";
import {
  loadMigrations,
  migrationStatement,
  qualifiedMigrationConnection,
  releaseConnection,
  validateReleaseSources,
  verifyForwardAdmission,
} from "../scripts/db/forward-migrations.mjs";
import { createHash } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = "20300101000000_catalog_sort.sql";
const sql = "CREATE INDEX products_sort ON public.products(sort_order, id);\n";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sidecar = { sourceSha256: hash(sql), verify: "SELECT true AS applied" };

describe("production migration admission", () => {
  const candidateSha = "a".repeat(40);
  const expiresAt = "2026-11-21T10:00:00.000Z";
  const deadline = Date.parse(expiresAt);
  const receipt = {
    version: 1, operation: "verify", candidateSha,
    contextSha256: hash("context"), packetSha256: hash("packet"), expiresAt,
  };
  const raw = JSON.stringify(receipt);

  it("binds the exact protected receipt and candidate until the deadline", () => {
    for (const operation of ["verify", "promote"]) {
      const bytes = JSON.stringify({ ...receipt, operation });
      expect(verifyForwardAdmission(bytes, hash(bytes), candidateSha, deadline - 1)).toBe(deadline);
      expect(() => verifyForwardAdmission(bytes, hash(bytes), candidateSha, deadline)).toThrow(/expired/);
    }
    expect(() => verifyForwardAdmission(raw, hash("different bytes"), candidateSha, deadline - 1)).toThrow();
    expect(() => verifyForwardAdmission(raw, hash(raw), "b".repeat(40), deadline - 1)).toThrow();
    expect(() => verifyForwardAdmission(undefined, undefined, candidateSha, deadline - 1)).toThrow();
    expect(() => verifyForwardAdmission(raw, hash(raw), candidateSha, NaN)).toThrow();
  });

  it("rejects recovery operations and noncanonical or incomplete receipts, even with matching hashes", () => {
    for (const bytes of [
      JSON.stringify({ ...receipt, operation: "rollback" }),
      JSON.stringify({ ...receipt, operation: "cancel" }),
      JSON.stringify({ ...receipt, version: 2 }),
      JSON.stringify({ ...receipt, extra: false }),
      JSON.stringify({ ...receipt, candidateSha: "invalid" }),
      JSON.stringify({ ...receipt, contextSha256: hash("context").toUpperCase() }),
      JSON.stringify({ ...receipt, packetSha256: undefined }),
      JSON.stringify({ ...receipt, expiresAt: "2026-11-21" }),
      JSON.stringify({ ...receipt, expiresAt: "invalid" }),
      raw + "\n",
      raw.replace('"version":1', '"version":1,"version":1'),
      JSON.stringify(Object.fromEntries(Object.entries(receipt).reverse())),
      "not-json",
      "null",
    ]) {
      expect(() => verifyForwardAdmission(bytes, hash(bytes), candidateSha, deadline - 1)).toThrow();
    }
  });
});

describe("reviewed forward migrations", () => {
  it("verifies the real repository legacy inventory and every forward sidecar", async () => {
    await expect(loadMigrations(process.cwd())).resolves.toEqual(
      expect.any(Array),
    );
  });
  it("requires an exact match between migration bytes and the selected manifest", () => {
    expect(validateReleaseSources([[file, sql]], [[file, sidecar]])).toEqual([
      { file, sql, verify: sidecar.verify },
    ]);
    expect(() =>
      validateReleaseSources([[file, sql + "\n"]], [[file, sidecar]]),
    ).toThrow();
    expect(() => validateReleaseSources([[file, sql]], [])).toThrow();
    expect(() => validateReleaseSources([], [[file, sidecar]])).toThrow();
  });
  it("keeps CLI recording inside its DDL transaction", () => {
    expect(migrationStatement(sql)).toBe(sql.trim().slice(0, -1));
    expect(
      migrationStatement("DO $migration$ BEGIN PERFORM 1; END $migration$;"),
    ).toContain("PERFORM 1;");
    for (const bad of [
      "VACUUM;",
      "CREATE INDEX CONCURRENTLY x ON t(a);",
      "BEGIN; COMMIT;",
      sql + "COMMIT;",
      "DO $migration$ BEGIN END $migration$; COMMIT; DO $migration$ BEGIN END $migration$;",
    ]) {
      expect(() => migrationStatement(bad)).toThrow();
    }
  });
  it("checks the bytes read from disk, including a UTF-8 BOM", async () => {
    const root = await mkdtemp(join(tmpdir(), "helix-release-source-"));
    try {
      for (const directory of ["supabase/migrations", "supabase/releases"])
        await cp(directory, join(root, directory), { recursive: true });
      await writeFile(join(root, "supabase/migrations", file), "\uFEFF" + sql);
      const manifest = join(
        root,
        "supabase/releases",
        file.replace(".sql", ".json"),
      );
      await writeFile(manifest, JSON.stringify(sidecar));
      await expect(loadMigrations(root)).rejects.toThrow("mismatched");
      await writeFile(
        manifest,
        JSON.stringify({ ...sidecar, sourceSha256: hash("\uFEFF" + sql) }),
      );
      await expect(loadMigrations(root)).rejects.toThrow(
        "transaction-compatible",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("only supersedes distinct, earlier and still active contracts", () => {
    const later = "20300101000001_catalog_change.sql";
    const last = "20300101000002_catalog_finish.sql";
    const sources = [
      [file, sql],
      [later, sql],
      [last, sql],
    ];
    const validate = (replacements: unknown, next?: string[]) =>
      validateReleaseSources(sources, [
        [file, sidecar],
        [later, { ...sidecar, supersedes: replacements }],
        [last, next ? { ...sidecar, supersedes: next } : sidecar],
      ]);
    expect(
      validate([file], [later]).map(
        (migration: { file: string }) => migration.file,
      ),
    ).toEqual([file, later, last]);
    for (const invalid of [
      [],
      file,
      null,
      [file, file],
      [last],
      [later],
      ["unknown.sql"],
    ])
      expect(() => validate(invalid)).toThrow();
    expect(() => validate([file], [file])).toThrow();
  });
  it("requires an independent target and verifies TLS/tenant before connecting", () => {
    const ref = "abcdefghijklmnopqrst";
    const target = {
      environment: "development",
      projectRef: ref,
      host: "db." + ref + ".supabase.co",
      role: "release_writer",
    };
    const url = releaseConnection(target);
    expect(url.hostname).toBe(target.host);
    expect(url.password).toBe("");
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(() =>
      releaseConnection({
        ...target,
        host: "db.aaaaaaaaaaaaaaaaaaaa.supabase.co",
      }),
    ).toThrow();
    expect(() => releaseConnection({ ...target, role: "anon" })).toThrow();
    const pool = releaseConnection({
      ...target,
      host: "aws-0-us-east-1.pooler.supabase.com",
    });
    expect(pool.username).toBe("release_writer." + ref);
  });
  it("admits a qualified empty development history and preserves nonempty enrollments", () => {
    const development = {
      environment: "development",
      projectRef: "abcdefghijklmnopqrst",
      host: "db.abcdefghijklmnopqrst.supabase.co",
      role: "release_writer",
      legacyCount: 0,
      legacyDigest: hash("[]"),
      cutoverQualified: true,
      bootstrap: [],
    };
    expect(qualifiedMigrationConnection(development, "development").hostname).toBe(development.host);
    for (const [environment, count] of [["development", 12], ["production", 97]] as const) {
      const target = { ...development, environment, legacyCount: count, legacyDigest: hash("observed history") };
      expect(qualifiedMigrationConnection(target, environment).hostname).toBe(target.host);
    }
    const rejected = [
      { ...development, cutoverQualified: false },
      { ...development, environment: "production" },
      { ...development, legacyDigest: hash("observed history") },
      { ...development, legacyCount: 12 },
      { ...development, legacyCount: -1 },
      { ...development, bootstrap: null },
    ];
    for (const target of rejected) {
      expect(() => qualifiedMigrationConnection(target, target.environment)).toThrow("Unqualified migration target");
    }
    expect(() => qualifiedMigrationConnection(development, "production")).toThrow("Unqualified migration target");
  });
});
