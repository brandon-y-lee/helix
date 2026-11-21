import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createSqlSession } from "../../supabase/tests/catalog_sql_session.mjs";

assert.equal(process.argv.length, 2, "The proof creates its own networkless database");
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
const docker = (args, input) => execFileSync("docker", args, {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
}).trim();
assert.match(JSON.parse(docker(["context", "inspect"]))[0].Endpoints.docker.Host, /^unix:\/\//);
const label = randomUUID();
const container = docker(["run", "-d", "--pull=never", "--network=none", "--label", "helix.native-welcome=" + label,
  "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
const psql = (role = "postgres", database = "postgres") => ["exec", "-i", container, "psql", "-XAtq", "-U", role, "-d", database, "-v", "ON_ERROR_STOP=1"];
const sql = (input, role) => docker(psql(role), input);
const file = path => readFileSync(new URL("../../supabase/" + path, import.meta.url), "utf8");
const nativePackage = () => file("operations/production-marketing/native-welcome.sql");
const fixture = phase => docker([...psql(), "-v", "preinstall=" + (phase === "old")], file("tests/production_marketing_native_welcome.integration.sql"));
const worker = "helix_native_welcome_worker";
const args = "repeat('c',64),'prj_native597','dpl_native597',repeat('d',40)";
const reserve = "SELECT intent_id FROM helix_welcome_worker.reserve(" + args + ");";
const withdraw = seed => "SELECT public.withdraw_production_marketing_subscription(proof.hash('" + seed + "-p'));";
const seed = address => sql("SELECT proof.confirmed('" + address + "','" + address + "',true);");

try {
  for (let attempt = 0;; attempt++) {
    try {
      docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      break;
    } catch (error) {
      if (attempt === 100) throw error;
      await delay(100);
    }
  }
  assert.equal(sql("SELECT current_setting('server_version_num')::int/10000;"), "17");
  sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role LOGIN BYPASSRLS; CREATE ROLE proof_worker_login LOGIN; CREATE ROLE proof_unexpected LOGIN; CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  sql(file("operations/release-bootstrap/20261120131122_helix_environment_identity.sql"));
  sql(file("migrations/20261117090000_production_marketing_consent.sql"));
  sql(file("operations/production-marketing/delivery.sql"));
  sql("CREATE TABLE public.admin_memberships(user_id uuid PRIMARY KEY,role text,active boolean);");
  sql(file("operations/production-marketing/events.sql"));
  fixture("old");
  assert.throws(() => sql(nativePackage()), /Verified owner and environment marker required/);
  assert.equal(sql("SELECT to_regnamespace('helix_welcome_worker') IS NULL AND to_regrole('helix_native_welcome_worker') IS NULL;"), "t",
    "the empty marker refusal left no worker role or schema");
  // Apply the same real package in a separately marked clone. Give it a
  // qualified publisher and an actual confirmed native candidate.
  sql("CREATE DATABASE proof_child TEMPLATE postgres;");
  const child = input => docker(psql("postgres", "proof_child"), input);
  child("INSERT INTO private.helix_environment VALUES(true,'development','zyfkunnpnlmgvrojmrbg');");
  child(nativePackage());
  child("ALTER ROLE helix_native_welcome_worker LOGIN;");
  child("UPDATE private.production_marketing_controls SET native_welcome_enabled=true,native_welcome_contract_hash=repeat('c',64),native_welcome_publisher_project_id='prj_native597',native_welcome_publisher_deployment_id='dpl_native597',native_welcome_publisher_git_sha=repeat('d',40),native_welcome_qualified_until=clock_timestamp()+interval '1 hour';");
  const childIntent = child("SELECT proof.confirmed('child','child',true);");
  assert.equal(docker(psql(worker, "proof_child"), reserve), "", "child database cannot release a recipient");
  // Model a copied outstanding parent attempt. Its matching IDs must not let the
  // child record a result, even when an independently qualified caller presents them.
  const childAttempt = randomUUID();
  child(`UPDATE private.production_marketing_messages SET state='native_reserved',native_attempt_id='${childAttempt}',
    first_prepared_at=statement_timestamp(),last_admitted_at=statement_timestamp(),contract_hash=repeat('c',64) WHERE id='${childIntent}';`);
  assert.equal(docker(psql(worker, "proof_child"), `SELECT helix_welcome_worker.finish('${childIntent}','${childAttempt}','submitted');`), "f");
  sql("DROP DATABASE proof_child; DROP ROLE helix_native_welcome_worker;");
  sql("INSERT INTO private.helix_environment VALUES(true,'production','erasogmsqpgiirovubjh');");
  // Both safe outcomes are supported: an ignored/revoked ambient grant, or an
  // atomic refusal followed by normal owner enrollment.
  sql("ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO proof_unexpected;");
  try { sql(nativePackage()); }
  catch (error) {
    assert.equal(sql("SELECT to_regnamespace('helix_welcome_worker') IS NULL;"), "t", "failed installation left state");
    sql("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM proof_unexpected;");
    sql(nativePackage());
  }
  sql("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM proof_unexpected;");
  assert.equal(sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='helix_native_welcome_worker';"), "t");
  sql("ALTER ROLE helix_native_welcome_worker LOGIN; GRANT helix_native_welcome_worker TO proof_worker_login;");
  for (const role of ["anon", "authenticated", "service_role", "proof_unexpected"]) {
    assert.equal(sql(`SELECT NOT has_schema_privilege('${role}','helix_welcome_worker','USAGE')
      AND NOT has_function_privilege('${role}','helix_welcome_worker.reserve(text,text,text,text)','EXECUTE')
      AND NOT has_function_privilege('${role}','helix_welcome_worker.finish(uuid,uuid,text)','EXECUTE');`), "t", role);
  }
  assert.equal(sql("SELECT NOT has_table_privilege('proof_worker_login','private.production_marketing_messages','SELECT,INSERT,UPDATE,DELETE') AND NOT has_column_privilege('proof_worker_login','private.production_marketing_controls','native_welcome_enabled','UPDATE');"), "t");
  assert.throws(() => sql("SELECT * FROM private.production_marketing_subscribers;", worker), /permission denied/);
  fixture("new");
  // A different login cannot release a recipient or finish an attempt by borrowing the role.
  const foreignCandidate = seed("foreign-session");
  assert.equal(sql("SET ROLE helix_native_welcome_worker;" + reserve, "proof_worker_login"), "");
  assert.equal(sql(reserve, worker), foreignCandidate);
  const foreignAttempt = sql(`SELECT native_attempt_id FROM private.production_marketing_messages WHERE id='${foreignCandidate}';`);
  const finishForeign = `SELECT helix_welcome_worker.finish('${foreignCandidate}','${foreignAttempt}','submitted');`;
  assert.equal(sql("SET ROLE helix_native_welcome_worker;" + finishForeign, "proof_worker_login"), "f");
  assert.equal(sql(finishForeign, worker), "t");
  sql("GRANT USAGE ON SCHEMA proof TO service_role;");

  // Each holder reaches its SQL boundary before the other session starts. A
  // contender may skip a busy address or wait and re-read its committed state.
  async function heldTransaction(first, second, { waitFor, rollback = false } = {}) {
    const a = createSqlSession(psql(first.role));
    let b;
    try {
      const held = await a.send("BEGIN; SET LOCAL application_name='proof_native_holder'; SET LOCAL statement_timeout='15s';" + first.query);
      b = createSqlSession(psql(second.role));
      const contenderName = "proof_native_contender";
      await b.send(`BEGIN; SET LOCAL application_name='${contenderName}'; SET LOCAL statement_timeout='15s';`);
      const completed = b.finish(second.query + "COMMIT;");
      let finished = false;
      completed.then(() => { finished = true; });
      const deadline = Date.now() + 8_000;
      const quotaLock = waitFor === "quota" ? `AND EXISTS (SELECT FROM pg_locks l WHERE l.pid=c.pid
        AND l.locktype='advisory' AND NOT l.granted AND l.objsubid=1
        AND ((l.classid::bigint << 32) | l.objid::bigint)=hashtextextended('production-marketing:quota',0))` : "";
      const blocked = `SELECT EXISTS(SELECT FROM pg_stat_activity c WHERE c.application_name='${contenderName}'
        AND c.wait_event_type='Lock' AND EXISTS (SELECT FROM pg_stat_activity h WHERE h.application_name='proof_native_holder'
          AND h.pid=ANY(pg_blocking_pids(c.pid))) ${quotaLock});`;
      while (!finished && sql(blocked) !== "t") {
        assert.ok(Date.now() < deadline, "contender never reached its lock or result");
        await delay(15);
      }
      if (waitFor) assert.ok(!finished, `contender must wait on the holder's ${waitFor} lock`);
      const firstResult = await a.finish(rollback ? "ROLLBACK;" : "COMMIT;");
      assert.equal(firstResult.status, 0, firstResult.errors);
      const secondResult = await completed;
      assert.equal(secondResult.status, 0, secondResult.errors);
      return [held, secondResult.output.trim().split("\n").filter(line => !line.startsWith("CATALOG_MILESTONE_")).join("\n")];
    } finally {
      for (const session of [a, b]) if (session && !session.child.stdin.writableEnded) await session.finish("ROLLBACK;");
    }
  }

  const call = { role: worker, query: reserve };
  let id = seed("concurrent");
  assert.deepEqual(await heldTransaction(call, call), [id, ""], "concurrent workers reserve at most once");
  assert.equal(sql(reserve, worker), "", "lost response after commit cannot resubmit");
  id = seed("post-withdraw");
  assert.deepEqual(await heldTransaction(call, { query: withdraw("post-withdraw") }, { waitFor: "withdrawal" }), [id, "t"]);
  assert.equal(sql(reserve, worker), "", "withdrawal after commitment never releases a reserved row");
  seed("pre-withdraw");
  assert.deepEqual(await heldTransaction({ query: withdraw("pre-withdraw") }, call), ["t", ""]);
  assert.equal(sql(reserve, worker), "", "committed earlier withdrawal prevents reservation");
  id = seed("rolled-back-reservation");
  await heldTransaction(call, { query: "SELECT true;" }, { rollback: true });
  assert.equal(sql(reserve, worker), id, "crash before reservation commit leaves one recoverable intent");
  sql("DELETE FROM private.production_marketing_request_limits WHERE kind='global';");
  const { exerciseNativeWelcomePublisher } = await import("./exercise-native-welcome-publisher.mjs");
  await exerciseNativeWelcomePublisher({ sql, seed, worker });
  // Use distinct recipients so only the shared quota, never an address or message lock, decides the winner.
  const currentBudget = () => JSON.parse(sql(`SELECT json_build_object(
    'day',coalesce(sum(used) FILTER (WHERE kind='day' AND period=(clock_timestamp() AT TIME ZONE 'UTC')::date),0),
    'month',coalesce(sum(used) FILTER (WHERE kind='month' AND period=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date),0))
    FROM private.production_marketing_quota_counters;`));
  const contractHash = sql("SELECT proof.hash(delivery_contract_text) FROM private.production_marketing_controls;");
  for (const firstTransport of ["raw", "native"]) {
    const rawLabel = "quota-race-raw-" + firstTransport;
    const nativeLabel = "quota-race-native-" + firstTransport;
    const raw = sql(`SELECT proof.confirmed('${rawLabel}','${rawLabel}',false);`);
    const native = seed(nativeLabel);
    const lease = randomUUID();
    assert.equal(sql(`SELECT public.claim_production_marketing_message('${lease}')->>'id';`, "service_role"), raw);
    const used = currentBudget();
    sql(`UPDATE private.production_marketing_controls SET daily_limit=${used.day + 1},monthly_limit=${used.month + 1} WHERE singleton;`);
    const prepare = { role: "service_role",
      query: `SELECT proof.prepare_raw('${raw}','${lease}','${rawLabel}','${contractHash}') IS NOT NULL;` };
    const rawFirst = firstTransport === "raw";
    const winner = rawFirst ? raw : native;
    const loser = rawFirst ? native : raw;
    const callers = rawFirst ? [prepare, call] : [call, prepare];
    assert.deepEqual(await heldTransaction(...callers, { waitFor: "quota" }), rawFirst ? ["t", ""] : [native, "f"]);
    assert.deepEqual(currentBudget(), { day: used.day + 1, month: used.month + 1 });
    assert.equal(sql(`SELECT string_agg(kind,',' ORDER BY kind) FROM private.production_marketing_quota_reservations
      WHERE message_id='${winner}';`), "day,month");
    assert.equal(sql(`SELECT count(*) FROM private.production_marketing_quota_reservations WHERE message_id='${loser}';`), "0");
    assert.equal(sql(`SELECT state FROM private.production_marketing_messages WHERE id='${winner}';`), rawFirst ? "prepared" : "native_reserved");
    assert.equal(sql(`SELECT state FROM private.production_marketing_messages WHERE id='${loser}'
      AND first_prepared_at IS NULL AND native_attempt_id IS NULL AND body_text IS NULL;`), rawFirst ? "native_queued" : "held");
    assert.equal(sql(withdraw(rawLabel)), "t");
    assert.equal(sql(withdraw(nativeLabel)), "t");
  }
  console.log("PASS PostgreSQL 17 native welcome transport, shared admission, isolated worker grants and crash/withdrawal ordering.");
} finally {
  assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "helix.native-welcome"}}', container]), label);
  docker(["rm", "--force", "--volumes", container]);
}
