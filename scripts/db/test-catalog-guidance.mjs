import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { deepStrictEqual } from "node:assert";
import { verifyGuidanceDraftIsolation } from "../../supabase/tests/catalog_guidance_isolation.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable local PostgreSQL 17 container>.");
}
const extraMigrations = process.argv.filter((arg) => arg.startsWith("--migration="))
  .map((arg) => arg.slice(12));
if (extraMigrations.some((path) => !/^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(path))) {
  throw new Error("Additional migrations must be repository migration paths.");
}
function docker(args, input, onDiagnostics) {
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
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
const database = `helix_catalog_guidance_${randomBytes(8).toString("hex")}`;
const checkpoint = "supabase/tests/checkpoints/catalog-current-20260909042518.sql";
const identityMigration = "supabase/migrations/20260914051153_catalog_restore_current_identity.sql";
const migration = "supabase/migrations/20260914062650_catalog_reviewed_guidance.sql";
const fixtures = "supabase/tests/catalog_identity.fixtures.sql";
const tests = "supabase/tests/catalog_guidance.integration.sql";
const preexistingReady = "supabase/tests/catalog_guidance.preexisting-ready.sql";
const operation = "supabase/operations/prepare_reviewed_product_guidance.sql";
const preflight = "supabase/operations/reviewed_product_guidance_preflight.sql";
const preparationTests = "supabase/tests/catalog_guidance_preparation.integration.sql";
const files = [checkpoint, identityMigration, ...extraMigrations, fixtures, migration, tests,
  preexistingReady, operation, preflight, preparationTests,
  "supabase/tests/catalog_guidance_isolation.mjs", "supabase/tests/catalog_sql_session.mjs"];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
const checks = [];
const collect = (diagnostics) => checks.push(...diagnostics.split("\n")
  .filter((line) => line.includes("PASS ")).map((line) => line.slice(line.indexOf("PASS ") + 5)));
let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const version = docker(psql, "show server_version;").trim();
  if (!version.startsWith("17.")) throw new Error("Catalog checkpoint tests require PostgreSQL 17.");
  const roles = JSON.parse(docker(psql, "select jsonb_object_agg(rolname,rolbypassrls) from pg_roles where rolname in ('anon','authenticated','service_role');").trim());
  if (roles.anon !== false || roles.authenticated !== false || roles.service_role !== true) {
    throw new Error("Catalog tests require the documented Supabase PostgreSQL image roles.");
  }
  docker(psql, [checkpoint, identityMigration, ...extraMigrations].map(read).join("\n"));
  const preservedRoutines = "'public.restore_catalog_product_revision(uuid,uuid)'::regprocedure,'public.transition_catalog_product_draft(uuid,bigint,text,jsonb,uuid)'::regprocedure";
  const securityMetadataSql = `select jsonb_object_agg(oid::regprocedure::text,
    jsonb_build_object('securityDefiner',prosecdef,'configuration',proconfig,'acl',proacl::text))
    from pg_proc where oid in (${preservedRoutines});`;
  const beforeSecurity = JSON.parse(docker(psql, securityMetadataSql).trim());
  // Seed the already-Ready draft before installing the contract in each rolled
  // back transaction. No production trigger is disabled to manufacture a case.
  for (const steps of ["null", '"paragraph"', '"{}"', '[" "]', '["\\t\\n"]', "[123]", "[null]", "[{}]"]) {
    const setup = `begin;\n${read(fixtures)}\nselect pg_temp.seed_catalog_identity('super-serum','Super Serum');
      insert into public.product_content_drafts(product_id,schema_version,base_revision,version,document,status,validation_errors,created_by,updated_by)
      values ('10000000-0000-4000-8000-000000000101',4,1,1,
        jsonb_set(public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101'),
          '{productPdpContent,how_to_use_steps}', '${steps}'::jsonb), 'ready','[]',
        '10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901');`;
    docker(psql, [setup, read(migration), read(preexistingReady), "rollback;"].join("\n"), collect);
  }
  const preflightFunction = `create function pg_temp.capture_guidance_preflight() returns jsonb
    language sql as $guidance_preflight$\n${read(preflight)}\n$guidance_preflight$;`;
  docker(psql, [read(migration), read(fixtures), read(tests), read(operation),
    preflightFunction, read(preparationTests)].join("\n"), collect);
  deepStrictEqual(JSON.parse(docker(psql, securityMetadataSql).trim()), beforeSecurity,
    "Surgical Restore/audit edits must preserve function authority, grants and configuration");
  const functionDefinitions = JSON.parse(docker(psql, `select jsonb_object_agg(oid::regprocedure::text,
    encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')) from pg_proc where oid in (
      ${preservedRoutines},'private.catalog_guidance_validation_errors(jsonb)'::regprocedure,
      'private.catalog_restore_guidance(jsonb,jsonb)'::regprocedure,
      'private.enforce_catalog_draft_guidance()'::regprocedure);`).trim());
  const draftIsolation = await verifyGuidanceDraftIsolation({
    container, checkpoint: read(checkpoint), identityMigration: read(identityMigration),
    extraMigrations: extraMigrations.map(read), fixtures: read(fixtures),
    guidanceMigration: read(migration), operationSql: read(operation), docker,
  });
  console.log(JSON.stringify({
    status: "passed", postgres: version,
    executed: files.map((path) => ({ path, sha256: createHash("sha256").update(read(path)).digest("hex") })),
    checks, draftIsolation, functionDefinitionSha256: functionDefinitions,
    scope: "isolated synthetic Catalog; no provider data or outbound delivery",
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
