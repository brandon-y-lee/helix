import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// Deliberately limited to this local synthetic container/database. No provider URL.
const container = "helix-spec358-pg";
const database = "catalog_t8";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const execute = (args, input) => spawnSync("docker", ["exec", "-i", container, ...args], {
  input, encoding: "utf8", cwd: root,
});
const psql = (input, target = database) => execute([
  "psql", "-X", "-U", "postgres", "-d", target, "-v", "ON_ERROR_STOP=1", "-At",
], input);
const requireSuccess = (result, label) => {
  assert.equal(result.status, 0, `${label}\n${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
};

const databaseExists = requireSuccess(psql(
  "select count(*) from pg_database where datname = 'catalog_t8';", "postgres",
), "inspect local fixture database").trim();
if (databaseExists === "0") {
  requireSuccess(execute(["createdb", "-U", "postgres", database]), "create local fixture database");
}

const filenames = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((name) => name.endsWith("_retire_catalog_v3_dispatcher.sql"));
assert.equal(filenames.length, 1, "exactly one dispatcher retirement migration");
const migration = read(`supabase/migrations/${filenames[0]}`);
const history = read("supabase/migrations/20260801052736_catalog_editor_v3_complete_field_coverage.sql");
const exactDispatcher = history.match(
  /create or replace function private\.catalog_editor_upgrade_to_v3\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(exactDispatcher, "historical dispatcher definition must be present");
const fixture = read("supabase/tests/fixtures/catalog_dispatcher_retirement.sql")
  + exactDispatcher
  + "\nrevoke all on function private.catalog_editor_upgrade_to_v3(jsonb) from public;"
  + "\nalter function private.catalog_editor_upgrade_to_v3(jsonb) volatile;";
const preservationCheck = `
do $preservation_check$
begin
  if exists (
    select 1 from preserved_dispatcher_fixture_functions expected
    left join pg_proc actual on actual.oid = to_regprocedure(expected.signature)
    where actual.oid is null
       or pg_get_functiondef(actual.oid) is distinct from expected.definition
       or actual.proacl::text is distinct from expected.privileges
  ) then
    raise exception 'retirement changed a preserved definition or ACL';
  end if;
end;
$preservation_check$;`;
const absenceCheck = `
do $absence_check$
begin
  if to_regprocedure('private.catalog_editor_upgrade_to_v3(jsonb)') is not null then
    raise exception 'retired dispatcher still exists';
  end if;
end;
$absence_check$;`;

requireSuccess(psql(`begin;\n${fixture}\n${migration}\n${absenceCheck}\n${preservationCheck}\nrollback;`),
  "exact dispatcher retirement preserves unrelated definitions and ACLs");
console.log("PASS exact dispatcher retirement preserves unrelated definitions and ACLs");
requireSuccess(psql(`begin;\n${fixture}\n${migration}\n${migration}\n${absenceCheck}\n${preservationCheck}\nrollback;`),
  "repeated retirement is a no-op");
console.log("PASS repeated retirement is a no-op");

const expectRefusal = (label, setup, message) => {
  assert.ok(!migration.includes("$migration_under_test$"));
  const expected = `'${message.replaceAll("'", "''")}'`;
  requireSuccess(psql(`begin;
${fixture}
${setup}
truncate preserved_dispatcher_fixture_functions;
insert into preserved_dispatcher_fixture_functions
select p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('private', 'public');
do $refusal_check$
declare
  v_message text;
begin
  begin
    execute $migration_under_test$${migration}$migration_under_test$;
  exception when others then
    v_message := sqlerrm;
  end;
  if v_message is distinct from ${expected} then
    raise exception 'expected refusal %, got %', ${expected}, v_message;
  end if;
end;
$refusal_check$;
${preservationCheck}
rollback;`), label);
  console.log(`PASS ${label}`);
};

expectRefusal("changed dispatcher body is preserved for review", `
create or replace function private.catalog_editor_upgrade_to_v3(p_document jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$ begin return p_document; end; $$;`, "Catalog V3 dispatcher definition changed; review required");
for (const [label, change] of [
  ["public execution grant", "grant execute on function private.catalog_editor_upgrade_to_v3(jsonb) to public;"],
  ["security mode", "alter function private.catalog_editor_upgrade_to_v3(jsonb) security invoker;"],
  ["search path", "alter function private.catalog_editor_upgrade_to_v3(jsonb) set search_path = public;"],
  ["owner", "grant usage, create on schema private to service_role; alter function private.catalog_editor_upgrade_to_v3(jsonb) owner to service_role;"],
]) {
  expectRefusal(`changed ${label} is preserved for review`, change,
    "Catalog V3 dispatcher security changed; review required");
}
expectRefusal("changed volatility is preserved for review",
  "alter function private.catalog_editor_upgrade_to_v3(jsonb) stable;",
  "Catalog V3 dispatcher definition changed; review required");
expectRefusal("a routine caller blocks retirement", `
create function public.synthetic_dispatcher_caller(jsonb) returns jsonb
language plpgsql as $$ begin return private.catalog_editor_upgrade_to_v3($1); end; $$;`,
"Catalog V3 dispatcher has routine callers; review required");
expectRefusal("a tracked dependency blocks retirement", `
create function public.synthetic_dispatcher_dependency(jsonb) returns jsonb
language sql begin atomic select private.catalog_editor_upgrade_to_v3($1); end;`,
"Catalog V3 dispatcher has tracked dependents; review required");
expectRefusal("missing historical decoder blocks retirement",
  "drop function private.catalog_editor_upgrade_v1_to_v2(jsonb);",
  "Current Catalog functions missing; review required");
expectRefusal("missing current Restore wrapper blocks retirement",
  "drop function private.catalog_editor_upgrade_to_v4_without_family(jsonb);",
  "Current Catalog functions missing; review required");
console.log(`Migration SHA256 ${createHash("sha256").update(migration).digest("hex")}`);
