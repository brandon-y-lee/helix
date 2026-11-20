import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createCatalogReleaseWriter, checkCatalogRelease } from "./test-catalog-release-writer.mjs";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable local PostgreSQL 17 container>.");
}

function docker(args, input, onDiagnostics, env = process.env) {
  const result = spawnSync("docker", args, {
    input, env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || "Local PostgreSQL command failed.");
  }
  onDiagnostics?.(result.stderr);
  return result.stdout;
}

const label = docker([
  "inspect", "--format", '{{index .Config.Labels "helix.task"}}', container,
]).trim();
if (label !== "spec358-synthetic-sql") {
  throw new Error("Refusing a container without the spec358-synthetic-sql test label.");
}
const readinessDeadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < readinessDeadline) {
  // TCP excludes the image's socket-only initialization server.
  const probe = spawnSync("docker", [
    "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres",
  ], { encoding: "utf8", timeout: 5_000 });
  if (probe.status === 0) { ready = true; break; }
  await delay(250);
}
if (!ready) throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
const roles = JSON.parse(docker([
  "exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atc",
  "select coalesce(jsonb_object_agg(rolname, rolbypassrls), '{}'::jsonb) from pg_roles where rolname in ('anon','authenticated','service_role');",
]).trim());
if (roles.anon !== false || roles.authenticated !== false || roles.service_role !== true) {
  throw new Error("Catalog SQL tests require the documented Supabase PostgreSQL image roles: anon/authenticated without BYPASSRLS and service_role with BYPASSRLS.");
}

const database = `helix_catalog_media_${randomBytes(8).toString("hex")}`;
const checkpoint = "supabase/tests/checkpoints/catalog-current-20260909042518.sql";
const identity = "supabase/migrations/20260914051153_catalog_restore_current_identity.sql";
const migration = "supabase/migrations/20260914062651_catalog_stable_media_boundary.sql";
const activationMigration = "supabase/migrations/20260915030021_catalog_media_activation_singleton_guard.sql";
const environment = process.argv.find((arg) => arg.startsWith("--environment="))?.slice("--environment=".length) ?? "production";
const productionRef = "erasogmsqpgiirovubjh";
const developmentRef = "zyfkunnpnlmgvrojmrbg";
if (!["development", "production"].includes(environment)) throw new Error("Unknown synthetic environment");
const projectRef = environment === "development" ? developmentRef : productionRef;
const oppositeRef = environment === "development" ? productionRef : developmentRef;
const identityBootstrap = "supabase/operations/release-bootstrap/20261120131122_helix_environment_identity.sql";
const bindingMigration = "supabase/migrations/20261120131137_bind_catalog_media_to_environment.sql";
const bindingProof = "supabase/tests/catalog_media_environment.integration.sql";
const fixtures = "supabase/tests/catalog_identity.fixtures.sql";
const tests = "supabase/tests/catalog_media.integration.sql";
// Optional read-only composition against a sibling's actual migration. This
// does not copy, merge, or modify that sibling's source/worktree state.
const additionalMigrations = process.argv.filter((arg) => arg.startsWith("--with-migration="))
  .map((arg) => arg.slice("--with-migration=".length));
if (additionalMigrations.some((path) => !path.endsWith(".sql"))) {
  throw new Error("Additional composition migrations must be SQL files.");
}
// Reuse the synthetic identity seed with the production content-addressed filename
// grammar; the schema-only checkpoint and applied migration are unmodified.
const read = (path) => {
  let sql = readFileSync(resolve(root, path), "utf8");
  if (path === tests || path === fixtures) sql = sql.replaceAll(productionRef, projectRef);
  if (path === bindingProof) sql = sql.replaceAll("<own-ref>", projectRef).replaceAll("<other-ref>", oppositeRef);
  return path === fixtures ? sql.replaceAll("current.webp", `primary/${"a".repeat(64)}.webp`) : sql;
};
const files = [checkpoint, identity, ...additionalMigrations, migration, activationMigration, fixtures, tests];
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];

function worker(input, onOutput = () => {}) {
  return new Promise((resolveWorker, reject) => {
    const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => child.kill(), 20_000);
    child.stdout.on("data", (chunk) => { output += chunk; onOutput(output); });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timeout);
      if (status === 0) resolveWorker(output);
      else reject(new Error(errors || "Concurrent SQL worker failed."));
    });
    child.stdin.end(input);
  });
}

async function concurrencyChecks() {
  const helperSql = read(tests).slice(read(tests).indexOf("create function pg_temp.assert_media"), read(tests).indexOf("\nbegin;"));
  const manifest = JSON.parse(docker(psql, read(fixtures) + helperSql + "select pg_temp.seed_media();").trim());
  const literal = (value) => {
    const delimiter = `$manifest_${randomBytes(8).toString("hex")}$`;
    return `${delimiter}${JSON.stringify(value)}${delimiter}::jsonb`;
  };
  let held;
  const isHeld = new Promise((resolveHeld) => { held = resolveHeld; });
  const writer = worker("begin; update public.product_sources set supplier_title='Concurrent reviewed edit'; select 'WRITER_HELD'; select pg_sleep(1); commit;", (output) => {
    if (output.includes("WRITER_HELD")) held();
  });
  await Promise.race([isHeld, writer.then(() => { throw new Error("Writer never acquired its fence."); })]);
  const blocked = await worker(`select public.cutover_catalog_product_media(${literal(manifest)});`)
    .then(() => false, (error) => error.message.includes("could not obtain lock"));
  await writer;
  if (!blocked) throw new Error("Cutover did not refuse an independent source writer.");
  const title = docker(psql, "select supplier_title from public.product_sources;").trim();
  if (title !== "Concurrent reviewed edit") throw new Error("Concurrent writer was not preserved.");
  manifest.products[0].expectedDocument = JSON.parse(docker(psql,
    `select public.get_catalog_editor_document('${manifest.products[0].productId}');`).trim());

  let published;
  const isPublished = new Promise((resolvePublished) => { published = resolvePublished; });
  const call = `select public.cutover_catalog_product_media(${literal(manifest)});`;
  const first = worker(`begin; ${call} select pg_sleep(1); commit;`, (output) => {
    if (output.includes('"published"')) published();
  });
  await Promise.race([isPublished, first.then(() => { throw new Error("First cutover did not publish."); })]);
  const second = worker(call);
  const outcomes = (await Promise.all([first, second])).map((out) => JSON.parse(out.trim().split("\n")[0]).outcome);
  if (outcomes.join(",") !== "published,no-op") throw new Error("Concurrent retry did not publish exactly once.");

  const staleCutover = await worker(`begin isolation level repeatable read; ${call} commit;`)
    .then(() => false, (error) => error.message.includes("READ COMMITTED"));
  if (!staleCutover) throw new Error("Operational cutover allowed a stale isolation level.");
  let activationSnapshot;
  const hasActivationSnapshot = new Promise((resolveSnapshot) => { activationSnapshot = resolveSnapshot; });
  const staleActivation = worker(`begin isolation level repeatable read; select count(*) from public.product_media; select 'ACTIVATION_SNAPSHOT'; select pg_sleep(1); select public.activate_catalog_product_media_policy('${manifest.operationId}','${manifest.actorId}'); commit;`, (output) => {
    if (output.includes("ACTIVATION_SNAPSHOT")) activationSnapshot();
  });
  const staleActivationOutcome = staleActivation.then(() => false, (error) => error.message.includes("READ COMMITTED"));
  await hasActivationSnapshot;
  docker(psql, `insert into public.product_media(id,product_id,media_type,url,alt,width,height,role,sort_order) values('10000000-0000-4000-8000-000000000303','10000000-0000-4000-8000-000000000101','image','https://${projectRef}.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/late-unreviewed.webp','Independent write after activation snapshot',100,100,'gallery',9);`);
  if (!await staleActivationOutcome) throw new Error("Stale operational snapshot activated over an unseen retired row.");
  if (docker(psql, "select enabled from private.catalog_media_policy;").trim() !== "f") throw new Error("Stale activation changed policy.");
  docker(psql, "delete from public.product_media where id='10000000-0000-4000-8000-000000000303';");

  // Establish a repeatable-read snapshot while disabled without taking a policy
  // row lock; activation commits before this stale transaction attempts a write.
  let snapshotted;
  const hasSnapshot = new Promise((resolveSnapshot) => { snapshotted = resolveSnapshot; });
  const stale = worker("begin isolation level repeatable read; select case when not enabled then 'DISABLED_SNAPSHOT' end from private.catalog_media_policy; select pg_sleep(1); update public.product_media set archived_at=null,sort_order=9 where id='10000000-0000-4000-8000-000000000302'; commit;", (output) => {
    if (output.includes("DISABLED_SNAPSHOT")) snapshotted();
  });
  // Attach the rejection handler before waiting so a failed worker cannot become
  // an unhandled promise while activation runs.
  const staleOutcome = stale.then(() => false, (error) => error.message.includes("could not serialize access"));
  await hasSnapshot;
  // Hosted PostgREST authenticator sessions preload safeupdate. Load the real
  // extension as the disposable container administrator, then call the RPC with
  // its actual service role so this test exercises the same UPDATE guard.
  const apiSession = [...psql];
  apiSession[apiSession.indexOf("-U") + 1] = "supabase_admin";
  const activated = JSON.parse(docker(apiSession, `load 'safeupdate'; set role service_role;
    select public.activate_catalog_product_media_policy('${manifest.operationId}','${manifest.actorId}');`).trim());
  if (activated.ok !== true || activated.outcome !== "activated" || activated.operationId !== manifest.operationId) {
    throw new Error("Service-role activation with safeupdate did not activate the reviewed operation.");
  }
  if (!await staleOutcome) throw new Error("Stale transaction bypassed activated media policy.");
  const policyBeforeRetry = docker(psql, "select to_jsonb(p) from private.catalog_media_policy p;").trim();
  const policy = JSON.parse(policyBeforeRetry);
  if (!policy.singleton || !policy.enabled || policy.operation_id !== manifest.operationId
    || policy.activated_by !== manifest.actorId || !policy.activated_at) {
    throw new Error("Activation did not record the exact reviewed policy operation and actor.");
  }
  const retried = JSON.parse(docker(apiSession, `load 'safeupdate'; set role service_role;
    select public.activate_catalog_product_media_policy('${manifest.operationId}','${manifest.actorId}');`).trim());
  if (retried.ok !== true || retried.outcome !== "no-op" || retried.operationId !== manifest.operationId
    || docker(psql, "select to_jsonb(p) from private.catalog_media_policy p;").trim() !== policyBeforeRetry) {
    throw new Error("Service-role activation retry changed the policy.");
  }
  return { sourceWriterPreserved: true, retryOutcomes: outcomes, staleOperationalSnapshotRejected: true,
    staleSnapshotRejected: true, safeupdateActivation: true, safeupdateActivationRetryPreserved: true };
}

const enrollmentFile = "supabase/operations/release-bootstrap/enroll_catalog_media_release.sql";
const releaseCli = process.argv.find((arg) => arg.startsWith("--release-cli="))?.slice("--release-cli=".length);
const runnerFile = process.argv.find((arg) => arg.startsWith("--forward-runner="))?.slice("--forward-runner=".length);
if (runnerFile && !releaseCli) throw new Error("--forward-runner requires --release-cli");
const writerRole = "helix_media_writer_" + randomBytes(8).toString("hex");
const writerPassword = randomBytes(32).toString("hex");
let writerCreated = false;
let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const version = docker([
    "exec", container, "psql", "-U", "postgres", "-d", database, "-Atc", "show server_version;",
  ]).trim();
  if (!version.startsWith("17.")) throw new Error("Catalog checkpoint tests require PostgreSQL 17.");
  // The T1 development renderer binds these three historical routines and one
  // constraint to the child. Model exactly that prerequisite on the synthetic
  // DB; checkpoint and migrations on disk remain the reviewed historical bytes.
  const predecessors = files.slice(0, -2);
  function predecessorSql(path) {
    const sql = read(path);
    if (environment !== "development") return sql;
    if (path === migration) return sql.replaceAll(productionRef, developmentRef);
    if (path === checkpoint) return sql.split("\n").map((line) =>
      line.includes('add constraint "product_media_core_routine_editorial_shape_check"')
        ? line.replaceAll(productionRef, developmentRef) : line).join("\n");
    return sql;
  }
  docker(psql, predecessors.map(predecessorSql).join("\n") + "\n" + read(identityBootstrap));
  createCatalogReleaseWriter(docker, psql, writerRole, writerPassword);
  writerCreated = true;
  const enroll = [
    ...psql, "-v", `writer_role=${writerRole}`, "-v", `expected_environment=${environment}`, "-v", `expected_project_ref=${projectRef}`,
  ];
  // The owner enrolls a restricted login only for an independently bound target.
  function assertEnrollmentRefusal(args, reason) {
    const attempt = spawnSync("docker", args, { input: read(enrollmentFile), encoding: "utf8" });
    if (attempt.status === 0 || !attempt.stderr?.includes(reason)) {
      throw new Error("Expected owner enrollment to refuse an unqualified target.");
    }
  }
  assertEnrollmentRefusal(enroll, "matching environment marker");
  docker(psql, `insert into private.helix_environment(environment,project_ref) values ('${environment}','${projectRef}');`);
  const wrongTarget = [...enroll];
  wrongTarget[wrongTarget.length - 1] = `expected_project_ref=${oppositeRef}`;
  assertEnrollmentRefusal(wrongTarget, "matching environment marker");
  docker(psql, `GRANT SELECT (environment) ON private.helix_environment TO ${writerRole};`);
  assertEnrollmentRefusal(enroll, "existing privileged access");
  docker(psql, `REVOKE SELECT (environment) ON private.helix_environment FROM ${writerRole};`);
  // Granting schema USAGE would make a pre-existing routine EXECUTE usable.
  // Use a harmless constant function to test the grant boundary itself.
  docker(psql, `CREATE FUNCTION private.unrelated_enrollment_fixture()
    RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';`);
  const fixture = "private.unrelated_enrollment_fixture()";
  const writerAclState = `SELECT jsonb_build_object(
    'schema', (SELECT jsonb_object_agg(nspname,nspacl) FROM pg_namespace
      WHERE nspname IN ('public','private','supabase_migrations')),
    'ledger', (SELECT relacl FROM pg_class WHERE oid='supabase_migrations.schema_migrations'::regclass),
    'functions', (SELECT jsonb_object_agg(oid::regprocedure::text,proacl) FROM pg_proc WHERE oid IN
      ('public.read_helix_environment()'::regprocedure,'private.read_helix_environment()'::regprocedure,'${fixture}'::regprocedure)),
    'capability', to_regprocedure('private.apply_helix_catalog_media_binding()')
  );`;
  function assertDefinerRefusal(grantSource) {
    const routineGrant = docker(psql, `SELECT has_function_privilege('${writerRole}','${fixture}','EXECUTE')
      AND NOT has_schema_privilege('${writerRole}', 'private', 'USAGE')
      AND EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
        WHERE p.oid='${fixture}'::regprocedure AND acl.privilege_type='EXECUTE' AND acl.grantee=${grantSource});`);
    if (routineGrant.trim() !== "t") throw new Error("Expected latent private routine execution privilege.");
    const before = docker(psql, writerAclState);
    assertEnrollmentRefusal(enroll, "existing privileged access");
    if (docker(psql, writerAclState) !== before) throw new Error("Refused enrollment changed existing privileges.");
  }
  assertDefinerRefusal("0"); // PostgreSQL's default PUBLIC EXECUTE.
  docker(psql, `REVOKE ALL ON FUNCTION ${fixture} FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ${fixture} TO ${writerRole};`);
  assertDefinerRefusal(`'${writerRole}'::regrole`);
  docker(psql, `DROP FUNCTION ${fixture};`);
  docker(enroll, read(enrollmentFile));
  // Exercise the forward DDL on nonempty old-app state before the full suite.
  // The pre-existing document, media rows, and immutable revisions
  // must survive, and the old writer must still accept its own slug URLs.
  const sidecar = JSON.parse(read("supabase/releases/20261120131137_bind_catalog_media_to_environment.json"));
  if (createHash("sha256").update(read(bindingMigration)).digest("hex") !== sidecar.sourceSha256) {
    throw new Error("Stale forward migration sidecar.");
  }
  docker(psql, [
    "begin;", read(fixtures), "select pg_temp.seed_catalog_identity('synthetic-serum','Synthetic serum');",
    "create temp table saved_catalog as select pg_temp.catalog_identity_state() AS snapshot;",
    read(bindingMigration),
    "do $$ begin if (select snapshot from saved_catalog) is distinct from pg_temp.catalog_identity_state() then raise exception 'Binding changed existing Catalog rows'; end if; end $$;",
    "update public.product_media set url = url where archived_at is null;", "rollback;",
  ].join("\n"));
  const restrictedRelease = releaseCli ? await checkCatalogRelease({
    root, docker, container, database, writerRole, writerPassword, environment, projectRef, oppositeRef,
    migrationPath: bindingMigration, sidecar, cli: releaseCli, runnerFile, fixtures: read(fixtures),
  }) : undefined;
  // Authenticate the same restricted role for the compatibility suite too.
  const writerSql = (input) => docker(
    ["exec", "-i", "-e", "PGPASSWORD", container, "psql", "-X", "-h", "127.0.0.1", "-U", writerRole, "-d", database,
      "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"],
    input, undefined, { ...process.env, PGPASSWORD: writerPassword },
  );
  writerSql(read(bindingMigration));
  const input = [fixtures, tests, bindingProof].map(read).join("\n");
  let checks = [];
  docker(psql, input, (diagnostics) => {
    checks = diagnostics.split("\n").filter((line) => line.includes("PASS "))
      .map((line) => line.slice(line.indexOf("PASS ") + 5));
  });
  if (writerSql(sidecar.verify).trim() !== "t") throw new Error("Release sidecar postflight rejected target.");
  const concurrency = await concurrencyChecks();
  console.log(JSON.stringify({
    status: "passed", environment, restrictedRelease,
    postgres: version,
    checkpoint: { path: checkpoint, sourceSha256: createHash("sha256").update(read(checkpoint)).digest("hex"),
      sha256: createHash("sha256").update(predecessorSql(checkpoint)).digest("hex") },
    executed: [...files.slice(1,-2), identityBootstrap, enrollmentFile, bindingMigration, fixtures, tests, bindingProof].map((path) => ({
      path, sourceSha256: createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"),
      sha256: createHash("sha256").update(predecessors.includes(path) ? predecessorSql(path) : read(path)).digest("hex"),
    })),
    checks,
    concurrency,
    scope: "isolated synthetic Catalog; no provider data or outbound delivery",
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
  // The login is unique to this run. Its object grants vanish with its databases.
  if (writerCreated) docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `drop role ${writerRole};`);
}
