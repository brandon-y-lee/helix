import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

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
  sql(source("supabase/tests/checkpoints/checkout-current.sql"));
  loadCheckoutPaymentTestEffects(sql, source);
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  const [paymentFixtures, paymentAssertions] = source("supabase/tests/checkout_payment_contracts.integration.sql")
    .split("-- APPLY PAYMENT CONTRACT MIGRATION");
  sql(paymentFixtures);
  migration("_checkout_admission.sql");
  migration("_checkout_payment_contracts.sql");
  sql(paymentAssertions);
  const [emailFixtures, emailAssertions] = source("supabase/tests/order_email_contracts.integration.sql")
    .split("-- APPLY ORDER EMAIL MIGRATION");
  sql(emailFixtures);
  migration("_order_confirmation_email.sql");
  sql(emailAssertions);
  const membership = source("supabase/migrations/20260730034330_catalog_editor_backend.sql")
    .match(/create table public\.admin_memberships \([\s\S]*?\n\);/);
  assert.ok(membership, "Actual admin membership predecessor is required");
  sql(`${membership[0]} ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.admin_memberships FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_memberships TO service_role;`);
  sql(source("supabase/tests/simulated_tracking.integration.sql").split("-- APPLY SIMULATED TRACKING MIGRATION")[0]);
  sql(source("supabase/tests/support_intake_contracts.integration.sql").split("-- APPLY SUPPORT INTAKE MIGRATION")[0]);
  migration("_simulated_tracking.sql");
  migration("_support_intake.sql");
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
  assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE purpose IN ('welcome_initial','welcome_education');").trim(), "2",
    "Overlapping confirmation transactions enqueue exactly two welcome messages");
  const subscriberId = sql("SELECT id FROM private.marketing_subscribers;").trim();
  sql(`SET ROLE service_role;
    SELECT public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',1);`);
  const admissions = await concurrentLocked(`SELECT public.admit_marketing_contact_import('${subscriberId}',2,
    '00000000-0000-0000-0000-000000000001');`);
  const parsedAdmissions = admissions.map((out) => JSON.parse(out.split("\n").find((line) => line.startsWith("{"))));
  assert.deepEqual(parsedAdmissions.map((item) => item.allowSubmit), [true, false],
    "Only one overlapping worker may submit the one-address native import");
  const rejectedFailure = '{"category":"rate_limited","httpStatus":429,"providerName":"rate_limit_exceeded","retryAfterSeconds":1}';
  sql(`SET ROLE service_role;
    SELECT public.record_marketing_contact_import('${subscriberId}',1,'${parsedAdmissions[0].admissionToken}',null,'rate_limited','${rejectedFailure}');
    UPDATE private.marketing_contact_imports SET next_submission_at=clock_timestamp()-interval '1 second'
      WHERE subscriber_id='${subscriberId}';`);
  const dueAdmissions = await concurrentLocked(`SELECT public.admit_marketing_contact_import('${subscriberId}',2,
    '00000000-0000-0000-0000-000000000001');`);
  const parsedDueAdmissions = dueAdmissions.map((out) => JSON.parse(out.split("\n").find((line) => line.startsWith("{"))));
  assert.deepEqual(parsedDueAdmissions.map((item) => item.allowSubmit), [true, false],
    "Only one overlapping worker receives authority to submit the due retry");
  assert.equal(parsedDueAdmissions[0].admissionToken, parsedDueAdmissions[1].admissionToken);
  assert.notEqual(parsedDueAdmissions[0].admissionToken, parsedAdmissions[0].admissionToken);
  assert.equal(parsedDueAdmissions[0].attemptCount, 2);
  assert.equal(sql(`SELECT public.record_marketing_contact_import('${subscriberId}',1,
    '${parsedAdmissions[0].admissionToken}',null,'rate_limited','${rejectedFailure}');`).trim(), "f",
    "A previous attempt's result cannot control the retry after admission token rotation");
  sql(`SET ROLE service_role;
    SELECT public.record_marketing_contact_import('${subscriberId}',1,'${parsedDueAdmissions[0].admissionToken}',
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
  async function prepareWithdrawalRace({ suffix, token, preference, withdrawFirst }) {
    sql(`SET ROLE service_role; ${request(`handoff-${suffix}@example.invalid`, token)}
      SELECT public.confirm_marketing_subscription(repeat('${token}',64),repeat('${preference}',64));`);
    const recipientId = sql(`SELECT id FROM private.marketing_subscribers WHERE normalized_email='handoff-${suffix}@example.invalid';`).trim();
    const intentId = sql(`SELECT id FROM private.email_intents WHERE recipient='handoff-${suffix}@example.invalid'
      AND purpose='welcome_initial';`).trim();
    sql(`SET ROLE service_role;
      SELECT public.claim_marketing_sync('50000000-0000-0000-0000-000000000001',3);
      SELECT public.finish_marketing_sync('${recipientId}',2,'50000000-0000-0000-0000-000000000001',
        'contact_${suffix}','topic_synthetic','synced');
      SELECT public.record_marketing_provider_observation('${recipientId}',1,2,'contact_${suffix}','topic_synthetic',true,true);
      UPDATE private.email_intents SET state='leased',lease_token='50000000-0000-0000-0000-000000000002',
        lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id='${intentId}';`);
    const prepare = `SELECT public.prepare_email_attempt('${intentId}','50000000-0000-0000-0000-000000000002',
      marketing_contract_test.payload('${intentId}')) IS NOT NULL;`;
    const withdraw = `SELECT public.withdraw_marketing_subscription(repeat('${preference}',64),'global');`;
    const results = await concurrentLocked(withdrawFirst ? withdraw : prepare, withdrawFirst ? prepare : withdraw);
    assert.ok(results[withdrawFirst ? 1 : 0].split("\n").includes(withdrawFirst ? "f" : "t"),
      "Address lock serializes actual handoff against withdrawal in either ordering");
    if (withdrawFirst) {
      assert.equal(sql(`SELECT count(*) FROM private.marketing_send_reservations WHERE intent_id='${intentId}';`).trim(), "0");
      assert.equal(sql(`SELECT state||':'||(first_attempt_at IS NULL)::text FROM private.email_intents WHERE id='${intentId}';`).trim(), "blocked:true");
    } else {
      sql(`SET ROLE service_role; SELECT public.finish_email_attempt('${intentId}',
        '50000000-0000-0000-0000-000000000002','blocked',null,'marketing_not_eligible');`);
      assert.equal(sql(`SELECT state||':'||error_code FROM private.email_intents WHERE id='${intentId}';`).trim(), "uncertain:reconciliation_required");
      assert.equal(sql(`SELECT count(*) FROM private.marketing_send_reservations WHERE intent_id='${intentId}';`).trim(), "1",
        "Withdrawal never releases a possibly consumed promotional reservation");
    }
  }
  await prepareWithdrawalRace({ suffix: "prepare-first", token: "h", preference: "j", withdrawFirst: false });
  await prepareWithdrawalRace({ suffix: "withdraw-first", token: "i", preference: "k", withdrawFirst: true });
  sql(`SET ROLE service_role; DELETE FROM private.marketing_request_limits;
    DO $$ BEGIN FOR n IN 1..29 LOOP
      PERFORM public.request_marketing_subscription('global-'||n||'@example.invalid','footer','welcome_v1',
        lpad(n::text,64,'g'),repeat('b',64),true,marketing_contract_test.contract());
    END LOOP; END $$;`);
  await concurrentLocked(request("global-thirtieth@example.invalid", "t"), request("global-thirty-first@example.invalid", "u"));
  assert.equal(sql("SELECT count(*) FROM private.marketing_subscribers WHERE normalized_email LIKE 'global-%';").trim(), "30",
    "Overlapping different-address requests cannot spend the last global hourly slot twice");
  // Execute the maintained predecessor harness with this migration installed in BOTH its
  // fresh database and old-schema installation clone. Checked anchors fail on harness drift.
  let predecessor = source("scripts/db/test-support-intake-contracts.mjs");
  const importAnchor = '"./checkout-payment-test-fixture.mjs"';
  const rootAnchor = 'const root = fileURLToPath(new URL("../../", import.meta.url));';
  const migrationAnchor = 'migration("_support_intake.sql");';
  assert.equal(predecessor.split(importAnchor).length - 1, 1);
  assert.equal(predecessor.split(rootAnchor).length - 1, 1);
  assert.equal(predecessor.split(migrationAnchor).length - 1, 2);
  predecessor = predecessor.replace(importAnchor, JSON.stringify(new URL("scripts/db/checkout-payment-test-fixture.mjs", `file://${root}`).href))
    .replace(rootAnchor, `const root = ${JSON.stringify(root)};`)
    .replaceAll(migrationAnchor, `${migrationAnchor}\n  migration("_marketing_subscription_contracts.sql");`);
  const predecessorOutput = execFileSync(process.execPath, ["--input-type=module", "-", container], {
    input: predecessor, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  assert.equal(JSON.parse(predecessorOutput).status, "passed", "All prior contracts must pass after the marketing extension");
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, explicitConsentRequired: true,
    normalizedAddressConcurrency: true, actualConcurrentConfirmation: true, predecessorContractsAndRaces: true,
    currentGenerationOnly: true, expiredTokenRejected: true, oldPreferenceWithdrawsCurrent: true,
    immutableEvidence: true, immutableTemplateContract: true, sharedAbuseBounds: true, actualConcurrentGlobalLimit: true,
    generationFencing: true, sanitizedImportFailureEvidence: true, providerDenialSticky: true, withdrawalQueuePositionPreserved: true, actualConcurrentCapacity: true, actualConcurrentHandoffWithdrawal: true, actualConcurrentImportAdmission: true, actualConcurrentDueImportRetry: true, privateForcedRls: true,
    serviceOnlyRpcs: true, providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
