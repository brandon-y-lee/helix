import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { localStack } from "./bootstrap/local-stack.mjs";
import { historyQuery, loadMigrations, runForward } from "./forward-migrations.mjs";
import { runLiveCheckoutSettlementTests } from "./test-live-checkout-settlement.mjs";
import { seedCliHistory } from "./test-catalog-release-writer.mjs";

// Both databases, their non-superuser owners and the two authenticated writers
// belong to this one disposable, loopback-only PG17.12 stack.
const root = fileURLToPath(new URL("../../", import.meta.url));
const stack = localStack();
const cli = process.env.HELIX_SUPABASE_CLI;
assert.ok(cli, "Set HELIX_SUPABASE_CLI to the pinned 2.117.0 executable");
const refs = { development: "zyfkunnpnlmgvrojmrbg", production: "erasogmsqpgiirovubjh" };
const basenames = [
  "20261120131137_bind_catalog_media_to_environment.sql",
  "20261120141910_index_stable_catalog_product_order.sql",
  "20261121073052_extend_checkout_environment.sql",
  "20261121073053_install_live_checkout_contract.sql",
];
const checkoutOperation = "supabase/operations/release-bootstrap/enroll_live_checkout_settlement.sql";
const targetFiles = [
  checkoutOperation, "supabase/operations/live-checkout/extend-checkout-environment.sql",
  "supabase/operations/live-checkout/install-live-checkout-contract.sql",
];
const operation = name => readFileSync(join(root, "supabase/operations/release-bootstrap", name + ".sql"), "utf8");
const rendered = (...args) => execFileSync(process.execPath,
  [join(root, "scripts/db/bootstrap/render-development-schema.mjs"), ...args], { encoding: "utf8", maxBuffer: 4_000_000 });
const base = rendered();
const developmentChanges = rendered("--dev-changes");
const migrations = (await loadMigrations(root)).filter(row => basenames.includes(row.file));
assert.deepEqual(migrations.map(m => m.file), basenames);
const location = "/tmp/helix-checkout-" + stack.nonce;

async function verifyTarget(environment, database, port) {
  const projectRef = refs[environment];
  const writer = "helix_checkout_" + environment + "_" + stack.nonce;
  const password = randomBytes(32).toString("hex");
  const psql = ["/opt/postgres/bin/psql", "-X", "-Atq", "-h", "/tmp", "-d", database, "-v", "ON_ERROR_STOP=1"];
  const owner = sql => stack.exec([...psql, "-U", "postgres", "-f", "-"], sql).stdout.toString().trim();
  const vars = ["-v", "writer_role=" + writer, "-v", "expected_environment=" + environment, "-v", "expected_project_ref=" + projectRef];
  const enroll = (args = [], mayFail = false) => stack.exec(
    [...psql, "-U", "postgres", ...vars, ...args, "-f", location + "/" + checkoutOperation], undefined, mayFail,
  );
  const requiredOwner = sql => stack.exec([...psql, "-U", "postgres", ...vars, "-f", "-"], sql);
  const scalar = sql => stack.sql(database, sql).stdout.toString().trim();
  // Only the marker and Catalog predecessor URL definitions differ for the
  // parent-shaped local fixture. All Checkout source bytes come from the repo.
  owner("BEGIN;\n" + base.replaceAll(refs.development, projectRef) +
    (environment === "development" ? "\n" + developmentChanges : "") + "\nCOMMIT;");
  owner(operation("20261120131122_helix_environment_identity"));
  owner(`INSERT INTO private.helix_environment (environment,project_ref) VALUES ('${environment}','${projectRef}');
    CREATE ROLE ${writer} LOGIN NOINHERIT PASSWORD '${password}';
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);`);
  requiredOwner(operation("enroll_catalog_media_release"));
  requiredOwner(operation("enroll_catalog_order_index"));
  const connectionUrl = `postgresql://${writer}@127.0.0.1:${port}/${database}?sslmode=disable`;
  seedCliHistory(cli, connectionUrl, password);
  const client = new pg.Client({ host: "127.0.0.1", port, user: writer, password, database, ssl: false });
  await client.connect();
  try {
    const ledger = async () => (await client.query(historyQuery)).rows[0];
    const initial = await ledger();
    assert.deepEqual(initial.versions, ["20200101000000"]);
    const target = { role: writer, environment, projectRef, legacyCount: initial.legacy_count,
      legacyDigest: initial.legacy_digest, bootstrap: [], cutoverQualified: true };
    const forward = (sources = migrations) => runForward({ client, password, connectionUrl, cli, target,
      apply: true, migrations: sources, assertCurrentSource: async () => {} });
    assert.deepEqual((await forward(migrations.slice(0, 2))).applied, basenames.slice(0, 2));
    const before = await ledger();
    const absent = () => scalar("SELECT to_regprocedure('private.extend_checkout_environment()') IS NULL " +
      "AND to_regprocedure('private.install_live_checkout_contract()') IS NULL;");
    for (const args of [["-U", "supabase_admin"], ["-v", "expected_project_ref=" + refs[environment === "development" ? "production" : "development"]],
      ["-v", "writer_role=service_role"]]) {
      assert.notEqual(enroll(args, true).status, 0);
      assert.equal(absent(), "t");
    }
    enroll();
    assert.notEqual(enroll([], true).status, 0, "Owner enrollment cannot replace an existing operation");
    for (const capability of ["extend_checkout_environment", "install_live_checkout_contract"]) {
      assert.equal(scalar(`SELECT bool_and(NOT has_function_privilege(r, 'private.${capability}()', 'EXECUTE'))
        FROM unnest(ARRAY['anon','authenticated','service_role']) r;`), "t");
    }
    await assert.rejects(client.query("SELECT * FROM private.checkout_verified_payments"), { code: "42501" });
    await assert.rejects(client.query("ALTER TYPE public.checkout_environment ADD VALUE 'unapproved'"), { code: "42501" });
    await assert.rejects(client.query("DELETE FROM supabase_migrations.schema_migrations WHERE false"), { code: "42501" });
    const lastVersion = basenames[3].split("_")[0];
    owner(`CREATE SEQUENCE private.checkout_ledger_failure_observed;
      CREATE FUNCTION private.interrupt_checkout_ledger_fixture() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      BEGIN IF NEW.version='${lastVersion}' THEN
        PERFORM pg_catalog.nextval('private.checkout_ledger_failure_observed');
        RAISE EXCEPTION 'synthetic Checkout ledger interruption';
      END IF; RETURN NEW; END $$;
      REVOKE ALL ON FUNCTION private.interrupt_checkout_ledger_fixture() FROM public, anon, authenticated, service_role;
      CREATE TRIGGER interrupt_checkout_ledger BEFORE INSERT ON supabase_migrations.schema_migrations
        FOR EACH ROW EXECUTE FUNCTION private.interrupt_checkout_ledger_fixture();`);
    await assert.rejects(forward(), /Supabase CLI operation failed/);
    assert.equal(scalar("SELECT is_called FROM private.checkout_ledger_failure_observed;"), "t");
    assert.equal(scalar(`SELECT to_regclass('private.live_checkout_bindings') IS NULL
      AND to_regprocedure('private.live_checkout_contract_installed()') IS NULL
      AND EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_sandbox_only');`), "t");
    const afterFailure = await ledger();
    assert.deepEqual(afterFailure.versions, [...before.versions, basenames[2].split("_")[0]]);
    assert.equal((await client.query(migrations[2].verify)).rows[0].applied, true);
    owner("DROP TRIGGER interrupt_checkout_ledger ON supabase_migrations.schema_migrations;");
    assert.deepEqual((await forward()).applied, [basenames[3]]);
    const after = await ledger();
    assert.equal(after.legacy_digest, initial.legacy_digest);
    assert.deepEqual(after.forward.slice(0, 2), before.forward);
    assert.deepEqual(after.forward.slice(0, 3), afterFailure.forward);
    assert.deepEqual(await forward(), { pending: [], applied: [] });
    assert.deepEqual(await ledger(), after);
    const check = owner("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_checkout_mode'");
    const replaceCheck = "ALTER TABLE public.orders DROP CONSTRAINT orders_checkout_mode, ADD CONSTRAINT orders_checkout_mode ";
    const bindingTrigger = " TRIGGER live_checkout_binding_immutable";
    const targetPath = "ALTER FUNCTION private.live_checkout_target() SET search_path = ";
    for (const [drift, restore] of [
      [replaceCheck + "CHECK (true)", replaceCheck + check],
      ["ALTER TABLE private.live_checkout_bindings DISABLE" + bindingTrigger,
       "ALTER TABLE private.live_checkout_bindings ENABLE" + bindingTrigger],
      [targetPath + "public", targetPath + "pg_catalog, pg_temp"],
    ]) {
      owner(drift);
      try {
        assert.equal((await client.query(migrations[3].verify)).rows[0].applied, false);
      } finally {
        owner(restore);
      }
      assert.equal((await client.query(migrations[3].verify)).rows[0].applied, true);
    }
    await runLiveCheckoutSettlementTests({ ownerSql: owner, client, database, environment, stack, writerRole: writer });
    console.log(JSON.stringify({ environment, postgres: "17.12", legacyCount: after.legacy_count,
      catalogVersionsPreserved: 2, checkoutVersionsApplied: 2, failedHistoryRolledBack: true, retryApplied: 0 }));
  } finally {
    await client.end();
  }
}

try {
  stack.start();
  const port = Number(/^127\.0\.0\.1:(\d+)$/.exec(stack.docker(["port", stack.container, "5432/tcp"]).stdout.toString().trim())?.[1]);
  assert.ok(port, "Expected one loopback PostgreSQL port");
  stack.exec(["mkdir", "-p", location + "/supabase/operations/release-bootstrap", location + "/supabase/operations/live-checkout"]);
  for (const file of targetFiles) stack.docker(["cp", join(root, file), stack.container + ":" + location + "/" + file]);
  const empty = stack.backup("postgres");
  for (const [environment, stage] of [["development", "fresh_a"], ["production", "fresh_b"]]) {
    const database = "helix_bootstrap_" + stage + "_" + stack.nonce;
    stack.restore(empty, database);
    await verifyTarget(environment, database, port);
  }
} finally {
  stack.cleanup();
}
