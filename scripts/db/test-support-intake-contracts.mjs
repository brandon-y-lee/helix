import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// No database URL or provider credentials: only the explicitly labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `support_intake_contracts_${process.pid}_${Date.now()}`;
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
  const memberships = source("supabase/migrations/20260730034330_catalog_editor_backend.sql")
    .match(/create table public\.admin_memberships \([\s\S]*?\n\);/);
  assert.ok(memberships, "Real admin membership predecessor definition is required");
  sql(`${memberships[0]}
    ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.admin_memberships FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_memberships TO service_role;`);
  migration("_simulated_tracking.sql");
  const [supportFixtures, supportAssertions] = source("supabase/tests/support_intake_contracts.integration.sql")
    .split("-- APPLY SUPPORT INTAKE MIGRATION");
  assert.ok(supportAssertions, "Support fixture migration boundary is required");
  stage = "support fixtures";
  sql(supportFixtures);
  migration("_support_intake.sql");
  stage = "existing payment and email regressions";
  sql(paymentAssertions.replaceAll("CREATE FUNCTION payment_contract_test.",
    "CREATE OR REPLACE FUNCTION payment_contract_test."));
  sql(emailAssertions);
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

  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,
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
