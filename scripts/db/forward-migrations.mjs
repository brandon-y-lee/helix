import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const exec = promisify(execFile);
const cutoff = "20261120000000";
const historicalFilesHash =
  "c273fc518810cf9b65c2d61b480f9169b9cafd38cec2a956f7ae423ed2730dd9";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[a-f0-9]{64}$/;
const namePattern = /^(\d{14})_([a-z][a-z0-9_]*)\.sql$/;

class ReleaseError extends Error {}

function requireCondition(value, message) {
  if (!value) throw new ReleaseError(message);
}

// The CLI separately commits transaction-control or pipeline-incompatible
// statements. These admitted forms keep the DDL and the genuine history insert
// in the same provider transaction. Complex reviewed SQL goes in one DO block.
export function migrationStatement(sql) {
  const trimmed = sql.trim();
  const block =
    trimmed.startsWith("DO $migration$") &&
    trimmed.endsWith("$migration$;") &&
    trimmed.split("$migration$").length === 3;
  const simple =
    /^CREATE\s+(?:(?:UNIQUE\s+)?INDEX|TABLE)\s+[a-z_][a-z_0-9.]*(?:\s|\()/i.test(
      trimmed,
    ) && !/\bCONCURRENTLY\b|['"$\\]|--|\/\*|\*\/|;[\s\S]/i.test(trimmed);
  requireCondition(
    (block || simple) &&
      trimmed.endsWith(";") &&
      !/pg-delta/i.test(sql) &&
      !sql.includes("\r") &&
      !sql.includes("\0"),
    "Expected one transaction-compatible CREATE or DO $migration$ statement",
  );
  return trimmed.slice(0, -1);
}

export function validateReleaseSources(sources, sidecars) {
  const metadata = new Map(sidecars);
  requireCondition(
    metadata.size === sources.length && sidecars.length === sources.length,
    "Unexpected release sidecars",
  );
  let previous = "";
  return sources.map(([file, sql]) => {
    const match = namePattern.exec(file);
    const entry = metadata.get(file);
    requireCondition(
      match && match[1] >= cutoff && match[1] > previous,
      "Invalid or duplicate forward migration version",
    );
    previous = match[1];
    requireCondition(
      entry &&
        entry.sourceSha256 === hash(sql) &&
        typeof entry.verify === "string" &&
        /^SELECT\s/i.test(entry.verify) &&
        !entry.verify.includes(";"),
      "Missing or mismatched forward migration manifest",
    );
    migrationStatement(sql);
    return { file, sql, verify: entry.verify };
  });
}

export async function loadMigrations(root) {
  const directory = join(root, "supabase/migrations");
  const legacy = createHash("sha256");
  const sources = [];
  const files = await readdir(directory, { withFileTypes: true });
  for (const entry of files.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    requireCondition(
      entry.isFile() && /^\d{12,14}_[a-z0-9_]+\.sql$/.test(entry.name),
      "Unexpected migration file",
    );
    const bytes = await readFile(join(directory, entry.name));
    if (entry.name.split("_")[0] < cutoff)
      legacy.update(entry.name + ":" + hash(bytes) + "\n");
    else
      sources.push([
        entry.name,
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ]);
  }
  requireCondition(
    legacy.digest("hex") === historicalFilesHash,
    "Historical migration sources changed",
  );
  const metadata = [];
  for (const item of await readdir(join(root, "supabase/releases"), {
    withFileTypes: true,
  })) {
    requireCondition(item.isFile(), "Unexpected release metadata entry");
    if (item.name === "README.md") continue;
    const file = item.name.replace(/\.json$/, ".sql");
    requireCondition(
      item.name.endsWith(".json") && namePattern.test(file),
      "Invalid release sidecar file",
    );
    metadata.push([
      file,
      JSON.parse(
        await readFile(join(root, "supabase/releases", item.name), "utf8"),
      ),
    ]);
  }
  return validateReleaseSources(sources, metadata);
}

export function releaseConnection(target) {
  const { projectRef, role, host } = target;
  requireCondition(
    /^[a-z]{20}$/.test(projectRef) &&
      /^[a-z][a-z0-9_]{0,48}$/.test(role) &&
      !["anon", "authenticated", "service_role", "authenticator", "postgres"].includes(
        role,
      ) &&
      !role.startsWith("cli_login_"),
    "Invalid database identity",
  );
  const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
  requireCondition(
    host === "db." + projectRef + ".supabase.co" || pooler,
    "Unexpected migration endpoint",
  );
  return new URL(
    "postgresql://" +
      role +
      (pooler ? "." + projectRef : "") +
      "@" +
      host +
      ":5432/postgres?sslmode=verify-full",
  );
}

export const historyQuery = `
WITH records AS (
  SELECT version, name,
         encode(sha256(convert_to(to_jsonb(statements)::text, 'UTF8')), 'hex') AS digest
  FROM supabase_migrations.schema_migrations
)
SELECT (count(*) FILTER (WHERE version < '20261120000000'))::int AS legacy_count,
       encode(sha256(convert_to(coalesce((jsonb_agg(jsonb_build_array(version,name,digest)
         ORDER BY version COLLATE "C") FILTER (WHERE version < '20261120000000'))::text, '[]'), 'UTF8')), 'hex') AS legacy_digest,
       coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsDigest',digest)
         ORDER BY version COLLATE "C") FILTER (WHERE version >= '20261120000000'), '[]') AS forward,
       array_agg(version ORDER BY version COLLATE "C") AS versions
FROM records`;

async function inspectLedger(client, target, migrations) {
  const { rows } = await client.query(
    "select current_user AS role, environment, project_ref from public.read_helix_environment()",
  );
  requireCondition(
    rows.length === 1 &&
      rows[0].role === target.role &&
      rows[0].environment === target.environment &&
      rows[0].project_ref === target.projectRef,
    "Database marker or writer identity mismatch",
  );
  const {
    rows: [state],
  } = await client.query(historyQuery);
  requireCondition(
    state.legacy_digest === target.legacyDigest &&
      state.legacy_count === target.legacyCount,
    "Unexpected historical migration ledger",
  );
  requireCondition(
    state.versions.every((version) => /^\d{12,14}$/.test(version)),
    "Invalid migration history version",
  );
  const bootstrap = new Map(
    target.bootstrap.map((entry) => [entry.version, entry]),
  );
  requireCondition(
    bootstrap.size === target.bootstrap.length,
    "Duplicate bootstrap migration",
  );
  const actual = new Map(state.forward.map((entry) => [entry.version, entry]));
  for (const [version, entry] of bootstrap) {
    const recorded = actual.get(version);
    requireCondition(
      digestPattern.test(entry.statementsDigest) &&
        entry.name &&
        recorded?.name === entry.name &&
        recorded.statementsDigest === entry.statementsDigest,
      "Unexpected bootstrap migration ledger",
    );
    actual.delete(version);
  }
  let applied = 0;
  for (const { file, sql, verify } of migrations) {
    const [, version, name] = namePattern.exec(file);
    requireCondition(
      !bootstrap.has(version),
      "Bootstrap and forward versions overlap",
    );
    const record = actual.get(version);
    if (!record) break;
    const digest = hash(JSON.stringify([migrationStatement(sql)]));
    requireCondition(
      record.name === name && record.statementsDigest === digest,
      "Applied migration content drift",
    );
    const result = await client.query(verify);
    requireCondition(
      result.rowCount === 1 &&
        result.fields.length === 1 &&
        result.rows[0].applied === true,
      "Installed migration contract failed",
    );
    actual.delete(version);
    applied++;
  }
  requireCondition(
    actual.size === 0,
    "Unexpected migration or gap in the forward ledger",
  );
  return { applied, versions: state.versions };
}

async function readState(client, target, migrations) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '45s'");
    return await inspectLedger(client, target, migrations);
  } finally {
    await client.query("ROLLBACK");
  }
}

// Every historical filename represents an observed and authenticated version.
// Its contents must never run, even if a writer outside this workflow races it.
const refusal =
  "DO $$ BEGIN RAISE EXCEPTION 'historical SQL unavailable to release writer'; END $$;\n";

export async function runForward({
  client,
  connectionUrl,
  password,
  ca,
  cli,
  target,
  migrations,
  apply,
}) {
  const workdir = await mkdtemp(join(tmpdir(), "helix-forward-"));
  const dir = join(workdir, "supabase/migrations");
  const cliEnv = {
    PATH: process.env.PATH,
    HOME: workdir,
    XDG_CONFIG_HOME: workdir,
    PGPASSWORD: password,
    SUPABASE_TELEMETRY_DISABLED: "1",
    NO_COLOR: "1",
  };
  let locked = false;
  const abort = new AbortController();
  const connectionLost = () => abort.abort();
  client.on("error", connectionLost);
  client.on("end", connectionLost);
  async function invoke(args) {
    try {
      return await exec(cli, args, {
        env: cliEnv,
        cwd: workdir,
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
        signal: abort.signal,
      });
    } catch {
      throw new ReleaseError(
        "Supabase CLI operation failed; refresh the ledger before retrying",
      );
    }
  }
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(workdir, "supabase/config.toml"),
      'project_id = "helix-forward"\n',
      { mode: 0o600 },
    );
    const dsn = new URL(connectionUrl);
    if (ca) {
      const certPath = join(workdir, "ca.crt");
      await writeFile(certPath, ca, { mode: 0o600 });
      dsn.searchParams.set("sslrootcert", certPath);
    }
    const args = [
      "--workdir",
      workdir,
      "--yes",
      "db",
      "push",
      "--db-url",
      dsn.toString(),
      "--skip-vault",
    ];
    requireCondition(
      (await invoke(["--version"])).stdout.trim() === "2.117.0",
      "Supabase CLI version mismatch",
    );
    await client.query("SELECT pg_advisory_lock(2107275624,561)");
    locked = true;
    const before = await readState(client, target, migrations);
    const pending = migrations.slice(before.applied);
    const files = pending.map((m) => m.file);
    // A target-only bootstrap can have a later timestamp than the common first
    // release. The private workdir admits only verified records and this suffix.
    if (files.length && files[0].split("_")[0] < before.versions.at(-1)) {
      args.push("--include-all");
    }
    for (const version of before.versions)
      await writeFile(join(dir, version + "_recorded.sql"), refusal, {
        mode: 0o600,
      });
    for (const migration of pending)
      await writeFile(join(dir, migration.file), migration.sql, {
        mode: 0o600,
      });
    const dry = await invoke([...args, "--dry-run"]);
    const selected = [
      ...(dry.stdout + "\n" + dry.stderr).matchAll(
        /^\s*• ([^\r\n]+\.sql)\s*$/gm,
      ),
    ].map((match) => match[1]);
    requireCondition(
      JSON.stringify(selected) === JSON.stringify(files),
      "CLI pending migration list differs from reviewed release",
    );
    if (!apply || !files.length) return { pending: files, applied: [] };
    // Advance one version at a time. Check its actual contract before allowing
    // the next dependent version to be considered for application.
    for (const file of files) await rm(join(dir, file));
    for (let index = 0; index < pending.length; index++) {
      const { file, sql } = pending[index];
      await writeFile(join(dir, file), sql, { mode: 0o600 });
      await invoke(args);
      const after = await readState(client, target, migrations);
      requireCondition(
        after.applied === before.applied + index + 1,
        "Unexpected ledger after migration",
      );
    }
    return { pending: files, applied: files };
  } finally {
    try {
      if (locked && !abort.signal.aborted)
        await client.query("SELECT pg_advisory_unlock(2107275624,561)");
    } finally {
      client.off("end", connectionLost);
      client.off("error", connectionLost);
      await rm(workdir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const [mode, environment] = process.argv.slice(2);
  const releaseBranch = { development: "dev", production: "main" }[environment];
  const env = process.env;
  requireCondition(
    process.argv.length === 4 &&
      ["apply", "plan"].includes(mode) &&
      releaseBranch,
    "Invalid release command",
  );
  requireCondition(
    env.GITHUB_REPOSITORY === "brandon-y-lee/helix" &&
      env.GITHUB_REF_PROTECTED === "true" &&
      env.GITHUB_REF === "refs/heads/" + releaseBranch &&
      /^[a-f0-9]{40}$/.test(env.GITHUB_SHA),
    "Requires the protected release branch",
  );
  const { stdout } = await exec("git", ["rev-parse", "HEAD"]);
  requireCondition(
    stdout.trim() === env.GITHUB_SHA,
    "Checked-out source differs from release SHA",
  );
  const files = await exec("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    "scripts/db/forward-migrations.mjs",
    "supabase/migrations",
    "supabase/releases",
    "package.json",
    "pnpm-lock.yaml",
  ]);
  requireCondition(
    files.stdout.trim() === "",
    "Migration worktree differs from reviewed source",
  );
  const target = JSON.parse(env.HELIX_MIGRATION_TARGET);
  requireCondition(
    target.environment === environment &&
      target.cutoverQualified === true &&
      digestPattern.test(target.legacyDigest) &&
      Number.isSafeInteger(target.legacyCount) &&
      target.legacyCount > 0 &&
      Array.isArray(target.bootstrap),
    "Unqualified migration target",
  );
  requireCondition(
    env.HELIX_MIGRATION_PASSWORD &&
      env.HELIX_MIGRATION_CA?.startsWith("-----BEGIN CERTIFICATE-----"),
    "Missing dedicated writer credential or CA",
  );
  const connection = releaseConnection(target);
  const migrations = await loadMigrations(process.cwd());
  const client = new pg.Client({
    host: connection.hostname,
    port: 5432,
    user: connection.username,
    database: "postgres",
    password: env.HELIX_MIGRATION_PASSWORD,
    ssl: { ca: env.HELIX_MIGRATION_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const result = await runForward({
      client,
      connectionUrl: connection.toString(),
      password: env.HELIX_MIGRATION_PASSWORD,
      ca: env.HELIX_MIGRATION_CA,
      cli: env.HELIX_SUPABASE_CLI || "supabase",
      target,
      migrations,
      apply: mode === "apply",
    });
    console.log(
      JSON.stringify({ environment, sha: env.GITHUB_SHA, ...result }),
    );
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    // Driver and provider errors may contain query text or connection details.
    // Only deliberately authored diagnoses are suitable for release logs.
    console.error(
      error instanceof ReleaseError
        ? error.message
        : "Forward migration check failed; inspect the target privately",
    );
    process.exitCode = 1;
  });
}
