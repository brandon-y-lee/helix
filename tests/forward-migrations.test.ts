import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  loadMigrations,
  migrationStatement,
  qualifiedMigrationConnection,
  releaseConnection,
  validateReleaseSources,
  assertCurrentPush,
} from "../scripts/db/forward-migrations.mjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = "20300101000000_catalog_sort.sql";
const sql = "CREATE INDEX products_sort ON public.products(sort_order, id);\n";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sidecar = { sourceSha256: hash(sql), verify: "SELECT true AS applied" };

describe("protected migration source", () => {
  const sha = "a".repeat(40);
  const env = {
    GITHUB_REPOSITORY: "brandon-y-lee/helix", GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "push", GITHUB_SHA: sha, PUSH_SHA: sha, GH_TOKEN: "test-read-token",
  };

  it("admits only enabled branch writers through their exact GitHub environment policy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "helix-push-admission-"));
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    const workflow = await readFile(".github/workflows/forward-migrations.yml", "utf8");
    const admission = workflow.split("\n  admit:\n")[1].split("\n  migrate:\n")[0];
    // A skipped gate can report success when the writer is disabled.
    expect(admission).not.toMatch(/^    if:/m);
    const script = admission.split("        run: |\n")[1];
    const gh = `gh() {
      case "$2" in
        "$ENV_PATH") echo "$ENVIRONMENT_JSON" ;;
        "$ENV_PATH/deployment-branch-policies?per_page=100") echo "$POLICY_JSON" ;;
        *) return 2 ;;
      esac
    }`;
    function gate(branch: string, overrides: Record<string, string | undefined> = {}) {
      const environment = "helix-db-" + (branch === "main" ? "production" : "development");
      return spawnSync("bash", ["-c", gh + "\n" + script], {
        encoding: "utf8",
        env: { ...env, NODE_ENV: "test", PATH: process.env.PATH, GITHUB_REF: "refs/heads/" + branch,
          GITHUB_REF_NAME: branch, DEVELOPMENT_ENABLED: "true", PRODUCTION_ENABLED: "true", GITHUB_OUTPUT: join(directory, branch),
          ENV_PATH: "repos/brandon-y-lee/helix/environments/" + environment,
          ENVIRONMENT_JSON: JSON.stringify({ name: environment,
            deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } }),
          POLICY_JSON: JSON.stringify({ total_count: 1, branch_policies: [{ name: branch, type: "branch" }] }),
          ...overrides },
      });
    }
    for (const [branch, target] of [["main", "production"], ["dev", "development"]]) {
      const admitted = gate(branch);
      expect(admitted.status, admitted.stderr + admitted.stdout).toBe(0);
      expect(await readFile(join(directory, branch), "utf8")).toBe("environment=helix-db-" + target + "\ntarget=" + target + "\n");
    }
    const disabled = gate("main", { PRODUCTION_ENABLED: "false" });
    expect(disabled.status).toBe(1);
    expect(disabled.stdout).toContain("production database writer has not been enabled");
    expect(gate("dev", { DEVELOPMENT_ENABLED: "" }).status).toBe(1);
    for (const overrides of [
      { GITHUB_EVENT_NAME: "workflow_dispatch" }, { GITHUB_REPOSITORY: "another/helix" },
      { GITHUB_REF_PROTECTED: "false" }, { PUSH_SHA: "b".repeat(40) },
      { POLICY_JSON: '{"total_count":1,"branch_policies":[{"name":"dev","type":"branch"}]}' },
      { POLICY_JSON: '{"total_count":1,"branch_policies":[{"name":"main","type":"tag"}]}' },
      { ENVIRONMENT_JSON: '{"name":"helix-db-production","deployment_branch_policy":null}' },
    ]) expect(gate("main", overrides).status).not.toBe(0);
  });

  it("uses the current remote branch commit for the exact target on a protected push", async () => {
    for (const [target, branch] of [["production", "main"], ["development", "dev"]]) {
      const ref = "refs/heads/" + branch;
      const read = vi.fn(async () => Response.json({ ref, object: { type: "commit", sha } }));
      await assertCurrentPush(target, { ...env, GITHUB_REF: ref }, read);
      expect(read).toHaveBeenCalledWith("https://api.github.com/repos/brandon-y-lee/helix/git/ref/heads/" + branch,
        expect.objectContaining({ redirect: "error" }));
    }
  });

  it("rejects a different source before reading GitHub", async () => {
    const push = { ...env, GITHUB_REF: "refs/heads/main" };
    const read = vi.fn();
    for (const change of [
      { GITHUB_REPOSITORY: "another/helix" }, { GITHUB_REF_PROTECTED: "false" },
      { GITHUB_EVENT_NAME: "workflow_dispatch" }, { GITHUB_EVENT_NAME: "pull_request_target" },
      { GITHUB_REF: "refs/heads/dev" }, { GITHUB_REF: "refs/tags/main" },
      { PUSH_SHA: "b".repeat(40) }, { GITHUB_SHA: "invalid", PUSH_SHA: "invalid" }, { GH_TOKEN: "" },
    ]) await expect(assertCurrentPush("production", { ...push, ...change }, read)).rejects.toThrow();
    await expect(assertCurrentPush("development", push, read)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses stale, unverified or unavailable branch heads", async () => {
    const ref = "refs/heads/main";
    const push = { ...env, GITHUB_REF: ref };
    for (const response of [
      Response.json({ ref, object: { type: "commit", sha: "b".repeat(40) } }),
      Response.json({ ref: "refs/heads/dev", object: { type: "commit", sha } }),
      Response.json({ ref, object: { type: "tag", sha } }),
      new Response(null, { status: 403 }),
    ]) await expect(assertCurrentPush("production", push, async () => response)).rejects.toThrow();
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
