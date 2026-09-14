import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { verifyIdentityWriterConcurrency } from "../../supabase/tests/catalog_identity_concurrency.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable local PostgreSQL 17 container>.");
}

function docker(args, input, onDiagnostics) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || "Local PostgreSQL command failed.");
  }
  onDiagnostics?.(result.stderr);
  return result.stdout;
}

const label = docker([
  "inspect", "--format", '{{index .Config.Labels "helix.task"}}', container,
]).trim();
if (label !== "spec358-synthetic-sql") {
  throw new Error("Refusing a container without the spec358-synthetic-sql test label.");
}
const roles = JSON.parse(docker([
  "exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atc",
  "select coalesce(jsonb_object_agg(rolname, rolbypassrls), '{}'::jsonb) from pg_roles where rolname in ('anon','authenticated','service_role');",
]).trim());
if (roles.anon !== false || roles.authenticated !== false || roles.service_role !== true) {
  throw new Error("Catalog SQL tests require the documented Supabase PostgreSQL image roles: anon/authenticated without BYPASSRLS and service_role with BYPASSRLS.");
}

const database = `helix_catalog_identity_${randomBytes(8).toString("hex")}`;
const checkpoint = "supabase/tests/checkpoints/catalog-current-20260909042518.sql";
const migration = "supabase/migrations/20260914051153_catalog_restore_current_identity.sql";
const operation = "supabase/operations/upgrade_current_treat_identity.sql";
const preflight = "supabase/operations/current_treat_identity_preflight.sql";
const fixtures = "supabase/tests/catalog_identity.fixtures.sql";
const tests = "supabase/tests/catalog_identity.integration.sql";
const read = (path) => readFileSync(resolve(root, path), "utf8");
const files = [checkpoint, migration, operation, fixtures, tests];
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];

function worker(input, onOutput = () => {}) {
  return new Promise((resolveWorker, reject) => {
    const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (chunk) => { output += chunk; onOutput(output); });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timeout);
      if (status === 0) resolveWorker(output);
      else reject(new Error(errors || "Concurrent SQL worker failed."));
    });
    child.stdin.end(input);
  });
}

async function verifyConcurrentRetry() {
  // Seed only synthetic rows; each worker creates its own temporary operation.
  docker(psql, read(fixtures) + "\nbegin; select pg_temp.seed_catalog_identity('peptide-bounce', 'Peptide Bounce'); commit;");
  const productId = "10000000-0000-4000-8000-000000000101";
  const actorId = "10000000-0000-4000-8000-000000000901";
  const manifest = JSON.parse(docker(psql, read(preflight)).trim());
  if (manifest.candidateCount !== 1 || manifest.administratorCount !== 1
      || manifest.administratorId !== actorId || manifest.expectedRevision !== 1
      || manifest.activeDrafts.length !== 0
      || manifest.expectedDocument.productId !== productId
      || Object.values(manifest.functionDefinitionHashes).some((hash) => !hash)) {
    throw new Error("Read-only preflight did not identify the exact synthetic operation inputs.");
  }
  const snapshot = JSON.stringify(manifest.expectedDocument);
  const delimiter = `$snapshot_${randomBytes(8).toString("hex")}$`;
  const call = `select pg_temp.upgrade_current_treat_identity(${delimiter}${snapshot}${delimiter}::jsonb, 1, '${actorId}'::uuid);`;
  let confirmPublication;
  const publicationReturned = new Promise((resolvePublication) => { confirmPublication = resolvePublication; });
  const first = worker(read(operation) + "\nbegin;\n" + call + "\nselect pg_sleep(1); commit;", (output) => {
    if (output.includes('"published"')) confirmPublication();
  });
  await Promise.race([publicationReturned, first.then(() => {
    throw new Error("First concurrent identity operation did not publish.");
  })]);
  const second = worker(read(operation) + "\nbegin;\n" + call + "\ncommit;");
  const completed = await Promise.allSettled([first, second]);
  const failed = completed.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  const outcomes = completed.map((result) =>
    JSON.parse(result.value.trim().split("\n")[0]).outcome,
  );
  if (outcomes[0] !== "published" || outcomes[1] !== "no-op") {
    throw new Error("Concurrent retry did not publish once and then verify no-op.");
  }
  const count = docker(psql, `select count(*) from public.catalog_product_revisions where product_id='${productId}'::uuid;`).trim();
  if (count !== "2") throw new Error("Concurrent retry appended a duplicate revision.");
  return { outcomes, revisionsIncludingSeed: Number(count) };
}
let created = false;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const version = docker([
    "exec", container, "psql", "-U", "postgres", "-d", database, "-Atc", "show server_version;",
  ]).trim();
  if (!version.startsWith("17.")) throw new Error("Catalog checkpoint tests require PostgreSQL 17.");
  const input = "\\set ON_ERROR_STOP on\n" + files.map(read).join("\n");
  let checks = [];
  docker(psql, input, (diagnostics) => {
    checks = diagnostics.split("\n").filter((line) => line.includes("PASS "))
      .map((line) => line.slice(line.indexOf("PASS ") + 5));
  });
  const concurrency = await verifyConcurrentRetry();
  const writerConcurrency = await verifyIdentityWriterConcurrency({
    container, checkpoint: read(checkpoint), fixtures: read(fixtures),
    operationSql: read(operation), docker,
  });
  console.log(JSON.stringify({
    status: "passed",
    postgres: version,
    checkpoint: { path: checkpoint, sha256: createHash("sha256").update(read(checkpoint)).digest("hex") },
    executed: [...files.slice(1), preflight, "supabase/tests/catalog_identity_concurrency.mjs"].map((path) => ({ path, sha256: createHash("sha256").update(read(path)).digest("hex") })),
    checks,
    concurrency,
    writerConcurrency,
    scope: "isolated synthetic Catalog; no provider data or outbound delivery",
  }, null, 2));
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
