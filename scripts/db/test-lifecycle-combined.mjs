import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
// Compose maintained real predecessor suites without mutating the repository or a remote DB.
const root=fileURLToPath(new URL('../../',import.meta.url));
const container=process.argv[2]??'helix-spec358-pg';
function once(source,anchor,replacement) {
  assert.equal(source.split(anchor).length-1,1,`Expected one composition anchor: ${anchor}`);
  return source.replace(anchor,()=>replacement);
}
let wrapper=readFileSync(root+'scripts/db/test-lifecycle-consent.mjs','utf8');
wrapper=once(wrapper,'const root=fileURLToPath(new URL("../../",import.meta.url));',`const root=${JSON.stringify(root)};`);
for(const file of ['test-product-notification-contracts.mjs','checkout-payment-test-fixture.mjs']) {
  wrapper=once(wrapper,`new URL("./${file}",import.meta.url)`,`new URL(${JSON.stringify(pathToFileURL(root+'scripts/db/'+file).href)})`);
}
const addition=`
  // Actual required checkout predecessor functions, without mock definitions.
  for (const [file,names] of [
    ['20260819183701_contract_legacy_loyalty_implementation.sql',['reserve_rewards_points','release_rewards_reservations_for_order','fail_checkout_attempt','cancel_checkout_order_without_session']],
    ['20260801140000_checkout_terminal_state_cas.sql',['claim_checkout_attempt','prepare_checkout_attempt','attach_checkout_session']],
    ['20260801060000_cart_server_integrity.sql',['merge_guest_cart']]]) {
    const text=source('supabase/migrations/'+file);
    for(const name of names) { const start=text.indexOf('create or replace function public.'+name+'(');const end=text.indexOf('\\n$$;',start)+4;assert.ok(start>=0&&end>start);sql(text.slice(start,end)); }
  }
  const fixture=source('supabase/tests/checkout_payment_contracts.integration.sql');
  assert.equal(fixture.split('-- APPLY PAYMENT CONTRACT MIGRATION').length,2);
  assert.equal(fixture.split("INSERT INTO public.system_steps VALUES ('TREAT', 3, 'core');").length,2);
  sql(fixture.split('-- APPLY PAYMENT CONTRACT MIGRATION')[0].replace("INSERT INTO public.system_steps VALUES ('TREAT', 3, 'core');","INSERT INTO public.system_steps VALUES ('TREAT', 3, 'core') ON CONFLICT DO NOTHING;"));
  migration('_checkout_single_send.sql');
  migration('_lifecycle_offer_entitlements.sql');
  migration('_lifecycle_campaigns.sql');
  sql('GRANT SELECT,INSERT,UPDATE ON auth.users TO service_role;');
  const start=fixture.indexOf('CREATE FUNCTION payment_contract_test.facts(');const end=fixture.indexOf('\\n$$;',start)+4;assert.ok(start>=0&&end>start);sql(fixture.slice(start,end));
`;
const tail=`
  sql(source('supabase/tests/lifecycle_offers.integration.sql').replaceAll('lifecycle_test','offer_test'));
  sql(source('supabase/tests/lifecycle_campaigns.integration.sql'));
  console.error('campaign race: admission');
  const campaignAdmissions=await concurrentLocked("SET ROLE service_role; SELECT campaign_test.admit(600,'cart');");
  assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE recipient='campaign600@example.invalid' AND purpose='lifecycle_cart';").trim(),'1');
  console.error('campaign race: capacity');
  const campaignCaps=await concurrentLocked("SET ROLE service_role; SELECT campaign_test.capacity(603,603);","SET ROLE service_role; SELECT campaign_test.capacity(603,604);");
  assert.ok(campaignCaps[0].includes('true')&&campaignCaps[1].includes('frequency_limited'));
  console.error('campaign race: withdrawal');
  await concurrentLocked("SET ROLE service_role; SELECT public.withdraw_marketing_subscription(rpad('pref601',43,'0'),'global');","SET ROLE service_role; SELECT campaign_test.prepare(601);");
  assert.equal(sql("SELECT first_attempt_at IS NULL FROM private.email_intents WHERE recipient='campaign601@example.invalid' AND purpose='lifecycle_browse';").trim(),'t');
  console.error('campaign race: payment');
  await concurrentLocked("SET ROLE service_role; SELECT public.finalize_verified_checkout_payment(payment_contract_test.id('order',602),(public.read_pending_checkout_attempt(payment_contract_test.id('order',602))->>'attemptId')::uuid,'cs_test_contract602','checkout_v2',payment_contract_test.facts(602)||jsonb_build_object('discountCents',250,'totalCents',2990),22);","SET ROLE service_role; SELECT campaign_test.prepare(602);");
  assert.equal(sql("SELECT status FROM public.orders WHERE id=payment_contract_test.id('order',602);").trim(),'paid');
  assert.equal(sql("SELECT first_attempt_at IS NULL FROM private.email_intents WHERE recipient='buyer602@example.invalid' AND purpose='lifecycle_browse';").trim(),'t');
  sql("SELECT campaign_test.assert(private.lifecycle_source((SELECT id FROM private.marketing_subscribers WHERE normalized_email='buyer602@example.invalid'),'cart') IS NULL,'converted current cart remains suppressed'); SELECT public.clear_paid_order_cart(payment_contract_test.id('order',602)); SELECT campaign_test.assert((SELECT c.checkout_generation IS DISTINCT FROM o.checkout_generation FROM public.carts c JOIN public.orders o ON o.cart_id=c.id WHERE o.id=payment_contract_test.id('order',602)),'real paid clear rotates retained cart generation'); UPDATE public.orders SET paid_at=clock_timestamp()-interval '2 days' WHERE id=payment_contract_test.id('order',602); INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity) VALUES(payment_contract_test.id('cart',602),notification_contract_test.id('already-available'),'30ml',1); UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '25 hours' WHERE user_id=payment_contract_test.id('user',602); SELECT campaign_test.assert(private.lifecycle_source((SELECT id FROM private.marketing_subscribers WHERE normalized_email='buyer602@example.invalid'),'cart') IS NOT NULL,'returning purchaser rearms retained cart after a new mutation and quiet period');");
  const grants=await concurrentLocked("SET ROLE service_role; SELECT public.grant_lifecycle_offer('cart','combined@example.invalid','same-combined-source','coupon_cart');");
  assert.equal(sql("SELECT count(*) FROM private.lifecycle_offers WHERE email='combined@example.invalid';").trim(),'1');
  sql('SET ROLE service_role; SELECT offer_test.seed(520,510); SELECT offer_test.seed(521,510);');
  const reservations=await concurrentLocked('SET ROLE service_role; SELECT offer_test.reserve(520);','SET ROLE service_role; SELECT offer_test.reserve(521);');
  assert.deepEqual(reservations.map(value=>value.split('\\n').find(line=>line==='t'||line==='f')),['t','f']);
`;
const assertionsAnchor='  sql(process.argv.includes("--enrollment-only") ? assertions.split("-- Canonical publication")[0] : assertions);';
const resultAnchor='  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,';
const injection=`
for(const anchor of ${JSON.stringify([assertionsAnchor,resultAnchor])}) assert.equal(harness.split(anchor).length-1,1,'Combined predecessor anchor changed');
harness=harness.replace(${JSON.stringify(assertionsAnchor)},()=>${JSON.stringify(addition)}+${JSON.stringify(assertionsAnchor)}).replace(${JSON.stringify(resultAnchor)},()=>${JSON.stringify(tail)}+${JSON.stringify(resultAnchor)});
`;
wrapper=once(wrapper,'const output=execFileSync',injection+'const output=execFileSync');
const output=execFileSync(process.execPath,['--input-type=module','-',container],{input:wrapper,encoding:'utf8',maxBuffer:8*1024*1024});
assert.equal(JSON.parse(output).status,'passed');
console.log(JSON.stringify({status:'passed',postgresMajor:17,combinedConsentAndOffers:true,priorNotificationContracts:true,actualOfferLockRaces:2,actualCampaignLockRaces:4,providerMutations:0}));
