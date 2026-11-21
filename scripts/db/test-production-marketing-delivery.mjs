import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const readiness=process.argv.length===3&&process.argv[2]==='--readiness';
const events=readiness||(process.argv.length===3&&process.argv[2]==='--events');
assert.ok(process.argv.length===2||events,'Only --events/--readiness are accepted; no database URL/container argument');
const ticket=readiness?'542':events?'541':'540';
assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'Remote Docker overrides refused');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
assert.ok(JSON.parse(docker(['context','inspect']))[0].Endpoints.docker.Host.startsWith('unix://'),'Local Unix Docker only');
const name=`helix-production-marketing-${ticket}-${process.pid}-${Date.now()}`;
const sql=input=>docker(['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input}).trim();
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
let owned=false;
try {
  docker(['run','--pull=never','--detach','--network=none','--name',name,'--label',`helix.task=production-marketing-${ticket}-synthetic`,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);owned=true;
  for(let i=0;i<100;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
  sql('create role anon;create role authenticated;create role service_role bypassrls;create schema private;revoke all on schema private from public;');
  sql(file('../../supabase/migrations/20261117090000_production_marketing_consent.sql'));
  if(!readiness)sql(file('../../supabase/tests/production_marketing_consent.integration.sql'));
  sql(file('../../supabase/operations/production-marketing/delivery.sql'));
  if(events){sql('create table public.admin_memberships(user_id uuid primary key,role text not null,active boolean not null);');sql(file('../../supabase/operations/production-marketing/events.sql'));}
  if(readiness){
    assert.equal(sql("SELECT NOT enrollment_enabled AND NOT dispatch_enabled AND NOT events_enabled AND NOT status_enabled AND daily_limit=0 AND monthly_limit=0 AND delivery_contract_text IS NULL FROM private.production_marketing_controls;"),'t','all three packages cold/off');
    assert.equal(sql("SELECT sum(n) FROM (SELECT count(*) n FROM private.production_marketing_subscribers UNION ALL SELECT count(*) FROM private.production_marketing_confirmation_intents UNION ALL SELECT count(*) FROM private.production_marketing_messages UNION ALL SELECT count(*) FROM private.production_marketing_events UNION ALL SELECT count(*) FROM private.production_marketing_suppressions) x;"),'0','no historical data imported');
    const browserOutput=execFileSync('pnpm',['exec','vitest','run','--config','scripts/db/production-marketing-readiness.config.ts'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,HELIX_SYNTHETIC_MARKETING_READINESS_CONTAINER:name}});
    assert.equal(/Tests\s+(\d+) passed/.exec(browserOutput)?.[1],'1','combined real browser/database journey executes');
    // Discard only this owned fixture database, then reapply pristine packages for retained suites.
    sql('DROP SCHEMA private CASCADE;DROP SCHEMA public CASCADE;CREATE SCHEMA public;GRANT USAGE ON SCHEMA public TO PUBLIC;CREATE SCHEMA private;REVOKE ALL ON SCHEMA private FROM PUBLIC;');
    sql(file('../../supabase/migrations/20261117090000_production_marketing_consent.sql'));
    sql(file('../../supabase/tests/production_marketing_consent.integration.sql'));
    sql(file('../../supabase/operations/production-marketing/delivery.sql'));
    sql('create table public.admin_memberships(user_id uuid primary key,role text not null,active boolean not null);');sql(file('../../supabase/operations/production-marketing/events.sql'));
  }
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
  // Hold the message row to pause the actual preparer after its address lock. A
  // repeated confirmation and controller pause must not create a control/address inversion.
  const pauseId=sql("SELECT public.test_delivery('control-order');");
  sql(`UPDATE private.production_marketing_messages SET lease_token='${lease}',lease_until=clock_timestamp()+interval '60 seconds' WHERE id='${pauseId}';`);
  const holder=session(),preparer=session(),confirmer=session(),controller=session();
  for(const s of [holder,preparer,confirmer,controller])s.done.catch(()=>{});
  try{
    holder.child.stdin.write(`BEGIN;SET LOCAL statement_timeout='15s';SELECT id FROM private.production_marketing_messages WHERE id='${pauseId}' FOR UPDATE;\n\\echo held\n`);
    await until(()=>holder.output().includes('held'),'control-order row barrier');
    preparer.child.stdin.end(`BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL application_name='marketing_540_control_prepare';SELECT public.test_prepare('${pauseId}','${lease}') IS NOT NULL;COMMIT;`);
    await until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='marketing_540_control_prepare' AND wait_event_type='Lock');")==='t','preparer row wait');
    confirmer.child.stdin.end("BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL application_name='marketing_540_control_confirm';SELECT public.confirm_production_marketing_subscription(md5('control-orderc')||md5('control-orderc'));COMMIT;");
    await until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='marketing_540_control_confirm' AND wait_event_type='Lock');")==='t','confirmation address wait');
    controller.child.stdin.end("BEGIN;SET LOCAL statement_timeout='15s';SET LOCAL application_name='marketing_540_control_pause';UPDATE private.production_marketing_controls SET dispatch_enabled=false;COMMIT;");
    await until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='marketing_540_control_pause' AND wait_event_type='Lock');")==='t','controller control wait');
    holder.child.stdin.end('COMMIT;\n');await Promise.all([holder.done,preparer.done,confirmer.done,controller.done]);
    assert.ok(preparer.output().split('\n').includes('t')&&confirmer.output().split('\n').includes('t'),'admitted work and idempotent confirmation complete before control pause');
    assert.equal(sql("SELECT dispatch_enabled FROM private.production_marketing_controls;"),'f');
  }finally{for(const s of [holder,preparer,confirmer,controller])if(!s.child.stdin.destroyed)s.child.stdin.end('ROLLBACK;\n');await Promise.all([holder,preparer,confirmer,controller].map(s=>s.done.catch(()=>{})));}
  sql(`UPDATE private.production_marketing_controls SET dispatch_enabled=true;UPDATE private.production_marketing_messages SET state='cancelled' WHERE id='${pauseId}';`);
  const workerOutput=execFileSync('pnpm',['exec','vitest','run','--config','scripts/db/production-marketing-delivery.config.ts'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,HELIX_SYNTHETIC_MARKETING_DELIVERY_CONTAINER:name}});
  const workerCases=/Tests\s+(\d+) passed/.exec(workerOutput)?.[1];assert.equal(workerCases,'7','all seven actual-worker cases must execute');
  if(events){
    sql('DELETE FROM private.production_marketing_request_limits;');
    sql(file('../../supabase/tests/production_marketing_events.integration.sql'));
    const eventLease='77777777-7777-4777-8777-777777777777';
    const eventMessage=label=>sql(`SELECT public.test_event_prepared('${label}','${eventLease}');`);
    const eventCall=(id,provider,event,type='email.sent')=>`SELECT public.test_event('${id}','${provider}','${event}','${type}');`;
    for(const eventFirst of [true,false]){
      const id=eventMessage(eventFirst?'event-first-race':'finish-first-race'),provider=sql('SELECT gen_random_uuid();');
      const event=eventCall(id,provider,`race-${eventFirst}`),finish=`SELECT public.finish_production_marketing_message('${id}','${eventLease}','accepted','${provider}');`;
      await race(eventFirst?event:finish,eventFirst?finish:event);
      assert.equal(sql(`SELECT state='accepted' AND provider_id='${provider}' AND NOT reconciliation_required FROM private.production_marketing_messages WHERE id='${id}';`),'t','both callback/finish lock orderings preserve first acceptance');
    }
    const duplicate=eventMessage('event-duplicate-race'),provider=sql('SELECT gen_random_uuid();');
    const duplicateCall=`SELECT public.test_event('${duplicate}','${provider}','duplicate-race','email.delivered','2026-11-17T00:00:00Z');`;
    // Event occurrence must follow this fixture preparation; freeze once across contenders.
    const occurred=sql('SELECT private.production_marketing_iso(clock_timestamp());');
    await race(duplicateCall.replace('2026-11-17T00:00:00Z',occurred),duplicateCall.replace('2026-11-17T00:00:00Z',occurred));
    assert.equal(sql("SELECT count(*) FROM private.production_marketing_events WHERE event_id='duplicate-race';"),'1','concurrent duplicate ID admits one normalized event');
    const a=eventMessage('provider-one-race'),b=eventMessage('provider-two-race'),shared=sql('SELECT gen_random_uuid();');
    await race(eventCall(a,shared,'provider-one'),eventCall(b,shared,'provider-two'));
    assert.equal(sql(`SELECT count(*) FROM private.production_marketing_messages WHERE provider_id='${shared}';`),'1','provider ID never binds two messages');
    assert.equal(sql(`SELECT reconciliation_required FROM private.production_marketing_messages WHERE id='${b}';`),'t','losing conflicting message held');
    const restricted=eventMessage('suppression-race'),restrictedProvider=sql('SELECT gen_random_uuid();');
    const subscriber=sql(`SELECT subscriber_id FROM private.production_marketing_messages WHERE id='${restricted}';`);
    const requestLabel='suppression-race';
    sql(`SELECT public.withdraw_production_marketing_subscription(md5('${requestLabel}p')||md5('${requestLabel}p'));SELECT public.request_production_marketing_subscription('${requestLabel}@example.invalid',md5('suppression-fresh-c')||md5('suppression-fresh-c'),md5('suppression-fresh-p')||md5('suppression-fresh-p'),md5('suppression-fresh-r')||md5('suppression-fresh-r'),true,'production_welcome_v1',public.test_envelope());SELECT public.confirm_production_marketing_subscription(md5('suppression-fresh-c')||md5('suppression-fresh-c'));`);
    const fresh=sql(`SELECT id FROM private.production_marketing_messages WHERE subscriber_id='${subscriber}' AND purpose='welcome' AND generation=2;`);
    sql(`UPDATE private.production_marketing_messages SET lease_token='${eventLease}',lease_until=clock_timestamp()+interval '60 seconds' WHERE id='${fresh}';`);
    const suppression=eventCall(restricted,restrictedProvider,'suppression-before-prepare','email.bounced');
    const result=await race(suppression,`SELECT public.test_prepare('${fresh}','${eventLease}') IS NULL;`);
    assert.ok(result[1].split('\n').includes('t'),'committed old-generation suppression blocks new preparation');
    const eventOutput=execFileSync('pnpm',['exec','vitest','run','--config','scripts/db/production-marketing-events.config.ts'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,HELIX_SYNTHETIC_MARKETING_EVENTS_CONTAINER:name}});
    assert.equal(/Tests\s+(\d+) passed/.exec(eventOutput)?.[1],'3','all three signed event/database adapter cases execute');
  }
  // Check the actual request transaction in both lock orders, after the retained
  // worker suites have finished. These identities belong only to this container.
  sql("DELETE FROM private.production_marketing_request_limits WHERE kind='global';");
  const contractDigest = "encode(sha256(convert_to(delivery_contract_text,'UTF8')),'hex')";
  const qualifyEntry = `UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,
    daily_limit=100,monthly_limit=1000,confirmation_worker_contract_hash=${contractDigest} WHERE singleton;`;
  const pauseEntry = "UPDATE private.production_marketing_controls SET dispatch_enabled=false WHERE singleton;";
  const oldDigest = sql(qualifyEntry + 'SELECT confirmation_worker_contract_hash FROM private.production_marketing_controls WHERE singleton;');
  assert.match(oldDigest, /^[a-f0-9]{64}$/);
  function entryRequest(label, digest) {
    const args = `p_email=>'${label}@example.invalid',p_confirmation_hash=>repeat(md5('${label}-confirm'),2),
      p_preference_hash=>repeat(md5('${label}-preference'),2),p_requester_hash=>repeat(md5('${label}-requester'),2),
      p_explicit_consent=>true,p_wording_version=>'production_welcome_v1',p_delivery_payload=>public.test_envelope()`;
    return digest === undefined ? `public.request_production_marketing_subscription(${args})`
      : `public.request_qualified_production_marketing_subscription(p_contract_hash=>'${digest}',${args})`;
  }
  function expectEntryHeld(call) {
    return `DO $$ BEGIN PERFORM ${call}; RAISE EXCEPTION 'Unqualified request returned normally';
      EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END $$;`;
  }
  const subscriberCount = label => sql(`SELECT count(*) FROM private.production_marketing_subscribers
    WHERE normalized_email='${label}@example.invalid';`);
  const pausedLabel = 'entry596-pause-first';
  await race(pauseEntry, 'SET LOCAL ROLE service_role;' + expectEntryHeld(entryRequest(pausedLabel, oldDigest)));
  assert.equal(subscriberCount(pausedLabel), '0', 'pause winner refuses enrollment after the lock clears');

  sql(qualifyEntry);
  const acceptedLabel = 'entry596-request-first';
  const accepted = entryRequest(acceptedLabel, oldDigest);
  await race(`SET LOCAL ROLE service_role; SELECT public.test_assert(${accepted},'qualified request entered');`, pauseEntry);
  assert.equal(subscriberCount(acceptedLabel), '1', 'request winner commits exactly once before pause');
  assert.equal(sql('SELECT dispatch_enabled FROM private.production_marketing_controls WHERE singleton;'), 'f');
  sql(qualifyEntry);
  sql(`SET ROLE service_role; SELECT ${accepted};`);
  assert.equal(sql(`SELECT count(*) FROM private.production_marketing_confirmation_intents i
    JOIN private.production_marketing_subscribers s ON s.id=i.subscriber_id
    WHERE s.normalized_email='${acceptedLabel}@example.invalid';`), '1', 'ordinary duplicate creates no second intent');

  sql("UPDATE private.production_marketing_controls SET delivery_contract_text=delivery_contract_text || ' ' WHERE singleton;");
  sql(qualifyEntry);
  const driftLabel = 'entry596-drift';
  sql('SET ROLE service_role;' + expectEntryHeld(entryRequest(driftLabel, oldDigest)));
  assert.equal(subscriberCount(driftLabel), '0', 'the former digest cannot enroll against a newly qualified contract');
  assert.equal(sql(`SET ROLE service_role; SELECT ${entryRequest(driftLabel)};`), 't', 'the retained P1 caller remains compatible');
  console.log(JSON.stringify({readinessBrowser:readiness,viewports:readiness?['390x844','1440x1000']:[],eventsPackage:events,status:'passed',postgresMajor:17,actualWorkerThroughPostgres:true,workerCases:Number(workerCases),rlsAndGrants:true,competingClaims:true,controlPauseOrdering:true,qualifiedEnrollmentBothOrders:true,staleEnrollmentContractRefused:true,withdrawalBothOrders:true,atomicQuota:true,utcRollover:true,payloadErasure:true,unknownDurableResultHold:true,externalProviderCalls:0}));
}finally{if(owned){assert.equal(docker(['inspect','-f','{{index .Config.Labels "helix.task"}}',name]).trim(),`production-marketing-${ticket}-synthetic`);docker(['rm','--force','--volumes',name]);}}
