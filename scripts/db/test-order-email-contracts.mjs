import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// This runner has no database-URL input and only operates a labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `order_email_contracts_${process.pid}_${Date.now()}`;
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
\\echo email-contract-held
`);
    await Promise.race([until(() => first.output().includes("email-contract-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='order_email_contract_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='order_email_contract_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the finalization lock"),
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

async function concurrentClaims() {
  const first = session();
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
SELECT public.claim_email_intents('sandbox',payment_contract_test.id('parallel-lease',1200),1);
\\echo email-claim-held
`);
    await Promise.race([until(() => first.output().includes("email-claim-held"), "First claim barrier timed out"),
      first.done.then(() => { throw new Error("First claim exited before its barrier"); })]);
    const second = JSON.parse(sql(`SET statement_timeout='2s'; SET ROLE service_role;
      SELECT public.claim_email_intents('sandbox',payment_contract_test.id('parallel-lease',1201),1);`));
    assert.deepEqual(second, [], "A concurrent dispatcher skips the already locked message without waiting");
    first.child.stdin.end("COMMIT;\n");
    await first.done;
    const claimed = JSON.parse(first.output().split("\n").find((line) => line.startsWith("[")));
    assert.equal(claimed.length, 1, "Only the first overlapping dispatcher claims the message");
    return claimed[0];
  } finally {
    if (!first.child.stdin.destroyed) first.child.stdin.end("ROLLBACK;\n");
    await first.done.catch(() => {});
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

  sql(`SELECT payment_contract_test.seed(1200,true); SET ROLE service_role;
    SELECT payment_contract_test.prepare_and_bind(1200);`);
  await concurrentLocked("SELECT payment_contract_test.settle(1200);");
  assert.equal(sql(`SELECT count(*) FROM private.email_intents
    WHERE order_id=payment_contract_test.id('order',1200);`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM private.checkout_verified_payments
    WHERE order_id=payment_contract_test.id('order',1200);`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM public.rewards_ledger_entries
    WHERE order_id=payment_contract_test.id('order',1200);`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM public.cart_items
    WHERE cart_id=payment_contract_test.id('cart',1200);`).trim(), "0");

  const claimed = await concurrentClaims();
  sql(`SET ROLE service_role; SELECT public.prepare_email_attempt('${claimed.id}'::uuid,
    payment_contract_test.id('parallel-lease',1200),
    email_contract_test.payload('synthetic@example.invalid','${claimed.id}'::uuid));`);
  const callbackStatement = `SELECT public.record_email_delivery_event('evt_concurrent','sandbox',
    '${claimed.id}'::uuid,'email_synthetic_1200','email.delivered',now(),
    'Helix Demo <onboarding@resend.dev>','synthetic@example.invalid');`;
  const callbacks = await concurrentLocked(callbackStatement);
  assert.deepEqual(callbacks.map((out) => out.split("\n").find((line) => /^(matched|duplicate)$/.test(line))),
    ["matched", "duplicate"], "Overlapping callback connections persist one delivery event");
  assert.equal(sql("SELECT count(*) FROM private.email_event_receipts WHERE event_id='evt_concurrent';").trim(), "1");

  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,
    existingPaymentContractsPreserved: true, atomicPaymentProofAndIntent: true,
    invalidRecipientDoesNotRejectPayment: true,
    receiptUsesVerifiedDelivery: true, disabledByDefault: true, noHistoricalBackfill: true,
    actualConcurrentFinalization: true, actualConcurrentClaims: true, actualConcurrentCallbacks: true,
    oneConfirmation: true, staleWorkerFenced: true, frozenRetryEnvelope: true,
    boundedRetriesAndIdempotencyWindow: true, boundedMaintenanceBatches: true,
    outOfOrderCallbacks: true, retainedDeduplicationIdentity: true,
    privateForcedRls: true, serviceOnlyRpcs: true, providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
