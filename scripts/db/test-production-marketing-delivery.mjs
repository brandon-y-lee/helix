import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
assert.equal(process.argv.length,2,'No database URL/container argument is accepted');
assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'Remote Docker overrides refused');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
assert.ok(JSON.parse(docker(['context','inspect']))[0].Endpoints.docker.Host.startsWith('unix://'),'Local Unix Docker only');
const name=`helix-production-marketing-540-${process.pid}-${Date.now()}`;
const sql=input=>docker(['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input}).trim();
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
let owned=false;
try {
  docker(['run','--pull=never','--detach','--network=none','--name',name,'--label','helix.task=production-marketing-540-synthetic','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);owned=true;
  for(let i=0;i<100;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
  sql('create role anon;create role authenticated;create role service_role bypassrls;create schema private;revoke all on schema private from public;');
  sql(file('../../supabase/migrations/20261117090000_production_marketing_consent.sql'));
  sql(file('../../supabase/tests/production_marketing_consent.integration.sql'));
  sql(file('../../supabase/operations/production-marketing/delivery.sql'));
  sql(file('../../supabase/tests/production_marketing_delivery.integration.sql'));
  function session(){
    const child=spawn('docker',['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{stdio:['pipe','pipe','pipe']});
    let output='',error='';child.stdout.on('data',v=>{output+=v;});child.stderr.on('data',v=>{error+=v;});
    const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(error)));});
    return {child,done,output:()=>output};
  }
  async function until(predicate,message){const deadline=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<deadline,message);await new Promise(r=>setTimeout(r,25));}}
  async function race(firstSql,secondSql,{wait=true}={}){
    const first=session();let second;
    try{
      first.child.stdin.write(`BEGIN;SET LOCAL statement_timeout='15s';${firstSql}\n\\echo held\n`);
      await Promise.race([until(()=>first.output().includes('held'),'first barrier'),first.done.then(()=>{throw new Error('first exited before barrier');})]);
      second=session();second.child.stdin.end(`BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL application_name='marketing_540_contender';${secondSql}COMMIT;`);
      if(wait)await Promise.race([until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='marketing_540_contender' and wait_event_type='Lock');")==='t','contender must wait for transaction lock'),second.done.then(()=>{throw new Error('contender escaped lock');})]);
      else await second.done;
      first.child.stdin.end('COMMIT;\n');await Promise.all([first.done,second.done]);return [first.output(),second.output()];
    }finally{if(!first.child.stdin.destroyed)first.child.stdin.end('ROLLBACK;\n');await first.done.catch(()=>{});if(second)await second.done.catch(()=>{});}
  }
  sql("SELECT public.request_production_marketing_subscription('concurrent-confirm@example.invalid',md5('concurrent-confirmc')||md5('concurrent-confirmc'),md5('concurrent-confirmp')||md5('concurrent-confirmp'),md5('concurrent-confirmr')||md5('concurrent-confirmr'),true,'production_welcome_v1',public.test_envelope());");
  const confirm="SELECT public.confirm_production_marketing_subscription(md5('concurrent-confirmc')||md5('concurrent-confirmc'));";
  assert.deepEqual((await race(confirm,confirm)).map(v=>v.split('\n').filter(x=>x==='t'||x==='f')),[['t'],['t']]);
  assert.equal(sql("SELECT count(*) FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE normalized_email='concurrent-confirm@example.invalid' AND purpose='welcome';"),'1','concurrent confirmation admits one welcome');
  sql("UPDATE private.production_marketing_messages SET state='cancelled' WHERE subscriber_id=(SELECT id FROM private.production_marketing_subscribers WHERE normalized_email='concurrent-confirm@example.invalid');");
  const id=sql("SELECT public.test_delivery('concurrent-claim');"), lease='44444444-4444-4444-8444-444444444444';
  const claims=await race(`SET LOCAL ROLE service_role;SELECT public.claim_production_marketing_message('${lease}')->>'id';`,`SET LOCAL ROLE service_role;SELECT public.claim_production_marketing_message(gen_random_uuid())->>'id';`,{wait:false});
  assert.ok(claims[0].includes(id));assert.ok(!claims[1].includes(id),'competing worker cannot take held address/lease');
  sql(`UPDATE private.production_marketing_messages SET lease_until=clock_timestamp()-interval '1 second' WHERE id='${id}';`);
  const renewed='66666666-6666-4666-8666-666666666666';
  assert.equal(sql(`SELECT public.claim_production_marketing_message('${renewed}')->>'id';`),id);
  assert.equal(sql(`SELECT public.test_prepare('${id}','${lease}') IS NULL;`),'t','expired claim cannot prepare after lease replacement');
  assert.equal(sql(`SELECT public.test_prepare('${id}','${renewed}') IS NOT NULL;`),'t','replacement lease prepares once');
  sql(`UPDATE private.production_marketing_messages SET state='cancelled' WHERE id='${id}';`);
  for(const withdrawalFirst of [true,false]){
    const label=withdrawalFirst?'race-withdraw-first':'race-prepare-first',message=sql(`SELECT public.test_delivery('${label}');`);
    sql(`UPDATE private.production_marketing_messages SET lease_token='${lease}',lease_until=clock_timestamp()+interval '60 seconds' WHERE id='${message}';`);
    const withdraw=`SELECT public.withdraw_production_marketing_subscription(md5('${label}p')||md5('${label}p'));`;
    const prepare=`SELECT public.test_prepare('${message}','${lease}') IS NOT NULL;`;
    const output=await race(withdrawalFirst?withdraw:prepare,withdrawalFirst?prepare:withdraw);
    assert.deepEqual(output.map(v=>v.split('\n').filter(x=>x==='t'||x==='f')),withdrawalFirst?[['t'],['f']]:[['t'],['t']]);
    assert.equal(sql(`SELECT state FROM private.production_marketing_subscribers WHERE normalized_email='${label}@example.invalid';`),'withdrawn');
  }
  const one=sql("SELECT public.test_delivery('quota-one');"),two=sql("SELECT public.test_delivery('quota-two');");
  sql(`UPDATE private.production_marketing_messages SET lease_token='${lease}',lease_until=clock_timestamp()+interval '60 seconds' WHERE id IN ('${one}','${two}');UPDATE private.production_marketing_controls SET daily_limit=(SELECT used+1 FROM private.production_marketing_quota_counters WHERE kind='day' AND period=(clock_timestamp() AT TIME ZONE 'UTC')::date);`);
  const quota=await race(`SELECT public.test_prepare('${one}','${lease}') IS NOT NULL;`,`SELECT public.test_prepare('${two}','${lease}') IS NOT NULL;`);
  assert.deepEqual(quota.map(v=>v.split('\n').filter(x=>x==='t'||x==='f')),[['t'],['f']]);
  assert.equal(sql(`SELECT count(*) FROM private.production_marketing_quota_reservations WHERE message_id='${two}';`),'0','denied competing quota must not partially charge');
  sql("UPDATE private.production_marketing_controls SET daily_limit=100;UPDATE private.production_marketing_messages SET state='cancelled' WHERE state IN ('held','uncertain');");
  execFileSync('pnpm',['exec','vitest','run','--config','scripts/db/production-marketing-delivery.config.ts'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,HELIX_SYNTHETIC_MARKETING_DELIVERY_CONTAINER:name}});
  console.log(JSON.stringify({status:'passed',postgresMajor:17,actualWorkerThroughPostgres:true,rlsAndGrants:true,competingClaims:true,withdrawalBothOrders:true,atomicQuota:true,utcRollover:true,payloadErasure:true,unknownDurableResultHold:true,externalProviderCalls:0}));
}finally{if(owned){assert.equal(docker(['inspect','-f','{{index .Config.Labels "helix.task"}}',name]).trim(),'production-marketing-540-synthetic');docker(['rm','--force','--volumes',name]);}}
