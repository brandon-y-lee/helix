import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No database URL is accepted: this runner owns one ephemeral synthetic local database.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `marketing_contracts_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
const migration = (suffix) => {
  const matches = migrations.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix} migration`);
  sql(source(`supabase/migrations/${matches[0]}`));
};

function session() {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(error)));
  });
  return { child, done, output: () => output };
}

async function until(predicate, description) {
  const deadline = Date.now() + 8_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, description);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function concurrentLocked(firstStatement, secondStatement = firstStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo marketing-held
`);
    await Promise.race([until(() => first.output().includes("marketing-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='marketing_contract_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='marketing_contract_contender'
      AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the shared marketing lock"),
    second.done.then(() => { throw new Error("Contender escaped before the first transaction committed"); })]);
    first.child.stdin.end("COMMIT;\n");
    await Promise.all([first.done, second.done]);
    return [first.output(), second.output()];
  } finally {
    if (!first.child.stdin.destroyed) first.child.stdin.end("ROLLBACK;\n");
    await first.done.catch(() => {});
    if (second) await second.done.catch(() => {});
  }
}
assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(),
  "spec358-synthetic-sql", "Refusing a container without the synthetic-test label");
let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  assert.equal(sql("SELECT current_setting('server_version_num')::integer / 10000;").trim(), "17");
  sql(`CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;
    GRANT USAGE ON SCHEMA private TO service_role;
    CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    GRANT USAGE ON SCHEMA extensions TO service_role;`);
  const [fixtures, assertions] = source("supabase/tests/marketing_subscription_contracts.integration.sql")
    .split("-- APPLY MARKETING SUBSCRIPTION MIGRATION");
  assert.ok(assertions, "Marketing fixture must retain its migration boundary");
  sql(fixtures);
  migration("_marketing_subscription_contracts.sql");
  sql(assertions);
  const request = (email, token) => `SELECT public.request_marketing_subscription('${email}',
    'footer','welcome_v1',repeat('${token}',64),repeat('b',64),true,marketing_contract_test.contract());`;
  await concurrentLocked(request("parallel@example.invalid", "a"), request("PARALLEL@example.invalid", "b"));
  assert.equal(sql("SELECT count(*) FROM private.marketing_subscribers;").trim(), "1",
    "Overlapping normalized-address requests create only one subscriber");
  assert.equal(sql("SELECT count(*) FROM private.marketing_confirmation_tokens;").trim(), "1",
    "Overlapping requests issue one bounded confirmation occurrence");
  await concurrentLocked(`SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));`,
    `SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('q',64));`);
  assert.equal(sql("SELECT count(*) FROM private.marketing_consent_evidence WHERE event='confirmed';").trim(), "1",
    "Overlapping confirmation connections activate the generation once");
  assert.equal(sql("SELECT count(*) FROM private.marketing_preference_tokens;").trim(), "1");
  const subscriberId = sql("SELECT id FROM private.marketing_subscribers;").trim();
  sql(`SET ROLE service_role;
    SELECT public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',1);`);
  const admissions = await concurrentLocked(`SELECT public.admit_marketing_contact_import('${subscriberId}',2,
    '00000000-0000-0000-0000-000000000001');`);
  const parsedAdmissions = admissions.map((out) => JSON.parse(out.split("\n").find((line) => line.startsWith("{"))));
  assert.deepEqual(parsedAdmissions.map((item) => item.allowSubmit), [true, false],
    "Only one overlapping worker may submit the one-address native import");
  sql(`SET ROLE service_role;
    SELECT public.record_marketing_contact_import('${subscriberId}',1,'${parsedAdmissions[0].admissionToken}',
      '20000000-0000-0000-0000-000000000001','submitted');
    SELECT public.claim_marketing_contact_imports('00000000-0000-0000-0000-000000000002',1);
    SELECT public.finish_marketing_contact_import('${subscriberId}',1,'00000000-0000-0000-0000-000000000002','completed');
    SELECT public.finish_marketing_sync('${subscriberId}',2,'00000000-0000-0000-0000-000000000001',
      'contact_parallel','topic_synthetic','synced');
    SELECT public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',1);`);
  sql(`SET ROLE service_role; SELECT public.finish_marketing_sync('${subscriberId}',2,'00000000-0000-0000-0000-000000000001',
      'contact_parallel','topic_synthetic','synced');
    SELECT public.record_marketing_provider_observation('${subscriberId}',1,2,'contact_parallel','topic_synthetic',true,true);`);
  const reserve = (id) => `SELECT private.reserve_marketing_capacity('${subscriberId}',1,2,
    '10000000-0000-0000-0000-${id}','welcome_initial',clock_timestamp(),null,false);`;
  const reservationResults = await concurrentLocked(reserve("000000000001"), reserve("000000000002"));
  assert.deepEqual(reservationResults.map((out) => JSON.parse(out.split("\n").find((line) => line.startsWith("{"))).eligible),
    [true, false], "Overlapping independent workers cannot spend the same daily promotional capacity twice");
  assert.equal(sql("SELECT count(*) FROM private.marketing_send_reservations;").trim(), "1");
  sql(`SET ROLE service_role; DELETE FROM private.marketing_request_limits;
    DO $$ BEGIN FOR n IN 1..29 LOOP
      PERFORM public.request_marketing_subscription('global-'||n||'@example.invalid','footer','welcome_v1',
        lpad(n::text,64,'g'),repeat('b',64),true,marketing_contract_test.contract());
    END LOOP; END $$;`);
  await concurrentLocked(request("global-thirtieth@example.invalid", "t"), request("global-thirty-first@example.invalid", "u"));
  assert.equal(sql("SELECT count(*) FROM private.marketing_subscribers WHERE normalized_email LIKE 'global-%';").trim(), "30",
    "Overlapping different-address requests cannot spend the last global hourly slot twice");
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, explicitConsentRequired: true,
    normalizedAddressConcurrency: true, actualConcurrentConfirmation: true,
    currentGenerationOnly: true, expiredTokenRejected: true, oldPreferenceWithdrawsCurrent: true,
    immutableEvidence: true, immutableTemplateContract: true, sharedAbuseBounds: true, actualConcurrentGlobalLimit: true,
    generationFencing: true, providerDenialSticky: true, withdrawalQueuePositionPreserved: true, actualConcurrentCapacity: true, actualConcurrentImportAdmission: true, privateForcedRls: true,
    serviceOnlyRpcs: true, providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
