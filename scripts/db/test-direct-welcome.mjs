import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createSqlSession } from "../../supabase/tests/catalog_sql_session.mjs";

assert.equal(process.argv.length, 2, "The proof creates its own networkless database");
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
const docker = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  }).trim();
const socket = JSON.parse(docker(["context", "inspect"]))[0].Endpoints.docker.Host;
assert.match(socket, /^unix:\/\/\/[^\r\n\0]+$/);
const local = (args, input) => docker(["--host", socket, ...args], input);
const owner = randomUUID();
const container = local([
  "run",
  "-d",
  "--pull=never",
  "--network=none",
  "--label",
  "helix.direct-welcome=" + owner,
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
  "-h",
  "/var/run/postgresql",
  "-U",
  role,
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (query, role, db) => local(psql(role, db), query);
const source = (path) => readFileSync(new URL("../../supabase/" + path, import.meta.url), "utf8");
const direct = () => source("operations/production-marketing/direct-welcome.sql");
const fixture = (phase, db = "postgres") =>
  local(
    [...psql("postgres", db), "-v", "legacy=" + (phase === "legacy")],
    source("tests/production_marketing_direct_welcome.integration.sql"),
  );

// Hold the actual first admission/withdrawal transaction open and prove that
// the second PostgreSQL backend is waiting on it before choosing the commit.
async function ordered(first, second) {
  const sessions = [
    createSqlSession(["--host", socket, ...psql("service_role")]),
    createSqlSession(["--host", socket, ...psql("service_role")]),
  ];
  const [holder, waiter] = sessions;
  try {
    const held = await holder.send(
      "BEGIN; SET LOCAL statement_timeout='13s'; SET LOCAL application_name='direct_holder'; " + first,
    );
    await waiter.send("BEGIN; SET LOCAL statement_timeout='13s'; SET LOCAL application_name='direct_waiter';");
    const completion = waiter.finish(second + " COMMIT;");
    const deadline = Date.now() + 8000;
    while (
      sql(
        "SELECT EXISTS(SELECT FROM pg_stat_activity h,pg_stat_activity w WHERE h.application_name='direct_holder' AND w.application_name='direct_waiter' AND h.pid=ANY(pg_blocking_pids(w.pid)));",
      ) !== "t"
    ) {
      assert.ok(Date.now() < deadline, "contender never reached the holder's database lock");
      await delay(20);
    }
    const firstResult = await holder.finish("COMMIT;");
    assert.equal(firstResult.status, 0, firstResult.errors);
    const secondResult = await completion;
    assert.equal(secondResult.status, 0, secondResult.errors);
    return [
      held,
      secondResult.output
        .split("\n")
        .filter((line) => line && !line.startsWith("CATALOG_MILESTONE_"))
        .join("\n"),
    ];
  } finally {
    for (const session of sessions) if (!session.child.stdin.writableEnded) await session.finish("ROLLBACK;");
  }
}

try {
  for (let attempt = 0; ; attempt++) {
    try {
      local(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      break;
    } catch (error) {
      if (attempt === 100) throw error;
      await delay(100);
    }
  }
  assert.equal(sql("SELECT current_setting('server_version_num')::int/10000;"), "17");
  sql(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role LOGIN BYPASSRLS; CREATE ROLE unexpected; CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;",
  );
  sql(source("operations/release-bootstrap/20261120131122_helix_environment_identity.sql"));
  sql(source("migrations/20261117090000_production_marketing_consent.sql"));
  sql(source("operations/production-marketing/delivery.sql"));
  sql("CREATE TABLE public.admin_memberships(user_id uuid PRIMARY KEY,role text,active boolean);");
  sql(source("operations/production-marketing/events.sql"));
  sql("CREATE DATABASE proof_child TEMPLATE postgres;");
  sql(
    "INSERT INTO private.helix_environment VALUES(true,'development','zyfkunnpnlmgvrojmrbg');",
    "postgres",
    "proof_child",
  );

  sql("INSERT INTO private.helix_environment VALUES(true,'production','erasogmsqpgiirovubjh');");
  // Keep the signed HTTP journey empty, while the low-level proof carries actual
  // pre-P4 consent and frozen work through installation on the other database.
  sql("CREATE DATABASE proof_journey TEMPLATE postgres;");
  fixture("legacy");
  sql(direct(), "postgres", "proof_child");
  const childDeny = sql(
    "SELECT public.record_direct_production_marketing_preference('child','contact.updated',statement_timestamp(),'child@example.invalid',true,'{}',false);",
    "service_role",
    "proof_child",
  );
  assert.ok(["paused", "ignored"].includes(childDeny), "child cannot receive production marketing denial");
  assert.equal(
    sql("SELECT count(*) FROM private.production_marketing_direct_denials;", "postgres", "proof_child"),
    "0",
  );
  sql(direct(), "postgres", "proof_journey");
  sql(direct());
  fixture("direct");
  for (const phase of ["first", "retry"]) {
    for (const denyFirst of [true, false]) {
      const label = phase + (denyFirst ? "-deny-first" : "-handoff-first");
      const id = sql("SELECT proof.seed_lease('" + label + "','" + phase + "');");
      assert.match(id, /^[0-9a-f-]{36}$/);
      const handoff = "SELECT proof.handoff('" + id + "','" + label + "','" + phase + "') IS NOT NULL;";
      const deny = "SELECT proof.denial('" + label + "');";
      assert.deepEqual(
        await ordered(denyFirst ? deny : handoff, denyFirst ? handoff : deny),
        denyFirst ? ["applied", "f"] : ["t", "applied"],
        label,
      );
      sql("SELECT proof.verify_race('" + id + "','" + label + "','" + phase + "'," + denyFirst + ");");
    }
  }
  console.log(
    "PASS PostgreSQL 17 direct welcome storage, receipt ownership, retained consent and first/retry handoff races.",
  );
  execFileSync("pnpm", ["exec", "vitest", "run", "--config", "scripts/db/direct-welcome-journey.config.ts"], {
    cwd: new URL("../..", import.meta.url),
    stdio: "inherit",
    timeout: 120000,
    env: {
      ...process.env,
      HELIX_DIRECT_JOURNEY_CONTAINER: container,
      HELIX_DIRECT_JOURNEY_OWNER: owner,
    },
  });
} finally {
  assert.equal(local(["inspect", "--format", '{{index .Config.Labels "helix.direct-welcome"}}', container]), owner);
  local(["rm", "--force", "--volumes", container]);
}
