import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const container='helix-spec358-pg', database=`production_support_529_${process.pid}_${Date.now()}`;
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const args=['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
let stage='container identity',created=false;
const sql=input=>{try{return docker(args,{input}).trim();}catch(error){throw new Error(String(error.stderr??'').match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1]??`Disposable media SQL failed during ${stage}`);}};
const source=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

function session() {
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='';
 child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.resume();
 const done=new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('Concurrent SQL start failed')));child.once('close',code=>code===0?resolve():reject(new Error('Concurrent SQL failed')));});
 return {child,done,output:()=>output};
}
async function until(test,label){const deadline=Date.now()+10000;while(!test()){assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,25));}}
async function overlap(firstQuery,secondQuery){const first=session();let second;
 try {
  first.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role; ${firstQuery}\n\\echo support-media-held\n`);
  await Promise.race([until(()=>first.output().includes('support-media-held'),'First overlap barrier'),first.done.then(()=>{throw new Error('First transaction escaped');})]);
  second=session();second.child.stdin.end(`BEGIN; SET LOCAL application_name='support_529_contender'; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role; ${secondQuery}\nCOMMIT;`);
  await Promise.race([until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='support_529_contender' AND wait_event_type='Lock')")==='t','Second session actually waits on contract lock'),second.done.then(()=>{throw new Error('No actual transaction overlap');})]);
  first.child.stdin.end('COMMIT;\n');await Promise.all([first.done,second.done]);
  return [first.output(),second.output()].map(out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{'))).result);
 } finally {if(!first.child.stdin.destroyed)first.child.stdin.end('ROLLBACK;\n');await first.done.catch(()=>{});if(second)await second.done.catch(()=>{});}
}
const wrapped=expr=>`SELECT jsonb_build_object('result',${expr});`;
const context=(values)=>`production_support_test.context('${JSON.stringify(values)}'::jsonb)`;
async function concurrencyProof(){
 stage='concurrent fleet claim';
 sql("SELECT production_support_test.queue_photos(300,2,10485760); UPDATE support_production_private.contract SET photo_worker_limit=1;");
 const claims=await overlap(wrapped("public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"),wrapped("public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"));
 assert.ok(claims[0]?.photoId);assert.equal(claims[1],null,'Fleet lease bound holds across sessions');
 stage='stale photo lease';
 sql(`UPDATE support_production_private.photo_ledger SET lease_until=clock_timestamp()-interval '1 second' WHERE photo_id='${claims[0].photoId}';`);
 const replacement=JSON.parse(sql(wrapped("public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"))).result;
 const raw=claim=>({photoId:claim.photoId,leaseId:claim.leaseId,rawBytes:10485760,rawHash:'a'.repeat(64),contentType:'image/png'});
 assert.equal(sql(`SELECT public.record_support_prod_photo_raw(${context(raw(claims[0]))});`),'f','Stale raw writer fenced');
 assert.equal(replacement.photoId,claims[0].photoId);
 sql('UPDATE support_production_private.contract SET photo_worker_limit=2;');
 const other=JSON.parse(sql(wrapped("public.claim_support_prod_photo(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"))).result;
 stage='concurrent original aggregate';
 const accepted=await overlap(wrapped(`public.record_support_prod_photo_raw(${context(raw(replacement))})`),wrapped(`public.record_support_prod_photo_raw(${context(raw(other))})`));
 assert.deepEqual(accepted,[true,true]);
 assert.equal(sql("SELECT sum(l.raw_bytes) FROM support_production_private.photo_ledger l JOIN support_production_private.photo_slots s ON s.id=l.photo_id JOIN support_production_private.inquiries i ON i.id=s.inquiry_id WHERE i.submission_id=md5('submission300')::uuid AND l.raw_accepted;"),'20971520');
 for(const claim of [replacement,other]) assert.equal(sql(`SELECT public.finish_support_prod_photo(${context({photoId:claim.photoId,leaseId:claim.leaseId,outcome:'ready',cleanBytes:1,cleanHash:'c'.repeat(64),width:1,height:1})});`),'t');
 sql('SELECT production_support_test.bind_primary(300);');
 stage='concurrent immutable batch';
 const batches=await overlap(wrapped("public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"),wrapped("public.prepare_support_prod_media(production_support_test.context(jsonb_build_object('leaseId',gen_random_uuid())))"));
 assert.equal(batches[0].recipe.photos.length,2);assert.equal(batches[1],null);
 const finalize={outboxId:batches[0].outboxId,leaseId:batches[0].leaseId,requestHash:'e'.repeat(64),requestBytes:1000};
 stage='concurrent same finalization';
 assert.deepEqual(await overlap(wrapped(`public.finalize_support_prod_media(${context(finalize)})`),wrapped(`public.finalize_support_prod_media(${context(finalize)})`)),[true,true]);
 assert.equal(sql(`SELECT count(*) FROM support_production_private.outbox WHERE id='${batches[0].outboxId}';`),'1');
 stage='concurrent mint and complete';
 sql('SELECT production_support_test.submit(301);');
 const identity="production_support_test.media_input(301,jsonb_build_object('uploadId',md5('photo301')::uuid))";
 const capacity=sql('SELECT reserved_bytes FROM support_production_private.contract');
 const reservations=await overlap(wrapped(`public.reserve_support_prod_photo(${identity})`),wrapped(`public.reserve_support_prod_photo(${identity})`));
 assert.equal(reservations[0].photoId,reservations[1].photoId);assert.equal(reservations[0].rawPath,reservations[1].rawPath);
 assert.equal(sql(`SELECT mint_count FROM support_production_private.photo_ledger WHERE photo_id='${reservations[0].photoId}';`),'2');
 assert.deepEqual(await overlap(wrapped(`public.complete_support_prod_photo(${identity})`),wrapped(`public.complete_support_prod_photo(${identity})`)),[true,true]);
 assert.equal(sql('SELECT reserved_bytes FROM support_production_private.contract'),capacity,'Concurrent retries never double-charge');
 stage='concurrent daily send budget across primary and attachment jobs';
 const primary = JSON.parse(sql('SELECT production_support_test.submit(302);')).outboxId;
 const media = batches[0].outboxId;
 const lease = id => sql(`UPDATE support_production_private.outbox SET state='leased', lease_id=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '2 minutes' WHERE outbox.id='${id}' RETURNING lease_id;`);
 const mediaStart = wrapped(`public.start_support_prod_send(${context({ outboxId: media, leaseId: lease(media) })})`);
 const primaryStart = wrapped(`public.start_support_prod_send(${context({ outboxId: primary, leaseId: lease(primary) })})`);
 const window = "date_trunc('day',clock_timestamp(),'UTC')";
 sql(`INSERT INTO support_production_private.abuse_windows VALUES('send-day','global',${window},19)
  ON CONFLICT(kind,digest,window_at) DO UPDATE SET used=19;`);
 const attempts = await overlap(mediaStart, primaryStart);
 assert.equal(attempts[0]?.kind, 'media');
 assert.equal(attempts[1], null);
 assert.equal(sql(`SELECT used FROM support_production_private.abuse_windows WHERE kind='send-day' AND window_at=${window};`),'20');
 assert.equal(sql(`SELECT state='queued' AND first_attempt_at IS NULL AND attempt_count=0 AND lease_id IS NULL
  AND next_attempt_at=${window}+interval '24 hours' FROM support_production_private.outbox WHERE outbox.id='${primary}';`),'t');
}
try {
 assert.equal(docker(['inspect','-f','{{index .Config.Labels "helix.task"}}',container]).trim(),'spec358-synthetic-sql');
 assert.equal(docker(['inspect','-f','{{.Config.Image}}',container]).trim(),'public.ecr.aws/supabase/postgres:17.6.1.159');
 assert.equal(docker(['inspect','-f','{{.State.Running}}',container]).trim(),'true');
 docker(['exec',container,'createdb','-U','postgres',database]);created=true;
 assert.equal(sql("SELECT current_setting('server_version_num')::int/10000"),'17');
 stage='install primary';sql(source('supabase/operations/support-production/install.sql'));
 sql(source('supabase/tests/production-support.contracts.sql'));
 stage='existing declaration extension fixture';
 sql(`UPDATE support_production_private.contract SET project_ref='synthetic-support-project',contract_id='synthetic-support-contract-v1',
  admission_enabled=true,full_media_qualified=true,isolation_qualified=true,operations_qualified=true,capacity_bytes=1073741824,
  source_hour_limit=10000,email_hour_limit=10000,global_hour_limit=10000;`);
 const existing=JSON.parse(sql('SELECT production_support_test.submit(499);'));
 const existingHash=sql(`SELECT request_hash FROM support_production_private.outbox WHERE id='${existing.outboxId}';`);
 sql(`UPDATE support_production_private.outbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE id='${existing.outboxId}';
  UPDATE support_production_private.contract SET project_ref=NULL,contract_id=NULL,admission_enabled=false,full_media_qualified=false,
  isolation_qualified=false,operations_qualified=false,source_hour_limit=0,email_hour_limit=0,global_hour_limit=0,capacity_bytes=reserved_bytes;`);
 stage='media source installation';
 const mediaPath=new URL('../../supabase/operations/support-production/media.sql',import.meta.url);
 if(existsSync(mediaPath)) {
  const mediaSource=readFileSync(mediaPath,'utf8');
  const installerGuard=mediaSource.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)?.[0];
  assert.ok(installerGuard);
  for(const actor of ['anon','authenticated','service_role','authenticator']) sql(`DO $proof$ DECLARE blocked boolean:=false; BEGIN
   SET LOCAL ROLE ${actor}; BEGIN EXECUTE $guard$${installerGuard}$guard$; EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM='support_install_requires_trusted_operator'; END;
   RESET ROLE; IF NOT blocked THEN RAISE EXCEPTION 'Assertion failed: explicit media installer guard'; END IF; END $proof$;`);
  sql(mediaSource);
 }
 stage='existing declaration backfill proof';
 assert.equal(sql(`SELECT count(*) FROM support_production_private.photo_slots WHERE inquiry_id='${existing.inquiryId}';`),'1');
 assert.equal(sql(`SELECT count(*) FROM support_production_private.photo_ledger l JOIN support_production_private.photo_slots s ON s.id=l.photo_id WHERE s.inquiry_id='${existing.inquiryId}';`),'1');
 assert.equal(sql('SELECT reserved_bytes FROM support_production_private.contract'),'14680064','Backfill never double-charges old reservation');
 assert.equal(sql(`SELECT request_hash FROM support_production_private.outbox WHERE id='${existing.outboxId}';`),existingHash,'Backfill preserves primary bytes');
 stage='media assertions';sql(source('supabase/tests/production-support.media.sql'));
 await concurrencyProof();
 console.log(JSON.stringify({status:'passed',postgresMajor:17,existingDeclarationBackfill:true,installerRoleDenial:true,fixedMintExpiry:true,retryExhaustionHold:true,seedTransactionRollback:true,forcedPrivateRls:true,applicationRoleRpcDenial:true,immutableSlots:true,noDoubleReservation:true,capabilityBinding:true,actualOriginalLimits:true,maxFiveMediaPadding:true,primaryPayloadPreserved:true,verifiedPrimaryRecipe:true,unknownFrozenRetry:true,preAttemptIntegrityHold:true,lateMediaMembership:true,concurrentFleetLimit:true,stalePhotoLeaseFencing:true,concurrentActualAggregate:true,concurrentBatchAndFinalize:true,concurrentMintAndComplete:true,providerMutations:0}));
} catch(error){console.error(JSON.stringify({status:'failed',stage,message:error.message,providerMutations:0}));process.exitCode=1;}
finally{if(created)docker(['exec',container,'dropdb','-U','postgres',database]);}
