import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { localStack } from "./bootstrap/local-stack.mjs";
import { historyQuery, loadMigrations, runForward } from "./forward-migrations.mjs";
import { seedCliHistory } from "./test-catalog-release-writer.mjs";
import { renderWelcomeRelease } from "./render-production-marketing-release.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = process.env.HELIX_SUPABASE_CLI;
assert.ok(cli, "Set HELIX_SUPABASE_CLI to the pinned Supabase 2.117.0 binary");
// Obtain the real unshipped owner capsule from its immutable local Git object.
// A source-only archive can point to the full local repository that supplied it.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--history-repository"),
  "Usage: node scripts/db/test-production-marketing-forward.mjs [--history-repository local-checkout]");
const historyRepository = args.length ? resolve(args[1]) : root;
const retiredCommit = "1db9f1f58602401eeb2dc2ccfd73850235ebd59d";
const retiredFile = "20261121081630_install_production_marketing.sql";
const read = (dir, file) => readFileSync(join(dir, file), "utf8");
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
const marketingFile = "20261121090054_install_direct_production_marketing.sql";
const all = await loadMigrations(root);
assert.deepEqual(all.map(row=>row.file), [...prefix, marketingFile]);
const predecessor = all.slice(0, -1);
const marketing = all.at(-1);
const releaseFiles = [
  ...["enroll_live_checkout_settlement", "enroll_first_order_checkout"].map(x => "release-bootstrap/" + x),
  ...["extend-checkout-environment", "install-live-checkout-contract",
    "extend-business-checkout-environment", "install-first-order-checkout"].map(x => "live-checkout/" + x),
  ...["inventory", "issuer", "admission", "manual-fulfillment"].map(x => "business-checkout/" + x),
].map(x => "supabase/operations/" + x + ".sql");
const renderSchema = (...flags) => execFileSync(process.execPath,
  [join(root,"scripts/db/bootstrap/render-development-schema.mjs"), ...flags],
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
    IF NEW.version='${marketingFile.slice(0, 14)}' THEN
      PERFORM nextval('private.saw_welcome_ledger_fault'); RAISE EXCEPTION 'Synthetic history failure';
    END IF;
    RETURN NEW;
  END;
  $test$;
  REVOKE ALL ON FUNCTION private.fail_welcome_ledger_fixture() FROM PUBLIC,anon,authenticated,service_role;
  CREATE TRIGGER fail_welcome_history BEFORE INSERT ON supabase_migrations.schema_migrations
    FOR EACH ROW EXECUTE FUNCTION private.fail_welcome_ledger_fixture();`;

const capabilityState = `SELECT encode(sha256(convert_to(jsonb_agg(
  jsonb_build_array(p.oid::text,pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl::text,p.xmin::text)
  ORDER BY p.proname)::text,'UTF8')),'hex') FROM pg_proc p WHERE p.oid IN
  (to_regprocedure('private.install_helix_welcome_release()'),to_regprocedure('private.helix_welcome_release_shape()'))`;
const nativeAbsent = `SELECT to_regrole('helix_native_welcome_worker') IS NULL
  AND to_regnamespace('helix_welcome_worker') IS NULL
  AND to_regclass('private.production_marketing_native_generations') IS NULL
  AND to_regclass('private.production_marketing_native_policy') IS NULL`;

function verifyOwnerRefusals(owner, release, writer) {
  // Isolate each operational drift and roll the whole transaction back on
  // refusal. An accidental success also rolls back before the assertion fails.
  const initial = owner(capabilityState);
  assert.match(initial, /^[0-9a-f]{64}$/);
  const guarded = release.ownerSql.replace(/^BEGIN;\n/, "").replace(/COMMIT;\s*$/, "");
  assert.notEqual(guarded, release.ownerSql);
  for (const drift of [
    "ALTER FUNCTION private.helix_welcome_release_shape() RENAME TO incomplete_shape_fixture;",
    "ALTER FUNCTION private.install_helix_welcome_release() SET application_name='fixture';",
    `REVOKE EXECUTE ON FUNCTION private.install_helix_welcome_release() FROM ${writer};`,
    "CREATE SCHEMA helix_welcome_worker AUTHORIZATION postgres;",
  ]) {
    assert.throws(()=>owner("BEGIN;\n"+drift+"\n"+guarded+"\nROLLBACK;"), /ERROR:/);
    assert.equal(owner(capabilityState), initial);
  }
  assert.throws(()=>owner("BEGIN;\n"+guarded+"\nSELECT 1/0; ROLLBACK;"), /division by zero/);
  assert.equal(owner(capabilityState),initial,"Late owner transaction failure changed the enrolled capsule");
}

async function enrollAfterContendedRollback(stack, database, client, ownerSql) {
  await client.query("BEGIN");
  let completion;
  try {
    // An old release writer may have invoked the real capsule outside T3.
    // Hold its actual installation open through the owner's target check.
    await client.query("SELECT private.install_helix_welcome_release()");
    const contender = stack.session(database);
    completion = once(contender,"close");
    contender.stdout.resume();
    contender.stderr.resume();
    contender.stdin.end(ownerSql);
    const wait = `SELECT EXISTS (SELECT FROM pg_locks l WHERE l.locktype='relation'
      AND l.relation='private.helix_environment'::regclass AND l.mode='AccessExclusiveLock'
      AND NOT l.granted AND pg_backend_pid()=ANY(pg_blocking_pids(l.pid))) AS blocked`;
    const deadline = Date.now()+3000;
    while (!(await client.query(wait)).rows[0].blocked) {
      assert.ok(Date.now()<deadline,"Original writer must block the owner on the actual marker");
      await delay(20);
    }
  } finally {
    await client.query("ROLLBACK");
    if (completion) assert.equal((await completion)[0],0,"Replacement failed after old transaction rolled back");
  }
}

async function verifyTarget(environment, historical, retired) {
  // Worker roles are cluster-wide. Each real target is a separate fresh local
  // managed stack with its own role membership, defaults, markers and data.
  const stack = localStack();
  const projectRef = refs[environment], writer = writers[environment];
  const child = environment === "development";
  const stage = child ? "fresh_a" : "fresh_b";
  const database = "helix_bootstrap_" + stage + "_" + stack.nonce;
  const password = randomBytes(32).toString("hex");
  const location = "/tmp/helix-welcome-" + stack.nonce;
  const psql = ["/opt/postgres/bin/psql","-X","-Atq","-h","/tmp",
    "-v","ON_ERROR_STOP=1","-U","postgres"];
  const owner = (sql, variables=[], db=database) => stack.exec([...psql,"-d",db,...variables,"-f","-"],sql).stdout.toString().trim();
  const flags = ["-v","writer_role="+writer,"-v","expected_environment="+environment,"-v","expected_project_ref="+projectRef];
  const op = name => read(root, "supabase/operations/release-bootstrap/" + name + ".sql");
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
    const writerUrl = db => `postgresql://${writer}@127.0.0.1:${port}/${db}?sslmode=disable`;
    const open = async db => {
      const connection = new pg.Client({host:"127.0.0.1",port,database:db,user:writer,password,ssl:false});
      await connection.connect();
      return connection;
    };
    seedCliHistory(cli,writerUrl(database),password);
    client = await open(database);
    const ledger = async () => (await client.query(historyQuery)).rows[0];
    const initial = await ledger();
    assert.deepEqual(initial.versions,["20200101000000"]);
    const target = {role:writer,environment,projectRef,legacyCount:initial.legacy_count,legacyDigest:initial.legacy_digest,
      bootstrap:[],cutoverQualified:true};
    const forward = (migrations, db=database, connection=client) => runForward({client:connection,password,connectionUrl:writerUrl(db),cli,target,
      apply:true,migrations,assertCurrentSource:async () => {}});
    assert.deepEqual((await forward(predecessor.slice(0,2))).applied,prefix.slice(0,2));
    stack.exec(["mkdir","-p",...["release-bootstrap","live-checkout","business-checkout"].map(x=>location+"/supabase/operations/"+x)]);
    for (const file of releaseFiles) stack.docker(["cp",join(root,file),stack.container+":"+location+"/"+file]);
    for (const file of releaseFiles.slice(0,2)) stack.exec([...psql,"-d",database,...flags,"-f",location+"/"+file]);
    const beforeShape = shape();
    assert.match(beforeShape,/^[a-f0-9]{64}$/);
    console.log(JSON.stringify({environment, beforeShape}));
    if (child) snapshot("seed");
    const oldData = child ? snapshot("snapshot") : null;
    if (child) assert.match(oldData,/^[a-f0-9]{64}$/);
    assert.equal(owner("SELECT to_regrole('helix_native_welcome_worker') IS NULL"),"t");
    const oldRelease = historical.renderWelcomeRelease({environment});
    assert.ok(oldRelease.migration===retired.sql,"Historical native owner capsule disagrees with its recorded source");
    const rendered = renderWelcomeRelease({environment});
    assert.ok(rendered.migration===marketing.sql,"Direct owner capsule disagrees with its recorded source");
    assert.ok(rendered.manifest.verify===marketing.verify,"Direct schema verifier disagrees with its recorded source");
    owner(oldRelease.ownerSql);
    if (child) assert.deepEqual((await forward(predecessor)).applied,prefix.slice(2));
    const beforeEnroll = await ledger();
    assert.equal(beforeEnroll.forward.length, child ? 6 : 2);

    // The later refusal tests restore this precise genuine pre-enrollment state.
    const oldBackup = stack.backup(database);
    verifyOwnerRefusals(owner,rendered,writer);
    const originalPair = owner(capabilityState);
    if (child) await enrollAfterContendedRollback(stack,database,client,rendered.ownerSql);
    else owner(rendered.ownerSql);
    const currentPair = owner(capabilityState);
    assert.notEqual(currentPair,originalPair);
    assert.deepEqual(await ledger(),beforeEnroll);
    owner(rendered.ownerSql);
    assert.equal(owner(capabilityState),currentPair,"Repeated verified owner enrollment rewrote a function");
    assert.deepEqual(await ledger(),beforeEnroll);
    if (!child) assert.deepEqual((await forward(predecessor)).applied,prefix.slice(2));
    await assert.rejects(client.query("SELECT * FROM private.helix_environment FOR UPDATE"), {code:"42501"});
    const before = await ledger();
    assert.deepEqual(before.forward.map(x=>x.version),prefix.map(file=>file.slice(0,14)));
    // An old deployment arriving after owner enrollment cannot run the new
    // capability under its old ledger version.
    await assert.rejects(forward([...predecessor,retired]),/Supabase CLI operation failed/);
    assert.deepEqual(await ledger(),before);
    assert.equal(shape(),beforeShape);
    owner(markFault);
    await assert.rejects(forward(all),/Supabase CLI operation failed/);
    if (owner("SELECT is_called FROM private.saw_welcome_ledger_fault") !== "t") {
      // The CLI intentionally suppresses provider diagnostics. Replay only the
      // exact reviewed statement inside the disposable writer's rollback so a
      // failed admission can be distinguished from a ledger fault.
      await client.query("BEGIN");
      try {
        await client.query(marketing.sql);
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
    assert.equal(owner(nativeAbsent),"t");
    if (child) assert.equal(snapshot("snapshot"),oldData);
    owner("DROP TRIGGER fail_welcome_history ON supabase_migrations.schema_migrations");
    assert.deepEqual((await forward(all)).applied,[marketingFile]);
    const installed = await ledger();
    assert.deepEqual(installed.forward.slice(0,-1),before.forward);
    assert.equal(installed.legacy_digest,initial.legacy_digest);
    assert.equal((await client.query(marketing.verify)).rows[0].applied,true);
    assert.deepEqual(await forward(all),{pending:[],applied:[]});
    assert.deepEqual(await ledger(),installed);
    assert.equal(owner(`SELECT NOT (enrollment_enabled OR dispatch_enabled OR events_enabled OR status_enabled)
      AND daily_limit=0 AND monthly_limit=0 AND confirmation_worker_binding_hash IS NULL
      FROM private.production_marketing_controls WHERE singleton`),"t");
    assert.equal(owner(nativeAbsent),"t");
    assert.equal(owner(`SELECT EXISTS (SELECT FROM private.production_marketing_direct_policy WHERE singleton AND revision=0
      AND topic_default IS NULL AND baseline_evidence_sha256 IS NULL AND intake_evidence_sha256 IS NULL)
      AND (SELECT count(*)=1 FROM private.production_marketing_direct_lookup_key)
      AND NOT EXISTS (SELECT FROM private.production_marketing_direct_denials)
      AND NOT EXISTS (SELECT FROM private.production_marketing_direct_receipts)
      AND NOT EXISTS (SELECT FROM private.production_marketing_generations WHERE direct_subject IS NOT NULL)`),"t");
    assert.throws(()=>owner(rendered.ownerSql), /ERROR:/,"Owner setup must refuse an already-applied direct store");
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
    const afterShape = shape();
    // Only after all direct checks, exercise independent old-store outcomes.
    // The old installer creates a cluster-wide role; this clone shares no state
    // with the other target and the test destroys its entire owned stack.
    const oldDb = "helix_bootstrap_restore_"+stack.nonce;
    stack.restore(oldBackup,oldDb);
    const oldConnection = await open(oldDb);
    try {
      if (!child) assert.deepEqual((await forward(predecessor,oldDb,oldConnection)).applied,prefix.slice(2));
      const oldLedger = async () => (await oldConnection.query(historyQuery)).rows[0];
      const starting = await oldLedger();
      assert.equal(starting.forward.length,6);
      if (child) {
        await oldConnection.query("SELECT private.install_helix_welcome_release()");
        assert.deepEqual(await oldLedger(),starting);
      } else {
        assert.deepEqual((await forward([...predecessor,retired],oldDb,oldConnection)).applied,[retiredFile]);
      }
      assert.equal((await oldConnection.query(retired.verify)).rows[0].applied,true);
      const oldInstalled = await oldLedger();
      const oldPair = owner(capabilityState,[],oldDb);
      assert.throws(()=>owner(rendered.ownerSql,[],oldDb), /ERROR:/);
      assert.deepEqual(await oldLedger(),oldInstalled);
      assert.equal(owner(capabilityState,[],oldDb),oldPair);
      assert.equal((await oldConnection.query(retired.verify)).rows[0].applied,true);
    } finally { await oldConnection.end(); }
    console.log(JSON.stringify({environment,beforeShape,afterShape,ownerPrefix:beforeEnroll.forward.length,
      priorForwardCount:before.forward.length,appliedVersion:marketingFile.slice(0,14),ownerRetryNoOp:true,
      ledgerRollback:true,retryApplied:0,paused:true,originalChildConsentPreserved:child,retiredInstalledRefused:true,
      retiredRecorded:!child}));
  } finally {
    try { if (client) await client.end(); }
    finally { stack.cleanup(); }
  }
}

const fixture = mkdtempSync(join(tmpdir(),"helix-retired-owner-"));
try {
  const archive = join(fixture,"retired.tar");
  execFileSync("git", ["-C",historyRepository,"archive","--format=tar","-o",archive,retiredCommit,
    "scripts/db/render-production-marketing-release.mjs","scripts/db/forward-migrations.mjs",
    "supabase/migrations","supabase/releases","supabase/operations/production-marketing",
    "supabase/operations/release-bootstrap"], {env:{...process.env,GIT_ALLOW_PROTOCOL:"",GIT_NO_LAZY_FETCH:"1"}});
  execFileSync("tar",["-xf",archive,"-C",fixture]);
  symlinkSync(join(root,"node_modules"),join(fixture,"node_modules"));
  const historical = await import(pathToFileURL(join(fixture,"scripts/db/render-production-marketing-release.mjs")));
  const retired = (await loadMigrations(fixture)).find(row=>row.file===retiredFile);
  assert.ok(retired);
  for (const environment of ["development","production"]) await verifyTarget(environment,historical,retired);
} finally { rmSync(fixture,{recursive:true,force:true}); }
