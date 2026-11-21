import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { executeRelease } from '../release/workflow.mjs';

// A fresh networkless PostgreSQL 17 container. No connection override, shared
// volumes, host ports, production keys or customer fixtures enter this proof.
assert.equal(process.argv.length, 2);
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT);
const env = { PATH: process.env.PATH, HOME: process.env.HOME };
function docker(args, input) {
  return execFileSync('docker', args, { input, env, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30_000 }).trim();
}
assert.match(JSON.parse(docker(['context', 'inspect']))[0].Endpoints.docker.Host, /^unix:\/\//);
const nonce = randomUUID();
const container = docker(['run', '--detach', '--pull=never', '--network=none', '--label', 'helix.release-auth=' + nonce,
  '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
const marker = new URL('../../supabase/operations/release-bootstrap/20261120131122_helix_environment_identity.sql', import.meta.url);
const enrollment = new URL('../../supabase/operations/release-bootstrap/enroll_deployment_authorization.sql', import.meta.url);
const psql = role => ['exec', '-i', container, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', 'postgres'];
const owner = sql => docker(psql('postgres'), sql);
const writer = sql => docker(psql('helix_release_controller'), sql);
const project = 'prj_N9nyPL9SixJHOROIovS8PDQ9aKny';
const build = n => ['dpl_test' + n, String(n).repeat(40)];
const [A, B, C, D] = [1, 2, 3, 4].map(build);
const args = values => values.map(value => value === null ? 'null' : "'" + value + "'").join(',');
const transition = (action, previous, candidate) =>
  'select helix_release_control.transition_helix_release_authorization(' + args([action, project, ...previous, ...candidate]) + ');';
const read = (id, role = 'anon', projectId = project) => docker(psql(role),
  'select public.read_helix_release_authorization(' + args([projectId, ...id]) + ');');
const pair = (id, role = 'helix_release_controller') => docker(psql(role),
  'select previous_id, previous_sha, candidate_id, candidate_sha, phase from helix_release_control.read_release_pair(' + args(id) + ');');
const retry = (previous, candidate, requestedAt) => 'select helix_release_control.reserve_rollback_retry('
  + args([project, ...previous, ...candidate]) + ',' + requestedAt + ');';
const deny = (run, reason) => assert.throws(run, error => String(error.stderr).includes(reason));
const concurrently = async sql => (await promisify(execFile)('docker', [...psql('helix_release_controller'), '-c', sql], { env, timeout: 20_000 })).stdout.trim();

function verifyManagedOwnerEnrollment(install) {
  // The preceding tests used a controller created by the bootstrap superuser.
  // Keep that registry and its grants attached to their original role OID.
  owner('alter role helix_release_controller rename to prior_fixture_controller;');
  owner('create role registry_owner login createrole;');
  owner('create database managed_registry owner registry_owner;');
  const connect = (role, sql) => docker(psql(role).with(-1, 'managed_registry'), sql);
  const admin = sql => connect('postgres', sql);
  const installAsOwner = sql => connect('registry_owner', sql);
  installAsOwner('create schema private; create schema supabase_migrations; create role helix_release_controller login;');
  installAsOwner(readFileSync(marker, 'utf8'));
  installAsOwner("insert into private.helix_environment values(true,'production','erasogmsqpgiirovubjh');");
  assert.equal(installAsOwner(`select session_user,current_user,r.rolsuper,r.rolcreaterole,r.oid<>10,
    (select relowner=r.oid from pg_class where relname='helix_environment' and relnamespace='private'::regnamespace)
    from pg_roles r where r.rolname=current_user;`), 'registry_owner|registry_owner|f|t|t|t');
  const membership = `select roleid::regrole,member::regrole,grantor::regrole,grantor=10,
    admin_option,inherit_option,set_option from pg_auth_members
    where 'helix_release_controller'::regrole in (roleid,member);`;
  const stock = 'helix_release_controller|registry_owner|postgres|t|t|f|f';
  assert.equal(admin(membership), stock);
  const denyEnrollment = () => deny(() => installAsOwner(install), 'independent release login');
  admin('alter role registry_owner nocreaterole;');
  denyEnrollment();
  admin('alter role registry_owner createrole;');
  const rejectGrant = (grant, undo) => {
    admin(grant);
    denyEnrollment();
    admin(undo);
  };
  rejectGrant('grant helix_release_controller to authenticated with inherit false, set false;',
    'revoke helix_release_controller from authenticated;');
  rejectGrant('grant authenticated to helix_release_controller with inherit false, set false;',
    'revoke authenticated from helix_release_controller;');
  const toOwner = 'grant helix_release_controller to registry_owner with ';
  for (const [altered, original] of [['admin false', 'admin true'], ['inherit true', 'inherit false'], ['set true', 'set false']]) {
    rejectGrant(toOwner + altered, toOwner + original);
    assert.equal(admin(membership), stock);
  }
  // A genuine foreign-grantor row with the same options also requires the
  // grantor's own ADMIN membership. Verify both the row and refusal of the graph.
  admin('grant helix_release_controller to unexpected_reader with admin true, inherit false, set false;');
  admin('set role unexpected_reader;' + toOwner + 'admin true, inherit false, set false;');
  assert.ok(admin(membership).split('\n').includes('helix_release_controller|registry_owner|unexpected_reader|f|t|f|f'));
  denyEnrollment();
  admin('set role unexpected_reader; revoke helix_release_controller from registry_owner;');
  admin('revoke helix_release_controller from unexpected_reader;');
  assert.equal(admin(membership), stock);
  for (const target of ['database managed_registry', 'schema public', 'schema private', 'schema supabase_migrations']) {
    rejectGrant('grant create on ' + target + ' to helix_release_controller;',
      'revoke create on ' + target + ' from helix_release_controller;');
  }
  installAsOwner('create table private.restricted_fixture (id int);');
  for (const right of ['truncate', 'insert (id)']) {
    rejectGrant('grant ' + right + ' on private.restricted_fixture to helix_release_controller;',
      'revoke ' + right + ' on private.restricted_fixture from helix_release_controller;');
  }
  deny(() => admin('set role registry_owner;' + install), 'independent owner');
  assert.equal(admin("select to_regnamespace('helix_release_control') is null;"), 't');
  installAsOwner(install);
  assert.equal(installAsOwner('select count(*) from helix_release_control.transitions;'), '0');
  assert.equal(connect('anon', 'select public.read_helix_release_authorization(' + args([project, ...A]) + ');'), 'f');
  assert.equal(connect('helix_release_controller', 'select * from helix_release_control.read_environment();'),
    'production|erasogmsqpgiirovubjh');
}

const legacyPrevious = ['dpl_91HXTZGJXtUp9P4Us9edBvC73CmC', '4d45e0d3e14271513fb887592faadf6c2c24fede'];
const admission = (action, inspectionOnly, previous, candidate, projectId = project) =>
  'select helix_release_control.admit_release(' + args([action, inspectionOnly, projectId, ...previous, ...candidate]) + ');';

// The SQL boundary can explicitly refuse an action (false or a P0001 policy error).
// Missing functions, broken SQL, and unrelated permission errors cannot satisfy this check.
function refused(run) {
  let result;
  try {
    result = run();
  } catch (error) {
    assert.match(String(error.stderr), /ERROR:\s+P0001:/);
    return;
  }
  assert.equal(result, 'f');
}

function upgradePopulatedRegistry(install) {
  const history = `select sequence_id,previous_id,previous_sha,candidate_id,candidate_sha,phase,
    retained_id,retained_sha,last_failed_rollback_request_at from helix_release_control.transitions order by sequence_id;`;
  const before = owner(history);
  assert.ok(before.split('\n').length > 1);
  owner('alter default privileges in schema helix_release_control grant select on tables to unexpected_reader;');
  deny(() => owner(install), 'Unexpected release admission grants');
  assert.equal(owner("select to_regclass('helix_release_control.release_admissions') is null;"), 't');
  assert.equal(owner(history), before);
  owner('alter default privileges in schema helix_release_control revoke select on tables from unexpected_reader;');
  owner(install);
  assert.equal(owner(history), before);
  assert.equal(writer(admission('promote', false, B, build(6))), 't');
  assert.equal(writer(transition('start_promote', B, build(6))), 't');
  assert.equal(writer(transition('promoted', B, build(6))), 't');
  assert.equal(read(build(6)), 't');
}

async function verifyInspectionAdmission(install) {
  const db = 'managed_registry';
  const direct = (role, sql) => docker([...psql(role).with(-1, db), '-v', 'VERBOSITY=verbose'], sql);
  const control = sql => direct('helix_release_controller', sql);
  const candidate = build(7);
  const testAdmission = (action, held) => admission(action, held, legacyPrevious, candidate);
  const step = action => transition(action, legacyPrevious, candidate);
  const authorized = id => direct('anon',
    'select public.read_helix_release_authorization(' + args([project, ...id]) + ');');
  const phases = () => direct('registry_owner', 'select phase from helix_release_control.transitions order by sequence_id;');
  direct('registry_owner', install);
  // Use an independent empty registry for the competing protected dispatches.
  owner('create database admission_race template managed_registry owner registry_owner;');
  owner('create database admission_crossed template managed_registry owner registry_owner;');
  const crossed = sql => docker([...psql('helix_release_controller').with(-1, 'admission_crossed'), '-v', 'VERBOSITY=verbose'], sql);
  const downstream = build(9);
  assert.equal(crossed(admission('verify', false, candidate, downstream)), 't');
  assert.equal(crossed(testAdmission('verify', true)), 't');
  // The previously admitted downstream tuple now names a held artifact as
  // its serving predecessor. An older caller may still try its saved tuple.
  refused(() => crossed(transition('prepare', candidate, downstream)));
  assert.equal(docker(psql('registry_owner').with(-1, 'admission_crossed'),
    'select count(*) from helix_release_control.transitions;'), '0');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    deny(() => direct(role, testAdmission('verify', true)), 'permission denied');
  }
  refused(() => control(admission('verify', true, A, candidate)));
  refused(() => control(admission('verify', true, [legacyPrevious[0], A[1]], candidate)));
  refused(() => control(admission('verify', true, legacyPrevious, candidate, 'prj_other')));
  refused(() => control(step('prepare')));
  for (const unsupported of ['promote', 'rollback']) refused(() => control(testAdmission(unsupported, true)));
  assert.equal(phases(), '');

  // Admission precedes the migration. Retry may pin the same mode and tuple,
  // but cannot prepare either build or overwrite an existing inspection hold.
  assert.equal(control(testAdmission('verify', true)), 't');
  assert.equal(control(testAdmission('verify', true)), 't');
  for (const role of ['anon', 'authenticated', 'service_role', 'helix_release_controller']) {
    deny(() => direct(role, 'update helix_release_control.release_admissions set inspection_only=false;'), 'permission denied');
    deny(() => direct(role, 'delete from helix_release_control.release_admissions;'), 'permission denied');
  }
  for (const action of ['verify', 'promote', 'rollback', 'cancel']) refused(() => control(testAdmission(action, false)));
  refused(() => control(admission('verify', true, legacyPrevious, [candidate[0], A[1]])));
  assert.equal(phases(), '');
  assert.equal(authorized(legacyPrevious), 'f');
  assert.equal(authorized(candidate), 'f');
  assert.equal(control(step('prepare')), 't');
  assert.equal(authorized(legacyPrevious), 't');
  assert.equal(authorized(candidate), 't');
  for (const action of ['start_promote', 'promoted', 'start_rollback', 'rolled_back', 'failed_promotion']) {
    refused(() => control(step(action)));
  }
  refused(() => control(retry(legacyPrevious, candidate, 123)));
  assert.equal(phases(), 'prepared');
  assert.equal(control(testAdmission('cancel', true)), 't');
  assert.equal(control(step('cancel')), 't');
  assert.equal(authorized(legacyPrevious), 't');
  assert.equal(authorized(candidate), 'f');
  for (const action of ['verify', 'promote', 'rollback']) refused(() => control(testAdmission(action, false)));
  refused(() => control(step('prepare')));
  refused(() => control(step('start_promote')));
  assert.equal(phases(), 'cancelled');

  // A different, fully qualified release keeps the ordinary lifecycle. The
  // cancelled artifact's restriction survives this later registry record.
  const full = build(8);
  assert.equal(control(admission('promote', false, legacyPrevious, full)), 't');
  for (const action of ['prepare', 'start_promote', 'promoted']) {
    assert.equal(control(transition(action, legacyPrevious, full)), 't');
  }
  assert.equal(authorized(full), 't');
  assert.equal(control(admission('rollback', false, legacyPrevious, full)), 't');
  assert.equal(control(transition('start_rollback', legacyPrevious, full)), 't');
  assert.equal(control(transition('rolled_back', legacyPrevious, full)), 't');
  assert.equal(authorized(full), 'f');
  refused(() => control(testAdmission('promote', false)));
  assert.equal(phases(), 'cancelled\nrolled_back');

  const raceConnection = [...psql('helix_release_controller').with(-1, 'admission_race'), '-v', 'VERBOSITY=verbose'];
  const modes = [true, false];
  const race = await Promise.allSettled(modes.map(held =>
    promisify(execFile)('docker', [...raceConnection, '-c', testAdmission('verify', held)], { env, timeout: 20_000 })));
  const won = result => result.status === 'fulfilled' && result.value.stdout.trim() === 't';
  assert.equal(race.filter(won).length, 1, 'Exactly one evidence mode may pin this deployment');
  const winner = modes[race.findIndex(won)];
  const loser = race.find(result => !won(result));
  if (loser.status === 'rejected') assert.match(String(loser.reason.stderr), /ERROR:\s+P0001:/);
  else assert.equal(loser.value.stdout.trim(), 'f');
  assert.equal(docker(raceConnection, testAdmission('verify', winner)), 't');
  refused(() => docker(raceConnection, testAdmission('verify', !winner)));
}

try {
  for (let i = 0; ; i++) {
    try {
      // The entrypoint starts a temporary socket-only server during initdb.
      // Wait for the final postmaster to become PID 1 before creating fixtures.
      docker(['exec', container, 'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres']);
      break;
    } catch (error) { if (i >= 80) throw error; await delay(150); }
  }
  owner('create schema private; create role anon login; create role authenticated login; create role service_role login bypassrls; create role authenticator; create role helix_release_controller login; grant usage on schema private to service_role;');
  owner(readFileSync(marker, 'utf8'));
  const install = readFileSync(enrollment, 'utf8');
  deny(() => owner(install), 'production environment marker');
  owner("insert into private.helix_environment values(true,'production','erasogmsqpgiirovubjh');");
  // A superuser creator receives no automatic membership.
  owner('grant helix_release_controller to postgres with admin true, inherit false, set false;');
  deny(() => owner(install), 'independent release login');
  owner('revoke helix_release_controller from postgres;');
  owner('grant helix_release_controller to service_role;');
  deny(() => owner(install), 'independent release login');
  owner('revoke helix_release_controller from service_role;');
  owner('create role unexpected_reader; alter default privileges grant execute on functions to unexpected_reader;');
  deny(() => owner(install), 'Unexpected release authorization grants');
  owner('alter default privileges revoke execute on functions from unexpected_reader;');
  owner('alter default privileges grant create on schemas to unexpected_reader;');
  deny(() => owner(install), 'Unexpected release authorization grants');
  owner('alter default privileges revoke create on schemas from unexpected_reader;');
  owner(install);
  // Use the same source checkpoint and real forward migration as the T2 Catalog
  // proof. Keep this database independent of the controller state-machine proof.
  owner('create database catalog_observations;');
  const catalogPsql = psql('postgres').with(-1, 'catalog_observations');
  const catalog = sql => docker(catalogPsql, sql);
  const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  for (const file of [
    'supabase/tests/checkpoints/catalog-current-20260909042518.sql',
    'supabase/migrations/20260914051153_catalog_restore_current_identity.sql',
    'supabase/migrations/20260914062651_catalog_stable_media_boundary.sql',
    'supabase/migrations/20260915030021_catalog_media_activation_singleton_guard.sql',
  ]) catalog(source(file));
  catalog(readFileSync(marker, 'utf8'));
  const installObservations = source('supabase/operations/release-bootstrap/read_release_capabilities.sql');
  deny(() => catalog(installObservations), 'verified production marker');
  deny(() => catalog("begin; insert into private.helix_environment values(true,'development','zyfkunnpnlmgvrojmrbg');" + installObservations), 'verified production marker');
  catalog("insert into private.helix_environment values(true,'production','erasogmsqpgiirovubjh');");
  deny(() => catalog('set role service_role;' + installObservations), 'verified production marker');
  catalog('alter default privileges in schema public grant execute on functions to unexpected_reader;');
  deny(() => catalog(installObservations), 'Unexpected release observation grants');
  assert.equal(catalog("select to_regprocedure('private.read_helix_release_observations()') is null;"), 't');
  catalog('alter default privileges in schema public revoke execute on functions from unexpected_reader;');
  catalog(installObservations);
  assert.equal(catalog("select public.read_helix_release_observations()->>'catalogSchema';"), 'false');
  catalog('create role catalog_release_writer login; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  docker([...catalogPsql, '-v', 'writer_role=catalog_release_writer', '-v', 'expected_environment=production',
    '-v', 'expected_project_ref=erasogmsqpgiirovubjh'], source('supabase/operations/release-bootstrap/enroll_catalog_media_release.sql'));
  docker(psql('catalog_release_writer').with(-1, 'catalog_observations'), source('supabase/migrations/20261120131137_bind_catalog_media_to_environment.sql'));
  catalog(source('scripts/db/prove-release-observations.sql'));
  assert.equal(writer('select current_user, environment, project_ref from helix_release_control.read_environment();'),
    'helix_release_controller|production|erasogmsqpgiirovubjh');
  for (const role of ['anon', 'authenticated', 'service_role', 'helix_release_controller']) {
    deny(() => docker(psql(role), 'create table helix_release_control.unapproved (id int);'), 'permission denied');
    deny(() => docker(psql(role), 'select * from helix_release_control.transitions;'), 'permission denied');
    deny(() => docker(psql(role), 'update helix_release_control.transitions set phase=phase;'), 'permission denied');
    deny(() => docker(psql(role), 'insert into helix_release_control.transitions default values;'), 'permission denied');
    deny(() => docker(psql(role), 'delete from helix_release_control.transitions;'), 'permission denied');
    if (role !== 'helix_release_controller') deny(() => docker(psql(role), transition('prepare', A, B)), 'permission denied');
    if (role !== 'helix_release_controller') deny(() => docker(psql(role), retry(A, B, Date.now())), 'permission denied');
    if (role !== 'helix_release_controller') deny(() => pair(B, role), 'permission denied');
    if (!['anon', 'service_role'].includes(role)) deny(() => read(A, role), 'permission denied');
  }
  assert.equal(docker(psql('anon'), "select has_schema_privilege(current_user,'private','USAGE'),has_schema_privilege(current_user,'helix_release_control','USAGE');"), 'f|f');
  deny(() => docker(psql('anon'), 'select * from private.helix_environment;'), 'permission denied');
  assert.equal(read(A), 'f');
  assert.equal(pair(B), '');
  deny(() => writer('begin isolation level repeatable read; ' + transition('prepare', A, B)), 'transaction isolation');
  // A transaction interrupted before commit leaves no grant or request reservation.
  writer('begin; ' + transition('prepare', A, B) + transition('start_promote', A, B) + 'rollback;');
  assert.equal(read(B), 'f');
  assert.equal(writer(transition('prepare', A, B)), 't');
  assert.equal(pair(B), [...A, ...B, 'prepared'].join('|'));
  assert.equal(pair([B[0], null]), pair(B));
  assert.equal(pair([null, B[1]]), pair(B));
  assert.equal(pair([null, null]), '');
  assert.equal(pair([B[0], C[1]]), '');
  assert.equal(pair([C[0], B[1]]), '');
  assert.equal(read(A), 't'); assert.equal(read(B), 't');
  assert.equal(read(B, 'service_role'), 't');
  assert.equal(read([B[0], C[1]]), 'f'); assert.equal(read(B, 'service_role', 'prj_other'), 'f');
  assert.deepEqual((await Promise.all([1, 2].map(() => concurrently(transition('start_promote', A, B))))).sort(), ['f', 't']);
  deny(() => writer(transition('prepare', A, C)), 'Unresolved');
  deny(() => writer(transition('promoted', A, [B[0], C[1]])), 'identity');
  writer(transition('promoted', A, B)); writer(transition('promoted', A, B));
  // Race separate releases against the same actually-serving baseline. Only
  // the first preparation may authorize a candidate.
  const raced = await Promise.allSettled([C, D].map(id => concurrently(transition('prepare', B, id))));
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  const staged = raced[0].status === 'fulfilled' ? C : D;
  writer(transition('cancel', B, staged));
  assert.equal(read(staged), 'f');
  // The stale candidate stays terminal. Use fresh immutable deployment IDs.
  C[0] += 'new'; D[0] += 'new';
  writer(transition('prepare', B, C));
  assert.equal(pair(B), '', 'Even a matching historical candidate must not select an older release');
  // Prior rollback A remains authorized while the new C is staged beside B.
  for (const id of [A, B, C]) assert.equal(read(id), 't');
  writer(transition('start_promote', B, C)); writer(transition('promoted', B, C));
  assert.equal(read(A), 'f');
  deny(() => writer(retry(B, C, Date.now())), 'rolling-back pair');
  assert.deepEqual((await Promise.all([1, 2].map(() => concurrently(transition('start_rollback', B, C))))).sort(), ['f', 't']);
  const failedRequestAt = Date.now();
  deny(() => writer(retry(A, B, failedRequestAt)), 'rolling-back pair');
  assert.deepEqual((await Promise.all([1, 2].map(() => concurrently(retry(B, C, failedRequestAt))))).sort(), ['f', 't']);
  assert.equal(writer(retry(B, C, failedRequestAt - 1)), 'f');
  assert.equal(writer(retry(B, C, failedRequestAt + 1)), 't');
  assert.equal(writer(retry(B, C, failedRequestAt + 1)), 'f');
  deny(() => writer(transition('prepare', C, D)), 'Unresolved');
  writer(transition('rolled_back', B, C)); writer(transition('rolled_back', B, C));
  assert.equal(pair(C), [...B, ...C, 'rolled_back'].join('|'));
  deny(() => writer(retry(B, C, failedRequestAt + 2)), 'rolling-back pair');
  assert.equal(read(A), 't'); assert.equal(read(B), 't'); assert.equal(read(C), 'f');
  deny(() => writer(transition('promoted', B, C)), 'phase');
  deny(() => writer(transition('prepare', B, C)), 'terminal');
  deny(() => writer(transition('prepare', B, [A[0], D[1]])), 'reused');
  deny(() => writer(transition('prepare', A, D)), 'serving');

  // Exercise the real release orchestrator on the retained B and a new build,
  // replacing only hosting and application reads with a tiny Catalog fixture.
  owner("create table public.proof_products (id int primary key, title text not null); insert into public.proof_products values (1,'Serum'); grant select on public.proof_products to anon;");
  const oldQuery = 'select title from public.proof_products order by id;';
  const newQuery = 'select title,sort_order from public.proof_products order by sort_order,id;';
  assert.equal(docker(psql('anon'), oldQuery), 'Serum');
  owner('alter table public.proof_products add column sort_order int not null default 10;');
  const previous = { id: B[0], sha: B[1], url: 'https://previous.vercel.app' };
  const candidate = { id: D[0], sha: D[1], url: 'https://candidate.vercel.app' };
  const release = { previousId: B[0], previousSha: B[1], candidateId: D[0], candidateSha: D[1] };
  let serving = 'previous';
  let failedRollback = null;
  const inspect = () => ({ previous, candidate, serving });
  const checks = [];
  const rehearsal = {
    release, appliedSha: candidate.sha, currentHead: () => candidate.sha,
    controller: { inspect, inspectRecovery: inspect,
      terminalFailedRollback: () => failedRollback,
      promote() { serving = 'candidate'; },
      rollback(_release, failure) {
        if (!failedRollback) {
          failedRollback = { requestedAt: Date.now() };
          throw new Error('Synthetic provider rollback failed');
        }
        assert.deepEqual(failure, failedRollback);
        serving = 'previous';
      } },
    transition: (action, requestedAt) => writer(action === 'retry_rollback'
      ? retry(B, D, requestedAt) : transition(action, B, D)) === 't',
    check(phase, origin, deployment) {
      const served = origin === 'https://www.helixskin.us' ? inspect()[serving]
        : [previous, candidate].find(build => build.url === origin);
      assert.deepEqual(served, deployment);
      assert.equal(read([deployment.id, deployment.sha]), 't');
      const isOld = deployment.id === previous.id;
      assert.equal(docker(psql('anon'), isOld ? oldQuery : newQuery), isOld ? 'Serum' : 'Serum|10');
      checks.push(phase);
    },
  };
  await executeRelease('verify', rehearsal);
  assert.equal(serving, 'previous');
  await executeRelease('promote', rehearsal);
  assert.equal(serving, 'candidate');
  await assert.rejects(executeRelease('rollback', rehearsal), /Synthetic provider rollback failed/);
  await executeRelease('rollback', rehearsal);
  assert.equal(serving, 'previous');
  assert.deepEqual(checks, ['previous','staged','previous','staged','canonical','previous','previous','previous']);
  assert.equal(read(A), 't'); assert.equal(read(B), 't'); assert.equal(read(D), 'f');
  assert.equal(docker(psql('anon'), newQuery), 'Serum|10', 'Rollback must preserve the forward schema');
  const failedCandidate = build(5);
  writer(transition('prepare', B, failedCandidate));
  deny(() => writer(transition('failed_promotion', B, failedCandidate)), 'phase');
  writer(transition('start_promote', B, failedCandidate));
  assert.equal(writer(transition('failed_promotion', B, failedCandidate)), 't');
  assert.equal(writer(transition('failed_promotion', B, failedCandidate)), 't');
  assert.equal(read(failedCandidate), 'f'); assert.equal(read(B), 't');
  assert.equal(writer(transition('prepare', B, build(6))), 't');
  const inspectionInstall = source('supabase/operations/release-bootstrap/enroll_inspection_only_release.sql');
  upgradePopulatedRegistry(inspectionInstall);
  verifyManagedOwnerEnrollment(install);
  await verifyInspectionAdmission(inspectionInstall);
  console.log('PASS PostgreSQL 17 release authorization and observations: exact grants, capability states, concurrency, staged promotion and old-build rollback on expanded schema.');
} finally {
  assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "helix.release-auth"}}', container]), nonce);
  docker(['rm', '--force', container]);
}
