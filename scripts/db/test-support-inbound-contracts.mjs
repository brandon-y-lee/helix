import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// No database URL or provider credentials: only the explicitly labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `support_inbound_contracts_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification";
const startedAt = performance.now();
const sql = (input) => {
  try { return docker(psqlArgs, { input }); }
  catch (error) {
    // SQL details can include customer-like values. Emit only our literal assertion description.
    const assertion = String(error.stderr ?? "").match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1];
    throw new Error(assertion ?? `Disposable inbound support SQL failed during ${stage}`);
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
    child.once("error", () => reject(new Error("Disposable inbound support connection could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Disposable inbound support connection failed")));
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
async function concurrentLocked(firstStatement, secondStatement = firstStatement, afterBlockedStatement = "", releaseDelayMs = 0) {
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
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='inbound_contract_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='inbound_contract_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Support contender did not wait on the database lock"),
      second.done.then(() => { throw new Error("Support contender escaped before the first transaction committed"); })]);
    if (releaseDelayMs) await new Promise((resolve) => setTimeout(resolve, releaseDelayMs));
    first.child.stdin.end(`${afterBlockedStatement}\nCOMMIT;\n`);
    await Promise.all([first.done, second.done]);
    return [first.output(), second.output()];
  } finally {
    if (!first.child.stdin.destroyed) first.child.stdin.end("ROLLBACK;\n");
    await first.done.catch(() => {});
    if (second) await second.done.catch(() => {});
  }
}

const result = (output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{") || line.startsWith("[")));

async function proveInboundConcurrency() {
  const inquiry = sql("SET ROLE service_role; SELECT support_inbound_test.seed(100);").trim();
  const events = await concurrentLocked(`SELECT support_inbound_test.enqueue(100,'${inquiry}'::uuid);`,
    `SELECT support_inbound_test.enqueue(100,'${inquiry}'::uuid,'{"eventId":"concurrent_second_event_100"}'::jsonb);`);
  assert.deepEqual(events.map((output) => result(output).status), ["queued", "duplicate"],
    "Independent verified callbacks racing for one provider email admit one inbound job");
  assert.equal(result(events[0]).id, result(events[1]).id);
  assert.equal(sql("SELECT count(*) FROM private.support_inbound_jobs;").trim(), "1");
  const worker = session();
  try {
    worker.child.stdin.write(`BEGIN; SET LOCAL ROLE service_role;
      SELECT public.claim_support_inbound(support_inbound_test.id('concurrent-inbound-lease',100),1);
      \\echo inbound-claim-held
    `);
    await Promise.race([until(() => worker.output().includes("inbound-claim-held"), "First inbound claim did not reach its barrier"),
      worker.done.then(() => { throw new Error("Inbound claimant exited before the barrier"); })]);
    assert.deepEqual(result(sql(`SET statement_timeout='2s'; SET ROLE service_role;
      SELECT public.claim_support_inbound(support_inbound_test.id('other-inbound-lease',100),1);`)), [],
    "An overlapping inbound processor skips another worker's locked job");
    worker.child.stdin.end("COMMIT;\n");
    await worker.done;
  } finally {
    if (!worker.child.stdin.destroyed) worker.child.stdin.end("ROLLBACK;\n");
    await worker.done.catch(() => {});
  }
  assert.equal(sql(`SET ROLE service_role; SELECT public.finish_support_inbound('${result(events[0]).id}'::uuid,
    support_inbound_test.id('concurrent-inbound-lease',100),support_inbound_test.email(100));`).trim(), "t");

  const contextInquiry = sql("SET ROLE service_role; SELECT support_inbound_test.seed(101);").trim();
  sql(`SET ROLE service_role; SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),
    '${contextInquiry}'::uuid,1,'save_draft',0,'Synthetic reply','Draft before new customer context');`);
  const approval = await concurrentLocked(`SELECT support_inbound_test.enqueue(101,'${contextInquiry}'::uuid);`,
    `SELECT support_inbound_test.try_approve('${contextInquiry}'::uuid,2,1);`);
  assert.equal(result(approval[1]).status, "stale_inquiry",
    "Incoming email committed ahead of approval invalidates the exact reviewed revision");
  assert.equal(sql(`SELECT count(*) FROM private.email_intents WHERE purpose='support_reply'
    AND receipt->>'inquiryId'='${contextInquiry}';`).trim(), "0");

  // Capture runs after a provider callback transaction, using the same Inquiry-first lock order.
  const rfcInquiry = sql("SET ROLE service_role; SELECT support_inbound_test.seed(102,false);").trim();
  const rfcIntent = sql(`SELECT id FROM private.email_intents WHERE receipt->>'inquiryId'='${rfcInquiry}';`).trim();
  sql(`UPDATE private.email_intents SET lease_token=support_inbound_test.id('rfc-finish-lease',102),
    lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id='${rfcIntent}'::uuid;`);
  const capture = await concurrentLocked(
    `SELECT id FROM private.support_inquiries WHERE id='${rfcInquiry}'::uuid FOR UPDATE;`,
    `SELECT public.record_support_rfc_message('${rfcIntent}'::uuid,'outbound_fixture_102','<concurrent-102@example.invalid>');`,
    `SELECT public.finish_email_attempt('${rfcIntent}'::uuid,support_inbound_test.id('rfc-finish-lease',102),
      'accepted','outbound_fixture_102',null);`);
  assert.equal(capture[1].trim(), "t",
    "RFC capture waits on Inquiry before the intent so an earlier lease finisher cannot deadlock");
  assert.ok(capture[0].split("\n").includes("t"));

  const collisionA = sql("SET ROLE service_role; SELECT support_inbound_test.seed(121);").trim();
  const collisionB = sql("SET ROLE service_role; SELECT support_inbound_test.seed(122);").trim();
  const collisionJobA = result(sql(`SET ROLE service_role; SELECT support_inbound_test.enqueue(121,'${collisionA}'::uuid);`));
  const collisionJobB = result(sql(`SET ROLE service_role; SELECT support_inbound_test.enqueue(122,'${collisionB}'::uuid);`));
  sql("SET ROLE service_role; SELECT public.claim_support_inbound(support_inbound_test.id('rfc-collision-lease',121),5);");
  await concurrentLocked(`SELECT public.finish_support_inbound('${collisionJobA.id}'::uuid,
    support_inbound_test.id('rfc-collision-lease',121),support_inbound_test.email(121,
      '{"rfcMessageId":"<shared-concurrent@example.invalid>"}'::jsonb));`,
  `SELECT public.finish_support_inbound('${collisionJobB.id}'::uuid,
    support_inbound_test.id('rfc-collision-lease',121),support_inbound_test.email(122,
      '{"rfcMessageId":"<shared-concurrent@example.invalid>"}'::jsonb));`);
  assert.equal(sql(`SELECT state FROM private.support_inbound_jobs WHERE id='${collisionJobA.id}'::uuid;`).trim(), "accepted");
  assert.equal(sql(`SELECT state='quarantined' AND reason='message_id_conflict' AND message_id IS NULL
    FROM private.support_inbound_jobs WHERE id='${collisionJobB.id}'::uuid;`).trim(), "t",
  "Concurrent reuse of one RFC Message-ID cannot admit customer text into two private Inquiries");

}

async function proveInboundQuotaConcurrency() {
  const limitedInquiry = sql("SET ROLE service_role; SELECT support_inbound_test.seed(120);").trim();
  sql(`SET ROLE service_role; SELECT support_inbound_test.enqueue(n,'${limitedInquiry}'::uuid)
    FROM generate_series(12000,12018) n;`);
  const admissions = await concurrentLocked(`SELECT support_inbound_test.enqueue(12019,'${limitedInquiry}'::uuid);`,
    `SELECT support_inbound_test.enqueue(12020,'${limitedInquiry}'::uuid);`);
  assert.deepEqual(admissions.map((output) => result(output).status), ["queued", "rate_limited"],
    "Competing inbound events cannot both consume the final unresolved Inquiry slot");
  assert.equal(sql(`SELECT count(*) FROM private.support_inbound_jobs WHERE inquiry_id='${limitedInquiry}'::uuid;`).trim(), "20");
}

async function provePhotoConcurrency() {
  const inquiry = sql("SET ROLE service_role; SELECT support_inbound_test.photo_seed(100,3);").trim();
  const claims = [];
  for (let slot = 1; slot <= 3; slot += 1) {
    const reservation = result(sql(`SET ROLE service_role; SELECT support_inbound_test.reserve(100,${slot});`));
    sql(`SET ROLE service_role; SELECT public.complete_support_photo_upload(support_contract_test.id('submission',6100),
      support_contract_test.key('photo-capability',100),'${reservation.photoId}'::uuid);`);
    claims.push(result(sql(`SET ROLE service_role;
      SELECT public.claim_support_photos(support_inbound_test.id('concurrent-photo-lease',${slot}),1);`))[0]);
  }
  assert.equal(sql(`SET ROLE service_role; SELECT public.admit_support_photo_size('${claims[0].id}'::uuid,
    support_inbound_test.id('concurrent-photo-lease',1),10485760);`).trim(), "accepted");
  const budget = await concurrentLocked(
    `SELECT public.admit_support_photo_size('${claims[1].id}'::uuid,support_inbound_test.id('concurrent-photo-lease',2),10485760);`,
    `SELECT public.admit_support_photo_size('${claims[2].id}'::uuid,support_inbound_test.id('concurrent-photo-lease',3),10485760);`);
  assert.deepEqual(budget.map((output) => output.split("\n").find((line) => /^(accepted|rejected|stale)$/.test(line))),
    ["accepted", "rejected"], "Independent photo processors cannot overdraw the final ten MiB of one message budget");
  assert.equal(sql(`SELECT sum(charged_bytes) FROM private.support_photos WHERE inquiry_id='${inquiry}'::uuid;`).trim(), "20971520");
  assert.equal(sql(`SELECT state='rejected' AND lease_token IS NULL FROM private.support_photos WHERE id='${claims[2].id}'::uuid;`).trim(), "t");

  const mintInquiry = sql("SET ROLE service_role; SELECT support_inbound_test.photo_seed(101,1);").trim();
  const reservations = await concurrentLocked("SELECT support_inbound_test.reserve(101,1);");
  assert.equal(result(reservations[0]).photoId, result(reservations[1]).photoId,
    "Concurrent upload URL reservations retain the same fixed photo slot");
  assert.equal(sql(`SELECT count(*) FROM private.support_photos WHERE inquiry_id='${mintInquiry}'::uuid;`).trim(), "1");
  const photo = result(reservations[0]).photoId;
  sql(`SET ROLE service_role;
    SELECT public.complete_support_photo_upload(support_contract_test.id('submission',6101),
      support_contract_test.key('photo-capability',101),'${photo}'::uuid);
    SELECT public.claim_support_photos(support_inbound_test.id('expiring-photo-lease',101),1);
    UPDATE private.support_photos SET lease_expires_at=clock_timestamp()+interval '500 milliseconds'
      WHERE id='${photo}'::uuid;`);
  const expired = await concurrentLocked(
    `SELECT id FROM private.support_inquiries WHERE id='${mintInquiry}'::uuid FOR UPDATE;`,
    `SELECT public.admit_support_photo_size('${photo}'::uuid,support_inbound_test.id('expiring-photo-lease',101),1024);`,
    "", 750);
  assert.equal(expired[1].trim(), "stale", "Lease expiry is rechecked after waiting for the Inquiry lock");
  assert.equal(sql(`SELECT charged_bytes IS NULL FROM private.support_photos WHERE id='${photo}'::uuid;`).trim(), "t");

  sql(`SET ROLE service_role; SELECT support_inbound_test.photo_seed(n,1,support_contract_test.key('concurrent-source-quota',1))
    FROM generate_series(200,203) n;`);
  const outstanding = await concurrentLocked(
    "SELECT support_inbound_test.try_photo_seed(204,support_contract_test.key('concurrent-source-quota',1));",
    "SELECT support_inbound_test.try_photo_seed(205,support_contract_test.key('concurrent-source-quota',1));");
  assert.deepEqual(outstanding.map((output) => result(output).status), ["admitted", "rate_limited"],
    "Competing submissions cannot both consume the last outstanding source photo batch");
}

async function proveReplyPreparation() {
  const inquiry = sql("SET ROLE service_role; SELECT support_inbound_test.seed(103);").trim();
  const incoming = result(sql(`SET ROLE service_role; SELECT support_inbound_test.enqueue(103,'${inquiry}'::uuid);`));
  sql(`SET ROLE service_role;
    SELECT public.claim_support_inbound(support_inbound_test.id('reply-history-lease',103),5);
    SELECT public.finish_support_inbound('${incoming.id}'::uuid,support_inbound_test.id('reply-history-lease',103),
      support_inbound_test.email(103));
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${inquiry}'::uuid,
      (SELECT revision FROM private.support_inquiries WHERE id='${inquiry}'::uuid),'save_draft',0,
      'Synthetic threaded reply','An approved response with fixed RFC reply headers.');
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${inquiry}'::uuid,
      (SELECT revision FROM private.support_inquiries WHERE id='${inquiry}'::uuid),'approve_reply',1);
    SELECT public.claim_email_intents('sandbox',support_inbound_test.id('reply-send-lease',103),5);`);
  const intent = sql(`SELECT id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'='${inquiry}';`).trim();
  const prepared = result(sql(`SET ROLE service_role; SELECT public.prepare_email_attempt('${intent}'::uuid,
    support_inbound_test.id('reply-send-lease',103),support_inbound_test.reply_payload('${intent}'::uuid));`));
  assert.equal(prepared.requestPayload.headers["In-Reply-To"], "<incoming-103@example.invalid>",
    "Human-approved outgoing replies freeze RFC Message-ID history rather than provider API identifiers");
  assert.equal(prepared.requestPayload.headers.References, "<incoming-103@example.invalid>");
  assert.equal(sql(`SET ROLE service_role; SELECT public.finish_email_attempt('${intent}'::uuid,
    support_inbound_test.id('reply-send-lease',103),'accepted','accepted_reply_103',null);`).trim(), "t");

  const changing = sql("SET ROLE service_role; SELECT support_inbound_test.seed(104);").trim();
  sql(`SET ROLE service_role;
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${changing}'::uuid,1,'save_draft',0,
      'Synthetic queued reply','Approved before another customer message.');
    SELECT public.mutate_support_inquiry(support_contract_test.actor('admin'),'${changing}'::uuid,2,'approve_reply',1);
    SELECT public.claim_email_intents('sandbox',support_inbound_test.id('reply-send-lease',104),5);`);
  const changingIntent = sql(`SELECT id FROM private.email_intents WHERE purpose='support_reply'
    AND receipt->>'inquiryId'='${changing}';`).trim();
  const handoff = await concurrentLocked(`SELECT support_inbound_test.enqueue(104,'${changing}'::uuid);`,
    `SELECT public.prepare_email_attempt('${changingIntent}'::uuid,support_inbound_test.id('reply-send-lease',104),
      support_inbound_test.reply_payload('${changingIntent}'::uuid)) IS NULL;`);
  assert.equal(handoff[1].trim(), "t", "New inbound context committed before provider preparation blocks the old approved reply");
  assert.equal(sql(`SELECT state='blocked' AND attempt_count=0 AND first_attempt_at IS NULL
    FROM private.email_intents WHERE id='${changingIntent}'::uuid;`).trim(), "t");
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

  migration("_marketing_subscription_contracts.sql");

  const [inboundFixtures, inboundAssertions] = source("supabase/tests/support_inbound_contracts.integration.sql")
    .split("-- APPLY SUPPORT INBOUND MIGRATION");
  assert.ok(inboundAssertions, "Inbound support fixture migration boundary is required");
  stage = "inbound fixtures";
  sql(inboundFixtures);
  migration("_support_inbound.sql");
  stage = "inbound support contracts";
  sql(inboundAssertions);
  stage = "private photo contracts";
  sql(source("supabase/tests/support_inbound_photos.integration.sql"));
  stage = "concurrent inbound admission and review";
  await proveInboundConcurrency();
  stage = "threaded reply preparation and concurrent context hold";
  await proveReplyPreparation();
  stage = "concurrent inbound quota";
  await proveInboundQuotaConcurrency();
  stage = "concurrent private photo processing";
  await provePhotoConcurrency();

  // The maintained marketing harness already runs its own predecessor assertions
  // and races in both a fresh database and an old-schema installation clone.
  // Install this migration in all those paths too, proving the final shared send
  // guard rather than reporting predecessor checks performed before its override.
  stage = "maintained predecessor contracts under final shared guard";
  let predecessor = source("scripts/db/test-marketing-subscription-contracts.mjs");
  const importAnchor = '"./checkout-payment-test-fixture.mjs"';
  const rootAnchor = 'const root = fileURLToPath(new URL("../../", import.meta.url));';
  const migrationAnchor = 'migration("_marketing_subscription_contracts.sql");';
  // One real declaration and one literal used by the marketing harness's own nested composition.
  assert.equal(predecessor.split(importAnchor).length - 1, 2, "Marketing fixture import anchor is stable");
  assert.equal(predecessor.split(rootAnchor).length - 1, 2, "Marketing fixture root anchor is stable");
  assert.equal(predecessor.split(migrationAnchor).length - 1, 2,
    "Both marketing and nested predecessor installation paths must receive the final migration");
  predecessor = predecessor.replace(importAnchor,
    JSON.stringify(new URL("scripts/db/checkout-payment-test-fixture.mjs", `file://${root}`).href))
    .replace(rootAnchor, `const root = ${JSON.stringify(root)};`)
    .replaceAll(migrationAnchor, `${migrationAnchor}\n  migration("_support_inbound.sql");`);
  const predecessorOutput = execFileSync(process.execPath, ["--input-type=module", "-", container], {
    input: predecessor, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  assert.equal(JSON.parse(predecessorOutput).status, "passed",
    "Maintained marketing and all predecessor assertions and races pass under the final shared guard");

  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, elapsedMs: Math.round(performance.now() - startedAt),
    maintainedMarketingAndPredecessorContractsUnderFinalGuard: true,
    atomicInboundAdmission: true, deduplicatedProviderReceipts: true, aliasParticipantRfcThreading: true,
    explicitInboundReview: true, pendingContextApprovalHold: true, privateInboundAndPhotoRls: true,
    legacySubmissionAndDomainRetry: true, fixedCapabilityPhotoSlots: true, immutableActualByteBudget: true,
    rejectedAttachmentsPreserveText: true, cleanupGraceAndTombstones: true,
    actualConcurrentInboundEvents: true, actualConcurrentInboundClaims: true, actualConcurrentApprovalHold: true,
    inquiryFirstRfcCapture: true, actualConcurrentRfcCollision: true,
    actualConcurrentPhotoBudget: true, actualConcurrentUploadReservations: true,
    photoLeaseExpiryAfterLock: true, approvedRfcReplyHeaders: true, actualConcurrentInboundPreparation: true,
    unresolvedInboundBudgets: true, outstandingPhotoBudgets: true,
    actualConcurrentInboundBudget: true, actualConcurrentPhotoQuota: true,
    finiteGuestPhotoCapabilities: true, providerMutations: 0 }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", stage, message: error.message, providerMutations: 0 }));
  process.exitCode = 1;
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
