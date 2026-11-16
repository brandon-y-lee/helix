import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Disposable synthetic PostgreSQL only. Never accepts credentials or a database URL.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `checkout_payment_contracts_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");

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

// The second independent connection must actually wait on a Postgres lock.
async function concurrent(firstStatement, secondStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo payment-contract-held
`);
    await Promise.race([until(() => first.output().includes("payment-contract-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='checkout_payment_contract_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='checkout_payment_contract_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the database lock"),
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
  const [fixtures, assertions] = source("supabase/tests/checkout_payment_contracts.integration.sql")
    .split("-- APPLY PAYMENT CONTRACT MIGRATION");
  assert.ok(assertions, "Payment contract test must retain its migration boundary");
  sql(fixtures);
  const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
  for (const suffix of ["_checkout_admission.sql", "_checkout_payment_contracts.sql"]) {
    const matching = migrations.filter((file) => file.endsWith(suffix));
    assert.equal(matching.length, 1, `Expected exactly one ${suffix} migration`);
    sql(source(`supabase/migrations/${matching[0]}`));
  }
  sql(assertions);
  sql(`SET ROLE service_role; SELECT status FROM public.finalize_verified_checkout_payment(
    payment_contract_test.id('order',18),(payment_contract_test.facts(18)->>'attemptId')::uuid,
    'cs_test_contract18','checkout_v1',payment_contract_test.facts(18)||jsonb_build_object(
      'contractVersion','checkout_v1','billingAddress',
      (SELECT snapshot->'billing_address' FROM payment_contract_test.historical_delivery_order)),25);`);
  const reloadedDelivery = JSON.parse(sql(`SET ROLE service_role;
    SELECT public.read_verified_checkout_delivery(payment_contract_test.id('order',18),'cs_test_contract18');`));
  assert.equal(reloadedDelivery.shippingAddress.line1, "123 Synthetic St",
    "A new database connection reloads verified shipping after the transaction commits");
  assert.equal(reloadedDelivery.billingAddress.line1, "999 Billing St");
  assert.equal(sql(`SELECT to_jsonb(o)=history.snapshot FROM public.orders o
    CROSS JOIN payment_contract_test.historical_delivery_order history
    WHERE o.id=payment_contract_test.id('order',18);`).trim(), "t");
  sql("SELECT payment_contract_test.seed(1000, true); SET ROLE service_role; SELECT payment_contract_test.prepare_and_bind(1000);");
  const statement = "SELECT payment_contract_test.settle(1000);";
  const outcomes = await concurrent(statement, statement);
  assert.deepEqual(outcomes.map((out) => out.split("\n").find((line) => /^\d+$/.test(line))), ["1", "0"],
    "Concurrent finalizers clear the purchased cart line exactly once");
  assert.equal(sql(`SELECT count(*) FROM public.rewards_ledger_entries
    WHERE order_id=payment_contract_test.id('order',1000);`).trim(), "1");
  assert.equal(sql(`SELECT points_balance FROM public.rewards_accounts
    WHERE user_id=payment_contract_test.id('user',1000);`).trim(), "25");
  assert.equal(sql(`SELECT count(*) FROM public.cart_items
    WHERE cart_id=payment_contract_test.id('cart',1000);`).trim(), "0");
  const refundRace = await concurrent(`UPDATE public.orders SET status='refunded',refunded_at=now()
      WHERE id=payment_contract_test.id('order',1000);
    UPDATE public.payment_attempts SET status='refunded' WHERE order_id=payment_contract_test.id('order',1000);
    SELECT status FROM public.orders WHERE id=payment_contract_test.id('order',1000);`,
  "SELECT status FROM payment_contract_test.finalize(1000);");
  assert.deepEqual(refundRace.map((out) => out.split("\n").find((line) => line === "refunded")),
    ["refunded", "refunded"], "Concurrent late payment verification preserves the completed refund");
  assert.equal(sql(`SELECT count(*) FROM private.checkout_verified_payments
    WHERE order_id=payment_contract_test.id('order',1000);`).trim(), "1");
  assert.equal(sql(`SELECT count(*) FROM public.rewards_ledger_entries
    WHERE order_id=payment_contract_test.id('order',1000);`).trim(), "1");
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,
    immutableAcceptedTerms: true, legacyEligibilityFrozenAtMigration: true,
    stableAttemptAcrossClaimRotation: true, staleSessionAndAttemptRejected: true,
    verifiedAmountsGuarded: true, rollbackAndRetry: true,
    concurrentFinalization: true, singleCartEffect: true, singleRewardEffect: true,
    concurrentRefundPreserved: true, immutableAttemptIdentity: true, attachBeforeBindRecovery: true,
    historicalOrderDeliveryPreserved: true, verifiedDeliveryReload: true, deliveryPersistenceRollbackAndRetry: true,
    durablePrivateExceptions: true, serviceOnlyRpcGrants: true, privateContractRls: true,
    providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
