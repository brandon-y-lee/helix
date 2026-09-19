import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// This accepts a labeled local container only, never credentials or a remote database URL.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `payment_inbox_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

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

// Prove that the second independent connection really waits on a PostgreSQL lock.
async function concurrent(firstStatement, secondStatement, firstRole = "service_role", whileBlocked) {
  assert.ok(["service_role", "postgres"].includes(firstRole));
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE ${firstRole};
${firstStatement}
\\echo payment-inbox-held
`);
    await Promise.race([
      until(() => first.output().includes("payment-inbox-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before its barrier"); }),
    ]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='payment_inbox_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([
      until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND application_name='payment_inbox_contender'
          AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the database lock"),
      second.done.then(() => { throw new Error("Contender escaped before the first transaction committed"); }),
    ]);
    if (whileBlocked) await whileBlocked();
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
  const [fixtures, assertions] = source("supabase/tests/payment_inbox.integration.sql")
    .split("-- APPLY PAYMENT INBOX MIGRATION");
  assert.ok(assertions, "Payment inbox tests must retain the migration boundary");
  sql(fixtures);
  // Load the exact #410 exception implementation; never substitute test-only production RPCs.
  const contractMigration = source("supabase/migrations/20260919001919_checkout_payment_contracts.sql");
  const exceptionTable = contractMigration.match(/create table private\.checkout_payment_exceptions \([\s\S]*?\n\);/i)?.[0];
  assert.ok(exceptionTable, "Existing payment exception table must be available from its actual migration");
  sql(exceptionTable);
  for (const functionName of ["record_checkout_payment_exception", "resolve_checkout_payment_exceptions"]) {
    const functionSql = contractMigration.match(new RegExp(`create function public\\.${functionName}\\([\\s\\S]*?end \\$\\$;`, "i"))?.[0];
    assert.ok(functionSql, `Existing ${functionName} implementation must be available from its actual migration`);
    sql(functionSql);
  }
  sql(`ALTER TABLE private.checkout_payment_exceptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE private.checkout_payment_exceptions FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON private.checkout_payment_exceptions FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE ON private.checkout_payment_exceptions TO service_role;
    REVOKE ALL ON FUNCTION public.record_checkout_payment_exception(uuid,uuid,text,text,text,text,integer),
      public.resolve_checkout_payment_exceptions(uuid,text,text) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.record_checkout_payment_exception(uuid,uuid,text,text,text,text,integer),
      public.resolve_checkout_payment_exceptions(uuid,text,text) TO service_role;`);
  const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`))
    .filter((file) => file.endsWith("_payment_event_inbox.sql"));
  assert.equal(migrations.length, 1, "Expected exactly one payment inbox migration");
  sql(source(`supabase/migrations/${migrations[0]}`));
  sql(assertions);
  const duplicateReceipts = await concurrent(
    "SELECT public.receive_payment_event(payment_inbox_test.envelope(1000))->>'status';",
    "SELECT public.receive_payment_event(payment_inbox_test.envelope(1000))->>'status';",
  );
  assert.deepEqual(duplicateReceipts.map((out) => out.split("\n").find((line) => ["received", "duplicate"].includes(line))),
    ["received", "duplicate"], "Concurrent webhook deliveries share one committed receipt");
  assert.equal(sql("SELECT count(*) FROM private.payment_event_inbox WHERE event_id='evt_inbox1000';").trim(), "1");
  const overlappingRuns = await concurrent(
    "SELECT CASE WHEN public.claim_payment_worker_run() IS NULL THEN 'busy' ELSE 'acquired' END;",
    "SELECT CASE WHEN public.claim_payment_worker_run() IS NULL THEN 'busy' ELSE 'acquired' END;",
  );
  assert.deepEqual(overlappingRuns.map((out) => out.split("\n").find((line) => ["busy", "acquired"].includes(line))),
    ["acquired", "busy"], "Concurrent invocations acquire only one account run lease");
  sql(`SET ROLE service_role; SELECT public.finish_payment_worker_run(
    (SELECT run_token FROM private.payment_worker_health),0,0);`);

  const oldClaim = JSON.parse(sql("SET ROLE service_role; SELECT payment_inbox_test.start(1001,'charge');"));
  sql(`UPDATE private.payment_worker_health SET run_expires_at=clock_timestamp()-interval '1 second';
    UPDATE private.payment_event_inbox SET lease_expires_at=clock_timestamp()-interval '1 second'
      WHERE event_id='evt_inbox1001';`);
  const staleWrites = await concurrent(`
    SELECT public.claim_payment_worker_run();
    SELECT public.claim_payment_events((SELECT run_token FROM private.payment_worker_health),1);
    SELECT public.record_payment_refund_observations((SELECT run_token FROM private.payment_worker_health),
      id,lease_token,version,jsonb_build_array(payment_inbox_test.refund(1001)))
      FROM private.payment_event_inbox WHERE event_id='evt_inbox1001';`, `
    SELECT payment_inbox_test.finish(${literal(JSON.stringify(oldClaim))}::jsonb);
    SELECT payment_inbox_test.record_refund(${literal(JSON.stringify(oldClaim))}::jsonb,
      jsonb_build_array(payment_inbox_test.refund(1001,'pending')));`);
  assert.deepEqual(staleWrites[1].trim().split("\n"), ["f", "f"],
    "Stale completion and refund writer wait for takeover and then lose their fencing check");
  assert.equal(sql("SELECT status FROM private.payment_refund_observations WHERE refund_id='re_inbox1001';").trim(), "succeeded");
  sql(`SET ROLE service_role; SELECT public.finish_payment_event(
    (SELECT run_token FROM private.payment_worker_health),id,lease_token,version,'processed')
    FROM private.payment_event_inbox WHERE event_id='evt_inbox1001';
    SELECT public.finish_payment_worker_run((SELECT run_token FROM private.payment_worker_health),1,0);`);

  sql(`SET ROLE service_role; SELECT payment_inbox_test.seed_replay(1100); SELECT payment_inbox_test.replay(1100,1100);`);
  const sameReplay = await concurrent("SELECT payment_inbox_test.replay(1100,1100,false)->>'status';",
    "SELECT payment_inbox_test.replay(1100,1100,false)->>'status';");
  assert.deepEqual(sameReplay.map((out) => out.split("\n").find((line) => ["applied", "duplicate"].includes(line))),
    ["applied", "duplicate"], "Concurrent applications of one replay UUID create one audit and one new cycle");
  assert.equal(sql("SELECT count(*) FROM private.payment_replay_audit WHERE request_id=md5('payment-inbox:request:1100')::uuid;").trim(), "2");

  sql(`SET ROLE service_role; SELECT payment_inbox_test.seed_replay(1101);
    SELECT payment_inbox_test.replay(1101,1101); SELECT payment_inbox_test.replay(1101,1102);`);
  const versionRace = await concurrent("SELECT payment_inbox_test.replay(1101,1101,false)->>'status';",
    "SELECT payment_inbox_test.replay(1101,1102,false)->>'status';");
  assert.deepEqual(versionRace.map((out) => out.split("\n").find((line) => ["applied", "conflict"].includes(line))),
    ["applied", "conflict"], "Two reviewed replay intents cannot both consume the same item version");

  sql(`SET ROLE service_role; SELECT payment_inbox_test.seed_replay(1103); SELECT payment_inbox_test.replay(1103,1103);`);
  const revocationRace = await concurrent(`UPDATE public.admin_memberships SET active=false
    WHERE user_id=md5('payment-inbox:actor:1')::uuid;`,
  "SELECT payment_inbox_test.replay(1103,1103,false)->>'status';", "postgres");
  assert.equal(revocationRace[1].trim(), "denied", "Replay checks membership after a racing administrator revocation commits");
  assert.equal(sql("SELECT status||':'||version FROM private.payment_event_inbox WHERE event_id='evt_inbox1103';").trim(), "dead_letter:1");
  sql("UPDATE public.admin_memberships SET active=true WHERE user_id=md5('payment-inbox:actor:1')::uuid;");

  // Let the real #410 exception writer block after its initial fencing check.
  // The lease expires while blocked, so a final guard must roll back every write.
  sql(`INSERT INTO public.orders(id,stripe_checkout_session_id,stripe_payment_intent_id,status,total_cents)
    VALUES(md5('payment-inbox:order:1200')::uuid,'cs_test_inbox1200','pi_inbox1200','paid',2500);
    SET ROLE service_role; SELECT public.record_checkout_payment_exception(md5('payment-inbox:order:1200')::uuid,
      NULL,'cs_test_inbox1200','full_refund_reconciliation_failed','pi_inbox1200','unknown',0);`);
  const blockedClaim = JSON.parse(sql("SET ROLE service_role; SELECT payment_inbox_test.start(1200,'charge');"));
  sql(`UPDATE private.payment_worker_health SET run_expires_at=clock_timestamp()+interval '5 seconds';
    UPDATE private.payment_event_inbox SET lease_expires_at=clock_timestamp()+interval '5 seconds'
      WHERE event_id='evt_inbox1200';`);
  const recordBlockedFacts = `public.record_payment_refund_observations(
    ${literal(blockedClaim.runToken)}::uuid,${literal(blockedClaim.id)}::uuid,
    ${literal(blockedClaim.leaseToken)}::uuid,${blockedClaim.version},
    jsonb_build_array(payment_inbox_test.refund(1200)||jsonb_build_object('orderId',md5('payment-inbox:order:1200')::uuid)),
    jsonb_build_object('orderId',md5('payment-inbox:order:1200')::uuid,'sessionId','cs_test_inbox1200',
      'paymentIntentId','pi_inbox1200','paymentStatus','refunded','amountCents',2500))`;
  await concurrent(`SELECT 1 FROM private.checkout_payment_exceptions
      WHERE order_id=md5('payment-inbox:order:1200')::uuid FOR UPDATE;`,
  `DO $$ BEGIN
    BEGIN PERFORM ${recordBlockedFacts};
      RAISE EXCEPTION 'expired refund writer escaped after waiting on the exception row';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
  END $$;`, "postgres", async () => {
    await until(() => sql("SELECT run_expires_at < clock_timestamp() FROM private.payment_worker_health;").trim() === "t",
      "Synthetic lease did not expire while the exception writer waited");
  });
  assert.equal(sql("SELECT count(*) FROM private.payment_refund_observations WHERE refund_id='re_inbox1200';").trim(), "0",
    "Lease expiry after the exception row wait rolls back refund observations");
  assert.equal(sql("SELECT payment_status||':'||amount_cents FROM private.checkout_payment_exceptions WHERE order_id=md5('payment-inbox:order:1200')::uuid;").trim(),
    "unknown:0", "Late exception update rolls back with the refund facts");
  console.log(JSON.stringify({ status: "passed", postgresMajor: 17, durableReceipt: true,
    concurrentDuplicateReceipt: true, immutableReceiptIdentity: true, receiptFailureRollback: true,
    legacyAuditPreserved: true, legacyProcessingRecovered: true, invalidLegacyIncident: true,
    customerRoleDenial: true, privateTableRls: true, nullRunDenied: true,
    leaseTakeoverFencing: true, refundWriterFencing: true, boundedAttempts: 12, boundedClaimsPerRun: 20,
    activeAdministratorReplay: true, exactReplayPreview: true, immutableReplayHistory: true,
    replayAuditRollback: true, concurrentReplayDeduplication: true, concurrentReplayVersionConflict: true,
    concurrentAdministratorRevocation: true, refundExceptionAtomicity: true,
    refundResolutionRollback: true, nonMonotoneRefundHistory: true, exceptionLockExpiryRollback: true,
    boundedMaintenancePerCall: 20, ownerScopedCurrentHistoryExceptions: true,
    lockBarrierRaces: 7, providerMutations: 0 }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
