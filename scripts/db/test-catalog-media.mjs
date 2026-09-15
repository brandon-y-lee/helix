import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable local PostgreSQL 17 container>.");
}

function docker(args, input, onDiagnostics) {
  const result = spawnSync("docker", args, {
    input,
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
  const sql = readFileSync(resolve(root, path), "utf8");
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
  docker(psql, "insert into public.product_media(id,product_id,media_type,url,alt,width,height,role,sort_order) values('10000000-0000-4000-8000-000000000303','10000000-0000-4000-8000-000000000101','image','https://example.com/late-unreviewed.webp','Independent write after activation snapshot',100,100,'gallery',9);");
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

let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const version = docker([
    "exec", container, "psql", "-U", "postgres", "-d", database, "-Atc", "show server_version;",
  ]).trim();
  if (!version.startsWith("17.")) throw new Error("Catalog checkpoint tests require PostgreSQL 17.");
  const input = "\\set ON_ERROR_STOP on\n" + files.map(read).join("\n");
  let checks = [];
  docker(psql, input, (diagnostics) => {
    checks = diagnostics.split("\n").filter((line) => line.includes("PASS "))
      .map((line) => line.slice(line.indexOf("PASS ") + 5));
  });
  const concurrency = await concurrencyChecks();
  console.log(JSON.stringify({
    status: "passed",
    postgres: version,
    checkpoint: { path: checkpoint, sha256: createHash("sha256").update(read(checkpoint)).digest("hex") },
    executed: files.slice(1).map((path) => ({ path, sha256: createHash("sha256").update(read(path)).digest("hex") })),
    checks,
    concurrency,
    scope: "isolated synthetic Catalog; no provider data or outbound delivery",
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
