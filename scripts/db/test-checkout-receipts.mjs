import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Disposable, synthetic PostgreSQL only. Never accepts provider credentials or a database URL.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `checkout_receipts_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const bind = (order, token, existingToken = null) =>
  `SELECT receipt_test.bind(${order}, ${token}, ${existingToken ?? "NULL"});`;
const result = (output) => {
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert.ok(line, "Receipt binding must return a JSON result");
  return JSON.parse(line);
};
const resetBudgets = () => sql("SELECT receipt_test.reset_budgets();");

function assertAccess(orders, tokens, expected = true) {
  for (const order of orders) {
    for (const token of tokens) {
      assert.equal(sql(`SET ROLE service_role;
        SELECT receipt_test.authorize(${order}, ${token});`).trim(), expected ? "t" : "f",
      `Token ${token} ${expected ? "must" : "must not"} authorize Order ${order}`);
    }
  }
}

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

// Keep the first transaction open until PostgreSQL proves the independent contender is blocked.
// Either response may win the browser cookie race after these transactions have committed.
async function concurrent(firstStatement, secondStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo receipt-held
`);
    await Promise.race([
      until(() => first.output().includes("receipt-held"), "First receipt barrier timed out"),
      first.done.then(() => { throw new Error("First connection exited before its barrier"); }),
    ]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='checkout_receipts_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([
      until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND application_name='checkout_receipts_contender'
          AND wait_event_type='Lock');`).trim() === "t", "Contender never waited on a database lock"),
      second.done.then(() => {
        throw new Error("Concurrent contender escaped before the first transaction committed");
      }),
    ]);
    first.child.stdin.end("COMMIT;\n");
    await Promise.all([first.done, second.done]);
    return [result(first.output()), result(second.output())];
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
  // The narrow checkout checkpoint omits the private schema created by catalog-editor history.
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  const suffixes = ["_checkout_admission.sql", "_checkout_payment_contracts.sql", "_checkout_receipts.sql"];
  const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`))
    .filter((file) => suffixes.some((suffix) => file.endsWith(suffix))).sort();
  for (const suffix of suffixes) {
    assert.equal(migrations.filter((file) => file.endsWith(suffix)).length, 1,
      `Exactly one ${suffix} migration is required`);
  }
  const fixture = source("supabase/tests/checkout_receipts.integration.sql")
    .split("-- APPLY RECEIPT MIGRATIONS");
  assert.equal(fixture.length, 2, "Receipt fixtures must explicitly distinguish pre-cutover Sessions");
  sql(fixture[0]);
  for (const migration of migrations) sql(source(`supabase/migrations/${migration}`));
  sql(fixture[1]);

  resetBudgets();
  sql("SELECT receipt_test.seed(1000);");
  const sameOrder = await concurrent(bind(1000, 1000), bind(1000, 1001));
  assert.deepEqual(sameOrder.map((value) => [value.allowed, value.reused]), [[true, false], [true, false]],
    "Two first requests receive independent candidates for the same guest Order");
  assertAccess([1000], [1000, 1001]);

  resetBudgets();
  sql("SELECT receipt_test.seed(1100, 1100); SELECT receipt_test.seed(1101, 1100);");
  const differentOrders = await concurrent(bind(1100, 1100), bind(1101, 1101));
  assert.deepEqual(differentOrders.map((value) => value.allowed), [true, true],
    "Concurrent cart generations can both bind receipts for their proven guest owner");
  assertAccess([1100, 1101], [1100, 1101]);

  resetBudgets();
  sql(`SELECT receipt_test.seed(1200);
    SET ROLE service_role;
    SELECT receipt_test.bind(1200, n) FROM generate_series(1200, 1203) n;`);
  const ownerLimit = await concurrent(bind(1200, 1204), bind(1200, 1205));
  assert.deepEqual(ownerLimit.map((value) => value.allowed), [true, false],
    "Only one contender can spend the final guest owner candidate slot");
  assert.ok(ownerLimit[1].retry_after_seconds > 0 && ownerLimit[1].retry_after_seconds <= 60,
    "A denied owner candidate has a bounded retry time");
  assertAccess([1200], [1200, 1201, 1202, 1203, 1204]);
  assertAccess([1200], [1205], false);

  resetBudgets();
  sql(`SELECT receipt_test.seed(n) FROM generate_series(1300, 1310) n;
    SET ROLE service_role;
    SELECT receipt_test.bind(n, n) FROM generate_series(1300, 1308) n;`);
  const accountLimit = await concurrent(bind(1309, 1309), bind(1310, 1310));
  assert.deepEqual(accountLimit.map((value) => value.allowed), [true, false],
    "Only one contender can spend the final shared account candidate slot");
  assert.ok(accountLimit[1].retry_after_seconds > 0 && accountLimit[1].retry_after_seconds <= 60,
    "A denied account candidate has a bounded retry time");
  assertAccess([1309], [1309]);
  assertAccess([1310], [1310], false);
  assertAccess([1309], [1310], false);
  assertAccess([1310], [1309], false);

  resetBudgets();
  sql(`SELECT receipt_test.seed(1400, 1400);
    SET ROLE service_role;
    SELECT receipt_test.bind(1400, 1400);
    RESET ROLE;
    SELECT receipt_test.seed(1401, 1400); SELECT receipt_test.seed(1402, 1400);`);
  const reusedAndFresh = await concurrent(bind(1401, 1401, 1400), bind(1402, 1402));
  assert.deepEqual(reusedAndFresh.map((value) => [value.allowed, value.reused]), [[true, true], [true, false]],
    "An existing capability and a concurrent fresh candidate preserve symmetric same-owner access");
  assertAccess([1400, 1401, 1402], [1400, 1402]);
  assertAccess([1400, 1401, 1402], [1401], false);

  resetBudgets();
  sql(`SELECT receipt_test.seed(1500); SET ROLE service_role;
    SELECT receipt_test.bind(1500,n) FROM generate_series(1500,1504) n;`);
  resetBudgets();
  sql(`SET ROLE service_role;
    SELECT receipt_test.bind(1500,n) FROM generate_series(1505,1506) n;`);
  const cohortLimit = await concurrent(bind(1500,1507),bind(1500,1508));
  assert.deepEqual(cohortLimit.map((value) => value.allowed), [true,false],
    "Only one contender can claim the eighth active cohort capability");
  assertAccess([1500],[1500,1507]);
  assertAccess([1500],[1508],false);

  console.log(JSON.stringify({
    status: "passed", postgresMajor: 17, checkpoint: "schema-only-2026-09-14",
    concurrentSameOrderCandidates: true, concurrentDifferentGenerationCandidates: true,
    concurrentOwnerFinalSlot: true, concurrentAccountFinalSlot: true,
    concurrentExistingAndFreshCandidate: true, eitherCookiePreservesProvenGuestReceipts: true,
    concurrentCohortFinalSlot: true,
    ownerCandidateLimit: 5, aggregateCandidateLimit: 10,
    providerMutations: 0,
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
