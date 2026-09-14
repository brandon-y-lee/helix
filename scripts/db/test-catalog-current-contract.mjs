import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

// Local synthetic execution only. This runner accepts no provider URL or keys.
const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable labeled PostgreSQL 17 container>.");
}
const capturedFiles = new Map();
const read = (path) => {
  if (!capturedFiles.has(path)) {
    capturedFiles.set(path, readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
  }
  return capturedFiles.get(path);
};
const runnerPath = "scripts/db/test-catalog-current-contract.mjs";
// Capture this executable source before Docker inspection or readiness waits.
read(runnerPath);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const docker = (args, input) => {
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
};
const success = (result) => {
  if (result.status !== 0) throw new Error(result.stderr || "Local PostgreSQL execution failed.");
  return result.stdout;
};
assert.equal(success(docker(["inspect", "--format", '{{index .Config.Labels "helix.task"}}', container])).trim(),
  "spec358-synthetic-sql", "Refusing an unlabeled test container");
const ports = JSON.parse(success(docker(["inspect", "--format", '{{json (index .NetworkSettings.Ports "5432/tcp")}}', container])));
assert.ok(ports?.length && ports.every((port) => port.HostIp === "127.0.0.1"),
  "Synthetic PostgreSQL must be bound only to IPv4 loopback");
const deadline = Date.now() + 30_000;
while (docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres"]).status !== 0) {
  if (Date.now() >= deadline) throw new Error("Disposable PostgreSQL did not become ready.");
  await delay(250);
}
const database = `helix_catalog_current_${randomBytes(8).toString("hex")}`;
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
const checkpoints = {
  catalog: "supabase/tests/checkpoints/catalog-current-20260909042518.sql",
  checkout: "supabase/tests/checkpoints/checkout-current.sql",
};
const paths = {
  identity: "supabase/migrations/20260914051153_catalog_restore_current_identity.sql",
  dispatcher: "supabase/migrations/20260914051219_retire_catalog_v3_dispatcher.sql",
  guidance: "supabase/migrations/20260914062650_catalog_reviewed_guidance.sql",
  media: "supabase/migrations/20260914062651_catalog_stable_media_boundary.sql",
  dispatcherHistory: "supabase/migrations/20260801052736_catalog_editor_v3_complete_field_coverage.sql",
  resolverHistory: "supabase/migrations/20260810135417_durable_product_slug_routes.sql",
  urlPreflight: "supabase/operations/product-url-preflight.sql",
  urlContract: "supabase/operations/product-url-contract.sql",
  identityFixtures: "supabase/tests/catalog_identity.fixtures.sql",
  mediaFixtures: "supabase/tests/catalog_media.integration.sql",
  orders: "supabase/tests/catalog_current_contract.orders.sql",
  fixtures: "supabase/tests/catalog_current_contract.fixtures.sql",
  tests: "supabase/tests/catalog_current_contract.integration.sql",
};
// Freeze all source bytes before execution. Evidence must describe exactly the
// SQL loaded even if another worker edits this shared worktree during the run.
const artifactPaths = [...Object.values(checkpoints), ...Object.values(paths),
  runnerPath];
artifactPaths.forEach(read);
const sourceRevision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
assert.equal(sourceRevision.status, 0);
const dispatcher = read(paths.dispatcherHistory).match(
  /create or replace function private\.catalog_editor_upgrade_to_v3\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(dispatcher, "Exact historical V3 dispatcher definition is required");
const resolver = read(paths.resolverHistory).split("create or replace function public.resolve_product_slug(")[1]
  ?.split("create or replace function public.replace_catalog_product_slug(")[0];
assert.ok(resolver, "Exact historical public resolver definition is required");
const mediaFixture = read(paths.mediaFixtures).split("\nbegin;")[0];
assert.ok(mediaFixture.includes("create table storage.objects") && mediaFixture.includes("create function pg_temp.seed_media()"),
  "The exact T7 Storage metadata and verified-copy seed boundary is required");
// T7 uses the same synthetic T1 facts with a production-format content filename.
const identityFixture = read(paths.identityFixtures).replaceAll("current.webp", `primary/${"a".repeat(64)}.webp`);
const ordersSource = read(checkpoints.checkout);
const ordersFile = read(paths.orders);
const exactOrdersBlock = (name) => {
  const begin = `-- BEGIN EXACT CHECKOUT ORDERS ${name}\n`;
  const end = `\n-- END EXACT CHECKOUT ORDERS ${name}`;
  assert.equal(ordersFile.split(begin).length, 2);
  assert.equal(ordersFile.split(end).length, 2);
  const block = ordersFile.split(begin)[1].split(end)[0];
  for (const statement of block.split("\n\n")) {
    assert.ok(ordersSource.includes(statement), "Historical Orders schema must remain verbatim from its checkpoint");
  }
  return block;
};
const ordersPrerequisites = exactOrdersBlock("PREREQUISITES");
const ordersSlice = exactOrdersBlock("SLICE");
const selectedOrderStatements = [...ordersSource.matchAll(
  /^(?:CREATE TYPE|CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX|CREATE POLICY|GRANT)\b[\s\S]*?;/gm,
)].map(([statement]) => statement).filter((statement) => [
  /^CREATE TYPE "public"\."(?:cart_status|checkout_environment|order_status)" /,
  /^(?:CREATE TABLE|ALTER TABLE) public\."(?:carts|orders|order_items)" /,
  /^CREATE (?:UNIQUE )?INDEX [^ ]+ ON public\.(?:carts|orders|order_items) /,
  /^CREATE POLICY "[^"]+" ON public\."(?:carts|orders|order_items)" /,
  /^GRANT [A-Z]+ ON public\."(?:carts|orders|order_items)" /,
].some((pattern) => pattern.test(statement)));
assert.equal(ordersSlice, selectedOrderStatements.join("\n\n"), "Include the complete declared Orders schema slice");
assert.ok(ordersFile.includes(`-- Source SHA256: ${hash(ordersSource)}`), "Orders source checkpoint hash changed");
const ordersHelpers = ordersFile.split("-- END EXACT CHECKOUT ORDERS SLICE\n")[1];
const historicalContracts = `${dispatcher}
revoke all on function private.catalog_editor_upgrade_to_v3(jsonb) from public;
alter function private.catalog_editor_upgrade_to_v3(jsonb) volatile;
create or replace function public.resolve_product_slug(${resolver}
create schema supabase_functions;
-- Synthetic scheduling boundary: deliberately contains no outbound HTTP.
create function supabase_functions.http_request() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger helix_catalog_search_sync_product_slug_routes
after insert or update or delete on public.product_slug_routes for each row
execute function supabase_functions.http_request('https://example.invalid/hook','POST','{}','{}','1000');`;
const retainedRoutines = `select coalesce(jsonb_object_agg(p.oid::regprocedure::text,
  jsonb_build_object('definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'settings',p.proconfig)), '{}')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and p.prokind='f'
    and p.oid is distinct from to_regprocedure('private.catalog_editor_upgrade_to_v3(jsonb)')
    and p.oid is distinct from to_regprocedure('public.resolve_product_slug(text)');`;
const checks = [];
const executedSql = [];
const execute = (source) => {
  const result = docker(psql, source);
  success(result);
  executedSql.push({ sequence: executedSql.length + 1, sha256: hash(source) });
  checks.push(...result.stderr.split("\n").filter((line) => line.includes("PASS "))
    .map((line) => line.slice(line.indexOf("PASS ") + 5)));
  return result.stdout;
};
const assertAbsent = `do $$ begin
  if to_regprocedure('private.catalog_editor_upgrade_to_v3(jsonb)') is not null
     or to_regprocedure('public.resolve_product_slug(text)') is not null then
    raise exception 'Retired executable Catalog APIs remain';
  end if;
end $$;`;
let created = false;
let proof;
const startedAt = new Date().toISOString();
try {
  success(docker(["exec", container, "createdb", "-U", "postgres", database]));
  created = true;
  const version = execute("show server_version;").trim();
  assert.ok(version.startsWith("17."), "Current Catalog checkpoint requires PostgreSQL 17");
  const roles = JSON.parse(execute("select jsonb_object_agg(rolname,rolbypassrls) from pg_roles where rolname in ('anon','authenticated','service_role');").trim());
  assert.deepEqual(roles, { anon: false, authenticated: false, service_role: true },
    "Use the documented Supabase image role boundaries");
  execute([read(checkpoints.catalog), historicalContracts, read(paths.identity),
    read(paths.guidance), read(paths.media), ordersPrerequisites, ordersSlice].join("\n"));
  const retainedBefore = JSON.parse(execute(retainedRoutines).trim());
  const red = docker(psql, assertAbsent);
  assert.notEqual(red.status, 0, "Negative control must fail before contraction");
  assert.ok(red.stderr.includes("Retired executable Catalog APIs remain"));
  checks.push("negative control rejects unchanged retired resolver and dispatcher");
  execute(read(paths.dispatcher));
  assert.deepEqual(JSON.parse(execute(retainedRoutines).trim()), retainedBefore,
    "Dispatcher contraction changed a retained actual routine or authority boundary");
  checks.push("real dispatcher contraction preserves all retained actual function definitions and ACLs");
  // Temporary fixture helpers and every scenario share one connection.
  const evidence = JSON.stringify({ projectRef: "erasogmsqpgiirovubjh",
    stage: "canonical-consumers-search-reconciled", sourceSha: "a".repeat(40),
    verifiedDeploymentSha: "a".repeat(40), deploymentId: "synthetic-only-no-provider-deployment",
    canonicalConsumersVerified: true, searchVerified: true, catalogWritesPaused: true,
    routeDeliveriesDrained: true });
  execute([identityFixture, mediaFixture, ordersHelpers, read(paths.fixtures), read(paths.urlPreflight), read(paths.urlContract),
    `begin;
    create temp table current_manifest as select pg_temp.seed_media() as manifest;
    select pg_temp.seed_current_contract_order();
    create temp table before_url as select pg_temp.current_contract_state() as state;
    select pg_temp.contract_product_urls(pg_temp.product_url_inventory(),'${evidence}'::jsonb);
    select pg_temp.assert_current_contract(pg_temp.current_contract_state()=(select state from before_url),
      'URL contraction changed Catalog facts, historical Orders or media');
    select pg_temp.contract_product_urls(pg_temp.product_url_inventory(),'${evidence}'::jsonb);
    ${assertAbsent}
    select public.cutover_catalog_product_media((select manifest from current_manifest));
    select public.activate_catalog_product_media_policy('10000000-0000-4000-8000-000000000701',
      '10000000-0000-4000-8000-000000000901');
    select pg_temp.assert_current_history_rows((select state from before_url));
    select pg_temp.assert_current_contract(
      (pg_temp.current_contract_state()->'commerce')=(select state->'commerce' from before_url)
      and (pg_temp.current_contract_state()->'archived_media')=(select state->'archived_media' from before_url)
      and (pg_temp.current_contract_state()->'storage_objects')=(select state->'storage_objects' from before_url)
      and (select count(*) from public.catalog_product_revisions)=2
      and (select count(*) from private.verified_media_copies)=1
      and (select count(*) from private.catalog_media_operations)=1,
      'cutover changed historical Orders, archived media, Storage facts or the expected append-only outcome');
    do $$ begin raise notice 'PASS real media cutover/activation preserves exact prior revisions, audits, archived media and Orders'; end $$;
    commit;`, read(paths.tests)].join("\n"));
  assert.deepEqual(JSON.parse(execute(retainedRoutines).trim()), retainedBefore,
    "URL contraction or composed lifecycle changed retained routines or grants");
  execute(read(paths.dispatcher) + "\n" + assertAbsent);
  proof = {
    status: "passed", postgres: version, sourceRevision: sourceRevision.stdout.trim(),
    sourceState: "working-tree artifact bytes captured once before execution and identified by exact hashes", startedAt,
    checks, retainedActualRoutines: Object.keys(retainedBefore).length,
    retainedRoutineMetadataSha256: hash(JSON.stringify(retainedBefore)),
    artifacts: artifactPaths.map((path) => ({ path, sha256: hash(read(path)) })),
    executedSql,
    derivedInputs: [
      { sources: [paths.dispatcherHistory, paths.resolverHistory], purpose: "exact historical functions, applied dispatcher authority normalization and no-op local HTTP fixture", sha256: hash(historicalContracts) },
      { source: paths.mediaFixtures, purpose: "exact Storage metadata and seed prefix", sha256: hash(mediaFixture) },
      { source: paths.identityFixtures, purpose: "same synthetic facts with T7 content-addressed media filename", sha256: hash(identityFixture) },
      { source: checkpoints.checkout, purpose: "exact 4 prerequisite and 69 selected Orders schema statements", sha256: hash(ordersPrerequisites + "\n" + ordersSlice) },
    ],
    scope: "unique local synthetic Catalog plus exact limited historical Orders schema; no provider data, bytes, outbound HTTP or deployment proof",
    limitations: ["Checkout execution remains its separate actual SQL suite", "not a whole-history empty-database provisioner"],
  };
} finally {
  if (created) success(docker(["exec", container, "dropdb", "-U", "postgres", database]));
}
// A failed teardown throws before a successful evidence document is emitted.
console.log(JSON.stringify({ ...proof, completedAt: new Date().toISOString(),
  teardown: { database, removed: true } }, null, 2));
