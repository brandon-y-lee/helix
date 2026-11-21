import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { localStack } from "./bootstrap/local-stack.mjs";
import { historyQuery, loadMigrations, runForward, validateReleaseSources } from "./forward-migrations.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = process.env.HELIX_SUPABASE_CLI;
assert.ok(cli, "Set HELIX_SUPABASE_CLI to the pinned Supabase 2.117.0 binary");
// Before two reviewed Specs meet on dev, exercise the real Checkout predecessor
// from its local checkout. After integration the default is the current checkout.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--predecessor-root"),
  "Usage: node scripts/db/test-production-marketing-forward.mjs [--predecessor-root path]");
const predecessorRoot = args.length ? resolve(args[1]) : root;
const read = (dir, file) => readFileSync(join(dir, file), "utf8");
const { seedCliHistory } = await import(pathToFileURL(join(predecessorRoot, "scripts/db/test-catalog-release-writer.mjs")));
const refs = { development: "zyfkunnpnlmgvrojmrbg", production: "erasogmsqpgiirovubjh" };
const writers = { development: "helix_dev_migration_writer", production: "helix_prod_migration_writer" };
const prefix = [
  "20261120131137_bind_catalog_media_to_environment.sql",
  "20261120141910_index_stable_catalog_product_order.sql",
  "20261121073052_extend_checkout_environment.sql",
  "20261121073053_install_live_checkout_contract.sql",
  "20261121075612_extend_business_checkout_environment.sql",
  "20261121075613_install_first_order_checkout.sql",
];
const marketingFile = "20261121081630_install_production_marketing.sql";
const predecessor = (await loadMigrations(predecessorRoot)).filter(row => prefix.includes(row.file));
assert.deepEqual(predecessor.map(row => row.file), prefix);
const releaseFiles = [
  ...["enroll_live_checkout_settlement", "enroll_first_order_checkout"].map(x => "release-bootstrap/" + x),
  ...["extend-checkout-environment", "install-live-checkout-contract",
    "extend-business-checkout-environment", "install-first-order-checkout"].map(x => "live-checkout/" + x),
  ...["inventory", "issuer", "admission", "manual-fulfillment"].map(x => "business-checkout/" + x),
].map(x => "supabase/operations/" + x + ".sql");
const renderSchema = (...flags) => execFileSync(process.execPath,
  [join(predecessorRoot,"scripts/db/bootstrap/render-development-schema.mjs"), ...flags],
  { encoding: "utf8", maxBuffer: 4_000_000 });
const base = renderSchema();
const childChanges = renderSchema("--dev-changes");
const childFixture = read(root, "supabase/tests/production_marketing_forward_predecessor.integration.sql");
const shapeSql = read(root, "supabase/operations/production-marketing/release-shape.sql");
const markFault = `
  CREATE SEQUENCE private.saw_welcome_ledger_fault;
  CREATE FUNCTION private.fail_welcome_ledger_fixture() RETURNS trigger LANGUAGE plpgsql
    SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $test$
  BEGIN
    IF NEW.version='20261121081630' THEN
      PERFORM nextval('private.saw_welcome_ledger_fault'); RAISE EXCEPTION 'Synthetic history failure';
    END IF;
    RETURN NEW;
  END;
  $test$;
  REVOKE ALL ON FUNCTION private.fail_welcome_ledger_fixture() FROM PUBLIC,anon,authenticated,service_role;
  CREATE TRIGGER fail_welcome_history BEFORE INSERT ON supabase_migrations.schema_migrations
    FOR EACH ROW EXECUTE FUNCTION private.fail_welcome_ledger_fixture();`;

async function verifyTarget(environment) {
  // Worker roles are cluster-wide. Each real target is a separate fresh local
  // managed stack with its own role membership, defaults, markers and data.
  const stack = localStack();
  const projectRef = refs[environment], writer = writers[environment];
  const child = environment === "development";
  const stage = child ? "fresh_a" : "fresh_b";
  const database = "helix_bootstrap_" + stage + "_" + stack.nonce;
  const password = randomBytes(32).toString("hex");
  const location = "/tmp/helix-welcome-" + stack.nonce;
  const psql = ["/opt/postgres/bin/psql","-X","-Atq","-h","/tmp","-d",database,
    "-v","ON_ERROR_STOP=1","-U","postgres"];
  const owner = (sql, variables=[]) => stack.exec([...psql,...variables,"-f","-"],sql).stdout.toString().trim();
  const flags = ["-v","writer_role="+writer,"-v","expected_environment="+environment,"-v","expected_project_ref="+projectRef];
  const op = name => read(predecessorRoot, "supabase/operations/release-bootstrap/" + name + ".sql");
  const snapshot = phase => owner(childFixture,["-v","marketing_predecessor_phase="+phase]);
  const shape = () => owner("SET search_path=pg_catalog,pg_temp;\n"+shapeSql+";");
  let client;
  try {
    stack.start();
    const port = Number(/^127\.0\.0\.1:(\d+)$/.exec(stack.docker(["port",stack.container,"5432/tcp"]).stdout.toString().trim())?.[1]);
    assert.ok(port, "Expected exactly one loopback PostgreSQL endpoint");
    stack.restore(stack.backup("postgres"), database);
    owner("BEGIN;\n" + base.replaceAll(refs.development,projectRef) + (child?"\n"+childChanges:"") + "\nCOMMIT;");
    assert.equal(owner("SELECT current_user='postgres' AND NOT rolsuper FROM pg_roles WHERE rolname=current_user"), "t");
    owner(op("20261120131122_helix_environment_identity"));
    owner(`INSERT INTO private.helix_environment (environment,project_ref) VALUES ('${environment}','${projectRef}');
      CREATE ROLE ${writer} LOGIN NOINHERIT PASSWORD '${password}';
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY,name text,statements text[]);`);
    owner(op("enroll_catalog_media_release"),flags);
    owner(op("enroll_catalog_order_index"),flags);
    const url = `postgresql://${writer}@127.0.0.1:${port}/${database}?sslmode=disable`;
    seedCliHistory(cli,url,password);
    client = new pg.Client({host:"127.0.0.1",port,database,user:writer,password,ssl:false});
    await client.connect();
    const ledger = async () => (await client.query(historyQuery)).rows[0];
    const initial = await ledger();
    assert.deepEqual(initial.versions,["20200101000000"]);
    const target = {role:writer,environment,projectRef,legacyCount:initial.legacy_count,legacyDigest:initial.legacy_digest,
      bootstrap:[],cutoverQualified:true};
    const forward = migrations => runForward({client,password,connectionUrl:url,cli,target,
      apply:true,migrations,assertCurrentSource:async () => {}});
    assert.deepEqual((await forward(predecessor.slice(0,2))).applied,prefix.slice(0,2));
    stack.exec(["mkdir","-p",...["release-bootstrap","live-checkout","business-checkout"].map(x=>location+"/supabase/operations/"+x)]);
    for (const file of releaseFiles) stack.docker(["cp",join(predecessorRoot,file),stack.container+":"+location+"/"+file]);
    for (const file of releaseFiles.slice(0,2)) stack.exec([...psql,...flags,"-f",location+"/"+file]);
    const beforeShape = shape();
    assert.match(beforeShape,/^[a-f0-9]{64}$/);
    console.log(JSON.stringify({environment, beforeShape}));
    if (child) snapshot("seed");
    const oldData = child ? snapshot("snapshot") : null;
    if (child) assert.match(oldData,/^[a-f0-9]{64}$/);
    assert.equal(owner("SELECT to_regrole('helix_native_welcome_worker') IS NULL"),"t");
    const {renderWelcomeRelease} = await import("./render-production-marketing-release.mjs");
    const rendered = renderWelcomeRelease({environment,predecessorRoot});
    const version = read(root,"supabase/migrations/"+marketingFile);
    const sidecar = JSON.parse(read(root,"supabase/releases/"+marketingFile.replace(/\.sql$/,".json")));
    assert.equal(rendered.migration,version);
    assert.deepEqual(rendered.manifest,sidecar);
    const [marketing] = validateReleaseSources([[marketingFile, version]], [[marketingFile, sidecar]]);
    const all = [...predecessor,marketing];
    // Test one operator enrolling ahead of the queued Checkout releases, and
    // another who starts after Checkout's complete genuine ledger is available.
    if (!child) assert.deepEqual((await forward(predecessor)).applied,prefix.slice(2));
    const beforeEnroll = await ledger();
    owner(rendered.ownerSql);
    assert.deepEqual(await ledger(),beforeEnroll);
    if (child) assert.deepEqual((await forward(predecessor)).applied,prefix.slice(2));
    await assert.rejects(client.query("SELECT * FROM private.helix_environment FOR UPDATE"), {code:"42501"});
    const before = await ledger();
    assert.deepEqual(before.forward.map(x=>x.version),prefix.map(file=>file.slice(0,14)));
    owner(markFault);
    await assert.rejects(forward(all),/Supabase CLI operation failed/);
    if (owner("SELECT is_called FROM private.saw_welcome_ledger_fault") !== "t") {
      // The CLI intentionally suppresses provider diagnostics. Replay only the
      // exact reviewed statement inside the disposable writer's rollback so a
      // failed admission can be distinguished from a ledger fault.
      await client.query("BEGIN");
      try {
        await client.query(version);
        assert.fail("The CLI stopped before inserting the Marketing history row");
      } catch (error) {
        const reason = String(error.message).split("\n")[0].replace(/[^a-zA-Z0-9 _:.,-]/g, "").slice(0,180);
        throw new Error("Synthetic Marketing preflight failed ("+(error.code ?? "client")+"): "+reason);
      } finally {
        await client.query("ROLLBACK");
      }
    }
    assert.deepEqual(await ledger(),before);
    assert.equal(shape(),beforeShape);
    assert.equal(owner("SELECT to_regclass('private.production_marketing_native_policy') IS NULL " +
      "AND to_regrole('helix_native_welcome_worker') IS NULL"),"t");
    if (child) assert.equal(snapshot("snapshot"),oldData);
    owner("DROP TRIGGER fail_welcome_history ON supabase_migrations.schema_migrations");
    assert.deepEqual((await forward(all)).applied,[marketingFile]);
    const installed = await ledger();
    assert.deepEqual(installed.forward.slice(0,-1),before.forward);
    assert.equal(installed.legacy_digest,initial.legacy_digest);
    assert.equal((await client.query(marketing.verify)).rows[0].applied,true);
    assert.deepEqual(await forward(all),{pending:[],applied:[]});
    assert.deepEqual(await ledger(),installed);
    assert.equal(owner(`SELECT NOT (enrollment_enabled OR dispatch_enabled OR native_welcome_enabled OR events_enabled OR status_enabled)
      AND daily_limit=0 AND monthly_limit=0 AND confirmation_worker_binding_hash IS NULL
      FROM private.production_marketing_controls WHERE singleton`),"t");
    assert.equal(owner("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='helix_native_welcome_worker'"),"t");
    await assert.rejects(client.query("SELECT * FROM private.production_marketing_subscribers"),{code:"42501"});
    await assert.rejects(client.query("DELETE FROM supabase_migrations.schema_migrations WHERE false"),{code:"42501"});
    if (child) {
      assert.equal(snapshot("snapshot"),oldData);
      assert.equal(snapshot("withdraw"),"t");
    }
    // Operational flags and data can change, but an installed contract must
    // continue to reject an added application-table grant on an empty replay.
    owner("GRANT SELECT ON private.production_marketing_subscribers TO anon");
    try { await assert.rejects(forward(all),/Installed migration contract failed/); }
    finally { owner("REVOKE SELECT ON private.production_marketing_subscribers FROM anon"); }
    assert.deepEqual(await forward(all),{pending:[],applied:[]});
    assert.deepEqual(await ledger(),installed);
    console.log(JSON.stringify({environment,beforeShape,afterShape:shape(),priorForwardCount:before.forward.length,
      appliedVersion:marketingFile.slice(0,14),ledgerRollback:true,retryApplied:0,paused:true,originalChildConsentPreserved:child}));
  } finally {
    try { if (client) await client.end(); }
    finally { stack.cleanup(); }
  }
}

for (const environment of ["development","production"]) await verifyTarget(environment);
