import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Disposable, synthetic PostgreSQL only. Never accepts provider credentials or a database URL.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `checkout_admission_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");

const admit = (account, n) => `SELECT admission_test.admit('${account}', ${n});`;
const refresh = (account, target) => `SELECT public.claim_checkout_refresh('${account}',
  'shipping_rate', NULL, NULL, '${target}');`;
const result = (output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{")));

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

// Hold the first transaction open until PostgreSQL proves the contender is blocked.
// This tests actual independent connections, not Promise scheduling or serialized mocks.
async function concurrent(firstStatement, secondStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo admission-held
`);
    await Promise.race([until(() => first.output().includes("admission-held"), "First admission barrier timed out"),
      first.done.then(() => { throw new Error("First connection exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='checkout_admission_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='checkout_admission_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Contender never waited on a database lock"),
      second.done.then(() => { throw new Error("Concurrent contender escaped before the first transaction committed"); })]);
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
  // The narrow checkout checkpoint omits the private schema created by catalog-editor history.
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`))
    .filter((file) => file.endsWith("_checkout_admission.sql"));
  assert.ok(migrations.length <= 1, "Admission migration must be unambiguous");
  for (const migration of migrations) sql(source(`supabase/migrations/${migration}`));
  sql(source("supabase/tests/checkout_admission.integration.sql"));

  sql(`SELECT admission_test.seed(n, 100) FROM generate_series(1000, 1005) n;
    SET ROLE service_role;
    SELECT admission_test.admit('acct_concurrentowner', n) FROM generate_series(1000, 1003) n;`);
  const owner = await concurrent(admit("acct_concurrentowner", 1004), admit("acct_concurrentowner", 1005));
  assert.deepEqual(owner.map((value) => value.allowed), [true, false], "Only one caller can spend the final owner slot");

  sql(`SELECT admission_test.seed(n) FROM generate_series(1100, 1110) n;
    SET ROLE service_role;
    SELECT admission_test.admit('acct_concurrentaccount', n) FROM generate_series(1100, 1108) n;`);
  const account = await concurrent(admit("acct_concurrentaccount", 1109), admit("acct_concurrentaccount", 1110));
  assert.deepEqual(account.map((value) => value.allowed), [true, false], "Only one caller can spend the final account slot");

  sql("SELECT admission_test.seed(1200);");
  const replay = await concurrent(admit("acct_concurrentreplay", 1200), admit("acct_concurrentreplay", 1200));
  assert.deepEqual(replay.map((value) => [value.allowed, value.replay]), [[true, false], [true, true]],
    "Concurrent identical requests produce one admission and one free replay");

  sql(`SET ROLE service_role;
    SELECT public.claim_checkout_refresh('acct_concurrentrefresh', 'shipping_rate', NULL, NULL,
      'shr_prefill' || n) FROM generate_series(1, 29) n;`);
  const refreshLimit = await concurrent(refresh("acct_concurrentrefresh", "shr_final30"),
    refresh("acct_concurrentrefresh", "shr_final31"));
  assert.deepEqual(refreshLimit.map((value) => value.allowed), [true, false],
    "Only one caller can spend the final shared provider refresh slot");

  sql(`SELECT admission_test.seed(1300);
    UPDATE public.orders SET stripe_checkout_session_id='cs_test_fixture1300'
      WHERE id=admission_test.id('order',1300);`);
  const sameSession = "SELECT admission_test.refresh('acct_concurrentsession',1300);";
  const coalesced = await concurrent(sameSession, sameSession);
  assert.deepEqual(coalesced.map((value) => value.allowed), [true, false],
    "Concurrent refreshes of one Session make one provider request");

  sql(`SELECT admission_test.seed(1500);
    SET ROLE service_role;
    SELECT admission_test.admit('acct_concurrentattach',1500);
    RESET ROLE;
    UPDATE public.orders SET stripe_checkout_session_id='cs_test_fixture1500',
      metadata=metadata || '{"stripe_creation_outcome":"attached"}'::jsonb
      WHERE id=admission_test.id('order',1500);`);
  const attached = await concurrent("SELECT admission_test.refresh('acct_concurrentattach',1500);",
    `SELECT public.claim_checkout_refresh('acct_concurrentattach','attempt',admission_test.id('order',1500),
      admission_test.id('claim',1500),admission_test.key(1500));`);
  assert.deepEqual(attached.map((value) => value.allowed), [true, false],
    "Session and attempt refresh share one lease after attachment and before cache publication");

  console.log(JSON.stringify({
    status: "passed", postgresMajor: 17, checkpoint: "schema-only-2026-09-14",
    ownerLimit: 5, aggregateCreationLimit: 10, aggregateRefreshLimit: 30,
    rotatingGuestBounded: true, durableReplay: true, failedAdmissionAtomic: true,
    slidingWindow: true, refreshCooldownAndLease: true, minimalPrivateCache: true,
    concurrentOwnerFinalSlot: true, concurrentAccountFinalSlot: true,
    concurrentSameAttempt: true, concurrentRefreshFinalSlot: true, concurrentSessionRefresh: true,
    concurrentAttachedSessionAndAttempt: true,
    serviceOnlyRpcGrants: true, providerMutations: 0,
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
