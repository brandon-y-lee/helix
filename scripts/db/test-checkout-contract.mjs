import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Local, synthetic PostgreSQL only. Never accepts a database URL or provider credentials.
const container = process.argv[2] ?? "helix-spec358-pg";
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = `checkout_contract_${process.pid}_${Date.now()}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (source) => docker(psqlArgs, { input: source });
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8");
const preparation = source("supabase/migrations/20260914051313_assign_current_order_numbers.sql");
const contraction = source("supabase/migrations/20260914051315_retire_obsolete_checkout_failure.sql");
const verifiedLocalFixture = "SET helix.checkout_verified_deployment_sha='0000000000000000000000000000000000000000';\n";

function refuses(statement, expected) {
  assert.throws(() => sql(`BEGIN;\n${statement}`), (error) =>
    String(error.stderr).includes(expected), expected);
}

async function concurrentReservations(firstLetter, secondLetter, cart, expectedError) {
  let releaseFirst;
  const firstReady = new Promise((resolve) => { releaseFirst = resolve; });
  let firstOutput = "";
  const first = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let firstError = "";
  first.stdout.on("data", (chunk) => {
    firstOutput += chunk;
    if (firstOutput.includes("reservation-held")) releaseFirst();
  });
  first.stderr.on("data", (chunk) => { firstError += chunk; });
  const firstDone = new Promise((resolve, reject) => {
    first.on("error", reject);
    first.on("close", (code) => code === 0 ? resolve() : reject(new Error(firstError)));
  });
  first.stdin.end(`BEGIN; SET ROLE service_role;
SELECT order_number FROM checkout_test.reserve('${firstLetter}',${cart});
\\echo reservation-held
SELECT pg_sleep(1);
COMMIT;`);
  await Promise.race([firstReady, firstDone.then(() => { throw new Error("Reservation barrier missing"); })]);
  let secondOutput;
  if (expectedError) {
    refuses(`SET ROLE service_role; SELECT * FROM checkout_test.reserve('${secondLetter}',${cart});`, expectedError);
  } else {
    secondOutput = sql(`SET ROLE service_role; SELECT order_number FROM checkout_test.reserve('${secondLetter}',${cart});`);
  }
  await firstDone;
  const expectedNumber = `HX-${firstLetter.toUpperCase().repeat(12)}`;
  assert.ok(firstOutput.includes(expectedNumber));
  if (!expectedError) assert.equal(secondOutput.trim(), expectedNumber);
  assert.equal(sql(`SELECT count(*) FROM public.orders WHERE cart_id=
    ('a6000000-0000-4000-8000-' || lpad('${cart}',12,'0'))::uuid;`).trim(), "1");
}

assert.equal(docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim(),
  "spec358-synthetic-sql", "Refusing a container without the synthetic-test label");
let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  assert.equal(sql("SELECT current_setting('server_version_num')::integer / 10000;").trim(), "17");
  sql(source("supabase/tests/checkpoints/checkout-current.sql"));
  sql(source("supabase/tests/checkpoints/checkout-fixtures.sql"));
  refuses(source("supabase/tests/checkout_current_contract.integration.sql"),
    "new Orders use the current HX prefix");
  sql(preparation);
  refuses(contraction, "requires a verified session-qualified deployment SHA");
  refuses(`${verifiedLocalFixture}
    CREATE FUNCTION checkout_test.unexpected_caller() RETURNS boolean LANGUAGE sql
      AS 'SELECT public.fail_checkout_order_from_stripe(null::uuid,null::text)';
    ${contraction}`, "changed or has callers");
  refuses(`${verifiedLocalFixture}
    CREATE VIEW checkout_test.unexpected_dependency AS
      SELECT public.fail_checkout_order_from_stripe(null::uuid,null::text);
    ${contraction}`, "changed or has callers");
  refuses(`${verifiedLocalFixture}
    CREATE OR REPLACE FUNCTION public.fail_checkout_order_from_stripe(p_order_id uuid,p_reason text)
      RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT true';
    ${contraction}`, "changed or has callers");
  sql(verifiedLocalFixture + contraction);
  sql(source("supabase/tests/checkout_current_contract.integration.sql"));
  sql(preparation);
  sql(verifiedLocalFixture + contraction);
  await concurrentReservations("c", "c", 13);
  await concurrentReservations("d", "e", 14, "checkout already reserved for cart generation");
  console.log(JSON.stringify({
    status: "passed", postgresMajor: 17, checkpoint: "schema-only-2026-09-14",
    baselineRejectsCurrentPrefix: true, newNumberAndHistoricalReplay: true,
    unchangedCurrentFunctionsAndGrants: true, staleRetryAndPaidFailureProtection: true,
    refusedUnsafeContractions: 4, repeatedMigrations: true,
    concurrentSameIntent: true, concurrentSiblingIntent: true,
    providerMutations: 0,
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
