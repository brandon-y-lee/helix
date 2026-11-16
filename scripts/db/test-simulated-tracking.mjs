import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// This runner has no database-URL input and only operates a labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
let database = `simulated_tracking_${process.pid}_${Date.now()}`;
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
  let output = "";
  let error = "";
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

// Independent connections demonstrate the actual database lock, rather than serial promises.
async function concurrentLocked(firstStatement, secondStatement = firstStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo tracking-contract-held
`);
    await Promise.race([until(() => first.output().includes("tracking-contract-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='simulated_tracking_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='simulated_tracking_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the simulation lock"),
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

// Hold an old-schema refund read open while the complete tracking migration and
// first activation commit elsewhere. That pre-install Order must never gain admission.
async function proveSchemaInstallationRace() {
  const previousDatabase = database;
  const installationDatabase = `${database}_install`;
  let cloned = false;
  let reader;
  let contender;
  try {
    docker(["exec", container, "createdb", "-U", "postgres", "-T", previousDatabase, installationDatabase]);
    cloned = true;
    database = installationDatabase;
    psqlArgs[8] = database;
    sql(`SELECT payment_contract_test.seed(2300);
      SELECT payment_contract_test.prepare_and_bind(2300);
      SELECT status FROM payment_contract_test.finalize(2300);
      INSERT INTO auth.users(id) VALUES(payment_contract_test.id('operator',1));
      INSERT INTO public.admin_memberships(user_id,role,active)
        VALUES(payment_contract_test.id('operator',1),'admin',true);`);
    reader = session();
    reader.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL ROLE service_role;
      SELECT public.read_checkout_payment_contract(payment_contract_test.id('order',2300),'cs_test_contract2300');
      \\echo old-refund-schema-observed
    `);
    await Promise.race([until(() => reader.output().includes("old-refund-schema-observed"), "Old-schema refund read did not complete"),
      reader.done.then(() => { throw new Error("Old-schema read exited before installation"); })]);
    const oldContract = JSON.parse(reader.output().split("\n").find((line) => line.startsWith("{")));
    assert.equal(oldContract.version, "checkout_v2");
    assert.equal(oldContract.trackingSchemaVersion, undefined, "The pre-install refund observes a valid unmarked contract");
    migration("_simulated_tracking.sql");
    assert.equal(sql(`SET ROLE service_role; SELECT public.configure_simulated_tracking(true,
      (public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);`).trim(), "t");
    contender = session();
    contender.child.stdin.end(`BEGIN; SET LOCAL application_name='tracking_install_contender';
      SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
      SELECT public.apply_simulated_shipment_event(payment_contract_test.id('operator',1),
        payment_contract_test.id('order',2300),payment_contract_test.id('install-command',2300),NULL,0,'dispatched',
        jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2300),'quantity',1)),NULL);
      COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name='tracking_install_contender' AND wait_event_type='Lock');`).trim() === "t",
    "Simulation did not wait behind the old-schema refund Order lock"),
    contender.done.then(() => { throw new Error("Simulation escaped the old refund lock"); })]);
    reader.child.stdin.end("COMMIT;\n");
    await Promise.all([reader.done, contender.done]);
    const mutation = JSON.parse(contender.output().split("\n").find((line) => line.startsWith("{")));
    assert.equal(mutation.status, "ineligible", "The permanent first-activation cutoff fences an old-schema refund");
    assert.equal(sql("SELECT count(*) FROM private.simulated_shipments;").trim(), "0");
    const newContract = JSON.parse(sql(`SET ROLE service_role; SELECT public.read_checkout_payment_contract(
      payment_contract_test.id('order',2300),'cs_test_contract2300');`));
    assert.equal(newContract.trackingSchemaVersion, 1, "Subsequent refunds receive durable schema capability evidence");
    assert.equal(sql("SELECT count(*) FROM private.checkout_payment_contracts WHERE terms ? 'trackingSchemaVersion';").trim(), "0",
      "Capability metadata does not rewrite immutable accepted terms");
  } finally {
    if (reader && !reader.child.stdin.destroyed) reader.child.stdin.end("ROLLBACK;\n");
    if (reader) await reader.done.catch(() => {});
    if (contender) await contender.done.catch(() => {});
    database = previousDatabase;
    psqlArgs[8] = database;
    if (cloned) docker(["exec", container, "dropdb", "-U", "postgres", installationDatabase]);
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
  assert.ok(paymentAssertions, "Payment contract fixture must retain its migration boundary");
  sql(paymentFixtures);
  migration("_checkout_admission.sql");
  migration("_checkout_payment_contracts.sql");
  sql(paymentAssertions);
  const [emailFixtures, emailAssertions] = source("supabase/tests/order_email_contracts.integration.sql")
    .split("-- APPLY ORDER EMAIL MIGRATION");
  assert.ok(emailAssertions, "Order email fixture must retain its migration boundary");
  sql(emailFixtures);
  migration("_order_confirmation_email.sql");
  // Re-run the existing financial assertions against the replaced finalizer.
  // Only synthetic helper declarations need CREATE OR REPLACE for this second pass.
  sql(paymentAssertions.replaceAll("CREATE FUNCTION payment_contract_test.",
    "CREATE OR REPLACE FUNCTION payment_contract_test."));
  sql(emailAssertions);

  const membershipMigration = source("supabase/migrations/20260730034330_catalog_editor_backend.sql");
  const membershipTable = membershipMigration.match(/create table public\.admin_memberships \([\s\S]*?\n\);/)[0];
  sql(membershipTable);
  sql("ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE ON public.admin_memberships TO service_role;");
  const [trackingFixtures, trackingAssertions] = source("supabase/tests/simulated_tracking.integration.sql")
    .split("-- APPLY SIMULATED TRACKING MIGRATION");
  sql(trackingFixtures);
  await proveSchemaInstallationRace();
  migration("_simulated_tracking.sql");
  // Existing financial and email public contracts must also hold after this extension.
  // One exact-projection assertion gains only the newly approved capability metadata.
  sql(paymentAssertions.replaceAll("CREATE FUNCTION payment_contract_test.",
    "CREATE OR REPLACE FUNCTION payment_contract_test.").replace(
      `recovered=contract||'{"sessionId":"cs_test_contract9"}'::jsonb`,
      `recovered=contract||'{"sessionId":"cs_test_contract9","trackingSchemaVersion":1}'::jsonb`));
  sql("UPDATE private.email_controls SET enabled=false WHERE purpose='order_confirmation';");
  sql(emailAssertions.replaceAll("CREATE FUNCTION email_contract_test.",
    "CREATE OR REPLACE FUNCTION email_contract_test."));
  sql(trackingAssertions);
  sql("SELECT tracking_test.activate();");
  const command = (n, commandNumber = n * 10) => `SELECT tracking_test.apply(${n},${commandNumber});`;
  const refund = (n) => `SELECT public.record_verified_refund_simulation_freeze(
    payment_contract_test.id('order',${n}),'cs_test_contract${n}','pi_contract${n}',3240);`;
  const result = (output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{")));
  const seed = (n) => sql(`SELECT tracking_test.seed(${n});`);
  const dispatch = (n) => result(sql(`SET ROLE service_role; ${command(n)}`));
  const trackingMessage = (n) => JSON.parse(sql(`SELECT jsonb_build_object('id',id,'recipient',recipient,
    'attemptCount',attempt_count,'firstAttemptAt',first_attempt_at,'requestPayload',request_payload,
    'state',state,'errorCode',error_code,'providerEmailId',provider_email_id,'deliveryStatus',delivery_status)
    FROM private.email_intents WHERE order_id=payment_contract_test.id('order',${n}) AND purpose='order_tracking';`));
  const claim = (n) => {
    // Keep unrelated fixture messages out of this particular dispatcher exercise.
    sql(`UPDATE private.email_intents SET state='blocked' WHERE state IN ('queued','retry','uncertain')
      AND NOT (purpose='order_tracking' AND order_id=payment_contract_test.id('order',${n}));`);
    const work = JSON.parse(sql(`SET ROLE service_role;
      SELECT public.claim_email_intents('sandbox',payment_contract_test.id('race-lease',${n}),1);`));
    assert.equal(work.length, 1);
    assert.equal(work[0].id, trackingMessage(n).id);
    return work[0];
  };
  const prepare = (n, work, isNull = false) => `SELECT public.prepare_email_attempt('${work.id}'::uuid,
    payment_contract_test.id('race-lease',${n}),
    email_contract_test.payload('synthetic@example.invalid','${work.id}'::uuid))${isNull ? " IS NULL" : ""};`;

  seed(2200);
  const allocations = await concurrentLocked(command(2200), command(2200, 2201));
  assert.deepEqual(allocations.map((out) => result(out).status), ["applied", "conflict"],
    "Two independent transactions competing for the final unit accept exactly one allocation");
  assert.equal(sql(`SELECT sum(a.quantity) FROM private.simulated_shipment_allocations a
    JOIN private.simulated_shipments s ON s.id=a.shipment_id
    WHERE s.order_id=payment_contract_test.id('order',2200);`).trim(), "1");
  const shipment = result(allocations[0]).shipmentId;
  const transitions = await concurrentLocked(
    `SELECT tracking_test.apply(2200,2202,'${shipment}'::uuid,1,'in_transit');`,
    `SELECT tracking_test.apply(2200,2203,'${shipment}'::uuid,1,'exception');`);
  assert.deepEqual(transitions.map((out) => result(out).status), ["applied", "conflict"],
    "Two transitions against the same committed revision cannot both apply");

  seed(2201);
  const replays = await concurrentLocked(command(2201, 2210));
  assert.deepEqual(replays.map((out) => result(out).status), ["applied", "replayed"],
    "Concurrent stable command replay returns the same committed event");
  assert.equal(result(replays[0]).shipmentId, result(replays[1]).shipmentId);

  seed(2202);
  const frozenTransition = await concurrentLocked(refund(2202), command(2202));
  assert.equal(result(frozenTransition[1]).status, "ineligible",
    "A transition waiting behind committed verified refund facts cannot create history or mail");
  assert.equal(sql(`SELECT count(*) FROM private.simulated_shipments
    WHERE order_id=payment_contract_test.id('order',2202);`).trim(), "0");
  assert.equal(sql(`SELECT status FROM public.orders WHERE id=payment_contract_test.id('order',2202);`).trim(), "paid",
    "The monotonic freeze protects the gap before refund side effects reconcile Order status");

  seed(2203);
  const priorTransition = await concurrentLocked(command(2203), refund(2203));
  assert.equal(result(priorTransition[0]).status, "applied");
  assert.equal(sql(`SELECT jsonb_array_length(public.read_simulated_tracking(payment_contract_test.id('order',2203))->'shipments');`).trim(), "1",
    "A transition committed before refund preserves its history");

  seed(2204); dispatch(2204);
  const work2204 = claim(2204);
  const freezeBeforePreparation = await concurrentLocked(refund(2204), prepare(2204, work2204, true));
  assert.equal(freezeBeforePreparation[1].trim(), "t",
    "A dispatcher waiting on the Order lock cannot hand off a tracking send after refund freeze");
  assert.equal(trackingMessage(2204).state, "blocked");
  assert.equal(trackingMessage(2204).errorCode, "order_refunded");
  assert.equal(trackingMessage(2204).attemptCount, 0);
  sql(`SET ROLE service_role; SELECT public.retry_email_delivery('${work2204.id}'::uuid,
    (SELECT updated_at FROM private.email_intents WHERE id='${work2204.id}'::uuid));`);
  const retried2204 = claim(2204);
  assert.equal(sql(`SET ROLE service_role; ${prepare(2204, retried2204, true)}`).trim(), "t",
    "Manual retry cannot bypass the permanent refund preparation guard");

  seed(2205); dispatch(2205);
  const work2205 = claim(2205);
  const prepareBeforeFreeze = await concurrentLocked(prepare(2205, work2205), refund(2205));
  assert.equal(result(prepareBeforeFreeze[0]).attemptCount, 1,
    "Preparation committed before refund is the handoff boundary");
  assert.equal(sql(`SET ROLE service_role; SELECT public.finish_email_attempt('${work2205.id}'::uuid,
    payment_contract_test.id('race-lease',2205),'accepted','tracking_email_2205',NULL);`).trim(), "t");
  assert.equal(sql(`SET ROLE service_role; SELECT public.record_email_delivery_event('tracking_evt_2205','sandbox',
    '${work2205.id}'::uuid,'tracking_email_2205','email.delivered',now(),
    'Helix Demo <onboarding@resend.dev>','synthetic@example.invalid');`).trim(), "matched",
    "Verified delivery callbacks for a pre-freeze handoff remain accepted history");
  assert.equal(trackingMessage(2205).deliveryStatus, "delivered");

  seed(2206); dispatch(2206);
  const work2206 = claim(2206);
  sql(`SET ROLE service_role; ${prepare(2206, work2206)}
    SELECT public.finish_email_attempt('${work2206.id}'::uuid,payment_contract_test.id('race-lease',2206),
      'uncertain',NULL,'provider_timeout');
    UPDATE private.email_intents SET next_attempt_at=now()-interval '1 second' WHERE id='${work2206.id}'::uuid;`);
  const beforeFreeze = trackingMessage(2206);
  const retry2206 = claim(2206);
  const frozenRetry = await concurrentLocked(refund(2206), prepare(2206, retry2206, true));
  assert.equal(frozenRetry[1].trim(), "t", "Every retry rechecks the refund freeze");
  const afterFreeze = trackingMessage(2206);
  assert.deepEqual([afterFreeze.attemptCount, afterFreeze.firstAttemptAt, afterFreeze.requestPayload],
    [beforeFreeze.attemptCount, beforeFreeze.firstAttemptAt, beforeFreeze.requestPayload],
    "Blocked retry preserves all possibly accepted provider attempt evidence");
  assert.equal(afterFreeze.errorCode, "order_refunded");

  seed(2207); dispatch(2207);
  const work2207 = claim(2207);
  const fallbackRefund = `SELECT public.record_checkout_payment_exception(payment_contract_test.id('order',2207),
    NULL,'cs_test_contract2207','full_refund_reconciliation_failed','pi_contract2207','refunded',3240);`;
  const fallbackRace = await concurrentLocked(fallbackRefund, prepare(2207, work2207, true));
  assert.equal(fallbackRace[1].trim(), "t",
    "Verified refund fallback also serializes with and blocks a later provider handoff");
  assert.equal(trackingMessage(2207).errorCode, "order_refunded");

  console.log(JSON.stringify({status:"passed", postgresMajor:17,
    existingPaymentAndConfirmationContractsPreserved:true,
    actualSchemaInstallationRace:true, permanentActivationCutoff:true, canonicalCommandDigest:true,
    actualConcurrentAllocation:true, actualConcurrentRevision:true, actualConcurrentReplay:true,
    actualRefundTransitionRaces:true, actualRefundPreparationRaces:true, actualRefundFallbackRace:true, refundRetryGuard:true,
    lateCallbackAfterFreeze:true, serviceOnlyRpcs:true, forcedPrivateRls:true,
    providerMutations:0}, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
