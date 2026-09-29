import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Refuse remote URLs and unlabeled containers; only this run's disposable database is removed.
const container = process.argv[2] ?? "helix-spec358-pg";
const keep = process.argv[3] === "--keep";
const database = `support_ai_contracts_${process.pid}_${Date.now()}`;
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFileSync(`${root}${path}`, "utf8");
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification", created = false, passed = false;
const sql = (input) => {
  try { return docker(psql, { input }); }
  catch (error) {
    const assertion = String(error.stderr ?? "").match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1];
    throw new Error(assertion ?? `Disposable draft SQL failed during ${stage}`);
  }
};
const migration = (suffix) => {
  stage = suffix;
  const files = readdirSync(`${root}supabase/migrations`).filter((file) => file.endsWith(suffix));
  assert.equal(files.length, 1, `Expected one ${suffix} migration`);
  sql(source(`supabase/migrations/${files[0]}`));
};

function session() {
  const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Draft test connection could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Draft test connection failed")));
  });
  return { child, done, output: () => output };
}
async function until(predicate) {
  const deadline = Date.now()+8000;
  while (!predicate()) {
    assert.ok(Date.now()<deadline, "Draft concurrency barrier timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
// Observe a real second connection waiting on the first transaction before releasing it.
async function race(firstStatement, secondStatement) {
  const first = session(), second = session();
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
      ${firstStatement}\n\\echo draft-held\n`);
    await Promise.race([until(() => first.output().includes("draft-held")), first.done.then(() => { throw new Error("Draft holder ended early"); })]);
    second.child.stdin.end(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='support_ai_contender';
      SET LOCAL ROLE service_role; ${secondStatement} COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name='support_ai_contender' AND wait_event_type='Lock');`).trim()==="t"),
      second.done.then(() => { throw new Error("Draft contender escaped the lock"); })]);
    first.child.stdin.end("COMMIT;\n");
    await Promise.all([first.done,second.done]);
    return [first.output(),second.output()];
  } finally {
    if (!first.child.stdin.destroyed) first.child.stdin.end("ROLLBACK;\n");
    if (!second.child.stdin.destroyed) second.child.stdin.end("ROLLBACK;\n");
    await Promise.allSettled([first.done,second.done]);
  }
}
const json = (output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{")));

try {
  assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(), "spec358-synthetic-sql");
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  stage = "predecessor schema";
  sql(source("supabase/tests/checkpoints/checkout-current.sql"));
  loadCheckoutPaymentTestEffects(sql, source);
  sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
  migration("_checkout_admission.sql");
  migration("_checkout_payment_contracts.sql");
  migration("_order_confirmation_email.sql");
  const membership = source("supabase/migrations/20260730034330_catalog_editor_backend.sql")
    .match(/create table public\.admin_memberships \([\s\S]*?\n\);/);
  assert.ok(membership);
  sql(`${membership[0]} ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.admin_memberships FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_memberships TO service_role;`);
  migration("_simulated_tracking.sql");
  migration("_support_intake.sql");
  migration("_marketing_subscription_contracts.sql");
  migration("_support_inbound.sql");
  migration("_support_ai_drafts.sql");
  stage = "draft contracts";
  sql(source("supabase/tests/support_ai_contracts.integration.sql"));
  stage = "concurrent owner requests";
  sql("SELECT support_ai_test.seed(20);");
  const requested = await race("SELECT support_ai_test.request(20,120);", "SELECT support_ai_test.request(20,121);");
  assert.equal(json(requested[0]).job.id,json(requested[1]).job.id,"Concurrent owner requests share one logical job");
  stage = "concurrent worker claims";
  const claimed = await race("SELECT public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(220));",
    "SELECT public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(221));");
  assert.equal(json(claimed[0]).id,json(requested[0]).job.id);
  assert.equal(claimed[1].trim(),"","The second worker cannot start a duplicate inference");
  sql("SET ROLE service_role; SELECT public.cancel_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(20),support_ai_test.id(120));");
  stage = "concurrent approval and generated result";
  sql(`SELECT support_ai_test.seed(21); SET ROLE service_role;
    SELECT public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(21),1,'save_draft',0,'Manual','Approved manual reply.');
    SELECT support_ai_test.request(21,121,2,1);
    SELECT public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(221));`);
  const approval = await race("SELECT public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(21),2,'approve_reply',1);",
    "SELECT support_ai_test.finish(121,221);");
  assert.equal(approval[1].trim(),"f","A committed human approval wins over a concurrent generated result");
  assert.equal(json(sql("SET ROLE service_role; SELECT public.get_support_inquiry(support_ai_test.id(1),support_ai_test.id(21));")).draft.body,
    "Approved manual reply.");
  stage = "concurrent cancellation and generated result";
  sql(`SELECT support_ai_test.seed(22); SET ROLE service_role; SELECT support_ai_test.request(22,122);
    SELECT public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(222));`);
  const cancelled = await race("SELECT public.cancel_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(22),support_ai_test.id(122));",
    "SELECT support_ai_test.finish(122,222);");
  assert.equal(cancelled[1].trim(),"f","A committed cancellation rejects a concurrently arriving result");
  passed = true;
  console.log(JSON.stringify({ status: "passed", providerMutations: 0, checks: "private draft jobs and exact manual approval",
    ...(keep ? { database, container } : {}) }));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", stage, message: error.message, providerMutations: 0 }));
  process.exitCode = 1;
} finally {
  if (created && !(keep && passed)) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
