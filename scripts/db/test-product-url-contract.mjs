import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable labeled Supabase PostgreSQL 17 container>.");
}
function docker(args, input, expectError = false) {
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if ((result.status !== 0) !== expectError) throw new Error(result.stderr || "Unexpected SQL outcome.");
  return result;
}
if (docker(["inspect", "--format", '{{index .Config.Labels "helix.task"}}', container]).stdout.trim()
    !== "spec358-synthetic-sql") throw new Error("Refusing an unlabeled container.");
const deadline = Date.now() + 30_000;
while (true) {
  const probe = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { timeout: 5_000 });
  if (probe.status === 0) break;
  if (Date.now() > deadline) throw new Error("Disposable PostgreSQL readiness timeout.");
  await delay(250);
}
const roles = JSON.parse(docker(["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atc",
  "select jsonb_object_agg(rolname,rolbypassrls) from pg_roles where rolname in ('anon','authenticated','service_role')",
]).stdout.trim());
if (roles.anon !== false || roles.authenticated !== false || roles.service_role !== true) {
  throw new Error("Use the documented Supabase image with its non-bypass public roles and bypass service role.");
}
const database = `helix_product_url_${randomBytes(8).toString("hex")}`;
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
const read = (path) => readFileSync(root + path, "utf8");
const checkpoint = "supabase/tests/checkpoints/catalog-current-20260909042518.sql";
const migration = "supabase/migrations/20260810135417_durable_product_slug_routes.sql";
const preflightPath = "supabase/operations/product-url-preflight.sql";
const contractPath = "supabase/operations/product-url-contract.sql";
const testPath = "supabase/tests/product_slug_routes.integration.sql";
// The current checkpoint excludes this public resolver. Exercise its exact
// historical implementation, never a replacement mock. Provider preflight must
// independently confirm it still matches before any real contraction.
const resolver = read(migration).split("create or replace function public.resolve_product_slug(")[1]
  ?.split("create or replace function public.replace_catalog_product_slug(")[0];
if (!resolver) throw new Error("Historical resolver definition was not found.");
const hook = `
create schema supabase_functions;
-- No outbound execution exists in this synthetic database.
create function supabase_functions.http_request() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger helix_catalog_search_sync_product_slug_routes
  after insert or update or delete on public.product_slug_routes for each row
  execute function supabase_functions.http_request('https://example.invalid/hook','POST','{}','{}','1000');
`;
let created = false;
const checks = [];
function verifyGeneratedTypes() {
  const port = JSON.parse(docker(["inspect", "--format", '{{json (index .NetworkSettings.Ports "5432/tcp")}}', container]).stdout)[0];
  if (port.HostIp !== "127.0.0.1") throw new Error("Type generation requires a loopback-only test service.");
  const password = docker(["exec", container, "printenv", "POSTGRES_PASSWORD"]).stdout.trim();
  const url = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port.HostPort}/${database}`;
  const result = spawnSync("pnpm", ["dlx", "supabase", "gen", "types", "--db-url", url, "--schema", "public"], {
    cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  // Do not echo CLI diagnostics: they can contain the disposable credential URL.
  if (result.error || result.status !== 0) throw new Error("Local type generation failed; no CLI credentials were logged.");
  if (result.stdout.includes("resolve_product_slug:") || !result.stdout.includes("product_slug_routes:")) {
    throw new Error("Generated local types did not match the contracted Catalog API.");
  }
  writeFileSync("/private/tmp/helix-product-url-generated.types.ts", result.stdout);
  checks.push("generated local types omit resolver and preserve ledger model");
}
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]); created = true;
  const version = docker(psql, "show server_version;").stdout.trim();
  if (!version.startsWith("17.")) throw new Error("The Catalog checkpoint requires PostgreSQL 17.");
  docker(psql, read(checkpoint) + "\ncreate or replace function public.resolve_product_slug(" + resolver + hook
    + read("supabase/migrations/20260914051153_catalog_restore_current_identity.sql")
    + read("supabase/tests/catalog_identity.fixtures.sql")
    + "\nselect pg_temp.seed_catalog_identity('super-serum','Super Serum');"
    // Prepare standalone synthetic Products for replacement; family publication
    // behavior belongs to the separate current Catalog checkpoint tests.
    + "begin; delete from public.product_family_memberships; delete from public.product_families; commit;");
  const baseline = docker(psql, read(testPath), true);
  if (!baseline.stderr.includes("Public Product slug resolver still exists")) throw new Error(baseline.stderr);
  checks.push("red: unchanged public resolver fails the private boundary test");
  if (!existsSync(root + contractPath)) throw new Error("RED reproduced; contraction not implemented yet.");
  const preflight = read(preflightPath);
  const contract = read(contractPath);
  const evidence = {
    projectRef: "erasogmsqpgiirovubjh", stage: "canonical-consumers-search-reconciled",
    sourceSha: "a".repeat(40), verifiedDeploymentSha: "a".repeat(40), deploymentId: "synthetic-only",
    canonicalConsumersVerified: true, searchVerified: true, catalogWritesPaused: true, routeDeliveriesDrained: true,
  };
  const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const call = (manifest = "pg_temp.product_url_inventory()", attestation = evidence) =>
    `select pg_temp.contract_product_urls(${manifest},${json(attestation)});`;
  const refusals = [
    ["missing deployment", "", { ...evidence, verifiedDeploymentSha: "" }],
    ["different deployment SHA", "", { ...evidence, verifiedDeploymentSha: "b".repeat(40) }],
    ["wrong stage", "", { ...evidence, stage: "before-deploy" }],
    ["wrong project", "", { ...evidence, projectRef: "wrong-project" }],
    ["undrained delivery", "", { ...evidence, routeDeliveriesDrained: false }],
    ["resolver body drift", "create or replace function public.resolve_product_slug(p_source_slug text) returns table(source_slug text,target_slug text,target_product_id uuid,route_kind text) language sql stable set search_path='' as $$select null::text,null::text,null::uuid,null::text$$;"],
    ["security definer drift", "alter function public.resolve_product_slug(text) security definer;"],
    ["tracked resolver dependency", "create view public.synthetic_resolver_dependency as select * from public.resolve_product_slug('super-serum');"],
    ["string-body resolver caller", "create function public.synthetic_resolver_caller() returns text language plpgsql as $$begin perform public.resolve_product_slug('super-serum'); return 'called'; end$$;"],
    ["unknown route trigger", "create trigger unexpected_route_hook after insert on public.product_slug_routes for each row execute function supabase_functions.http_request();"],
    ["managed trigger shape drift", "alter table public.product_slug_routes disable trigger helix_catalog_search_sync_product_slug_routes;"],
    ["disabled Product rename safeguard", "alter table public.products disable trigger sync_updated_product_slug_route;"],
    ["missing Product reactivation safeguard", "drop trigger enforce_replaced_product_archival on public.products;"],
    ["public column grant", "grant select(source_slug) on public.product_slug_routes to anon;"],
    ["service write grant", "grant insert on public.product_slug_routes to service_role;"],
  ];
  for (const [name, mutation, attestation] of refusals) {
    const result = docker(psql, preflight + contract + "\nbegin;\n" + mutation + call(undefined, attestation), true);
    if (!result.stderr.includes("Product URL contraction")) throw new Error(`${name}: ${result.stderr}`);
    checks.push(`refusal: ${name}`);
  }
  const stale = docker(psql, preflight + contract + `
    begin;
    create temp table expected as select pg_temp.product_url_inventory() as manifest;
    update public.products set slug='changed-after-inventory' where slug='super-serum';
    ${call("(select manifest from expected)")}`, true);
  if (!stale.stderr.includes("Product URL contraction inventory changed")) throw new Error(stale.stderr);
  checks.push("refusal: stale ledger inventory");
  const result = docker(psql, preflight + contract + read("supabase/tests/catalog_identity.fixtures.sql")
    + "\nbegin; create temp table expected_catalog as select pg_temp.catalog_identity_state() as state;\n"
    + call() + `
    do $$ begin
      if pg_temp.catalog_identity_state() is distinct from (select state from expected_catalog) then
        raise exception 'Contraction changed Catalog facts or immutable history';
      end if;
      raise notice 'PASS contraction preserves every synthetic Catalog fact and historical row';
    end $$;
    commit;\n` + read(testPath));
  checks.push(...result.stderr.split("\n").filter((line) => line.includes("PASS ")).map((line) => line.split("PASS ")[1]));
  const again = docker(psql, preflight + contract + "\nbegin;\n" + call() + "commit;");
  if (!again.stdout.includes('"outcome": "already-contracted"')) throw new Error("Repeat contraction did not verify no-op.");
  checks.push("repeat contraction verifies no-op");
  if (process.argv.includes("--verify-types")) verifyGeneratedTypes();
  console.log(JSON.stringify({ status: "passed", postgres: version, checks,
    artifacts: [checkpoint,migration,preflightPath,contractPath,testPath].map((path) => ({
      path, sha256: createHash("sha256").update(read(path)).digest("hex"),
    })), scope: "unique disposable synthetic database; no provider rows, Orders, or outbound HTTP",
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
