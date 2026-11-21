import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createSqlSession } from "../../supabase/tests/catalog_sql_session.mjs";

assert.equal(process.argv.length, 2, "This proof creates its own isolated PG17 database");
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
const docker = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  }).trim();
assert.match(JSON.parse(docker(["context", "inspect"]))[0].Endpoints.docker.Host, /^unix:\/\//);
const label = randomUUID();
const container = docker([
  "run",
  "-d",
  "--pull=never",
  "--network=none",
  "--label",
  "helix.native-restrictions=" + label,
  "-e",
  "POSTGRES_HOST_AUTH_METHOD=trust",
  "postgres:17-alpine",
]);
const psql = (role = "postgres", db = "postgres") => [
  "exec",
  "-i",
  container,
  "psql",
  "-XAtq",
  "-U",
  role,
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (query, role, db) => docker(psql(role, db), query);
const file = (path) => readFileSync(new URL("../../supabase/" + path, import.meta.url), "utf8");
const worker = "helix_native_welcome_worker";
const reserve =
  "SELECT intent_id FROM helix_welcome_worker.reserve(repeat('c',64),'prj_native598','dpl_native598',repeat('d',40));";
const p5 = file("operations/production-marketing/native-restrictions.sql");
const fixture = file("tests/production_marketing_native_restrictions.integration.sql");
const alerts = () => JSON.parse(sql("SELECT public.production_marketing_native_alerts();", "service_role"));
const cleanup = () => Number(sql("SELECT public.cleanup_production_marketing_delivery();", "service_role"));
const seed = (name) => sql("SELECT proof.confirmed('" + name + "','" + name + "',true);");
const restrict = (name) =>
  "SELECT public.record_native_welcome_restriction(repeat('c',64),'" +
  name +
  "','contact.updated',statement_timestamp()," +
  "NULL,'" +
  name +
  "@example.invalid',true,'{}',NULL);";

// Establish both waiters by their actual Postgres blocking edges, before choosing the commit order.
async function ordered(first, firstRole, second, secondRole, afterBlocked) {
  const holder = createSqlSession(psql(firstRole));
  const waiter = createSqlSession(psql(secondRole));
  try {
    const firstResult = await holder.send("BEGIN; SET LOCAL application_name='p5_holder'; " + first);
    await waiter.send("BEGIN; SET LOCAL application_name='p5_waiter'; SET LOCAL statement_timeout='12s';");
    const result = waiter.finish(second + " COMMIT;");
    const deadline = Date.now() + 7000;
    while (
      sql(
        "SELECT EXISTS(SELECT FROM pg_stat_activity h,pg_stat_activity w WHERE h.application_name='p5_holder' AND w.application_name='p5_waiter' AND h.pid=ANY(pg_blocking_pids(w.pid)));",
      ) !== "t"
    ) {
      assert.ok(Date.now() < deadline, "second transaction must wait for the first");
      await delay(20);
    }
    if (afterBlocked) await afterBlocked();
    assert.equal((await holder.finish("COMMIT;")).status, 0);
    const last = await result;
    assert.equal(last.status, 0, last.errors);
    return [
      firstResult,
      last.output
        .split("\n")
        .filter((s) => s && !s.startsWith("CATALOG_MILESTONE_"))
        .join("\n"),
    ];
  } finally {
    for (const s of [holder, waiter]) if (!s.child.stdin.writableEnded) await s.finish("ROLLBACK;");
  }
}

try {
  for (let i = 0; ; i++) {
    try {
      docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      break;
    } catch (err) {
      if (i >= 100) throw err;
      await delay(100);
    }
  }
  assert.equal(sql("SELECT current_setting('server_version_num')::int/10000;"), "17");
  sql(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role LOGIN BYPASSRLS; CREATE ROLE unexpected LOGIN; CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;",
  );
  sql(file("operations/release-bootstrap/20261120131122_helix_environment_identity.sql"));
  sql(file("migrations/20261117090000_production_marketing_consent.sql"));
  sql(file("operations/production-marketing/delivery.sql"));
  sql("CREATE TABLE public.admin_memberships(user_id uuid PRIMARY KEY,role text,active boolean);");
  sql(file("operations/production-marketing/events.sql"));
  docker([...psql(), "-v", "preinstall=true"], file("tests/production_marketing_native_welcome.integration.sql"));
  sql("CREATE DATABASE proof_child TEMPLATE postgres;");
  sql(
    "INSERT INTO private.helix_environment VALUES(true,'development','zyfkunnpnlmgvrojmrbg');",
    "postgres",
    "proof_child",
  );
  sql(file("operations/production-marketing/native-welcome.sql"), "postgres", "proof_child");
  sql(p5, "postgres", "proof_child");
  assert.throws(
    () => sql("SELECT public.production_marketing_native_alerts();", "service_role", "proof_child"),
    /Native maintenance unavailable/,
  );
  assert.throws(() => sql(restrict("child"), "service_role", "proof_child"), /Native callback target unavailable/);
  sql("DROP DATABASE proof_child; DROP ROLE helix_native_welcome_worker;");
  sql("INSERT INTO private.helix_environment VALUES(true,'production','erasogmsqpgiirovubjh');");
  sql(file("operations/production-marketing/native-welcome.sql"));
  sql("ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO unexpected;");
  assert.throws(() => sql(p5), /Unexpected native callback function grant/);
  assert.equal(sql("SELECT to_regclass('private.production_marketing_native_policy') IS NULL;"), "t");
  sql("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM unexpected;");
  sql(p5);
  sql("ALTER ROLE helix_native_welcome_worker LOGIN;");
  sql(fixture);
  // The signed HTTP journey starts from the same proved policy and private role,
  // isolated from the crash, hold and quota races below.
  sql("CREATE DATABASE proof_journey TEMPLATE postgres;");
  const race1 = seed("reserve-first");
  assert.deepEqual(await ordered(reserve, worker, restrict("reserve-first"), "service_role"), [race1, "applied"]);
  seed("deny-first");
  assert.deepEqual(await ordered(restrict("deny-first"), "service_role", reserve, worker), ["applied", ""]);
  const expires = seed("expires-under-quota-lock");
  sql("UPDATE private.production_marketing_native_policy SET qualified_until=clock_timestamp()+interval '3 seconds';");
  const waitUntilExpired = () =>
    sql(
      "SELECT pg_sleep(greatest(0,extract(epoch FROM qualified_until-clock_timestamp()))+0.02) FROM private.production_marketing_native_policy;",
    );
  assert.deepEqual(
    await ordered(
      "SELECT pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));",
      "postgres",
      reserve,
      worker,
      waitUntilExpired,
    ),
    ["", ""],
  );
  assert.equal(
    sql(
      "SELECT NOT EXISTS(SELECT FROM private.production_marketing_quota_reservations WHERE message_id='" +
        expires +
        "') AND EXISTS(SELECT FROM private.production_marketing_messages WHERE id='" +
        expires +
        "' AND state='native_queued' AND native_attempt_id IS NULL);",
    ),
    "t",
    "P5 expiry under the real P4 quota wait must roll back even a provisional spend",
  );
  sql("UPDATE private.production_marketing_native_policy SET qualified_until=clock_timestamp()+interval '45 minutes';");
  assert.equal(sql(restrict("expires-under-quota-lock"), "service_role"), "applied");
  const native = seed("process-died");
  assert.equal(sql(reserve, worker), native);
  assert.deepEqual(alerts(), { uncertainAttempts: 0, unresolvedHolds: 0 });
  sql("UPDATE private.production_marketing_controls SET dispatch_enabled=false,native_welcome_enabled=false;");
  // Age only this disposable fixture's already committed exact attempt. No actual
  // cleanup/publisher path may modify its first admission or lost acknowledgment.
  sql(
    "BEGIN; SET LOCAL session_replication_role=replica; UPDATE private.production_marketing_messages SET first_prepared_at=first_prepared_at-interval '3 minutes',last_admitted_at=last_admitted_at-interval '3 minutes' WHERE id='" +
      native +
      "'; COMMIT;",
  );
  assert.deepEqual(alerts(), { uncertainAttempts: 1, unresolvedHolds: 0 });
  const tryReserve = () => sql(reserve, worker);
  const { exerciseNativeWelcomeAlert } = await import("./exercise-native-welcome-alert.mjs");
  await exerciseNativeWelcomeAlert(alerts, cleanup, tryReserve);
  execFileSync("pnpm", ["exec", "vitest", "run", "--config", "scripts/db/native-welcome-journey.config.ts"], {
    cwd: new URL("../..", import.meta.url),
    env: { ...process.env, HELIX_NATIVE_JOURNEY_CONTAINER: container, HELIX_NATIVE_JOURNEY_OWNER: label },
    stdio: "inherit",
    timeout: 90000,
  });
  console.log(
    "PASS PostgreSQL 17 signed native restrictions, sticky negative evidence, policy/races and paused crash maintenance.",
  );
} finally {
  assert.equal(
    docker(["inspect", "--format", '{{index .Config.Labels "helix.native-restrictions"}}', container]),
    label,
  );
  docker(["rm", "--force", "--volumes", container]);
}
