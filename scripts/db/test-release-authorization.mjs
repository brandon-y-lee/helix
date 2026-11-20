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
const args = values => values.map(value => "'" + value + "'").join(',');
const transition = (action, previous, candidate) =>
  'select helix_release_control.transition_helix_release_authorization(' + args([action, project, ...previous, ...candidate]) + ');';
const read = (id, role = 'service_role', projectId = project) => docker(psql(role),
  'select public.read_helix_release_authorization(' + args([projectId, ...id]) + ');');
const deny = (run, reason) => assert.throws(run, error => String(error.stderr).includes(reason));
const concurrently = async sql => (await promisify(execFile)('docker', [...psql('helix_release_controller'), '-c', sql], { env, timeout: 20_000 })).stdout.trim();

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
  owner('grant helix_release_controller to service_role;');
  deny(() => owner(install), 'independent release login');
  owner('revoke helix_release_controller from service_role;');
  owner('create role unexpected_reader; alter default privileges grant execute on functions to unexpected_reader;');
  deny(() => owner(install), 'Unexpected release authorization grants');
  owner('alter default privileges revoke execute on functions from unexpected_reader;');
  owner(install);
  owner(readFileSync(new URL('../../supabase/operations/release-bootstrap/read_release_capabilities.sql', import.meta.url), 'utf8'));
  owner(readFileSync(new URL('./prove-release-observations.sql', import.meta.url), 'utf8'));
  assert.equal(writer('select current_user, environment, project_ref from helix_release_control.read_environment();'),
    'helix_release_controller|production|erasogmsqpgiirovubjh');
  for (const role of ['anon', 'authenticated', 'service_role', 'helix_release_controller']) {
    deny(() => docker(psql(role), 'select * from helix_release_control.transitions;'), 'permission denied');
    deny(() => docker(psql(role), 'update helix_release_control.transitions set phase=phase;'), 'permission denied');
    if (role !== 'helix_release_controller') deny(() => docker(psql(role), transition('prepare', A, B)), 'permission denied');
    if (role !== 'service_role') deny(() => read(A, role), 'permission denied');
  }
  assert.equal(read(A), 'f');
  deny(() => writer('begin isolation level repeatable read; ' + transition('prepare', A, B)), 'transaction isolation');
  // A transaction interrupted before commit leaves no grant or request reservation.
  writer('begin; ' + transition('prepare', A, B) + transition('start_promote', A, B) + 'rollback;');
  assert.equal(read(B), 'f');
  assert.equal(writer(transition('prepare', A, B)), 't');
  assert.equal(read(A), 't'); assert.equal(read(B), 't');
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
  // Prior rollback A remains authorized while the new C is staged beside B.
  for (const id of [A, B, C]) assert.equal(read(id), 't');
  writer(transition('start_promote', B, C)); writer(transition('promoted', B, C));
  assert.equal(read(A), 'f');
  assert.deepEqual((await Promise.all([1, 2].map(() => concurrently(transition('start_rollback', B, C))))).sort(), ['f', 't']);
  deny(() => writer(transition('prepare', C, D)), 'Unresolved');
  writer(transition('rolled_back', B, C)); writer(transition('rolled_back', B, C));
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
  const inspect = () => ({ previous, candidate, serving });
  const checks = [];
  const rehearsal = {
    release, appliedSha: candidate.sha, currentHead: () => candidate.sha,
    controller: { inspect, inspectRecovery: inspect,
      promote() { serving = 'candidate'; }, rollback() { serving = 'previous'; } },
    transition: action => writer(transition(action, B, D)) === 't',
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
  await executeRelease('rollback', rehearsal);
  assert.equal(serving, 'previous');
  assert.deepEqual(checks, ['previous','staged','previous','staged','canonical','previous','previous']);
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
  console.log('PASS PostgreSQL 17 release authorization and observations: exact grants, capability states, concurrency, staged promotion and old-build rollback on expanded schema.');
} finally {
  assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "helix.release-auth"}}', container]), nonce);
  docker(['rm', '--force', container]);
}
