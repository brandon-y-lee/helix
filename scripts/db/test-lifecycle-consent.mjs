import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const container=process.argv[2]??"helix-spec358-pg";
// Reuse the maintained current catalog+checkout+email fixture and its predecessor proofs.
let harness=readFileSync(new URL("./test-product-notification-contracts.mjs",import.meta.url),"utf8");
const rootAnchor='const root = fileURLToPath(new URL("../../", import.meta.url));';
const importAnchor='"./checkout-payment-test-fixture.mjs"';
const migrationAnchor='  migration("_product_notifications.sql");';
const finalAnchor='  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,';
for(const anchor of [rootAnchor,importAnchor,migrationAnchor,finalAnchor]) assert.equal(harness.split(anchor).length-1,1);
harness=harness.replace(rootAnchor,`const root=${JSON.stringify(root)};`).replace(importAnchor,JSON.stringify(new URL("./checkout-payment-test-fixture.mjs",import.meta.url).href))
 .replace(migrationAnchor,`${migrationAnchor}\n  sql("ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_at timestamptz;");\n  migration("_lifecycle_consent_activity.sql");`)
 .replace(finalAnchor,`  sql(source("supabase/tests/lifecycle_consent.integration.sql"));\n  await concurrentLocked("SET ROLE service_role; SELECT public.confirm_marketing_subscription(repeat('R',43),repeat('S',43));");
  assert.equal(sql("SELECT count(*) FROM private.marketing_consent_evidence e JOIN private.marketing_subscribers s ON s.id=e.subscriber_id WHERE s.normalized_email='race-lifecycle@example.invalid' AND e.event='confirmed';").trim(),"1");
  await concurrentLocked("SET ROLE service_role; SELECT public.withdraw_marketing_subscription(repeat('S',43),'global');", "SET ROLE service_role; SELECT public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000005','synthetic-already-available');");
  assert.equal(sql("SELECT count(*) FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000005';").trim(),"0");
  const upgrades=await concurrentLocked("SET ROLE service_role; SELECT public.confirm_marketing_subscription(repeat('Y',43),repeat('Z',43));");
  assert.ok(upgrades.every(value=>value.includes('confirmed')), "Concurrent upgrade confirmations are both idempotently confirmed");
  assert.equal(sql("SELECT count(*) FROM private.marketing_consent_evidence e JOIN private.marketing_subscribers s ON s.id=e.subscriber_id WHERE s.normalized_email='race-upgrade@example.invalid' AND e.event='confirmed' AND e.purpose='lifecycle';").trim(),"1");
  ${finalAnchor.trimStart()}`);
const output=execFileSync(process.execPath,["--input-type=module","-",container],{input:harness,encoding:"utf8",maxBuffer:8*1024*1024});
assert.equal(JSON.parse(output).status,"passed");
console.log(JSON.stringify({status:"passed",postgresMajor:17,priorNotificationContracts:true,lifecycleConsent:true,providerMutations:0}));
