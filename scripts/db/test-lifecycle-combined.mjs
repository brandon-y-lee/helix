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
  migration('_review_winback_core.sql');
  migration('_review_winback_offers.sql');
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
  sql(source('supabase/tests/review_winback.integration.sql'));
  sql(source('supabase/tests/review_winback_offers.integration.sql'));
  console.error('review race: grant and invitation');
  await concurrentLocked('SET ROLE service_role; SELECT review_test.admit(901);');
  assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE recipient='review901@example.invalid' AND purpose='lifecycle_review_winback';").trim(),'1');
  assert.equal(sql("SELECT count(*) FROM private.lifecycle_offers WHERE email='review901@example.invalid' AND kind='review_winback';").trim(),'1');
  console.error('review race: withdrawal');
  await concurrentLocked("SET ROLE service_role; SELECT public.withdraw_marketing_subscription(rpad('review-pref-902',43,'0'),'global');",'SET ROLE service_role; SELECT review_test.prepare(902);');
  console.error('review race: refund');
  await concurrentLocked("UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',903);",'SET ROLE service_role; SELECT review_test.prepare(903);');
  console.error('review race: delivery revocation');
  await concurrentLocked("SELECT 1 FROM public.orders WHERE id=payment_contract_test.id('order',904) FOR UPDATE; UPDATE review_test.delivery SET evidence=jsonb_set(evidence,'{status}',to_jsonb('revoked'::text)) WHERE order_id=payment_contract_test.id('order',904);",'SET ROLE service_role; SELECT review_test.prepare(904);');
  console.error('review race: payment risk restriction');
  await concurrentLocked("SELECT 1 FROM public.orders WHERE id=payment_contract_test.id('order',905) FOR UPDATE; UPDATE review_test.risk SET evidence=jsonb_set(evidence,'{status}',to_jsonb('disputed'::text)) WHERE order_id=payment_contract_test.id('order',905);",'SET ROLE service_role; SELECT review_test.prepare(905);');
  assert.equal(sql("SELECT count(*) FROM private.email_intents WHERE recipient IN ('review902@example.invalid','review903@example.invalid','review904@example.invalid','review905@example.invalid') AND purpose='lifecycle_review_winback' AND first_attempt_at IS NULL;").trim(),'4');
  sql(source('supabase/tests/review_winback_checkout_race.integration.sql'));
  async function reviewCheckoutEmailRace(n,m) {
    const gate=session(),checkout=session(),email=session();
    const settled=[gate.done,checkout.done,email.done];settled.forEach(p=>p.catch(()=>{}));
    try {
      gate.child.stdin.write("SELECT pg_advisory_lock(4981970);\\\\echo gate-ready\\n");
      await until(()=>gate.output().includes('gate-ready'),'Checkout barrier gate missing');
      checkout.child.stdin.end("BEGIN; SET LOCAL application_name='review_checkout_race'; SET LOCAL statement_timeout='12s'; SET LOCAL helix_test.review_checkout_barrier='on'; SET ROLE service_role; SELECT review_test.checkout_prepare("+m+"); COMMIT;");
      await until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='review_checkout_race' AND wait_event_type='Lock' AND wait_event='advisory');").trim()==='t','Checkout never reached authentic outer-entry barrier');
      email.child.stdin.end("BEGIN; SET LOCAL application_name='review_email_race'; SET LOCAL statement_timeout='12s'; SET ROLE service_role; SELECT review_test.prepare("+n+"); COMMIT;");
      await until(()=>sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='review_email_race' AND wait_event_type='Lock');").trim()==='t','Email did not contend with held checkout order locks');
      gate.child.stdin.end('SELECT pg_advisory_unlock(4981970);');
      await Promise.all(settled);
      assert.equal(sql("SELECT count(*) FROM private.checkout_payment_contracts WHERE order_id=payment_contract_test.id('order',"+m+");").trim(),'1');
      assert.equal(sql("SELECT count(*) FROM private.lifecycle_offers WHERE source_order_id=payment_contract_test.id('order',"+n+") AND reserved_order_id=payment_contract_test.id('order',"+m+");").trim(),'1');
      assert.equal(sql("SELECT first_attempt_at IS NULL FROM private.email_intents WHERE recipient='review"+n+"@example.invalid' AND purpose='lifecycle_review_winback';").trim(),'t');
    } finally {
      for(const s of [gate,checkout,email]) if(!s.child.stdin.destroyed)s.child.stdin.end('ROLLBACK;');
      await Promise.allSettled(settled);
    }
  }
  console.error('review two-Order race: fresh checkout');await reviewCheckoutEmailRace(970,1970);
  console.error('review two-Order race: held recovery');await reviewCheckoutEmailRace(972,1972);
  console.error('review new-redemption race: source risk restriction');
  const riskCheckout=await concurrentLocked("SELECT 1 FROM public.orders WHERE id=payment_contract_test.id('order',976) FOR UPDATE; UPDATE review_test.risk SET evidence=jsonb_set(evidence,'{status}',to_jsonb('disputed'::text)) WHERE order_id=payment_contract_test.id('order',976);",'SET ROLE service_role; SELECT review_test.try_checkout(1976);');
  assert.ok(riskCheckout[1].split('\\n').includes('f'));
  assert.equal(sql("SELECT count(*) FROM private.checkout_payment_contracts WHERE order_id=payment_contract_test.id('order',1976);").trim(),'0');
  assert.equal(sql("SELECT reserved_order_id IS NULL FROM private.lifecycle_offers WHERE source_order_id=payment_contract_test.id('order',976);").trim(),'t');
  sql('DROP FUNCTION private.lifecycle_offer_verified_email(uuid,boolean); ALTER FUNCTION private.lifecycle_offer_verified_email_race_original(uuid,boolean) RENAME TO lifecycle_offer_verified_email;');
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
console.log(JSON.stringify({status:'passed',postgresMajor:17,combinedConsentAndOffers:true,priorNotificationContracts:true,actualOfferLockRaces:2,actualCampaignLockRaces:4,actualReviewLockRaces:8,providerMutations:0}));
