import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { historyQuery, runForward } from './forward-migrations.mjs';

// The only accepted argument is the pinned CLI executable. The database, role,
// password, marker and port are created here; never load real operator settings.
assert.ok(process.argv.length <= 3, 'Usage: node scripts/db/test-forward-migrations.mjs [supabase-binary]');
const cli = process.argv[2] ?? 'supabase';
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Use the local Docker socket');
const localEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
function docker(args, env = localEnv) {
  return execFileSync('docker', args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim();
}
const endpoint = JSON.parse(docker(['context', 'inspect']))[0].Endpoints.docker.Host;
assert.ok(endpoint.startsWith('unix://'), 'A local Docker daemon is required');

const nonce = randomBytes(10).toString('hex');
const name = 'helix-forward-proof-' + nonce;
const dir = mkdtempSync(join(tmpdir(), name + '-'));
const adminPassword = randomBytes(32).toString('hex');
const writerRole = 'helix_release_writer';
const password = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const projectRef = 'aaaaaaaaaaaaaaaaaaaa';
const clients = [];
let containerId;
async function connect(connectionUrl, role = writerRole, credential = password) {
  const url = new URL(connectionUrl);
  const client = new pg.Client({
    host: url.hostname,
    port: Number(url.port),
    database: 'postgres',
    user: role,
    password: credential,
    ssl: false,
    connectionTimeoutMillis: 3_000,
  });
  await client.connect();
  clients.push(client);
  return client;
}

function migration(version, name, sql, verify) {
  return { file: version + '_' + name + '.sql', sql: sql + ';\n', verify: 'SELECT ' + verify + ' AS applied' };
}

async function until(check, failure) {
  const end = Date.now() + 18_000;
  do {
    if (await check()) return;
    await delay(100);
  } while (Date.now() < end);
  throw new Error(failure);
}

try {
  containerId = docker(
    [
      'run',
      '--pull',
      'never',
      '-d',
      '--name',
      name,
      '--label',
      'helix.forward-proof=' + nonce,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      'postgres:17-alpine',
    ],
    { ...localEnv, POSTGRES_PASSWORD: adminPassword },
  );
  const address = docker(['port', containerId, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(address, 'Expected only one ephemeral loopback port');
  const connectionUrl = 'postgresql://' + writerRole + '@127.0.0.1:' + address[1] + '/postgres?sslmode=disable';
  await until(() => {
    try {
      docker(['exec', containerId, 'pg_isready', '-h', '127.0.0.1']);
      return true;
    } catch {
      return false;
    }
  }, 'Postgres did not start');
  const control = await connect(connectionUrl, 'postgres', adminPassword);
  // Model an already provisioned provider history table and separately owned
  // runtime marker. These fixture credentials use fresh hex strings locally.
  await control.query(`CREATE ROLE ${writerRole} LOGIN PASSWORD '${password}';
    CREATE ROLE authenticated LOGIN PASSWORD '${appPassword}';
    CREATE ROLE catalog_owner NOLOGIN;
    GRANT catalog_owner TO ${writerRole};
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
    GRANT USAGE ON SCHEMA supabase_migrations TO ${writerRole};
    GRANT SELECT, INSERT ON supabase_migrations.schema_migrations TO ${writerRole};
    GRANT CREATE ON SCHEMA public TO ${writerRole};
    CREATE SCHEMA private;
    CREATE TABLE private.helix_environment (singleton boolean PRIMARY KEY CHECK (singleton), environment text NOT NULL, project_ref text NOT NULL);
    INSERT INTO private.helix_environment VALUES (true, 'development', '${projectRef}');
    CREATE FUNCTION private.read_helix_environment() RETURNS TABLE(environment text, project_ref text)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT e.environment, e.project_ref FROM private.helix_environment AS e WHERE e.singleton $$;
    CREATE FUNCTION public.read_helix_environment() RETURNS TABLE(environment text, project_ref text)
      LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
        SELECT environment, project_ref FROM private.read_helix_environment() $$;
    REVOKE ALL ON FUNCTION private.read_helix_environment(), public.read_helix_environment() FROM PUBLIC;
    GRANT USAGE ON SCHEMA private, public TO ${writerRole};
    GRANT EXECUTE ON FUNCTION private.read_helix_environment(), public.read_helix_environment() TO ${writerRole};
    CREATE TABLE public.unrelated_application_table (id integer);
  `);

  // Build a genuine legacy ledger record with the same CLI that writes real migrations.
  mkdirSync(join(dir, 'supabase/migrations'), { recursive: true });
  mkdirSync(join(dir, 'cli-home'));
  writeFileSync(join(dir, 'supabase/config.toml'), 'project_id = "helix-forward-proof"\n');
  const legacy = '20200101000000_legacy.sql';
  writeFileSync(
    join(dir, 'supabase/migrations', legacy),
    'CREATE TABLE public.original_catalog(id integer);\n',
  );
  const cliEnv = {
    PATH: process.env.PATH,
    HOME: join(dir, 'cli-home'),
    PGPASSWORD: password,
    SUPABASE_TELEMETRY_DISABLED: '1',
  };
  assert.equal(execFileSync(cli, ['--version'], { env: cliEnv, encoding: 'utf8' }).trim(), '2.117.0');
  execFileSync(cli, ['--workdir', dir, '--yes', 'db', 'push', '--db-url', connectionUrl, '--skip-vault'], {
    env: cliEnv,
    stdio: 'pipe',
    timeout: 30_000,
  });
  const state = (await control.query(historyQuery)).rows[0];
  assert.equal(Number(state.legacy_count), 1);
  const target = {
    environment: 'development',
    projectRef,
    role: writerRole,
    legacyDigest: state.legacy_digest,
    legacyCount: 1,
    bootstrap: [],
  };
  const common = { target, cli, password, connectionUrl };
  const firstClient = await connect(connectionUrl);
  const secondClient = await connect(connectionUrl);
  const app = await connect(connectionUrl, 'authenticated', appPassword);
  const denied = (op) => assert.rejects(op, { code: '42501' });
  await denied(app.query('SET ROLE ' + writerRole));
  await denied(app.query('SELECT version FROM supabase_migrations.schema_migrations'));
  await denied(app.query('SELECT * FROM public.read_helix_environment()'));
  await denied(
    firstClient.query(
      "UPDATE supabase_migrations.schema_migrations SET name='changed' WHERE version='20200101000000'",
    ),
  );
  await denied(
    firstClient.query("DELETE FROM supabase_migrations.schema_migrations WHERE version='20200101000000'"),
  );
  await denied(firstClient.query("UPDATE private.helix_environment SET environment='production'"));
  await denied(firstClient.query('DROP FUNCTION public.read_helix_environment()'));
  await denied(firstClient.query('ALTER TABLE public.unrelated_application_table ADD COLUMN leaked text'));
  await control.query('ALTER TABLE public.original_catalog OWNER TO catalog_owner');
  assert.deepEqual(
    (
      await firstClient.query(
        `SELECT
      current_user = session_user AND current_user = $1 AS dedicated_login,
      NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication) AS restricted,
      NOT has_database_privilege(current_user, current_database(), 'CREATE') AS no_database_create,
      NOT has_schema_privilege(current_user, 'supabase_migrations','CREATE') AS no_history_create,
      (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.original_catalog'::regclass) AS catalog_owner,
      pg_has_role(current_user, 'catalog_owner','USAGE') AS can_migrate_catalog
    FROM pg_roles WHERE rolname=current_user`,
        [writerRole],
      )
    ).rows,
    [
      {
        dedicated_login: true,
        restricted: true,
        no_database_create: true,
        no_history_create: true,
        catalog_owner: 'catalog_owner',
        can_migrate_catalog: true,
      },
    ],
  );
  const secondPid = (await secondClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const apply = (migrations, overrides = {}) =>
    runForward({ ...common, client: firstClient, migrations, apply: true, ...overrides });
  const first = migration(
    '20300101000000',
    'catalog',
    'DO $migration$ BEGIN ALTER TABLE public.original_catalog ADD COLUMN enabled boolean; CREATE TABLE public.catalog(id integer); END; $migration$',
    "to_regclass('public.catalog') IS NOT NULL AND EXISTS (SELECT FROM pg_attribute WHERE attrelid='public.original_catalog'::regclass AND attname='enabled' AND NOT attisdropped)",
  );
  const second = migration(
    '20300101000001',
    'extra',
    'CREATE TABLE public.extra(id integer)',
    "to_regclass('public.extra') IS NOT NULL",
  );
  const index = migration(
    '20300101000002',
    'catalog_order',
    'CREATE INDEX catalog_order ON public.catalog(id)',
    "to_regclass('public.catalog_order') IS NOT NULL",
  );

  await assert.rejects(apply([first], { target: { ...target, projectRef: 'bbbbbbbbbbbbbbbbbbbb' } }));
  await assert.rejects(apply([first], { target: { ...target, legacyDigest: '0'.repeat(64) } }));
  // A protected secret could still identify an overprivileged login. Refuse the
  // entire release before its DDL when either historic data or runtime-role
  // impersonation is available through an unintended grant.
  await control.query('GRANT UPDATE (name) ON supabase_migrations.schema_migrations TO ' + writerRole);
  await assert.rejects(apply([first]), /privilege profile/);
  await control.query('REVOKE UPDATE (name) ON supabase_migrations.schema_migrations FROM ' + writerRole);
  await control.query('GRANT ' + writerRole + ' TO authenticated');
  await assert.rejects(apply([first]), /privilege profile/);
  await control.query('REVOKE ' + writerRole + ' FROM authenticated');
  const plan = await apply([first, second], { apply: false });
  assert.deepEqual(plan.pending, [first.file, second.file]);
  assert.equal(
    (await control.query("SELECT to_regclass('public.catalog') IS NULL AS untouched")).rows[0].untouched,
    true,
  );

  // Fail only the second provider ledger write, after its DDL has executed.
  await control.query(`CREATE FUNCTION public.stop_second() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.version='20300101000001' THEN RAISE EXCEPTION 'synthetic ledger outage'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER stop_second BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.stop_second()`);
  await assert.rejects(apply([first, second]));
  assert.deepEqual(
    (
      await control.query(`SELECT to_regclass('public.catalog') IS NOT NULL AS first_committed,
    to_regclass('public.extra') IS NULL AS second_rolled_back, (SELECT count(*)::int FROM supabase_migrations.schema_migrations) AS ledger`)
    ).rows,
    [{ first_committed: true, second_rolled_back: true, ledger: 2 }],
  );
  await control.query('DROP TRIGGER stop_second ON supabase_migrations.schema_migrations');
  assert.deepEqual((await apply([first, second])).applied, [second.file]);
  assert.deepEqual((await apply([first, second])).applied, []);

  // Hold an incompatible table lock until the real CLI is waiting to create
  // the index. Two release calls now contend on the target rather than racing
  // by chance. The winner records one index and the follower rechecks history.
  await control.query('BEGIN; LOCK public.catalog IN ACCESS EXCLUSIVE MODE');
  const observer = await connect(connectionUrl, 'postgres', adminPassword);
  const requests = [apply([first, second, index])];
  requests[0].catch(() => {});
  try {
    await Promise.race([
      until(
        async () =>
          (
            await observer.query(
              "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid <> pg_backend_pid() AND lower(query) LIKE '%create index catalog_order%') AS waiting",
            )
          ).rows[0].waiting,
        'The first CLI never attempted the migration',
      ),
      requests[0].then(() => {
        throw new Error('First release unexpectedly finished ahead of barrier');
      }),
    ]);
    requests.push(apply([first, second, index], { client: secondClient }));
    requests[1].catch(() => {});
    await Promise.race([
      until(
        async () =>
          (
            await observer.query(
              "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting",
              [secondPid],
            )
          ).rows[0].waiting,
        'The second release never waited for the migration lock',
      ),
      requests[1].then(() => {
        throw new Error('Second release unexpectedly finished ahead of barrier');
      }),
    ]);
  } finally {
    await control.query('ROLLBACK');
  }
  const completed = await Promise.all(requests);
  assert.deepEqual(
    completed.flatMap((result) => result.applied),
    [index.file],
  );
  assert.equal(
    (await control.query('SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations')).rows[0].n,
    4,
  );
  assert.deepEqual((await apply([first, second, index])).pending, []);
  // Interrupt the provider backend after the DO block has created a table
  // and inserted a quoted string, but before its final read can acquire a lock.
  const block = migration(
    '20300101000003',
    'interrupted',
    `DO $migration$
BEGIN
  CREATE TABLE public.interrupt_probe(label text);
  INSERT INTO public.interrupt_probe VALUES ('Catalog''s current state');
  PERFORM id FROM public.catalog LIMIT 1;
END;
$migration$`,
    "EXISTS (SELECT 1 FROM public.interrupt_probe WHERE label='Catalog''s current state')",
  );
  const release = [first, second, index, block];
  await control.query('BEGIN; LOCK public.catalog IN ACCESS EXCLUSIVE MODE');
  const interrupted = apply(release);
  interrupted.catch(() => {});
  try {
    await Promise.race([
      until(async () => {
        const { rows } = await observer.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%CREATE TABLE public.interrupt_probe%'",
        );
        if (rows.length === 0) return false;
        assert.equal(rows.length, 1);
        assert.equal(
          (await observer.query('SELECT pg_terminate_backend($1) AS terminated', [rows[0].pid])).rows[0]
            .terminated,
          true,
        );
        return true;
      }, 'No provider backend reached the interruption barrier'),
      interrupted.then(() => {
        throw new Error('The interrupted release passed the held barrier');
      }),
    ]);
    await assert.rejects(interrupted);
  } finally {
    await control.query('ROLLBACK');
  }
  assert.deepEqual(
    (
      await control.query(
        "SELECT to_regclass('public.interrupt_probe') IS NULL AS rolled_back, count(*)::int AS ledger FROM supabase_migrations.schema_migrations",
      )
    ).rows,
    [{ rolled_back: true, ledger: 4 }],
  );
  const recovered = await connect(connectionUrl);
  assert.deepEqual((await apply(release, { client: recovered })).applied, [block.file]);
  assert.deepEqual((await apply(release, { client: recovered })).pending, []);
  // An applied predecessor must still be healthy before its successor is
  // installed. Once the column is renamed, the old query is invalid and only
  // the successor's verifier can describe the installed contract.
  const rename = {
    ...migration(
      '20300101000004',
      'rename_probe_label',
      'DO $migration$ BEGIN ALTER TABLE public.interrupt_probe RENAME COLUMN label TO display_label; END; $migration$',
      "EXISTS (SELECT 1 FROM public.interrupt_probe WHERE display_label='Catalog''s current state')",
    ),
    supersedes: [block.file],
  };
  const evolvedRelease = [...release, rename];
  await control.query("UPDATE public.interrupt_probe SET label='drifted'");
  await assert.rejects(apply(evolvedRelease), 'a pending successor cannot hide predecessor drift');
  assert.equal(
    (
      await control.query(
        "SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations WHERE version='20300101000004'",
      )
    ).rows[0].n,
    0,
  );
  await control.query("UPDATE public.interrupt_probe SET label='Catalog''s current state'");
  assert.deepEqual((await apply(evolvedRelease)).applied, [rename.file]);
  assert.deepEqual((await apply(evolvedRelease)).pending, []);
  const changedPredecessor = (changes) =>
    evolvedRelease.map((item) => (item.file === block.file ? { ...item, ...changes } : item));
  await assert.rejects(
    apply(changedPredecessor({ verify: 'SELECT true AS applied' })),
    'historical verifier cannot change after supersession',
  );
  await assert.rejects(
    apply(changedPredecessor({ sql: block.sql + '\n' })),
    'historical source bytes cannot change after supersession',
  );
  await control.query("UPDATE public.interrupt_probe SET display_label='drifted'");
  await assert.rejects(apply(evolvedRelease), 'a successor must enforce its own installed contract');
  await control.query("UPDATE public.interrupt_probe SET display_label='Catalog''s current state'");

  await control.query('DROP INDEX public.catalog_order');
  await assert.rejects(apply(evolvedRelease), 'an applied migration with a broken schema contract must fail');
  await control.query('CREATE INDEX catalog_order ON public.catalog(id)');
  await control.query(
    "UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['different synthetic SQL'] WHERE version='20300101000002'",
  );
  await assert.rejects(apply(evolvedRelease), 'a version recorded with different SQL must fail');
  console.log(
    'Forward migration PostgreSQL/CLI checks passed (apply, dry run, retry, wrong target, history drift, partial failure, interrupted DDL, DO ledger, concurrency, separated writer/app permissions, successor preflight, source and verifier immutability, replay).',
  );
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (containerId) {
    assert.equal(
      docker(['inspect', '-f', '{{index .Config.Labels "helix.forward-proof"}}', containerId]),
      nonce,
    );
    docker(['rm', '--force', '--volumes', containerId]);
  }
  rmSync(dir, { recursive: true, force: true });
}
