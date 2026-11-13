import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// This runner has no database-URL input and only operates a labeled local fixture container.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
let database = `manual_shipments_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => docker(psqlArgs, { input });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const migrations = readdirSync(new URL("supabase/migrations/", `file://${root}`));
const migration = (suffix) => {
  const matches = migrations.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix} migration`);
  sql(source(`supabase/migrations/${matches[0]}`));
};

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

// Independent connections demonstrate the actual database lock, rather than serial promises.
async function concurrentLocked(firstStatement, secondStatement = firstStatement) {
  const first = session();
  let second;
  try {
    first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${firstStatement}
\\echo tracking-contract-held
`);
    await Promise.race([until(() => first.output().includes("tracking-contract-held"), "First transaction barrier timed out"),
      first.done.then(() => { throw new Error("First transaction exited before its barrier"); })]);
    second = session();
    second.child.stdin.end(`BEGIN; SET LOCAL application_name='manual_shipments_contender';
SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
${secondStatement}
COMMIT;`);
    await Promise.race([until(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='manual_shipments_contender'
        AND wait_event_type='Lock');`).trim() === "t", "Contender did not wait on the simulation lock"),
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


assert.equal(docker(["inspect","-f",'{{index .Config.Labels "helix.task"}}',container]).trim(),"spec358-synthetic-sql");
let created=false;
try {
 docker(["exec",container,"createdb","-U","postgres",database]);created=true;
 sql(source("supabase/tests/checkpoints/checkout-current.sql"));loadCheckoutPaymentTestEffects(sql,source);
 sql("CREATE SCHEMA private; REVOKE ALL ON SCHEMA private FROM PUBLIC;");
 const [fixtures,proof]=source("supabase/tests/checkout_payment_contracts.integration.sql").split("-- APPLY PAYMENT CONTRACT MIGRATION");
 sql(fixtures);migration("_checkout_admission.sql");migration("_checkout_payment_contracts.sql");sql(proof);
 const membership=source("supabase/migrations/20260730034330_catalog_editor_backend.sql").match(/create table public\.admin_memberships \([\s\S]*?\n\);/)[0];sql(membership);
 migration("_manual_shipment_records.sql");
 sql(source("supabase/tests/manual_shipments.integration.sql"));
 sql("SELECT manual_test.seed(5010);");
 const statement=(command)=>`SELECT public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5010,${command}));`;
 const outputs=await concurrentLocked(statement(50101),statement(50102));
 const statuses=outputs.map(o=>JSON.parse(o.split('\n').find(l=>l.startsWith('{'))).status).sort();
 assert.deepEqual(statuses,['applied','conflict']);
 assert.equal(sql("SELECT sum(quantity) FROM private.manual_shipment_allocations a JOIN private.manual_shipments s ON s.id=a.shipment_id WHERE s.order_id=payment_contract_test.id('order',5010);").trim(),'1');
 console.log("Manual shipment SQL: ownership, capability, payment proof, grants, idempotency, revisions, corrections, cancellation and concurrent capacity passed.");
}finally{if(created)docker(["exec",container,"dropdb","-U","postgres",database]);}
