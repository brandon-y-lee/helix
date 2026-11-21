import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const testSql = file => readFileSync(new URL("../../supabase/tests/" + file, import.meta.url), "utf8");

function openSession(stack, database) {
  const child = stack.session(database);
  const output = { stdout: "", stderr: "" };
  for (const stream of ["stdout", "stderr"]) {
    child[stream].setEncoding("utf8").on("data", value => { output[stream] += value; });
  }
  return { child, output, closed: once(child, "close") };
}

async function until(observed, failure) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (observed()) return;
    await delay(40);
  }
  assert.fail(failure);
}

// Keep the first real service call open until PostgreSQL sees the second
// waiting on that backend, then check both committed outcomes.
async function contend({ stack, database, ownerSql }, fixture, left, right) {
  const first = openSession(stack, database);
  const second = openSession(stack, database);
  try {
    first.child.stdin.write(fixture + "\nSET application_name='first_order_race_winner'; BEGIN; SET LOCAL ROLE service_role;\n" +
      left.sql + "\n\\echo first-order-held\n");
    await until(() => first.output.stdout.includes("first-order-held") || !!first.child.exitCode,
      "First service call did not reach its transaction barrier");
    assert.ok(first.output.stdout.split(/\s+/).includes(left.state), first.output.stderr || first.output.stdout);
    second.child.stdin.end(fixture + "\nSET application_name='first_order_race_loser'; SET ROLE service_role;\n" + right.sql);
    await until(() => {
      assert.equal(second.child.exitCode, null, second.output.stderr || "Second call finished without competing");
      return ownerSql(`SELECT EXISTS (SELECT FROM pg_stat_activity a JOIN pg_stat_activity b ON a.datid=b.datid
        WHERE a.datname=current_database() AND a.application_name='first_order_race_winner'
          AND b.application_name='first_order_race_loser' AND a.pid=ANY(pg_blocking_pids(b.pid)));`) === "t";
    }, "The competing service call did not wait for the first transaction");
    first.child.stdin.end("COMMIT;\n");
    for (const session of [first, second]) assert.equal((await session.closed)[0], 0, session.output.stderr);
    assert.equal(second.output.stdout.trim(), right.state, "Concurrent service call returned the wrong outcome");
  } finally {
    for (const session of [first, second]) {
      if (!session.child.stdin.destroyed && !session.child.stdin.writableEnded) session.child.stdin.end("ROLLBACK;\n");
    }
    await Promise.all([first.closed, second.closed]);
  }
}

const asJson = obj => "'" + JSON.stringify(obj).replaceAll("'", "''") + "'::jsonb";

async function raceForRetry(context, fixture) {
  const claim = JSON.parse(context.ownerSql(fixture +
    "\nSELECT pg_temp.make_retry_test_order('competing_recovery',interval '1 minute');"));
  assert.match(claim.requestSha256, /^[0-9a-f]{64}$/);
  const sql = `SELECT public.start_business_checkout_send(j->>'environment',j->>'accountId',(j->>'orderId')::uuid,
    (j->>'attemptId')::uuid,(j->>'bindingNonce')::uuid,j->>'requestSha256')->>'state'
    FROM (SELECT ${asJson(claim)} AS j) input;`;
  await contend(context, fixture, { sql, state: "recover" }, { sql, state: "send_started" });
  const unchanged = context.ownerSql(`SELECT count(*)=1 AND bool_and(b.idempotency_key=j->>'idempotencyKey'
    AND b.terms=j->'terms' AND b.send_request_sha256=j->>'requestSha256' AND r.state='held'
    AND b.first_send_at=(j->>'firstSendAt')::timestamptz AND b.last_send_attempt_at>b.first_send_at
    AND b.session_id IS NULL AND b.verified_facts IS NULL)
    FROM (SELECT ${asJson(claim)} AS j) input JOIN private.live_checkout_bindings b ON b.attempt_id=(j->>'attemptId')::uuid
    JOIN private.live_checkout_stock_reservations r ON r.order_id=b.order_id AND r.attempt_id=b.attempt_id;`);
  assert.equal(unchanged, "t", "The competing retry changed the provider request, payment evidence, or its stock");
}

async function raceForFinalUnit(context, fixture) {
  const { ownerSql } = context;
  ownerSql("UPDATE private.live_checkout_sale_policy SET approved_units=allocated_units+1;");
  const makeCart = purpose => JSON.parse(ownerSql(fixture + "\nSELECT pg_temp.make_test_first_cart('" + purpose + "',1);"));
  const winnerCart = makeCart("last_unit_winner");
  const loserCart = makeCart("last_unit_loser");
  const prepare = cart => "SELECT pg_temp.prepare_test_first_cart(" + asJson(cart) + ")->>'state';";
  await contend(context, fixture, { sql: prepare(winnerCart), state: "reserved" },
    { sql: prepare(loserCart), state: "unavailable" });
  for (const id of [winnerCart.cartId, loserCart.cartId]) assert.match(id, /^[0-9a-f-]{36}$/);
  const allocation = ownerSql(`SELECT jsonb_build_object('soldOut',p.approved_units=p.allocated_units,
     'winner',(SELECT count(*) FROM private.live_checkout_stock_reservations r JOIN public.orders o ON o.id=r.order_id
       WHERE o.cart_id='${winnerCart.cartId}' AND r.quantity=1 AND r.state='held'),
     'loser',(SELECT count(*) FROM public.orders WHERE cart_id='${loserCart.cartId}'))
     FROM private.live_checkout_sale_policy p;`);
  assert.deepEqual(JSON.parse(allocation), { soldOut: true, winner: 1, loser: 0 });
}

function enrollSyntheticSale(ownerSql, plan) {
  const manualSql = readFileSync(new URL("../../supabase/operations/business-checkout/enroll-sale-policy.sql", import.meta.url), "utf8");
  const run = (operation, input) => {
    const json = JSON.stringify(input).replaceAll("'", "''");
    const variables = "SELECT '" + operation + "' AS operation, '" + json + "' AS sale_policy \\gset\n";
    return JSON.parse(ownerSql(variables + manualSql));
  };
  const identity = Object.fromEntries(["project_ref", "provider_environment", "account_id", "variant_id", "sku"]
    .map(key => [key, plan[key]]));
  const enrolled = run("enroll", plan);
  assert.deepEqual(enrolled.approved_plan, plan);
  assert.equal(enrolled.enabled, false);
  assert.equal(enrolled.allocated_units, 0);
  assert.equal(enrolled.available_units, plan.approved_units);
  assert.deepEqual(run("enroll", plan), enrolled, "Enrollment replay cannot open sales or replenish stock");
  assert.deepEqual(run("inspect", identity), enrolled);
  assert.throws(() => run("enroll", { ...plan, approved_units: plan.approved_units + 1 }), /differs from the enrolled plan/);
  assert.throws(() => run("open", { ...plan, expected_policy_version: "0" }), /fresh policy readback/);
  const firstOpen = run("open", { ...plan, expected_policy_version: enrolled.policy_version });
  assert.equal(firstOpen.enabled, true);
  const paused = run("pause", identity);
  assert.equal(paused.enabled, false);
  assert.notEqual(paused.policy_version, enrolled.policy_version);
  assert.deepEqual(run("enroll", plan), paused);
  assert.throws(() => run("open", { ...plan, expected_policy_version: enrolled.policy_version }), /fresh policy readback/);
  const current = run("inspect", identity);
  const reopened = run("open", { ...plan, expected_policy_version: current.policy_version });
  assert.equal(reopened.enabled, true);
  assert.equal(reopened.available_units, plan.approved_units);
}

export async function runFirstOrderTests(context) {
  const { database, environment, ownerSql, stack } = context;
  assert.match(stack.nonce, /^[0-9a-f]{12}$/);
  assert.ok(environment === "development" || environment === "production");
  assert.equal(database, "helix_bootstrap_" + (environment === "development" ? "fresh_a_" : "fresh_b_") + stack.nonce);
  const project = environment === "development" ? "zyfkunnpnlmgvrojmrbg" : "erasogmsqpgiirovubjh";
  const guard = `SELECT current_database()='${database}' AND inet_client_addr() IS NULL AND current_user='postgres'
    AND EXISTS (SELECT FROM private.helix_environment WHERE singleton AND (environment,project_ref)=('${environment}','${project}'))
    AND NOT EXISTS (SELECT FROM private.live_checkout_sale_policy)
    AND NOT EXISTS (SELECT FROM private.live_checkout_stock_reservations);`;
  assert.equal(ownerSql(guard), "t", "First-order tests require the empty disposable Unix-socket fixture");
  const setup = testSql("business_checkout_test_setup.sql");
  const fixture = testSql("business_checkout_fixture.sql");
  const plan = JSON.parse(ownerSql("BEGIN;\n" + setup + "\nCOMMIT;"));
  enrollSyntheticSale(ownerSql, plan);
  const emptyInventory = "SELECT (SELECT allocated_units FROM private.live_checkout_sale_policy WHERE singleton)=0 " +
    "AND NOT EXISTS (SELECT FROM private.live_checkout_stock_reservations);";
  ownerSql(["BEGIN;", fixture, testSql("business_checkout_admission.integration.sql"), "ROLLBACK;"].join("\n"));
  assert.equal(ownerSql(emptyInventory), "t", "The rolled-back admission proof leaked an allocation");
  ownerSql(["BEGIN;", fixture, testSql("business_checkout_inventory.integration.sql"),
    testSql("business_fulfillment.integration.sql"), "ROLLBACK;"].join("\n"));
  assert.equal(ownerSql(emptyInventory), "t", "The rolled-back stock and fulfillment proof leaked an allocation");
  await raceForRetry(context, fixture);
  await raceForFinalUnit(context, fixture);
}
