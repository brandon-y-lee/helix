import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  PAYMENT_SCHEDULER_BASE_INVENTORY_SQL,
  PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL,
  parseSchedulerBaseInventory,
  parseSchedulerInstalledInventory,
  type SchedulerBaseInventory,
} from "../payments/scheduler-inventory";

// A unique local database with inert provider fixtures. No extension install,
// cluster configuration change, actual cron scheduling or HTTP request occurs.
const container = process.argv[2] ?? "helix-spec358-pg";
const suffix = `${process.pid}_${Date.now()}`;
const database = `payment_scheduler_${suffix}`;
const roles = ["anon", "authenticated", "service_role", "group_a", "group_b"]
  .map((name) => `scheduler_${name}_${suffix}`);
const docker = (args: string[], input?: string) => execFileSync("docker", args, {
  encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
});
const sql = (input: string) => docker(["exec", "-i", container, "psql", "-X",
  "-h", "127.0.0.1", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], input);
const isolateRoles = (input: string) => input
  .replaceAll("'anon'", `'${roles[0]}'`)
  .replaceAll("'authenticated'", `'${roles[1]}'`)
  .replaceAll("'service_role'", `'${roles[2]}'`);
const baseQuery = isolateRoles(PAYMENT_SCHEDULER_BASE_INVENTORY_SQL);
const readBase = (): SchedulerBaseInventory => {
  const raw = JSON.parse(sql(baseQuery));
  assert.equal(raw.databaseName, database);
  // The production parser correctly rejects arbitrary database names. Only this
  // synthetic harness maps its already-verified temporary name to the contract.
  return parseSchedulerBaseInventory([{ inventory: { ...raw, databaseName: "postgres" } }]);
};
const readInstalled = () => parseSchedulerInstalledInventory([
  { inventory: JSON.parse(sql(PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL)) },
]);
const original = readFileSync(new URL("../payments/scheduler.sql", import.meta.url), "utf8");
const extensionGuard = `(SELECT count(*) FROM pg_extension
      WHERE extname IN ('pg_net', 'supabase_vault', 'pg_cron')) <> 3`;
assert.ok(original.includes(extensionGuard));
const template = isolateRoles(original)
  .replace("current_database() <> 'postgres'", `current_database() <> '${database}'`)
  .replace(extensionGuard, "false /* inert provider fixtures, not installed extensions */");

function rejects(statement: string, pattern: RegExp) {
  let message = "";
  try { sql(statement); } catch (error) {
    message = String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  assert.match(message, pattern);
}

assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(),
  "spec358-synthetic-sql", "Refusing a container without the isolated-test label");
let created = false;
let createdRoles = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  assert.equal(sql("select current_setting('server_version_num')::integer / 10000;").trim(), "17");
  const empty = readBase();
  assert.equal(empty.installedRelationsPresent, false);
  assert.ok(empty.extensions.every((extension) => extension.installedVersion === null));
  rejects(isolateRoles(original).replace("current_database() <> 'postgres'", `current_database() <> '${database}'`),
    /prerequisites are missing/);

  sql(roles.map((role) => `create role ${role} nologin;`).join("\n"));
  createdRoles = true;
  sql(`
    create schema private; create schema net; create schema vault;
    create schema cron; create schema supabase_functions;
    create sequence net.http_request_queue_id_seq;
    create table net.http_request_queue (
      id bigint default nextval('net.http_request_queue_id_seq'), method text,
      url text, headers jsonb, body bytea, timeout_milliseconds integer);
    create table net._http_response (id bigint, content text);
    create table vault.secrets (name text, secret text);
    create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
    create table cron.job (jobid bigserial primary key, jobname text,
      schedule text, command text, username text default 'postgres',
      database text default 'postgres', nodename text default 'localhost',
      nodeport integer default 5432, active boolean default true);
    create table cron.job_run_details (jobid bigint, command text, return_message text);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint
      language plpgsql security definer set search_path = net as $$ declare result bigint; begin
        insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds)
        values ('POST',url,headers,convert_to(body::text,'UTF8'),timeout_milliseconds) returning id into result;
        return result;
      end $$;
    create function net._http_collect_response(request_id bigint, async boolean default true)
      returns text language sql security definer set search_path = net
      as $$ select content from net._http_response where id=request_id $$;
    create function supabase_functions.http_request() returns trigger
      language plpgsql security definer set search_path = supabase_functions as $$ begin
        perform net.http_post(url := 'https://fixture.invalid/catalog', body := '{}'::jsonb);
        return new;
      end $$;
    create table public.catalog_fixture(id integer);
    create function public.scheduler_fixture_review() returns integer
      language sql security definer set search_path = pg_catalog as $$ select 1 $$;
    create trigger helix_catalog_search_sync_fixture after insert on public.catalog_fixture
      for each row execute function supabase_functions.http_request();
    create function vault.create_secret(value text) returns void language sql security definer
      set search_path = pg_catalog as $$ insert into vault.secrets values ('fixture',value) $$;
    create function cron.schedule(job_name text,schedule text,command text) returns bigint
      language plpgsql set search_path = pg_catalog as $$ declare result bigint; begin
        insert into cron.job(jobname,schedule,command) values (job_name,schedule,command) returning jobid into result;
        return result;
      end $$;
    create function cron.alter_job(job_id bigint,schedule text default null,command text default null,
      database text default null,username text default null,active boolean default null)
      returns void language plpgsql set search_path = pg_catalog as $$ begin
        update cron.job set active=alter_job.active where jobid=job_id;
      end $$;
    grant usage on schema net,vault,cron,private,supabase_functions to public;
    grant all on all tables in schema net,vault,cron to public;
    grant all on sequence net.http_request_queue_id_seq to public;
    grant select(headers),update(url) on net.http_request_queue to ${roles[0]};
  `);
  assert.ok(readBase().unsafeTablePrivileges > 0);
  assert.ok(readBase().unsafeColumnPrivileges > 0);
  sql(template);
  const hardened = readBase();
  for (const [key, value] of Object.entries(hardened)) {
    if (key.startsWith("unsafe")) assert.equal(value, 0, key);
  }
  assert.equal(hardened.wrapperContractMatches, true);
  assert.equal(hardened.catalogExecutionPreserved, true);
  assert.equal(hardened.catalogTriggerCount, 1);
  assert.ok(hardened.customDefinerSignatures.includes("public.scheduler_fixture_review()"));
  assert.deepEqual(readInstalled(), { jobCount: 1, matchingJobCount: 1, activeJobCount: 0,
    otherPaymentJobCount: 0, secretCount: 0, secretShapeValid: false });
  assert.equal(sql("select count(*) from net.http_request_queue;").trim(), "0");
  sql(template);
  assert.equal(readInstalled().jobCount, 1);
  for (const role of roles.slice(0, 3)) {
    for (const query of [
      "select headers from net.http_request_queue;", "select * from vault.decrypted_secrets;",
      "update net.http_request_queue set url='https://fixture.invalid/redirect';",
      "select nextval('net.http_request_queue_id_seq');",
      "select net._http_collect_response(1);", "select vault.create_secret('fixture');",
      "select private.wake_sandbox_payment_worker();", "select * from cron.job;",
    ]) rejects(`set role ${role}; ${query}`, /permission denied/);
  }
  rejects("select private.wake_sandbox_payment_worker();", /could not queue a wakeup/);
  assert.equal(sql("select count(*) from net.http_request_queue;").trim(), "0");
  sql("insert into public.catalog_fixture values (1);");
  assert.equal(sql("select count(*) from net.http_request_queue where url='https://fixture.invalid/catalog';").trim(), "1");
  // A deliberately recognizable synthetic value, never a real credential.
  sql("insert into vault.secrets values ('helix_sandbox_payment_worker_secret', repeat('A',43));");
  assert.equal(readInstalled().secretShapeValid, true);
  sql("select private.wake_sandbox_payment_worker();");
  assert.equal(sql(`select count(*) from net.http_request_queue where
    url='https://helixskin.vercel.app/api/internal/payments/reconcile'
    and timeout_milliseconds=50000 and headers->>'Authorization'='Bearer '||repeat('A',43)
    and body=convert_to('{}','UTF8');`).trim(), "1");

  sql(`insert into cron.job(jobname,schedule,command) values
    (null,'* * * * *','select private.wake_sandbox_payment_worker();');`);
  assert.equal(readInstalled().otherPaymentJobCount, 1);
  rejects(template, /requires reconciliation/);
  sql("delete from cron.job where jobname is null;");

  sql(`grant select(headers) on net.http_request_queue to ${roles[4]};
    grant ${roles[4]} to ${roles[3]} with inherit false, set true;
    grant ${roles[3]} to ${roles[0]} with inherit false, set false, admin true;`);
  assert.ok(readBase().unsafeColumnPrivileges > 0, "Composed ADMIN then SET access must be discovered");
  rejects(template, /retains protected scheduler data privileges/);
  sql(`revoke ${roles[3]} from ${roles[0]}; revoke ${roles[4]} from ${roles[3]};
    revoke select(headers) on net.http_request_queue from ${roles[4]};`);

  sql(`grant ${roles[3]} to postgres with set true;
    grant create on schema net to ${roles[3]};
    alter sequence net.http_request_queue_id_seq owner to ${roles[3]};
    revoke all on sequence net.http_request_queue_id_seq from ${roles[3]};
    grant ${roles[3]} to ${roles[0]} with inherit false, set true;`);
  assert.ok(readBase().unsafeRoleMemberships > 0, "Intrinsic ownership survives a self-revoke");
  rejects(template, /privileged scheduler owner/);
  sql(`alter sequence net.http_request_queue_id_seq owner to postgres;
    grant all on sequence net.http_request_queue_id_seq to postgres;
    revoke ${roles[3]} from ${roles[0]};
    revoke create on schema net from ${roles[3]};`);

  sql(`create view public.scheduler_leak as select headers from net.http_request_queue;
    grant select on public.scheduler_leak to ${roles[0]};`);
  assert.ok(readBase().unsafeViews > 0);
  rejects(template, /view of scheduler data/);
  sql("drop view public.scheduler_leak;");
  sql(`create function net.http_post(id integer) returns text language sql security definer
    set search_path = pg_catalog as $$ select secret from vault.secrets limit 1 $$;`);
  assert.ok(readBase().unsafeDefinerWrappers > 0, "A custom overload is not a trusted provider sender");
  rejects(template, /security definer references scheduler data/);
  sql("drop function net.http_post(integer);");
  sql("alter function private.wake_sandbox_payment_worker() security definer;");
  assert.equal(readBase().wrapperContractMatches, false);
  rejects(template, /wrapper differs/);
  sql("alter function private.wake_sandbox_payment_worker() security invoker;");
  sql(`alter function net.http_post(text,jsonb,jsonb,jsonb,integer) rename to http_post_original;
    create function net.http_post(target text,body jsonb default '{}',params jsonb default '{}',
      headers jsonb default '{}',timeout_milliseconds integer default 5000) returns bigint
      language sql security definer set search_path = net as $$ select 1::bigint $$;`);
  assert.equal(readBase().functions.find((fn) => fn.signature.startsWith("net.http_post("))?.exists, false);
  rejects(template, /function signature differs/);
  sql(`drop function net.http_post(text,jsonb,jsonb,jsonb,integer);
    alter function net.http_post_original(text,jsonb,jsonb,jsonb,integer) rename to http_post;`);
  sql(template);
  assert.equal(readInstalled().activeJobCount, 0);
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, fixture: "inert provider interfaces",
    absentExtensionsSafe: true, inactivePreparation: true, repeatedPreparation: true,
    ordinaryRoleDenial: true, composedRoleDenial: true, protectedOwnerDenial: true,
    dependentViewDenial: true, unnamedJobDriftDenied: true, catalogFixturePreserved: true,
    realProviderExtensionsVerified: false, realHttpRequests: 0, remoteMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
  if (createdRoles) docker(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-Atq"], roles.map((role) => `drop role ${role};`).join("\n"));
}
