import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// No credentials, URL, hosted SQL or provider network. Never start/remove a container or alter shared roles.
const container = "helix-spec358-pg";
const expectedImage = "public.ecr.aws/supabase/postgres:17.6.1.159";
const database = `production_support_528_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const args = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification";
const sql = (input) => {
  try { return docker(args, { input }).trim(); }
  catch (error) {
    const assertion = String(error.stderr ?? "").match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1];
    throw new Error(assertion ?? `Disposable production support SQL failed during ${stage}`);
  }
};
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
function session() {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Disposable connection could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Disposable concurrent connection failed")));
  });
  return { child, done, output: () => output };
}
async function until(predicate, message) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function concurrent(firstInput, secondInput = firstInput) {
  const first = session(); let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role;\n${firstInput}\n\\echo support-528-held\n`);
    await Promise.race([until(() => first.output().includes("support-528-held"), "First transaction barrier timed out"), first.done.then(() => { throw new Error("First transaction escaped barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='support_528_contender'; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role;\n${secondInput}\nCOMMIT;`);
    await Promise.race([until(() => sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='support_528_contender' AND wait_event_type='Lock');") === "t", "Contender must actually wait on a SQL lock"), second.done.then(() => { throw new Error("Contender did not overlap"); })]);
    first.child.stdin.end("COMMIT;\n"); await Promise.all([first.done, second.done]);
    return [first.output(), second.output()].map((output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{"))));
  } finally {
    if (!first.child.stdin.destroyed) first.child.stdin.end("ROLLBACK;\n");
    await first.done.catch(() => {}); if(second) await second.done.catch(() => {});
  }
}
// A real locked expired row must not stall either the bounded batch or a useful claim.
async function proveBoundedBacklog() {
  sql(`UPDATE support_production_private.contract SET global_hour_limit=10000;
    UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()+interval '1 day'
      WHERE state IN ('queued','leased','unknown');
    SELECT production_support_test.submit(n,'{"photos":[]}'::jsonb) FROM generate_series(2000,2025) n;
    UPDATE support_production_private.outbox SET first_attempt_at=clock_timestamp()-interval '21 hours',attempt_count=1,state='unknown'
      WHERE inquiry_id IN (SELECT id FROM support_production_private.inquiries WHERE submission_id IN
        (SELECT md5('submission'||n)::uuid FROM generate_series(2000,2025) n));`);
  const lockedId = sql("SELECT id FROM support_production_private.outbox WHERE state='unknown' AND first_attempt_at<clock_timestamp()-interval '20 hours' ORDER BY first_attempt_at,id LIMIT 1;");
  const receipt = JSON.parse(sql(`SELECT production_support_test.submit(2100,'{"photos":[]}'::jsonb);`));
  const reader = session(); let worker;
  try {
    reader.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s';
      SELECT id FROM support_production_private.outbox WHERE id='${lockedId}'::uuid FOR UPDATE;
      \\echo support-backlog-held\n`);
    await Promise.race([until(() => reader.output().includes("support-backlog-held"), "Expired lock barrier timed out"), reader.done.then(() => { throw new Error("Expired lock escaped barrier"); })]);
    worker = session();
    worker.child.stdin.end(`SET ROLE service_role; SELECT public.claim_support_prod_outbox(
      production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));`);
    // The expired-row transaction is still open while this awaited worker completes.
    let workerDeadline;
    try {
      await Promise.race([worker.done, new Promise((_, reject) => {
        workerDeadline = setTimeout(() => reject(new Error("Locked expired row blocked useful work")), 10000);
      })]);
    } finally { clearTimeout(workerDeadline); }
    const claim = JSON.parse(worker.output().split("\n").find((line) => line.startsWith("{")));
    assert.equal(claim.outboxId, receipt.outboxId);
    assert.equal(sql("SELECT count(*) FROM support_production_private.outbox WHERE state='unknown' AND first_attempt_at<clock_timestamp()-interval '20 hours';"), "6", "Exactly twenty of twenty-six expired rows reconcile per invocation");
    assert.equal(sql(`SELECT state FROM support_production_private.outbox WHERE id='${lockedId}'::uuid;`), "unknown", "Locked expired row remains untouched");
    reader.child.stdin.end("COMMIT;\n"); await reader.done;
    sql("SET ROLE service_role; SELECT public.claim_support_prod_outbox(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid(),'leaseSeconds',120)));");
    assert.equal(sql(`SELECT state FROM support_production_private.outbox WHERE id='${lockedId}'::uuid;`), "reconciliation", "Later invocation reconciles released row");
    assert.equal(sql("SELECT count(*) FROM support_production_private.outbox WHERE state='unknown' AND first_attempt_at<clock_timestamp()-interval '20 hours';"), "0");
  } finally {
    if (!reader.child.stdin.destroyed) reader.child.stdin.end("ROLLBACK;\n");
    await reader.done.catch(() => {}); if (worker) await worker.done.catch(() => {});
  }
}
let created = false;
try {
  assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(), "spec358-synthetic-sql");
  assert.equal(docker(["inspect", "-f", "{{.Config.Image}}", container]).trim(), expectedImage);
  assert.equal(docker(["inspect", "-f", "{{.State.Running}}", container]).trim(), "true");
  docker(["exec", container, "createdb", "-U", "postgres", database]); created = true;
  assert.equal(sql("SELECT current_setting('server_version_num')::integer / 10000;"), "17");
  assert.equal(sql("SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role';"), "t");
  stage = "application roles rejected by exact installer guard";
  const installSource = source("supabase/operations/support-production/install.sql");
  const installerGuard = installSource.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)?.[0];
  assert.ok(installerGuard, "Expected the real installer guard before schema creation");
  // Run the exact source guard without CREATE statements. Failure must be its explicit
  // guard exception, never a missing schema/database CREATE privilege or altered host role.
  for (const actor of ["anon", "authenticated", "service_role", "authenticator"]) {
    sql(`DO $proof$ DECLARE blocked boolean := false; BEGIN
      SET LOCAL ROLE ${actor};
      BEGIN EXECUTE $installer$${installerGuard}$installer$;
      EXCEPTION WHEN raise_exception THEN blocked := SQLERRM = 'support_install_requires_trusted_operator'; END;
      RESET ROLE;
      IF NOT blocked THEN RAISE EXCEPTION 'Assertion failed: application role bypassed explicit installer guard'; END IF;
    END $proof$;`);
  }
  stage = "disabled package installation";
  sql(installSource);
  sql(source("supabase/tests/production-support.contracts.sql"));
  stage = "SQL assertions";
  sql(source("supabase/tests/production-support.assertions.sql"));
  stage = "separately installed legacy resolver";
  sql(source("supabase/operations/support-production/legacy-alias-resolver.sql"));
  sql(source("supabase/tests/production-support.legacy-alias.sql"));
  stage = "bounded expired backlog with actual locked row";
  await proveBoundedBacklog();
  stage = "concurrent stable submission";
  const same = await concurrent("SELECT production_support_test.submit(1000);", "SELECT production_support_test.submit(1000,jsonb_build_object('sourceHash',repeat('c',64)));" );
  assert.deepEqual(same[0], same[1]);
  assert.equal(sql("SELECT count(*) FROM support_production_private.inquiries WHERE submission_id=md5('submission1000')::uuid;"), "1");
  assert.equal(sql("SELECT count(*) FROM support_production_private.abuse_windows WHERE kind='source' AND digest=repeat('c',64);"), "0");
  stage = "concurrent conflicting submission";
  const conflict = await concurrent("SELECT production_support_test.submit(1001);", "SELECT production_support_test.try_submit(1001,'{\"body\":\"Different synthetic text\"}');");
  assert.equal(conflict[1].error, "support_submission_conflict");
  stage = "concurrent hard capacity";
  sql("UPDATE support_production_private.contract SET capacity_bytes=reserved_bytes+14680064;");
  const capacity = await concurrent("SELECT production_support_test.submit(1002);", "SELECT production_support_test.try_submit(1003);");
  assert.equal(capacity[0].status, "saved"); assert.equal(capacity[1].error, "support_capacity_exhausted");
  stage = "concurrent source limit";
  sql("UPDATE support_production_private.contract SET capacity_bytes=1073741824,source_hour_limit=1;");
  const sourceLimit = await concurrent("SELECT production_support_test.submit(1006);", "SELECT production_support_test.try_submit(1007,jsonb_build_object('sourceHash',production_support_test.input(1006)->>'sourceHash'));" );
  assert.equal(sourceLimit[0].status,"saved"); assert.equal(sourceLimit[1].error,"support_rate_limited");
  stage = "concurrent email limit";
  sql("UPDATE support_production_private.contract SET source_hour_limit=10000,email_hour_limit=1;");
  const emailLimit = await concurrent("SELECT production_support_test.submit(1008);", "SELECT production_support_test.try_submit(1009,jsonb_build_object('emailHash',production_support_test.input(1008)->>'emailHash'));" );
  assert.equal(emailLimit[0].status,"saved"); assert.equal(emailLimit[1].error,"support_rate_limited");
  stage = "concurrent global limit";
  sql("UPDATE support_production_private.contract SET email_hour_limit=10000;");
  sql("UPDATE support_production_private.contract SET capacity_bytes=1073741824, global_hour_limit=(SELECT used+1 FROM support_production_private.abuse_windows WHERE kind='global' AND window_at=date_trunc('hour',clock_timestamp()));");
  const limited = await concurrent("SELECT production_support_test.submit(1004);", "SELECT production_support_test.try_submit(1005);");
  assert.equal(limited[0].status, "saved"); assert.equal(limited[1].error, "support_rate_limited");
  console.log(JSON.stringify({status:"passed",postgresMajor:17,disabledByDefault:true,separatePrivateSchema:true,
    forcedRlsAndBypassRoleDenied:true,applicationRolesExplicitlyDeniedInstallation:true,atomicTextDeclarationOutbox:true,worstCaseReservation:true,
    actualConcurrentSameIdentity:true,actualConcurrentConflict:true,actualConcurrentCapacity:true,
    actualConcurrentGlobalLimit:true,actualConcurrentSourceLimit:true,actualConcurrentEmailLimit:true,independentLimits:true,transactionRollback:true,
    legacyExactHashResolver:true,legacyResolverUnauthorizedDenial:true,
    frozenProviderBytes:true,permanentFirstAttempt:true,leaseFencing:true,unknown20HourHold:true,
    boundedReconciliationBatch20:true,actualLockedExpiredRowSkipped:true,laterExpiredReconciliation:true,
    earlyAndPausedCallbacks:true,immutableProviderAndRfcBindings:true,providerMutations:0},null,2));
} catch (error) {
  console.error(JSON.stringify({status:"failed",stage,message:error.message,providerMutations:0})); process.exitCode=1;
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
