import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const { CONTROL_READS, controlChangeSql } = await tsImport("../resend-operations/operations.ts", import.meta.url);
// No URLs or provider credentials are accepted. Remove only this run's disposable database.
const container = process.argv[2] ?? "helix-spec358-pg";
const database = `resend_operations_controls_${process.pid}_${Date.now()}`;
const root = fileURLToPath(new URL("../../", import.meta.url));
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification", created = false;
const sql = (input) => docker(psql, { input });
const snapshot = () => JSON.parse(sql(`select jsonb_build_object(
  ${Object.entries(CONTROL_READS).map(([key, fn]) => `'${key}',public.${fn}()`).join(",")},
  'supportDelivery',(select jsonb_agg(jsonb_build_object('purpose',purpose,'enabled',enabled,
    'updatedAt',updated_at,'acceptedAfter',accepted_after) order by purpose)
    from private.email_controls where environment='sandbox' and purpose in ('support_acknowledgement','support_reply')));`).trim());
const disabled = Object.fromEntries(Object.keys(CONTROL_READS).map((key) => [key, false]));
const apply = (before, desired) => sql(controlChangeSql(before, desired));
const supportState = (state, enabled) => {
  assert.equal(state.support.enabled, enabled, "Support Intake follows the requested state");
  assert.deepEqual(state.supportDelivery.map(({ purpose, enabled: value }) => [purpose, value]),
    [["support_acknowledgement", enabled], ["support_reply", enabled]], "Both support delivery purposes follow Support Intake");
};
const cutoffs = (state) => state.supportDelivery.map(({ purpose, acceptedAfter }) => [purpose, acceptedAfter]);
const expectDrift = (before, desired) => {
  assert.throws(() => apply(before, desired), (error) => String(error.stderr).includes("activation_control_drift"),
    "A stale support delivery revision must abort the guarded transaction");
};

try {
  assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(), "spec358-synthetic-sql");
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  stage = "PostgreSQL version verification";
  const version = Number(sql("show server_version_num;").trim());
  assert.ok(version >= 170000 && version < 180000, "Operations contracts require the approved local PostgreSQL 17 runtime");
  stage = "control schema from reviewed migrations";
  sql("create schema private; revoke all on schema private from public;");
  const migrations = ["_order_confirmation_email.sql", "_simulated_tracking.sql", "_support_intake.sql",
    "_marketing_subscription_contracts.sql", "_support_inbound.sql", "_product_notifications.sql"];
  const functions = [...Object.values(CONTROL_READS), "configure_order_confirmation_email", "configure_simulated_tracking",
    "configure_support_intake", "configure_support_receiving", "configure_marketing_email", "configure_product_notification_email"];
  // Execute complete source statements for the two control tables and their real RPCs, without copying commerce fixtures.
  for (const suffix of migrations) {
    const files = readdirSync(`${root}supabase/migrations`).filter((file) => file.endsWith(suffix));
    assert.equal(files.length, 1, `Expected one ${suffix} migration`);
    const source = readFileSync(`${root}supabase/migrations/${files[0]}`, "utf8");
    const statements = [...source.matchAll(/^(?:create table|alter table|insert into) private\.(?:email_controls|support_controls)\b[\s\S]*?;/gm)];
    assert.ok(statements.length, `Expected control DDL in ${suffix}`);
    sql(statements.map(([statement]) => statement).join("\n"));
    for (const name of functions) {
      const definition = source.match(new RegExp(`^create function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "m"));
      if (definition) sql(definition[0]);
    }
    if (suffix === "_simulated_tracking.sql") {
      const fn = source.match(/^create function private\.preserve_tracking_activation\([\s\S]*?\$\$;/m);
      const trigger = source.match(/^create trigger preserve_tracking_activation[\s\S]*?;/m);
      assert.ok(fn && trigger);
      sql(`${fn[0]}\n${trigger[0]}`);
    }
  }
  stage = "apply support intake and delivery together";
  const initial = snapshot();
  apply(initial, { ...disabled, support: true, receiving: true });
  let current = snapshot();
  supportState(current, true);
  assert.equal(current.receiving.enabled, true);
  assert.deepEqual(cutoffs(current), cutoffs(initial), "Enabling support retains existing accepted cutoffs");

  stage = "repeat apply preserves revisions and cutoffs";
  apply(current, { ...disabled, support: true, receiving: true });
  assert.deepEqual(snapshot(), current, "An already satisfied apply does not rewrite control revisions");

  stage = "repair delivery when intake is already enabled";
  sql("update private.email_controls set enabled=false,updated_at=clock_timestamp() where purpose in ('support_acknowledgement','support_reply');");
  const beforeRepair = snapshot();
  apply(beforeRepair, { ...disabled, support: true, receiving: true });
  current = snapshot();
  supportState(current, true);
  assert.deepEqual(current.support, beforeRepair.support, "Delivery repair does not rewrite unchanged Support Intake");
  assert.deepEqual(cutoffs(current), cutoffs(initial));

  for (const purpose of ["support_acknowledgement", "support_reply"]) {
    stage = `reject drift in ${purpose} before any control changes`;
    const stale = snapshot();
    sql(`update private.email_controls set updated_at=updated_at+interval '1 microsecond' where purpose='${purpose}';`);
    const afterDrift = snapshot();
    expectDrift(stale, { ...disabled, confirmation: true, tracking: true, marketing: true, product: true, receiving: true });
    assert.deepEqual(snapshot(), afterDrift, "Drift aborts the entire transaction, including unrelated controls");
  }

  stage = "disable a mixed delivery state while preserving receiving";
  sql("update private.email_controls set enabled=false,updated_at=clock_timestamp() where purpose='support_reply';");
  const beforeDisable = snapshot();
  apply(beforeDisable, { ...disabled, receiving: beforeDisable.receiving.enabled });
  current = snapshot();
  supportState(current, false);
  assert.equal(current.receiving.enabled, true, "Disable preserves accepted inbound reconciliation");
  assert.deepEqual(cutoffs(current), cutoffs(initial), "Disable preserves support acceptance cutoffs");
  assert.deepEqual(current.supportDelivery.find(({ purpose }) => purpose === "support_reply"),
    beforeDisable.supportDelivery.find(({ purpose }) => purpose === "support_reply"), "Already disabled delivery keeps its revision");

  stage = "repeat disable preserves revisions and cutoffs";
  apply(current, { ...disabled, receiving: current.receiving.enabled });
  assert.deepEqual(snapshot(), current);
  console.log(JSON.stringify({ status: "passed", checks: 7, providerMutations: 0,
    coverage: "atomic support delivery, repeat apply, existing-intake repair, both delivery revisions, receiving-preserving disable, repeat disable" }));
} catch (error) {
  const controlError = String(error.stderr ?? "").match(/ERROR:\s+(activation_control_drift|activation_control_conflict)/)?.[1];
  console.error(JSON.stringify({ status: "failed", stage, message: controlError ?? (error.stderr ? "Disposable operations SQL failed" : error.message), providerMutations: 0 }));
  process.exitCode = 1;
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
