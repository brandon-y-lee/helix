import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// No database URL or provider credentials: only the explicitly labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
let database = `support_intake_contracts_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification";
const sql = (input) => {
  try { return docker(psqlArgs, { input }); }
  catch (error) {
    // SQL details can include customer-like values. Emit only our literal assertion description.
    const assertion = String(error.stderr ?? "").match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1];
    throw new Error(assertion ?? `Disposable support SQL failed during ${stage}`);
  }
};
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
const migration = (suffix) => {
  const matches = migrations.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix} migration`);
  stage = suffix;
  sql(source(`supabase/migrations/${matches[0]}`));
};

function session() {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Disposable support connection could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Disposable support connection failed")));
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

// Keep one real transaction open, observe another connection blocked on its lock, then commit.
async function concurrentLocked(firstStatement, secondStatement = firstStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo support-contract-held
`);
    await Promise.race([until(() => first.output().includes("support-contract-held"), "First support transaction barrier timed out"),
      first.done.then(() => { throw new Error("First support transaction exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='support_contract_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='support_contract_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Support contender did not wait on the database lock"),
      second.done.then(() => { throw new Error("Support contender escaped before the first transaction committed"); })]);
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
    migration("_support_intake.sql");
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

// Re-exercise the established tracking races against the final shared support send guard.
async function proveTrackingConcurrency() {
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

}

let created = false;
try {
  assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(),
    "spec358-synthetic-sql", "Refusing a container without the synthetic-test label");
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  assert.equal(sql("SELECT current_setting('server_version_num')::integer / 10000;").trim(), "17");
  stage = "checkout checkpoint";
  sql(source("supabase/tests/checkpoints/checkout-current.sql"));
  loadCheckoutPaymentTestEffects(sql, source);
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  const [paymentFixtures, paymentAssertions] = source("supabase/tests/checkout_payment_contracts.integration.sql")
    .split("-- APPLY PAYMENT CONTRACT MIGRATION");
  assert.ok(paymentAssertions, "Payment fixture migration boundary is required");
  sql(paymentFixtures);
  migration("_checkout_admission.sql");
  migration("_checkout_payment_contracts.sql");
  stage = "existing payment contracts";
  sql(paymentAssertions);
  const [emailFixtures, emailAssertions] = source("supabase/tests/order_email_contracts.integration.sql")
    .split("-- APPLY ORDER EMAIL MIGRATION");
  assert.ok(emailAssertions, "Email fixture migration boundary is required");
  sql(emailFixtures);
  migration("_order_confirmation_email.sql");
  stage = "original order-email fixtures and assertions";
  sql(paymentAssertions.replaceAll("CREATE FUNCTION payment_contract_test.",
    "CREATE OR REPLACE FUNCTION payment_contract_test."));
  sql(emailAssertions);
  const memberships = source("supabase/migrations/20260730034330_catalog_editor_backend.sql")
    .match(/create table public\.admin_memberships \([\s\S]*?\n\);/);
  assert.ok(memberships, "Real admin membership predecessor definition is required");
  sql(`${memberships[0]}
    ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.admin_memberships FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_memberships TO service_role;`);
  const [trackingFixtures, trackingAssertions] = source("supabase/tests/simulated_tracking.integration.sql")
    .split("-- APPLY SIMULATED TRACKING MIGRATION");
  assert.ok(trackingAssertions, "Tracking fixture migration boundary is required");
  sql(trackingFixtures);
  const [supportFixtures, supportAssertions] = source("supabase/tests/support_intake_contracts.integration.sql")
    .split("-- APPLY SUPPORT INTAKE MIGRATION");
  assert.ok(supportAssertions, "Support fixture migration boundary is required");
  stage = "support fixtures";
  sql(supportFixtures);
  stage = "old-schema refund versus combined installation";
  await proveSchemaInstallationRace();
  migration("_simulated_tracking.sql");
  migration("_support_intake.sql");
  stage = "final shared payment and confirmation regressions";
  // Tracking adds only the approved durable rollout capability to this projection.
  sql(paymentAssertions.replaceAll("CREATE FUNCTION payment_contract_test.",
    "CREATE OR REPLACE FUNCTION payment_contract_test.").replace(
      `recovered=contract||'{"sessionId":"cs_test_contract9"}'::jsonb`,
      `recovered=contract||'{"sessionId":"cs_test_contract9","trackingSchemaVersion":1}'::jsonb`));
  // Re-run the prior default-state assertions without changing support's installed controls.
  sql("UPDATE private.email_controls SET enabled=false WHERE purpose='order_confirmation';");
  sql(emailAssertions.replaceAll("CREATE FUNCTION email_contract_test.",
    "CREATE OR REPLACE FUNCTION email_contract_test."));
  stage = "final shared tracking contracts";
  sql(trackingAssertions);
  stage = "support contracts";
  sql(supportAssertions);

  stage = "concurrent intake";
  const intake = await concurrentLocked("SELECT support_contract_test.submit(2000);",
    `SELECT support_contract_test.submit(2001,jsonb_build_object(
      'submissionId',support_contract_test.id('submission',2000),
      'email','synthetic-2000@example.invalid','emailAbuseKey',support_contract_test.key('email',2000)));`);
  const ids = intake.map((output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{"))).inquiryId);
  assert.equal(ids[0], ids[1], "Concurrent retries return one private Inquiry identity");
  assert.equal(sql(`SELECT count(*) FROM private.support_inquiries WHERE id='${ids[0]}'::uuid;`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.email_intents WHERE purpose='support_acknowledgement'
    AND receipt->>'inquiryId'='${ids[0]}';`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.support_messages WHERE inquiry_id='${ids[0]}'::uuid;`).trim(), "1");

  assert.equal(sql(`SELECT count(*) FROM private.support_abuse_windows
    WHERE kind='source' AND abuse_key=support_contract_test.key('source',2001);`).trim(), "0",
  "Concurrent retry from a different source does not consume a second admission");

  stage = "concurrent conflicting submission";
  const conflict = await concurrentLocked("SELECT support_contract_test.submit(2002);",
    `SELECT support_contract_test.try_conflicting_submission(2003,jsonb_build_object(
      'submissionId',support_contract_test.id('submission',2002),
      'email','synthetic-2002@example.invalid','emailAbuseKey',support_contract_test.key('email',2002),
      'body','Conflicting content on another source'));`);
  const conflictResults = conflict.map((output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{"))));
  assert.equal(conflictResults[1].conflict, true, "Concurrent reuse with conflicting canonical content fails closed");
  assert.equal(sql(`SELECT count(*) FROM private.email_intents WHERE purpose='support_acknowledgement'
    AND receipt->>'inquiryId'='${conflictResults[0].inquiryId}';`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.support_messages
    WHERE inquiry_id='${conflictResults[0].inquiryId}'::uuid;`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.support_abuse_windows
    WHERE kind='source' AND abuse_key=support_contract_test.key('source',2003);`).trim(), "0");

  stage = "concurrent exact approval";
  sql(`SET ROLE service_role; SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),
    '${ids[0]}'::uuid,1,'save_draft',0,'Synthetic reply','Approved response');`);
  await concurrentLocked(`SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),
    '${ids[0]}'::uuid,2,'approve_reply',1);`);
  assert.equal(sql(`SELECT count(*) FROM private.email_intents WHERE purpose='support_reply'
    AND receipt->>'inquiryId'='${ids[0]}';`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.support_reply_approvals WHERE inquiry_id='${ids[0]}'::uuid;`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.support_messages WHERE inquiry_id='${ids[0]}'::uuid
    AND kind='reply';`).trim(), "1");

  stage = "concurrent context change and provider preparation";
  const editInquiry = JSON.parse(sql("SET ROLE service_role; SELECT support_contract_test.submit(2001);")).inquiryId;
  sql(`SET ROLE service_role;
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${editInquiry}'::uuid,
      1,'save_draft',0,'Synthetic concurrent reply','Approved before new context');
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${editInquiry}'::uuid,
      2,'approve_reply',1);
    SELECT public.claim_email_intents('sandbox',support_contract_test.id('concurrent-lease',2001),5);`);
  const editReply = sql(`SELECT id FROM private.email_intents WHERE purpose='support_reply'
    AND receipt->>'inquiryId'='${editInquiry}';`).trim();
  await concurrentLocked(`SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),
    '${editInquiry}'::uuid,2,'add_note',null,null,'New context invalidates the old approval');`,
    `SELECT public.prepare_email_attempt('${editReply}'::uuid,support_contract_test.id('concurrent-lease',2001),
      support_contract_test.payload('synthetic-2001@example.invalid','${editReply}'::uuid,
        'Synthetic concurrent reply','Approved before new context'));`);
  assert.equal(sql(`SELECT state='blocked' AND error_code='approval_stale' AND first_attempt_at IS NULL
    AND attempt_count=0 FROM private.email_intents WHERE id='${editReply}'::uuid;`).trim(), "t",
  "Concurrent context invalidation wins before provider preparation and records no attempted send");

  stage = "final shared tracking concurrency";
  await proveTrackingConcurrency();

  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,
    existingPaymentAndConfirmationContractsPreserved: true, existingTrackingContractsPreserved: true,
    actualCombinedSchemaInstallationRace: true, permanentTrackingActivationCutoff: true,
    actualConcurrentTrackingAllocation: true, actualConcurrentTrackingRevision: true,
    actualConcurrentTrackingReplay: true, actualRefundTransitionRaces: true,
    actualRefundPreparationRaces: true, actualRefundFallbackRace: true,
    trackingRefundRetryGuard: true, trackingLateCallbackAfterFreeze: true,
    intakeDisabledByDefault: true, atomicInquiryAcknowledgement: true, failureRollsBackAdmission: true,
    boundedDurableAbuseControls: true, privateForcedRls: true, serviceOnlyRpcs: true,
    activeAdminRequired: true, boundedConversationPages: true, stableMessageCursor: true,
    exactDraftApproval: true, staleApprovalBlocked: true, deliveryOutcomeSummaries: true,
    uncertainReplyCannotBeReplaced: true, actualConcurrentIntake: true,
    actualConcurrentApproval: true, actualConcurrentEditPreparation: true,
    actualConcurrentSourceChangeRetry: true, actualConcurrentConflictingSubmission: true, providerMutations: 0 }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", stage, message: error.message, providerMutations: 0 }));
  process.exitCode = 1;
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
