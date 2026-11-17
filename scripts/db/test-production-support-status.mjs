import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container='helix-spec358-pg',database=`production_support_530_${process.pid}_${Date.now()}`;
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const args=['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
let created=false,stage='fixture identity';
const sql=input=>{try{return docker(args,{input}).trim();}catch(error){throw new Error(String(error.stderr??'').match(/ERROR:\s+(Assertion failed: [^\n]+)/)?.[1]??`Disposable status SQL failed during ${stage}`);}};
const source=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

function session(){const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='';
 child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.resume();
 const done=new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('SQL connection failed')));child.once('close',code=>code===0?resolve():reject(new Error('Concurrent status SQL failed')));});
 return {child,done,output:()=>output};}
async function until(check){const deadline=Date.now()+10000;while(!check()){assert.ok(Date.now()<deadline,'Transaction barrier timeout');await new Promise(resolve=>setTimeout(resolve,25));}}
async function bounded(done,label){let timer;try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),5000);})]);}finally{clearTimeout(timer);}}
async function proveNonblocking(){
 const poll=session();let writer;
 try{
  poll.child.stdin.write("BEGIN READ ONLY; SET LOCAL application_name='support_530_held_poll'; SET LOCAL ROLE service_role; SELECT public.read_support_prod_photos(production_support_test.status_input());\n\\echo poll-held\n");
  await Promise.race([until(()=>poll.output().includes('poll-held')),poll.done.then(()=>{throw new Error('Poll transaction escaped barrier');})]);
  writer=session();writer.child.stdin.end("SET ROLE service_role; SELECT production_support_test.submit(532,'{\"photos\":[]}'::jsonb);");
  await bounded(writer.done,'Held status poll blocked an actual admission write');
  assert.equal(sql("SELECT state FROM pg_stat_activity WHERE datname=current_database() AND application_name='support_530_held_poll'"),'idle in transaction','Poll transaction stays open during completed admission');
  assert.equal(JSON.parse(writer.output().split('\n').find(line=>line.startsWith('{'))).status,'saved');
  poll.child.stdin.end('ROLLBACK;\n');await poll.done;
 }finally{if(!poll.child.stdin.destroyed)poll.child.stdin.end('ROLLBACK;\n');await poll.done.catch(()=>{});if(writer)await writer.done.catch(()=>{});}
 const lock=session();let reader;
 try{
  lock.child.stdin.write("BEGIN; SET LOCAL statement_timeout='15s'; SELECT singleton FROM support_production_private.contract FOR UPDATE;\n\\echo write-held\n");
  await Promise.race([until(()=>lock.output().includes('write-held')),lock.done.then(()=>{throw new Error('Writer lock escaped barrier');})]);
  reader=session();reader.child.stdin.end("BEGIN READ ONLY; SET LOCAL ROLE service_role; SELECT public.read_support_prod_photos(production_support_test.status_input()); COMMIT;");
  await bounded(reader.done,'Receipt read blocked on global admission row lock');
  assert.equal(JSON.parse(reader.output().split('\n').find(line=>line.startsWith('{'))).primaryHandoff,'provider_accepted');
  lock.child.stdin.end('ROLLBACK;\n');await lock.done;
 }finally{if(!lock.child.stdin.destroyed)lock.child.stdin.end('ROLLBACK;\n');await lock.done.catch(()=>{});if(reader)await reader.done.catch(()=>{});}
}
try{
 assert.equal(docker(['inspect','-f','{{index .Config.Labels "helix.task"}}',container]).trim(),'spec358-synthetic-sql');
 assert.equal(docker(['inspect','-f','{{.Config.Image}}',container]).trim(),'public.ecr.aws/supabase/postgres:17.6.1.159');
 assert.equal(docker(['inspect','-f','{{.State.Running}}',container]).trim(),'true');
 docker(['exec',container,'createdb','-U','postgres',database]);created=true;
 assert.equal(sql("SELECT current_setting('server_version_num')::int/10000"),'17');
 stage='source installation';sql(source('supabase/operations/support-production/install.sql'));sql(source('supabase/operations/support-production/media.sql'));
 sql(source('supabase/tests/production-support.contracts.sql'));
 const statusSource=source('supabase/operations/support-production/status.sql');
 const beforeContract=sql('SELECT public.read_support_prod_contract();');
 const guard=statusSource.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)?.[0];assert.ok(guard);
 for(const actor of ['anon','authenticated','service_role','authenticator'])sql(`DO $proof$ DECLARE blocked boolean:=false; BEGIN
  SET LOCAL ROLE ${actor}; BEGIN EXECUTE $guard$${guard}$guard$; EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM='support_install_requires_trusted_operator'; END;
  RESET ROLE; IF NOT blocked THEN RAISE EXCEPTION 'Assertion failed: explicit status installer guard'; END IF; END $proof$;`);
 sql(statusSource);
 assert.equal(sql('SELECT public.read_support_prod_contract();'),beforeContract,'Status installation changes no runtime controls or target identity');
 stage='status assertions';sql(source('supabase/tests/production-support.status.sql'));
 stage='actual overlapping poll and admission';await proveNonblocking();
 console.log(JSON.stringify({status:'passed',postgresMajor:17,capabilityBound:true,actualRoleDenial:true,readonlyTransaction:true,pausedAdmissionAndWorker:true,zeroPhotos:true,primaryAndMediaStateMappings:true,unknownRetryLeasesUnconfirmed:true,providerAcceptanceNotInboxReceipt:true,allowlistedPublicMetadata:true,pollDoesNotBlockAdmission:true,admissionRowLockDoesNotBlockPoll:true,providerMutations:0}));
}catch(error){console.error(JSON.stringify({status:'failed',stage,message:error.message,providerMutations:0}));process.exitCode=1;}
finally{if(created)docker(['exec',container,'dropdb','-U','postgres',database]);}
