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
const password = randomBytes(32).toString('hex');
const projectRef = 'aaaaaaaaaaaaaaaaaaaa';
const clients = [];
let containerId;
async function connect(connectionUrl) {
  const url = new URL(connectionUrl);
  const client = new pg.Client({
    host: url.hostname,
    port: Number(url.port),
    database: 'postgres',
    user: 'postgres',
    password,
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
    { ...localEnv, POSTGRES_PASSWORD: password },
  );
  const address = docker(['port', containerId, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(address, 'Expected only one ephemeral loopback port');
  const connectionUrl = 'postgresql://postgres@127.0.0.1:' + address[1] + '/postgres?sslmode=disable';
  await until(() => {
    try {
      docker(['exec', containerId, 'pg_isready', '-h', '127.0.0.1']);
      return true;
    } catch {
      return false;
    }
  }, 'Postgres did not start');
  const control = await connect(connectionUrl);
  await control.query(`CREATE FUNCTION public.read_helix_environment() RETURNS TABLE(environment text, project_ref text)
    LANGUAGE sql STABLE AS $$ SELECT 'development'::text, 'aaaaaaaaaaaaaaaaaaaa'::text $$`);

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
    role: 'postgres',
    legacyDigest: state.legacy_digest,
    legacyCount: 1,
    bootstrap: [],
  };
  const common = { target, cli, password, connectionUrl };
  const firstClient = await connect(connectionUrl);
  const secondClient = await connect(connectionUrl);
  const secondPid = (await secondClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const apply = (migrations, overrides = {}) =>
    runForward({ ...common, client: firstClient, migrations, apply: true, ...overrides });
  const first = migration(
    '20300101000000',
    'catalog',
    'CREATE TABLE public.catalog(id integer)',
    "to_regclass('public.catalog') IS NOT NULL",
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
  const observer = await connect(connectionUrl);
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
  await control.query('DROP INDEX public.catalog_order');
  await assert.rejects(apply(release), 'an applied migration with a broken schema contract must fail');
  await control.query('CREATE INDEX catalog_order ON public.catalog(id)');
  await control.query(
    "UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['different synthetic SQL'] WHERE version='20300101000002'",
  );
  await assert.rejects(apply(release), 'a version recorded with different SQL must fail');
  console.log(
    'Forward migration PostgreSQL/CLI checks passed (apply, dry run, retry, wrong target, history drift, partial failure, interrupted DDL, DO ledger, concurrency).',
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
