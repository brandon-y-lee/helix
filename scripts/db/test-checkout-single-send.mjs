import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Disposable synthetic PostgreSQL only. Never accepts credentials or a database URL.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `checkout_single_send_${process.pid}_${Date.now()}`;
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
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='checkout_single_send_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='checkout_single_send_contender'
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
  docker(["exec", container, "createdb", "-U", "postgres", database]); created = true;
  assert.equal(sql("SELECT current_setting('server_version_num')::integer / 10000;").trim(), "17");
  sql(source("supabase/tests/checkpoints/checkout-current.sql"));
  loadCheckoutPaymentTestEffects(sql, source);
  for (const [file, names] of [
    ["20260819183701_contract_legacy_loyalty_implementation.sql", ["reserve_rewards_points", "release_rewards_reservations_for_order", "fail_checkout_attempt", "cancel_checkout_order_without_session"]],
    ["20260801140000_checkout_terminal_state_cas.sql", ["claim_checkout_attempt", "prepare_checkout_attempt", "attach_checkout_session"]],
    ["20260801060000_cart_server_integrity.sql", ["merge_guest_cart"]],
  ]) {
    const definitions = source(`supabase/migrations/${file}`);
    for (const name of names) {
      const start = definitions.indexOf(`create or replace function public.${name}(`);
      const end = definitions.indexOf("\n$$;", start) + 4;
      assert.ok(start >= 0 && end > start, `Actual predecessor ${name} is required`);
      sql(definitions.slice(start, end));
    }
  }
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  sql(source("supabase/tests/checkout_payment_contracts.integration.sql").split("-- APPLY PAYMENT CONTRACT MIGRATION")[0]);
  const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
  for (const suffix of ["_checkout_admission.sql", "_checkout_payment_contracts.sql"]) {
    const files = migrations.filter((file) => file.endsWith(suffix)); assert.equal(files.length, 1);
    sql(source(`supabase/migrations/${files[0]}`));
  }
  sql(`SET ROLE service_role; SELECT payment_contract_test.seed(90);
    SELECT public.prepare_checkout_payment_contract(payment_contract_test.id('order',90),payment_contract_test.id('claim',90),payment_contract_test.key(90),payment_contract_test.terms(90));`);
  const files = migrations.filter((file) => file.endsWith("_checkout_single_send.sql")); assert.equal(files.length, 1);
  sql(source(`supabase/migrations/${files[0]}`));
  sql(source("supabase/tests/checkout_single_send.integration.sql"));
  sql(`SET ROLE service_role; SELECT payment_contract_test.seed(200); SELECT single_send_test.prepare(200);`);
  const sends = await concurrent("SELECT single_send_test.send(200);", "SELECT single_send_test.send(200);");
  assert.deepEqual(sends.map((value) => value.split("\n").find((line) => line === "t" || line === "f")), ["t", "f"], "Concurrent requests permit exactly one Session.create invocation");
  const bindings = await concurrent("SELECT single_send_test.bind(200);", "SELECT single_send_test.bind(200);");
  assert.deepEqual(bindings.map((value) => value.split("\n").find((line) => line === "t" || line === "f")), ["t", "t"], "Response and webhook retain the same atomic binding");
  sql(`SET ROLE service_role; SELECT payment_contract_test.seed(201); SELECT single_send_test.prepare(201);`);
  const cancel = await concurrent("SELECT public.cancel_checkout_order_without_session(payment_contract_test.id('order',201),'Cancelled before send');", "SELECT single_send_test.send(201);");
  assert.deepEqual(cancel.map((value) => value.split("\n").find((line) => line === "t" || line === "f")), ["t", "f"], "Cancellation that commits first prevents a later send");
  sql(`SET ROLE service_role; SELECT payment_contract_test.seed(202); SELECT single_send_test.prepare(202);`);
  const sent = await concurrent("SELECT single_send_test.send(202);", "SELECT public.cancel_checkout_order_without_session(payment_contract_test.id('order',202),'Cancellation after send');");
  assert.deepEqual(sent.map((value) => value.split("\n").find((line) => line === "t" || line === "f")), ["t", "f"], "A committed send prevents unsafe reservation release");
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, singleProviderInvocation: true,
    unknownReservationsPreserved: true, atomicBinding: true, cartGuard: true, privateGrants: true, actualLockRaces: 4 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
