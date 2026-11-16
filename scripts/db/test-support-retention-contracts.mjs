import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCheckoutPaymentTestEffects } from "./checkout-payment-test-fixture.mjs";

// Refuse remote URLs and unlabeled containers; only this run's disposable database is removed.
const container = process.argv[2] ?? "helix-spec358-pg";
const keep = process.argv[3] === "--keep";
const database = `support_retention_contracts_${process.pid}_${Date.now()}`;
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFileSync(`${root}${path}`, "utf8");
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"];
let stage = "container verification", created = false, passed = false;
const sql = (input) => {
  try { return docker(psql, { input }); }
  catch (error) {
    const assertion = String(error.stderr ?? "").match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1];
    throw new Error(assertion ?? `Disposable retention SQL failed during ${stage}`);
  }
};
const migration = (suffix) => {
  stage = suffix;
  const files = readdirSync(`${root}supabase/migrations`).filter((file) => file.endsWith(suffix));
  assert.equal(files.length, 1, `Expected one ${suffix} migration`);
  sql(source(`supabase/migrations/${files[0]}`));
};


// Hold one real transaction open while a second connection runs the retention worker.
async function whileTransactionHeld(statement,check) {
  const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Retention test connection could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Retention test connection failed")));
  });
  try {
    child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role;
      ${statement}
      \\echo retention-held
    `);
    const deadline = Date.now()+8000;
    await Promise.race([done.then(() => { throw new Error("Retention holder ended early"); }), (async () => {
      while (!output.includes("retention-held")) {
        assert.ok(Date.now()<deadline,"Retention transaction barrier timed out");
        await new Promise((resolve) => setTimeout(resolve,25));
      }
    })()]);
    await check();
    child.stdin.end("COMMIT;\n");
    await done;
  } finally {
    if (!child.stdin.destroyed) child.stdin.end("ROLLBACK;\n");
    await Promise.allSettled([done]);
  }
}

try {
  assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(), "spec358-synthetic-sql");
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  stage = "PostgreSQL version verification";
  const version = Number(sql("SHOW server_version_num;").trim());
  assert.ok(version >= 170000 && version < 180000, "Retention contracts require the approved local PostgreSQL 17 runtime");
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
  migration("_support_retention.sql");
  stage = "retention contracts";
  sql(source("supabase/tests/support_retention_contracts.integration.sql"));
  stage = "concurrent reopening and retention";
  sql("SELECT support_retention_test.seed(100);");
  await whileTransactionHeld(`SELECT public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',100),1,
      'set_status',null,null,null,'open');`, () => {
    const result = JSON.parse(sql(`SET statement_timeout='2s'; SET ROLE service_role;
      SELECT public.run_support_retention(20);`).trim());
    assert.equal(result.inquiriesRedacted,0,"A retention worker skips the concurrently reopening Inquiry");
  });
  sql(`SET ROLE service_role;
    SELECT public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',100),2,
      'set_status',null,null,null,'closed');
    SELECT public.run_support_retention(20);
    SELECT support_retention_test.assert((SELECT redacted_at IS NULL AND closed_at>clock_timestamp()-interval '1 minute'
      FROM private.support_inquiries WHERE id=support_retention_test.id('inquiry',100)),
      'cleanup uses the committed latest closure after a concurrent reopening');`);
  stage = "concurrent acknowledgement preparation and retention";
  sql(`SELECT support_retention_test.seed(160);
    INSERT INTO private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key)
      VALUES(support_retention_test.id('email',160),'sandbox','support_acknowledgement','private-retention@example.invalid',
        jsonb_build_object('inquiryId',support_retention_test.id('inquiry',160),'body','Private acknowledgement'),'queued','retention-email-160');`);
  await whileTransactionHeld(`UPDATE private.email_intents SET first_attempt_at=clock_timestamp(),
      request_payload='{"text":"Private prepared acknowledgement"}',attempt_count=1,state='retry'
      WHERE id=support_retention_test.id('email',160);`, () => {
    const result = JSON.parse(sql(`SET statement_timeout='2s'; SET ROLE service_role;
      SELECT public.run_support_retention(20);`).trim());
    assert.equal(result.inquiriesRedacted,0,"Retention skips an acknowledgement being prepared without blocking on its email lock");
  });
  sql(`SET ROLE service_role; SELECT public.run_support_retention(20);
    SELECT support_retention_test.assert((SELECT redacted_at IS NULL FROM private.support_inquiries
      WHERE id=support_retention_test.id('inquiry',160)) AND (SELECT request_payload IS NOT NULL AND content_deleted_at IS NULL
      FROM private.email_intents WHERE id=support_retention_test.id('email',160)),
      'the committed unreconciled acknowledgement preserves its Inquiry and prepared content');`);
  passed = true;
  console.log(JSON.stringify({ status: "passed", providerMutations: 0, checks: "bounded support retention and durable replay identities",
    ...(keep ? { database, container } : {}) }));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", stage, message: error.message, providerMutations: 0 }));
  process.exitCode = 1;
} finally {
  if (created && !(keep && passed)) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
