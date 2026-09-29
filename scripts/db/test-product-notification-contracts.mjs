import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Owns one disposable synthetic PostgreSQL database. No remote URL or provider keys.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `product_notifications_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024, timeout: 30_000, ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => {
  try { return docker(psqlArgs, { input }); }
  catch (error) { throw new Error(error.stderr || "Synthetic PostgreSQL contract failed"); }
};
const captured = new Map();
const source = (path) => {
  if (!captured.has(path)) captured.set(path, readFileSync(new URL(path, `file://${root}`), "utf8"));
  return captured.get(path);
};
const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
const migration = (suffix) => {
  const matches = migrations.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix} migration`);
  sql(source(`supabase/migrations/${matches[0]}`));
};

// Catalog provides actual Product/Auth tables and all V4 publication wrappers.
// Preserve every other Checkout statement verbatim, excluding only duplicate
// schema/table/index/policy/trigger definitions owned by the Catalog checkpoint.
function checkoutComposition() {
  let checkout = source("supabase/tests/checkpoints/checkout-current.sql");
  const boundary = "CREATE OR REPLACE FUNCTION public.fail_checkout_order_from_stripe(";
  const offset = checkout.indexOf(boundary);
  assert.ok(offset > 0);
  const shared = "(?:products|product_variants|system_steps)";
  const declarations = checkout.slice(0, offset).split(/;\n/).filter((statement) => {
    const text = statement.replace(/^--[^\n]*\n/gm, "").trim();
    return !/^CREATE SCHEMA auth$/.test(text)
      && !/^CREATE TABLE auth\.users\b/.test(text)
      && !new RegExp(`^(?:CREATE TABLE|ALTER TABLE) public\\."?${shared}"?\\b`).test(text.replaceAll('"', ''))
      && !new RegExp(`^CREATE (?:UNIQUE )?INDEX [^ ]+ ON public\\.${shared}\\b`).test(text)
      && !new RegExp(`^CREATE POLICY .* ON public\\."?${shared}"? `).test(text)
      && !new RegExp(`^GRANT .* ON public\\."?${shared}"? `).test(text);
  }).join(";\n");
  checkout = checkout.slice(offset).replace(/^CREATE TRIGGER (?:products|product_variants)_set_updated_at[^\n]*\n/gm, "");
  const sharedRoutine = /CREATE OR REPLACE FUNCTION public\.set_updated_at\(\)[\s\S]*?GRANT EXECUTE ON FUNCTION public\.set_updated_at\(\) TO service_role;\n/;
  assert.ok(sharedRoutine.test(checkout), "Shared timestamp function boundary changed");
  checkout = checkout.replace(sharedRoutine, "");
  return declarations + checkout;
}

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
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, description);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function concurrentLocked(firstStatement, secondStatement = firstStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`SELECT 'notification-pid:'||pg_backend_pid(); BEGIN; SET LOCAL statement_timeout='15s';\n${firstStatement}\n\\echo notification-held\n`);
    await Promise.race([until(() => first.output().includes("notification-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before barrier"); })]);
    const firstPid = Number(first.output().match(/notification-pid:(\d+)/)?.[1]);
    assert.ok(Number.isInteger(firstPid) && firstPid > 0, "First session identity must be captured");
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='product_notification_contender';
SET LOCAL statement_timeout='15s';\n${secondStatement}\nCOMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='product_notification_contender'
      AND wait_event_type='Lock' AND ${firstPid}=ANY(pg_blocking_pids(pid)));`).trim() === "t", "Contender did not wait on the shared boundary"),
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
  sql(source("supabase/tests/checkpoints/catalog-current-20260909042518.sql"));
  sql(checkoutComposition());
  loadCheckoutPaymentTestEffects(sql, source);
  migration("_checkout_admission.sql");
  migration("_checkout_payment_contracts.sql");
  migration("_order_confirmation_email.sql");
  migration("_simulated_tracking.sql");
  migration("_support_intake.sql");
  migration("_marketing_subscription_contracts.sql");
  migration("_support_inbound.sql");
  sql(source("supabase/tests/marketing_subscription_contracts.integration.sql").split("-- APPLY MARKETING SUBSCRIPTION MIGRATION")[0]);
  // The later Catalog checkpoint already includes the canonical waitlist publisher change.
  // Restore the exact private waitlist tables/RPC only; do not replay its obsolete rewrite.
  const waitlistPredecessor = source("supabase/migrations/20260810152158_private_product_waitlist.sql");
  assert.equal(waitlistPredecessor.split("do $waitlist$").length, 2);
  sql(waitlistPredecessor.split("do $waitlist$")[0]);
  migration("_harden_product_waitlist_abuse_controls.sql");
  for (const suffix of ["_catalog_restore_current_identity.sql", "_catalog_reviewed_guidance.sql",
    "_catalog_stable_media_boundary.sql", "_catalog_restore_current_timestamps.sql"]) migration(suffix);
  const [fixtures, assertions] = source("supabase/tests/product_notification_contracts.integration.sql")
    .split("-- APPLY PRODUCT NOTIFICATION MIGRATION");
  assert.ok(assertions, "Notification fixture must retain its migration boundary");
  sql(fixtures);
  if (process.argv.includes("--predecessor")) {
    sql("SELECT public.enroll_product_waitlist(null,'synthetic@example.invalid',false,'v1','pdp_waitlist',repeat('a',64),'00000000-0000-0000-0000-000000000001'::uuid,null,null);");
    throw new Error("Negative control unexpectedly accepted the new enrollment contract");
  }
  migration("_product_notifications.sql");
  sql(process.argv.includes("--enrollment-only") ? assertions.split("-- Canonical publication")[0] : assertions);
  if (!process.argv.includes("--enrollment-only")) {
    sql(`UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day'
      WHERE purpose IN ('product_availability','product_waitlist_recovery');`);
    const enroll = (key, email, request) => `SET ROLE service_role;
      SELECT notification_contract_test.enroll(notification_contract_test.id('${key}'),'${email}','${request}');`;
    const publish = (key) => `SET ROLE service_role;
      SELECT notification_contract_test.publish(notification_contract_test.id('${key}'),'available');`;
    sql("SELECT notification_contract_test.seed_product('parallel');");
    const duplicateResults = await concurrentLocked(enroll('parallel','parallel@example.invalid','parallel-first'),
      enroll('parallel','parallel@example.invalid','parallel-second'));
    assert.deepEqual(duplicateResults.map((output) => JSON.parse(output.split('\n').find((line) => line.startsWith('{')))),
      [{ ok: true }, { ok: true }], "Both overlapping legitimate submissions return success");
    assert.equal(sql("SELECT count(*) FROM private.product_waitlist_enrollments WHERE normalized_email='parallel@example.invalid';").trim(), "1",
      "Overlapping enrollment connections share one address/Product request");
    assert.equal(sql(`SELECT count(*) FROM private.product_notification_generations g
      JOIN private.product_waitlist_enrollments e ON e.id=g.enrollment_id WHERE e.normalized_email='parallel@example.invalid';`).trim(), "1",
      "Concurrent duplicates do not issue another generation");
    sql("SELECT notification_contract_test.seed_product('enroll-first');");
    await concurrentLocked(enroll('enroll-first','enroll-first@example.invalid','enroll-first'),publish('enroll-first'));
    sql("SET ROLE service_role; SELECT public.materialize_product_notifications(100);");
    assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE purpose='product_availability' AND recipient='enroll-first@example.invalid';").trim(), "1",
      "Publication waits for preceding enrollment and captures its subsequent transition");
    sql("SELECT notification_contract_test.seed_product('publish-first');");
    const afterPublication = await concurrentLocked(publish('publish-first'),
      enroll('publish-first','publish-first@example.invalid','publish-first'));
    assert.ok(afterPublication[1].includes('"product_unavailable"'),
      "Enrollment waiting behind publication rechecks current Product eligibility");
    assert.equal(sql("SELECT count(*) FROM private.product_waitlist_enrollments WHERE normalized_email='publish-first@example.invalid';").trim(), "0",
      "Publication-first race cannot insert a stranded request for an already-available Product");

    sql("SELECT notification_contract_test.seed_product('materialize-parallel');");
    sql(enroll('materialize-parallel','materialize-parallel@example.invalid','materialize-parallel'));
    sql(publish('materialize-parallel'));
    await concurrentLocked('SET ROLE service_role; SELECT public.materialize_product_notifications(100);');
    assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE recipient='materialize-parallel@example.invalid' AND purpose='product_availability';").trim(), "1",
      "Overlapping materializers consume one transition and create one intent");

    const recovery = (email, key, offset = 0) => `SET ROLE service_role;
      SELECT public.request_product_notification_recovery('${email}',encode(extensions.digest('${key}','sha256'),'hex'),
        notification_contract_test.tokens(${offset}),true,notification_contract_test.id('${key}'));`;
    sql("SELECT notification_contract_test.seed_product('recovery-parallel');");
    sql(enroll('recovery-parallel','recovery-parallel@example.invalid','recovery-parallel'));
    const recoveryResults = await concurrentLocked(recovery('recovery-parallel@example.invalid','recover-first',100),
      recovery('recovery-parallel@example.invalid','recover-second',120));
    assert.deepEqual(recoveryResults.map((output) => JSON.parse(output.split('\n').find((line) => line.startsWith('{')))),
      [{ ok: true }, { ok: true }], "Concurrent anonymous recovery responses remain generic");
    assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE recipient='recovery-parallel@example.invalid' AND purpose='product_waitlist_recovery';").trim(), "1",
      "Overlapping connections coalesce one mailbox recovery message");
    assert.equal(sql(`SELECT count(*) FROM private.product_notification_tokens t JOIN private.product_waitlist_enrollments e
      ON e.id=t.enrollment_id WHERE e.normalized_email='recovery-parallel@example.invalid';`).trim(), "1",
      "Concurrent recovery cannot rotate an existing capability");

    async function cancellationAdmissionRace(key, cancelFirst) {
      const email = `${key}@example.invalid`;
      sql(`SELECT notification_contract_test.seed_product('${key}');`);
      sql(enroll(key,email,`${key}-enroll`));
      sql(recovery(email,`${key}-recovery`,cancelFirst ? 200 : 240));
      const token = sql(`SELECT receipt#>>'{links,0,token}' FROM private.email_intents
        WHERE recipient='${email}' AND purpose='product_waitlist_recovery';`).trim();
      sql(publish(key));
      sql('SELECT public.materialize_product_notifications(100);');
      const intent = sql(`SELECT id FROM private.email_intents WHERE recipient='${email}' AND purpose='product_availability';`).trim();
      const lease = '40000000-0000-0000-0000-000000000001';
      sql(`UPDATE private.email_intents SET state='leased',lease_token='${lease}',lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id='${intent}';`);
      const cancel = `SET ROLE service_role; SELECT public.cancel_product_notification('${token}');`;
      const prepare = `SET ROLE service_role;
        SELECT public.prepare_email_attempt('${intent}','${lease}',notification_contract_test.payload('${intent}')) IS NOT NULL;`;
      const result = await concurrentLocked(cancelFirst ? cancel : prepare, cancelFirst ? prepare : cancel);
      assert.ok(result[cancelFirst ? 1 : 0].split('\n').includes(cancelFirst ? 'f' : 't'),
        'Cancellation and actual provider admission serialize in either ordering');
      if (cancelFirst) {
        assert.equal(sql(`SELECT state||':'||(first_attempt_at IS NULL)::text FROM private.email_intents WHERE id='${intent}';`).trim(), 'blocked:true',
          'Cancellation before admission leaves no provider handoff authority');
      } else {
        assert.equal(sql(`SELECT first_attempt_at IS NOT NULL AND request_payload IS NOT NULL FROM private.email_intents WHERE id='${intent}';`).trim(), 't',
          'Previously admitted exact content remains available for reconciliation after cancellation');
        sql(`SET ROLE service_role; SELECT public.finish_email_attempt('${intent}','${lease}','blocked',null,'product_request_not_eligible');`);
        assert.equal(sql(`SELECT state FROM private.email_intents WHERE id='${intent}';`).trim(), 'uncertain',
          'Cancellation after handoff cannot claim the provider message was recalled');
        sql(`UPDATE private.email_intents SET next_attempt_at=clock_timestamp()-interval '1 day' WHERE id='${intent}';`);
        assert.equal(sql(`SET ROLE service_role; SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.claim_email_intents(
          'sandbox','40000000-0000-0000-0000-000000000002',5)) work WHERE work->>'id'='${intent}');`).trim(), 't',
          'Reconciliation-only handoffs are excluded even when their next attempt is due');
        assert.equal(sql(`SET ROLE service_role; SELECT public.retry_email_delivery('${intent}',
          (SELECT updated_at FROM private.email_intents WHERE id='${intent}'));`).trim(), 'f',
          'Manual retry cannot authorize another send after attempted cancellation');
      }
    }
    await cancellationAdmissionRace('cancel-first',true);
    await cancellationAdmissionRace('admit-first',false);

    // Count all well-formed anonymous requests before lookup, including missing addresses.
    sql('DELETE FROM private.product_notification_recovery_limits;');
    for (let n = 1; n <= 29; n += 1) sql(recovery(`missing-global-${n}@example.invalid`,`global-${n}`,1000 + n*20));
    await concurrentLocked(recovery('missing-global-30@example.invalid','global-30',1600),
      recovery('missing-global-31@example.invalid','global-31',1620));
    assert.equal(sql("SELECT cardinality(occurrences) FROM private.product_notification_recovery_limits WHERE key='global';").trim(), "30",
      "Concurrent different-address requests cannot spend the final global hourly slot twice");
  }
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,
    legacyPreserved: true, fixedCalendarExpiry: true, independentMarketingConsent: true,
    canonicalPublication: !process.argv.includes("--enrollment-only"),
    actualConcurrentEnrollment: !process.argv.includes("--enrollment-only"),
    actualConcurrentEnrollmentPublication: !process.argv.includes("--enrollment-only"),
    actualConcurrentMaterialization: !process.argv.includes("--enrollment-only"),
    actualConcurrentRecovery: !process.argv.includes("--enrollment-only"),
    reconciliationExcludedFromRetry: !process.argv.includes("--enrollment-only"),
    actualConcurrentCancellationAdmission: !process.argv.includes("--enrollment-only"),
    actualConcurrentRecoveryGlobalLimit: !process.argv.includes("--enrollment-only"),
    providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
