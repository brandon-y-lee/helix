import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { developmentCatalogSeed } from "./bootstrap/catalog-media.mjs";
import { verifySchema } from "./bootstrap/verify-schema.mjs";
import { verifyLocalCatalogApi } from "./bootstrap/catalog-api.mjs";
import { verifyCleanForwardRelease } from "./bootstrap/verify-clean-release.mjs";
import { localStack } from "./bootstrap/local-stack.mjs";

const root = new URL("../../", import.meta.url);
const sql = (file) => readFileSync(new URL(file, root), "utf8");
const test = (name) => sql("supabase/tests/bootstrap/" + name + ".sql");
const bootstrap = (name) => sql("supabase/bootstrap/development/" + name + ".sql");
const render = (...args) =>
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("scripts/db/bootstrap/render-development-schema.mjs", root)), ...args],
    { encoding: "utf8", maxBuffer: 4_000_000 },
  );
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stack = localStack();
const dbName = (stage) => "helix_bootstrap_" + stage + "_" + stack.nonce;
const scalar = (name, source) => stack.sql(name, source).stdout.toString().trim();
const role = "SET SESSION AUTHORIZATION postgres;\n";
const report = {};
const source = { base: render(), updates: render("--dev-changes") };
const readSQL = (name) =>
  scalar(
    name,
    "BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;\n" + bootstrap("verify-schema") + "\nROLLBACK;",
  );
const schemaCheck = (name) => JSON.parse(readSQL(name));
const snapshot = (name) => {
  const ddl = stack
    .exec(["/opt/postgres/bin/pg_dump", "-h", "/tmp", "-U", "supabase_admin", "--schema-only", name])
    .stdout.toString();
  // pg_dump randomizes its psql metacommand key and may reorder independent entries after restore.
  const entries = ddl
    .replace(/^\\(?:un)?restrict .*$/gm, "")
    .split(/\n--\n(?=-- Name: )/)
    .map((s) => s.trim())
    .sort();
  return {
    schema: digest(JSON.stringify(entries)),
    rowsAndSequences: digest(scalar(name, test("snapshot"))),
  };
};

const seed = await developmentCatalogSeed({ mode: "local" });
const checkCatalog = (name) => {
  const scope = name === dbName("prefix") ? "local-prefix-rehearsal" : "local-clean-rehearsal";
  scalar(
    name,
    role +
      "BEGIN; SET LOCAL helix.bootstrap_scope='" +
      scope +
      "';\n" +
      seed +
      "\n" +
      test("catalog") +
      "\nCOMMIT;",
  );
  scalar(name, role + "BEGIN;\n" + test("auth-hook-effects") + "\nROLLBACK;");
};
const stages = (recovering = false) => {
  const scope = recovering ? "local-prefix-rehearsal" : "local-clean-rehearsal";
  return [
    role +
      "BEGIN; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'; SET LOCAL helix.bootstrap_scope='" +
      scope +
      "';",
    recovering ? bootstrap("preserve-prefix") : "",
    source.base,
    bootstrap("auth-hooks"),
    source.updates,
    seed,
    recovering ? test("preserved-prefix") : "",
    test("catalog"),
  ];
};
function install(name, recovering = false) {
  scalar(name, stages(recovering).join("\n") + "\nCOMMIT;");
}
function historicalReads(database, original) {
  const results = {};
  for (const runtimeRole of ["anon", "authenticated", "service_role", "postgres"]) {
    results[runtimeRole] = {};
    for (const [table, ids] of Object.entries(original)) {
      const values = ids
        .map((id) => {
          assert.match(id, /^[0-9a-f-]{36}$/);
          return "'" + id + "'::uuid";
        })
        .join(",");
      const read = stack.sql(
        database,
        "SET ROLE " +
          runtimeRole +
          "; SELECT count(*) FROM public." +
          table +
          " WHERE id IN (" +
          values +
          ");",
        true,
      );
      if (read.status !== 0) {
        assert.match(read.stderr.toString(), /permission denied for (?:table|relation)/);
        results[runtimeRole][table] = "permission denied";
      } else {
        results[runtimeRole][table] = Number(read.stdout.toString().trim());
      }
    }
  }
  return results;
}
async function openPreviousSession(name) {
  const child = stack.session(name);
  let received = "";
  let errors = "";
  const exited = once(child, "close");
  child.stderr.setEncoding("utf8").on("data", (d) => (errors += d));
  const ready = new Promise((resolve, reject) => {
    child.stdout.setEncoding("utf8").on("data", (d) => {
      received += d;
      if (received.includes("prefix-session-ready")) resolve();
    });
    exited.then(([code]) =>
      reject(Error("Historical session closed early (" + code + ") " + errors.slice(-210))),
    );
  });
  child.stdin.write(test("prefix-session-before") + "\n\\echo prefix-session-ready\n");
  await ready;
  return async () => {
    child.stdin.end(test("prefix-session-after") + "\n");
    const [code] = await exited;
    assert.equal(code, 0, "Historical session retained an unsafe binding: " + errors.slice(-210));
  };
}

try {
  try {
    stack.start();
    assert.equal(
      scalar(
        "postgres",
        "SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM storage.objects)+(SELECT count(*) FROM vault.secrets);",
      ),
      "0",
    );
    const empty = stack.backup("postgres");
    for (const stage of ["fresh_a", "fresh_b"]) {
      const name = dbName(stage);
      stack.restore(empty, name);
      const managedBefore = schemaCheck(name);
      if (stage === "fresh_a") {
        const baseOnly = scalar(
          name,
          role +
            "BEGIN;\n" +
            source.base +
            "\n" +
            bootstrap("auth-hooks") +
            "\nSET LOCAL search_path=pg_catalog;\n" +
            bootstrap("verify-schema") +
            "\nROLLBACK;",
        );
        verifySchema(JSON.parse(baseOnly.trim().split("\n").at(-1)), "base", { managedBefore });
      }
      install(name);
      checkCatalog(name);
      const verified = schemaCheck(name);
      verifySchema(verified, "dev", { managedBefore });
      report[stage] = { objects: verified.objects, privileges: verified.effectivePrivileges };
      if (stage === "fresh_a") {
        await verifyLocalCatalogApi(stack, name);
        report.catalogApi = { anonymousNonentryPdp: true, familyAndMediaEmbeds: true };
      }
    }
    assert.deepEqual(report.fresh_a, report.fresh_b, "Clean provisions differ");
    const origin = new URL("supabase/migrations/", root);
    const prefix = readdirSync(origin)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .slice(0, 12);
    assert.equal(prefix[11], "202607130001_commerce_routine_core_beyond.sql");
    for (const filename of prefix)
      copyFileSync(new URL(filename, origin), stack.migrations + "/" + filename);
    // A genuine local migration run records version and statements. Never synthesize ledger entries.
    stack.cli("migration", "up");
    const ledger = scalar(
      "postgres",
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
    );
    assert.deepEqual(
      ledger.split("\n"),
      prefix.map((f) => f.split("_")[0]),
    );
    const nativeAccess = scalar("postgres", test("managed-api-access"));
    assert.match(nativeAccess, /^[0-9a-f]{64}$/);
    const original = stack.backup("postgres");
    const target = dbName("prefix");
    stack.restore(original, target);
    assert.equal(
      scalar(target, test("managed-api-access")),
      nativeAccess,
      "The restored child prefix lost a managed namespace grant or callable API",
    );
    const previous = schemaCheck(target);
    const originalIds = JSON.parse(
      scalar(
        target,
        "SELECT json_build_object('products',(SELECT json_agg(id) FROM public.products),'product_variants',(SELECT json_agg(id) FROM public.product_variants));",
      ),
    );
    const oldVisibility = historicalReads(target, originalIds);
    assert.deepEqual(oldVisibility.postgres, { products: 6, product_variants: 10 });

    const before = snapshot(target);
    const backup = stack.backup(target);
    const restore = dbName("restore");
    stack.restore(backup, restore);
    assert.equal(
      scalar(restore, test("managed-api-access")),
      nativeAccess,
      "The recovery backup lost a managed namespace grant or callable API",
    );
    assert.deepEqual(snapshot(restore), before, "Restored prefix differs from the pre-upgrade backup");
    assert.equal(
      scalar(restore, "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"),
      ledger,
    );
    const cleanupFile = "supabase/migrations/20260714063716_dedupe_catalog_seed_data.sql";
    const legacyReplay = stack.sql(target, role + "BEGIN;\n" + sql(cleanupFile) + "\nROLLBACK;", true);
    assert.ok(
      legacyReplay.status &&
        legacyReplay.stderr.toString().includes("6 canonical active product(s) missing"),
    );
    assert.deepEqual(snapshot(target), before, "The historical replay trial changed the prefix");
    const parts = stages(true);
    // This grant already exists when the cutover starts. Refusal must preserve the caller's
    // effective access as well as the source objects and their data.
    scalar(target, role + "GRANT SELECT ON public.products TO authenticated;");
    const granted = snapshot(target);
    const grantTrial = stack.sql(target, parts.join("\n") + "\nCOMMIT;", true);
    assert.ok(
      grantTrial.status && grantTrial.stderr.toString().includes("Unexpected prefix access profile"),
    );
    assert.deepEqual(snapshot(target), granted, "Preflight changed a pre-existing consumer grant");
    assert.equal(
      scalar(
        target,
        "SELECT has_table_privilege('authenticated','public.products','SELECT') AND to_regnamespace('helix_development_prefix') IS NULL;",
      ),
      "t",
    );
    scalar(target, role + "REVOKE SELECT ON public.products FROM authenticated;");

    for (const [mutation, refusal] of [
      [
        "UPDATE public.products SET name='Unreviewed fixture change' WHERE slug='northpoint-renewal-serum';",
        "Unrecognized prefix application schema or seed",
      ],
      [
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC;",
        "Unexpected default ACL",
      ],
      [
        "GRANT SELECT (name) ON public.products TO authenticated WITH GRANT OPTION;",
        "Unexpected prefix access profile",
      ],
      [
        "GRANT EXECUTE ON FUNCTION public.ensure_loyalty_account(uuid) TO authenticated;",
        "Unexpected prefix access profile",
      ],
      [
        "GRANT USAGE ON TYPE public.cart_status TO authenticated WITH GRANT OPTION;",
        "Unexpected prefix access profile",
      ],
      [
        "CREATE ROLE helix_unexpected_reader; GRANT SELECT ON public.products TO helix_unexpected_reader;",
        "Unexpected prefix access profile",
      ],
      [
        "CREATE ROLE helix_unexpected_member; GRANT authenticated TO helix_unexpected_member;",
        "Unexpected prefix access profile",
      ],
      [
        "CREATE SCHEMA helix_consumer; CREATE TABLE helix_consumer.settings (status public.cart_status);",
        "Unexpected prefix consumer",
      ],
      [
        "CREATE SCHEMA helix_consumer; CREATE FUNCTION helix_consumer.account(uuid) RETURNS void LANGUAGE SQL RETURN public.ensure_loyalty_account($1);",
        "Unexpected prefix consumer",
      ],
      [
        "CREATE TRIGGER unexpected_auth_consumer AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();",
        "Unexpected prefix consumer",
      ],
      [
        "CREATE TRIGGER disabled_auth_consumer AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile(); ALTER TABLE auth.users DISABLE TRIGGER disabled_auth_consumer;",
        "Unexpected prefix consumer",
      ],
      [
        "CREATE SCHEMA helix_consumer; GRANT USAGE ON SCHEMA helix_consumer TO authenticated; " +
          "CREATE FUNCTION helix_consumer.health() RETURNS integer LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1'; " +
          "REVOKE ALL ON FUNCTION helix_consumer.health() FROM PUBLIC; GRANT EXECUTE ON FUNCTION helix_consumer.health() TO authenticated;",
        "Unexpected external executable inventory",
      ],
      [
        "CREATE SCHEMA helix_reporting; GRANT USAGE ON SCHEMA helix_reporting TO authenticated; " +
          "CREATE FUNCTION helix_reporting.product_count() RETURNS bigint LANGUAGE SQL SECURITY INVOKER AS 'SELECT count(*) FROM public.products'; " +
          "REVOKE ALL ON FUNCTION helix_reporting.product_count() FROM PUBLIC; GRANT EXECUTE ON FUNCTION helix_reporting.product_count() TO authenticated;",
        "Unexpected external executable inventory",
      ],
      [
        "CREATE PUBLICATION helix_unexpected FOR ALL TABLES;",
        "Unexpected publication or DDL integration",
      ],
    ]) {
      const begin = "BEGIN; SET LOCAL helix.bootstrap_scope='local-prefix-rehearsal';\n";
      const requiresManagedOwner =
        mutation.startsWith("CREATE PUBLICATION") || mutation.startsWith("CREATE TRIGGER");
      const probe = requiresManagedOwner ? mutation + "\n" + role : role + mutation;
      const result = stack.sql(target, begin + probe + "\n" + bootstrap("preserve-prefix"), true);
      assert.ok(
        result.status && result.stderr.toString().includes(refusal),
        "Unexpected drift probe outcome for " +
          mutation.split(" ").slice(0, 5).join(" ") +
          ": " +
          result.stderr
            .toString()
            .split("\n")
            .filter((l) => l.includes("ERROR:"))
            .slice(-1),
      );
      assert.deepEqual(snapshot(target), before, "A rejected preflight changed the synthetic prefix");
    }
    for (const cut of [2, parts.length]) {
      const failure = stack.sql(
        target,
        parts.slice(0, cut).join("\n") +
          "\nDO $$BEGIN RAISE EXCEPTION 'planned bootstrap fault'; END$$;",
        true,
      );
      assert.ok(
        failure.status && failure.stderr.toString().includes("planned bootstrap fault"),
        "Fixture failed before the planned fault: " +
          failure.stderr
            .toString()
            .split("\n")
            .filter((l) => l.includes("ERROR:"))
            .slice(-1),
      );
      assert.deepEqual(snapshot(target), before, "Partial upgrade survived a failed transaction");
    }
    const previousSession = await openPreviousSession(target);
    install(target, true);
    await previousSession();
    scalar(target, role + "BEGIN;\n" + test("legacy-classification") + "\nROLLBACK;");
    const newVisibility = historicalReads(target, originalIds);
    for (const counts of Object.values(newVisibility)) {
      for (const value of Object.values(counts)) assert.ok(value === 0 || value === "permission denied");
    }
    report.originalIdLookup = { before: oldVisibility, after: newVisibility };
    checkCatalog(target);
    // A hook writing to an unrelated archived table must be detected even when
    // it also creates the intended profile, rewards account, and referral code.
    const extraWrite = stack.sql(
      target,
      "BEGIN; CREATE FUNCTION pg_temp.unexpected_auth_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN " +
        "DELETE FROM helix_development_prefix.product_variants; RETURN NEW; END $$; " +
        "CREATE TRIGGER zz_unexpected_auth_write AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION pg_temp.unexpected_auth_write();\n" +
        role +
        test("auth-hook-effects") +
        "\nROLLBACK;",
      true,
    );
    assert.ok(
      extraWrite.status &&
        extraWrite.stderr
          .toString()
          .includes("Auth insert changed additional application or archive rows"),
      "Whole-archive Auth regression was not detected",
    );
    assert.equal(
      scalar(target, "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"),
      ledger,
    );
    const after = schemaCheck(target);
    verifySchema(after, "dev", { previousAuthHooks: previous.authHooks, managedBefore: previous });
    assert.deepEqual(
      { objects: after.objects, privileges: after.effectivePrivileges },
      report.fresh_a,
      "Recovered and fresh application signatures differ",
    );
    const retry = stack.sql(target, parts.slice(0, 2).join("\n"), true);
    assert.ok(
      retry.status &&
        retry.stderr.toString().includes("Unexpected development bootstrap starting schema"),
    );
    assert.deepEqual(schemaCheck(target), after);
    report.sourcePrefixCount = prefix.length;
    report.managedApiAccessSha256 = nativeAccess;
    report.backup = {
      bytes: backup.archive.length,
      sha256: digest(backup.archive),
      manifestSha256: digest(JSON.stringify(backup.manifest)),
      logical: before,
    };
    report.historicalClientVisibility =
      "The six historical IDs are preserved in the private archive and absent from the new current catalog.";
    report.checked = [
      "two fresh provisions",
      "genuine ledger",
      "in-place preservation",
      "two interrupted installations",
      "logical pre-upgrade recovery",
      "existing caller after commit",
      "direct SQL triggering current Auth hooks; four intended rows and complete archive checksum",
      "rejected unreviewed grantees and dependency or Auth hook consumers",
      "anonymous catalog",
      "idempotent seed",
      "rejected repeated cutover",
    ];
    report.cleanForwardRelease = await verifyCleanForwardRelease({
      stack,
      cleanDatabase: dbName("fresh_b"),
      recoveredDatabase: target,
      snapshotSql: test("snapshot"),
    });
    delete report.fresh_b;
  } finally {
    stack.cleanup();
  }
  console.log(JSON.stringify({ status: "passed", ...report }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
