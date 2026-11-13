import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// Usage: node scripts/db/test-review-disclosure-combined.mjs PRODUCER_SHA CONSUMER_PATH CONSUMER_SHA [labelled-container]
// Both trees must be clean exact commits. No Git/network mutation or database URL accepted.
const [producerSha,consumerPath,consumerSha,container='helix-spec358-pg',...extra]=process.argv.slice(2);
assert.equal(extra.length,0,'Unexpected arguments');
assert.match(producerSha??'',/^[a-f0-9]{40}$/,'Exact producer SHA required');
assert.match(consumerSha??'',/^[a-f0-9]{40}$/,'Exact consumer SHA required');
assert.match(container,/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/,'Only a named local container is accepted');
const producer=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const consumer=realpathSync(consumerPath);
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:4*1024*1024}).trimEnd();}
function pinned(root,sha){
 assert.equal(realpathSync(git(root,['rev-parse','--show-toplevel'])),root,'Expected checkout root');
 assert.equal(git(root,['rev-parse','HEAD']),sha,'Checkout does not match exact reviewed commit');
 assert.equal(git(root,['status','--porcelain=v1','--untracked-files=all']),'','Checkout must be clean');
}
pinned(producer,producerSha);pinned(consumer,consumerSha);
const allowlist=new Set([
 'supabase/migrations/20261113073330_public_product_reviews.sql',
 'supabase/migrations/20261113101020_public_review_offer_disclosure.sql',
 'supabase/tests/public_review_disclosure_composition.integration.sql',
]);
function foreign(path){assert.ok(allowlist.has(path),'Non-allowlisted consumer source');return git(consumer,['show',`${consumerSha}:${path}`]);}
function sqlCall(source){return `  sql(Buffer.from('${Buffer.from(source).toString('base64')}','base64').toString('utf8'));`;}
const foreignMigrations=[...allowlist].filter(p=>p.startsWith('supabase/migrations/')).map(p=>sqlCall(foreign(p))).join('\n');
const composition=sqlCall(git(producer,['show',`${producerSha}:supabase/tests/review_offer_disclosure_composition_fixture.sql`]))+'\n'+sqlCall(foreign('supabase/tests/public_review_disclosure_composition.integration.sql'));
function once(text,anchor,replacement){assert.equal(text.split(anchor).length-1,1,`Composition anchor changed: ${anchor}`);return text.replace(anchor,()=>replacement);}
for(const order of ['consumer-first','producer-first']){
 let runner=git(producer,['show',`${producerSha}:scripts/db/test-lifecycle-combined.mjs`]);
 runner=once(runner,"const root=fileURLToPath(new URL('../../',import.meta.url));",`const root=${JSON.stringify(producer+'/')};`);
 const anchor=order==='consumer-first'?"  migration('_lifecycle_offer_entitlements.sql');":"  migration('_review_offer_disclosure_contract.sql');";
 runner=once(runner,anchor,order==='consumer-first'?foreignMigrations+'\n'+anchor:anchor+'\n'+foreignMigrations);
 runner=once(runner,"  const grants=await concurrentLocked",composition+'\n  const grants=await concurrentLocked');
 const output=execFileSync(process.execPath,['--input-type=module','-',container],{cwd:producer,input:runner,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(JSON.parse(output).status,'passed');
 pinned(producer,producerSha);pinned(consumer,consumerSha);
 console.log(JSON.stringify({status:'passed',order,producerSha,consumerSha,actualPinnedSources:true,providerMutations:0}));
}
