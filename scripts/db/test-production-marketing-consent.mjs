import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Own a new no-network container. Never accept a URL, container name or remote Docker host.
assert.equal(process.argv.length, 2, 'This runner accepts no database or container arguments');
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Remote Docker overrides are refused');
const endpoint = JSON.parse(execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }))[0].Endpoints.docker.Host;
assert.ok(endpoint.startsWith('unix://'), 'Only the local Unix Docker socket is permitted');
const name = `helix-production-marketing-539-${process.pid}-${Date.now()}`;
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], ...options });
const sql = input => docker(['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'], { input });
let owned = false;
try {
  docker(['run','--pull=never','--detach','--network=none','--name',name,'--label','helix.task=production-marketing-539-synthetic','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
  owned = true;
  for (let i=0;i<100;i++) { try { docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  assert.equal(sql("select current_setting('server_version_num')::int/10000;").trim(), '17');
  sql('create role anon; create role authenticated; create role service_role bypassrls; create schema private; revoke all on schema private from public;');
  sql(readFileSync(new URL('../../supabase/migrations/20261117090000_production_marketing_consent.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/tests/production_marketing_consent.integration.sql',import.meta.url),'utf8'));
  function session() {
    const child = spawn('docker',['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'], { stdio:['pipe','pipe','pipe'] });
    let output='', error='';
    child.stdout.on('data',data=>{ output+=data; });
    child.stderr.on('data',data=>{ error+=data; });
    const done = new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(new Error(error)));
    });
    return { child,done,output:()=>output };
  }
  async function until(predicate, message) {
    const deadline=Date.now()+10000;
    while (!predicate()) { assert.ok(Date.now()<deadline,message); await new Promise(r=>setTimeout(r,25)); }
  }
  async function race(firstSql,secondSql) {
    const first=session(); let second;
    try {
      first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role; ${firstSql}\n\\echo held\n`);
      await Promise.race([until(()=>first.output().includes('held'),'first connection failed to reach barrier'),first.done.then(()=>{throw new Error('first connection exited early');})]);
      second=session();
      second.child.stdin.end(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='production_marketing_contender'; SET LOCAL ROLE service_role; ${secondSql} COMMIT;`);
      await Promise.race([until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='production_marketing_contender' AND wait_event_type='Lock');").trim()==='t','second connection must wait for shared lock'),second.done.then(()=>{throw new Error('contender escaped shared lock');})]);
      first.child.stdin.end('COMMIT;\n');
      await Promise.all([first.done,second.done]);
      return [first.output(),second.output()];
    } finally {
      if(!first.child.stdin.destroyed) first.child.stdin.end('ROLLBACK;\n');
      await first.done.catch(()=>{});
      if(second) await second.done.catch(()=>{});
    }
  }
  const hash = value => `md5('${value}')||md5('${value}')`;
  const request = (address,key) => `SELECT public.request_production_marketing_subscription('${address}',${hash(key+'c')},${hash(key+'p')},${hash(key+'r')},true,'production_welcome_v1',public.test_envelope());`;
  const confirm = key => `SELECT public.confirm_production_marketing_subscription(${hash(key+'c')});`;
  const withdraw = key => `SELECT public.withdraw_production_marketing_subscription(${hash(key+'p')});`;
  const bools = output => output.split('\n').filter(value=>value==='t'||value==='f');
  const duplicate = await race(request('parallel@example.invalid','parallel'),request('PARALLEL@example.invalid','parallel2'));
  assert.deepEqual(duplicate.map(bools),[['t'],['f']],'one current issuance under concurrent normalized-address requests');
  assert.deepEqual((await race(confirm('parallel'),confirm('parallel'))).map(bools),[['t'],['t']]);
  assert.equal(sql("SELECT count(*) FROM private.production_marketing_evidence e JOIN private.production_marketing_subscribers s ON s.id=e.subscriber_id WHERE s.normalized_email='parallel@example.invalid' AND e.event='confirmed';").trim(),'1');
  for(const firstWithdraw of [true,false]) {
    const key=firstWithdraw?'withdraw-first':'confirm-first';
    sql(request(`${key}@example.invalid`,key));
    const result=await race(firstWithdraw?withdraw(key):confirm(key),firstWithdraw?confirm(key):withdraw(key));
    assert.deepEqual(result.map(bools),firstWithdraw?[['t'],['f']]:[['t'],['t']]);
    assert.equal(sql(`SELECT state FROM private.production_marketing_subscribers WHERE normalized_email='${key}@example.invalid';`).trim(),'withdrawn');
    assert.equal(sql(confirm(key)).trim(),'f','neither ordering permits stale confirmation to restore consent');
  }
  sql("DELETE FROM private.production_marketing_request_limits;");
  for(let n=0;n<29;n++) sql(request(`budget-${n}@example.invalid`,`budget-${n}`));
  assert.deepEqual((await race(request('last-slot@example.invalid','last'),request('over-limit@example.invalid','over'))).map(bools),[['t'],['f']],'concurrent addresses cannot overrun shared issuance bound');
  execFileSync('pnpm',['exec','vitest','run','--config','scripts/db/production-marketing-request.config.ts'], { cwd:new URL('../../',import.meta.url), encoding:'utf8', stdio:['ignore','pipe','pipe'], env:{...process.env,HELIX_SYNTHETIC_PRODUCTION_MARKETING_CONTAINER:name} });
  console.log(JSON.stringify({ actualHandlersThroughPostgres:true, status:'passed', postgresMajor:17, forcedRls:true, serviceOnlyRpcs:true, expiry:true,
    finiteRateLimits:true, concurrentNormalizedAddress:true, concurrentConfirmation:true, concurrentWithdrawalBothOrders:true,
    concurrentGlobalLimit:true, providerCalls:0 }));
} finally {
  if (owned) {
    assert.equal(docker(['inspect','-f','{{index .Config.Labels "helix.task"}}',name]).trim(),'production-marketing-539-synthetic');
    docker(['rm','--force','--volumes',name]);
  }
}
