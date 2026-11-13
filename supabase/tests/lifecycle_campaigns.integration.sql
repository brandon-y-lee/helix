CREATE SCHEMA campaign_test;
CREATE FUNCTION campaign_test.assert(c boolean,m text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION '%',m; END IF; END $$;
SELECT campaign_test.assert(NOT public.lifecycle_campaign_readiness(),'campaigns default off');
CREATE FUNCTION campaign_test.contract() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_set(marketing_contract_test.contract()||'{"version":"lifecycle_v1"}', '{templates}', (marketing_contract_test.contract()->'templates')||jsonb_build_object('lifecycle_welcome',marketing_contract_test.contract()->'templates'->'welcome_initial','lifecycle_cart',marketing_contract_test.contract()->'templates'->'welcome_initial','lifecycle_browse',marketing_contract_test.contract()->'templates'->'welcome_initial')) $$;
UPDATE private.lifecycle_control SET enabled=true;
UPDATE private.lifecycle_offer_control SET enabled=true;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '10 days' WHERE purpose like 'lifecycle_%';
-- Readiness must agree with all actual subscription admission gates.
DO $$ DECLARE purpose_name text; BEGIN
 PERFORM campaign_test.assert(public.lifecycle_campaign_readiness(),'all admission controls ready');
 FOREACH purpose_name IN ARRAY ARRAY['marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome'] LOOP
   UPDATE private.email_controls SET enabled=false WHERE purpose=purpose_name;
   PERFORM campaign_test.assert(NOT public.lifecycle_campaign_readiness(),'disabled admission prerequisite must hide popup: '||purpose_name);
   UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()+interval '1 day' WHERE purpose=purpose_name;
   PERFORM campaign_test.assert(NOT public.lifecycle_campaign_readiness(),'future admission cutoff must hide popup: '||purpose_name);
   UPDATE private.email_controls SET accepted_after=clock_timestamp()-interval '10 days' WHERE purpose=purpose_name;
 END LOOP;
END $$;
SELECT public.request_marketing_subscription('campaign@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('G',43),repeat('3',64),true,campaign_test.contract());
SELECT public.confirm_marketing_subscription_scoped(repeat('G',43),repeat('H',43),'lifecycle');
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'welcome') IS NOT NULL FROM private.marketing_subscribers WHERE normalized_email='campaign@example.invalid'),'fresh confirmed welcome eligible');
SELECT campaign_test.assert(public.admit_lifecycle_campaign(s.id,'welcome','welcome:'||s.id,public.grant_lifecycle_offer('welcome',s.normalized_email,'welcome:'||s.id,'coupon_welcome')),'welcome admits exact offer') FROM private.marketing_subscribers s WHERE normalized_email='campaign@example.invalid';
SELECT campaign_test.assert(NOT public.admit_lifecycle_campaign(s.id,'welcome','welcome:'||s.id,(SELECT id FROM private.lifecycle_offers WHERE email=s.normalized_email)),'duplicate scheduler no new intent') FROM private.marketing_subscribers s WHERE normalized_email='campaign@example.invalid';
SELECT campaign_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE recipient='campaign@example.invalid' AND purpose='lifecycle_welcome'),'one logical welcome');
SELECT campaign_test.assert(NOT has_function_privilege('authenticated','public.admit_lifecycle_campaign(uuid,text,text,uuid)','EXECUTE'),'browser cannot admit campaigns');
-- Final handoff shares the existing provider observation and durable cap ledger.
CREATE FUNCTION campaign_test.observe(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 UPDATE private.marketing_provider_sync m SET state='synced',contact_id='campaign_contact',topic_id='topic_synthetic',
 observation_generation=s.generation,observation_revision=s.revision,observation_contact_id='campaign_contact',observation_topic_id='topic_synthetic',
 observation_global_allowed=true,observation_topic_allowed=true,observed_at=clock_timestamp()
 FROM private.marketing_subscribers s WHERE s.id=m.subscriber_id AND s.normalized_email=email;
END $$;
SELECT campaign_test.observe('campaign@example.invalid');
UPDATE private.email_intents SET state='leased',lease_token='eeeeeeee-0000-4000-8000-000000000020',lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='campaign@example.invalid' AND purpose='lifecycle_welcome';
SELECT campaign_test.assert(public.prepare_email_attempt(id,'eeeeeeee-0000-4000-8000-000000000020',marketing_contract_test.payload(id)) IS NOT NULL,'welcome uses shared final preparer') FROM private.email_intents WHERE recipient='campaign@example.invalid' AND purpose='lifecycle_welcome';
SELECT campaign_test.assert((SELECT count(*)=1 FROM private.marketing_send_reservations r JOIN private.marketing_subscribers s ON s.id=r.subscriber_id WHERE s.normalized_email='campaign@example.invalid'),'welcome consumes shared capacity');
SELECT campaign_test.assert(private.reserve_marketing_capacity(s.id,s.generation,s.revision,'eeeeeeee-0000-4000-8000-000000000021','lifecycle_cart',clock_timestamp(),null,false)->>'reason'='frequency_limited','new flow shares welcome daily cap') FROM private.marketing_subscribers s WHERE normalized_email='campaign@example.invalid';
-- Canonical verified-account activity, bounded quiet period, no browser-authored source.
SELECT public.request_marketing_subscription('cart-campaign@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('I',43),repeat('4',64),true,campaign_test.contract());
SELECT public.confirm_marketing_subscription_scoped(repeat('I',43),repeat('J',43),'lifecycle');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('eeeeeeee-0000-4000-8000-000000000030','cart-campaign@example.invalid',clock_timestamp());
INSERT INTO public.carts(id,user_id) VALUES('eeeeeeee-0000-4000-8000-000000000031','eeeeeeee-0000-4000-8000-000000000030');
INSERT INTO public.cart_items(id,cart_id,product_id,variant_key,quantity) VALUES('eeeeeeee-0000-4000-8000-000000000032','eeeeeeee-0000-4000-8000-000000000031',notification_contract_test.id('already-available'),'30ml',1);
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'fresh mutation must wait24h');
UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '25 hours' WHERE user_id='eeeeeeee-0000-4000-8000-000000000030';
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NOT NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'quiet available cart due');
SELECT campaign_test.assert(NOT public.admit_lifecycle_campaign(s.id,'cart',private.lifecycle_source(s.id,'cart')->>'sourceKey',public.grant_lifecycle_offer('cart',s.normalized_email,private.lifecycle_source(s.id,'cart')->>'sourceKey','coupon_cart')),'welcome wins simultaneous cart admission') FROM private.marketing_subscribers s WHERE normalized_email='cart-campaign@example.invalid';
-- Independently switch off welcome for the cart/browse contract proofs.
UPDATE private.email_controls SET enabled=false WHERE purpose='lifecycle_welcome';
SELECT campaign_test.assert(public.admit_lifecycle_campaign(s.id,'cart',private.lifecycle_source(s.id,'cart')->>'sourceKey',public.grant_lifecycle_offer('cart',s.normalized_email,private.lifecycle_source(s.id,'cart')->>'sourceKey','coupon_cart')),'duecart admits exact source/offer') FROM private.marketing_subscribers s WHERE normalized_email='cart-campaign@example.invalid';
UPDATE public.cart_items SET quantity=2 WHERE id='eeeeeeee-0000-4000-8000-000000000032';
UPDATE private.email_intents SET state='leased',lease_token='eeeeeeee-0000-4000-8000-000000000033',lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_cart';
SELECT campaign_test.assert(public.prepare_email_attempt(id,'eeeeeeee-0000-4000-8000-000000000033',marketing_contract_test.payload(id)) IS NULL,'mutation supersedes unattempted old revision') FROM private.email_intents WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_cart';
SELECT campaign_test.assert((SELECT state='blocked' AND first_attempt_at IS NULL FROM private.email_intents WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_cart'),'superseded never counted as attempted');
UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '49 hours' WHERE user_id='eeeeeeee-0000-4000-8000-000000000030';
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'stale due window expires');
DELETE FROM public.cart_items WHERE id='eeeeeeee-0000-4000-8000-000000000032';
SELECT public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000030','synthetic-already-available');
UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '26 hours',product_seen_at=clock_timestamp()-interval '25 hours' WHERE user_id='eeeeeeee-0000-4000-8000-000000000030';
SELECT campaign_test.assert(public.admit_lifecycle_campaign(s.id,'browse',private.lifecycle_source(s.id,'browse')->>'sourceKey',null),'browse admits without offer') FROM private.marketing_subscribers s WHERE normalized_email='cart-campaign@example.invalid';
SELECT campaign_test.assert((SELECT receipt->'lifecycle'->>'offerId' IS NULL FROM private.email_intents WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_browse'),'browse receipt has no offer');
UPDATE public.products SET status='coming_soon' WHERE id=notification_contract_test.id('already-available');
UPDATE private.email_intents SET state='leased',lease_token='eeeeeeee-0000-4000-8000-000000000033',lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_browse';
SELECT campaign_test.assert(public.prepare_email_attempt(id,'eeeeeeee-0000-4000-8000-000000000033',marketing_contract_test.payload(id)) IS NULL,'unavailable product blocks final browse handoff') FROM private.email_intents WHERE recipient='cart-campaign@example.invalid' AND purpose='lifecycle_browse';
UPDATE public.products SET status='available' WHERE id=notification_contract_test.id('already-available');
SELECT campaign_test.assert(public.record_email_delivery_event('campaign-bounce','sandbox',id,'campaign-provider-id','email.bounced',clock_timestamp(),receipt->'templateContract'->>'from',recipient)='matched','signed matching delivery event retained') FROM private.email_intents WHERE recipient='campaign@example.invalid' AND purpose='lifecycle_welcome';
SELECT campaign_test.assert((SELECT NOT global_allowed AND status='withdrawn' FROM private.marketing_subscribers WHERE normalized_email='campaign@example.invalid'),'bounce globally suppresses future lifecycle sends');
-- Definitively unsent failed checkouts do not permanently suppress future reminders.
INSERT INTO public.orders(id,order_number,user_id,customer_email,cart_id,merchandise_subtotal_cents,total_cents,idempotency_key,status)
VALUES('eeeeeeee-0000-4000-8000-000000000034','HX-CAMPAIGN-FAILED','eeeeeeee-0000-4000-8000-000000000030','cart-campaign@example.invalid','eeeeeeee-0000-4000-8000-000000000031',2500,2500,'campaign-failed','payment_failed');
INSERT INTO public.cart_items(id,cart_id,product_id,variant_key,quantity) VALUES('eeeeeeee-0000-4000-8000-000000000035','eeeeeeee-0000-4000-8000-000000000031',notification_contract_test.id('already-available'),'30ml',1);
UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '25 hours' WHERE user_id='eeeeeeee-0000-4000-8000-000000000030';
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NOT NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'unsent historical failure does not suppress latercart');
UPDATE public.orders SET status='pending_payment' WHERE id='eeeeeeee-0000-4000-8000-000000000034';
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'original unresolved checkout suppresses new discount promise');
UPDATE public.orders SET status='payment_failed',stripe_checkout_session_id='cs_test_campaign_unresolved' WHERE id='eeeeeeee-0000-4000-8000-000000000034';
SELECT campaign_test.assert((SELECT private.lifecycle_source(id,'cart') IS NULL FROM private.marketing_subscribers WHERE normalized_email='cart-campaign@example.invalid'),'failed with unresolved provider Session remains suppressed');
-- Race fixtures are synthetic and run through the real service RPCs.
CREATE FUNCTION campaign_test.seed(n integer,kind text,existing boolean default false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE email text:=CASE WHEN existing THEN 'buyer'||n||'@example.invalid' ELSE 'campaign'||n||'@example.invalid' END; uid uuid:=payment_contract_test.id('user',n); BEGIN
 IF NOT existing THEN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(uid,email,clock_timestamp());
 INSERT INTO public.carts(id,user_id) VALUES(payment_contract_test.id('cart',n),uid);
 END IF;
 PERFORM public.request_marketing_subscription(email,'welcome_popup','2026-11-13-lifecycle-v1',rpad('race'||n,43,'0'),md5(n::text)||md5(n::text),true,campaign_test.contract());
 PERFORM public.confirm_marketing_subscription_scoped(rpad('race'||n,43,'0'),rpad('pref'||n,43,'0'),'lifecycle');
 IF kind='cart' THEN
 INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity) VALUES(payment_contract_test.id('cart',n),notification_contract_test.id('already-available'),'30ml',1);
 UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '25 hours' WHERE user_id=uid;
 ELSE
 DELETE FROM public.cart_items WHERE cart_id=payment_contract_test.id('cart',n);
 PERFORM public.record_lifecycle_product_visit(uid,'synthetic-already-available');
 UPDATE private.lifecycle_activity SET cart_changed_at=clock_timestamp()-interval '26 hours',product_seen_at=clock_timestamp()-interval '25 hours' WHERE user_id=uid;
 END IF;
 PERFORM campaign_test.observe(email);
END $$;
CREATE FUNCTION campaign_test.admit(n integer,kind text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE s private.marketing_subscribers; src jsonb; offer uuid; BEGIN
 SELECT * INTO s FROM private.marketing_subscribers WHERE normalized_email IN ('campaign'||n||'@example.invalid','buyer'||n||'@example.invalid');
 src:=private.lifecycle_source(s.id,kind);
 IF kind='cart' THEN offer:=public.grant_lifecycle_offer('cart',s.normalized_email,src->>'sourceKey','coupon_cart'); END IF;
 RETURN public.admit_lifecycle_campaign(s.id,kind,src->>'sourceKey',offer);
END $$;
CREATE FUNCTION campaign_test.prepare(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE eid uuid; BEGIN
 SELECT id INTO eid FROM private.email_intents WHERE recipient IN ('campaign'||n||'@example.invalid','buyer'||n||'@example.invalid') AND purpose in ('lifecycle_cart','lifecycle_browse');
 RETURN public.prepare_email_attempt(eid,payment_contract_test.id('lease',n),marketing_contract_test.payload(eid));
END $$;
CREATE FUNCTION campaign_test.capacity(n integer,slot integer) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE s private.marketing_subscribers; BEGIN
 SELECT * INTO s FROM private.marketing_subscribers WHERE normalized_email='campaign'||n||'@example.invalid';
 RETURN private.reserve_marketing_capacity(s.id,s.generation,s.revision,payment_contract_test.id('capacity',slot),'lifecycle_browse',clock_timestamp(),null,false);
END $$;
GRANT USAGE ON SCHEMA campaign_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA campaign_test TO service_role;
SELECT campaign_test.seed(600,'cart');
SELECT campaign_test.seed(601,'browse'); SELECT campaign_test.admit(601,'browse');
UPDATE private.email_intents SET state='leased',lease_token=payment_contract_test.id('lease',601),lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='campaign601@example.invalid' AND purpose='lifecycle_browse';
SELECT offer_test.seed(602); SELECT offer_test.prepare(602);
SELECT public.start_checkout_attempt_send(payment_contract_test.id('order',602),(public.read_pending_checkout_attempt(payment_contract_test.id('order',602))->>'attemptId')::uuid,payment_contract_test.id('claim',602),payment_contract_test.key(602));
SELECT public.bind_checkout_attempt_session(payment_contract_test.id('order',602),(public.read_pending_checkout_attempt(payment_contract_test.id('order',602))->>'attemptId')::uuid,payment_contract_test.key(602),'cs_test_contract602',NULL);
SELECT campaign_test.seed(602,'browse',true); SELECT campaign_test.admit(602,'browse');
UPDATE private.email_intents SET state='leased',lease_token=payment_contract_test.id('lease',602),lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='buyer602@example.invalid' AND purpose='lifecycle_browse';
SELECT campaign_test.seed(603,'browse');

-- Selection reserves only a short retry window, so unavailable first candidates yield.
CREATE TABLE campaign_test.first_scan AS SELECT public.list_lifecycle_campaigns(1)->0 AS candidate;
SELECT campaign_test.assert((SELECT (public.list_lifecycle_campaigns(1)->0->>'sourceKey') IS DISTINCT FROM candidate->>'sourceKey' FROM campaign_test.first_scan),'unavailable candidate cannot monopolize next schedule');
CREATE TABLE campaign_test.timezone_identity AS SELECT private.lifecycle_source(id,'browse')->>'sourceKey' AS identity FROM private.marketing_subscribers WHERE normalized_email='campaign603@example.invalid';
SET TIME ZONE 'America/Los_Angeles';
SELECT campaign_test.assert((SELECT private.lifecycle_source(s.id,'browse')->>'sourceKey'=i.identity FROM private.marketing_subscribers s CROSS JOIN campaign_test.timezone_identity i WHERE s.normalized_email='campaign603@example.invalid'),'browse identity stable across session timezone');
SET TIME ZONE 'UTC';

-- Fairness remains across expired backoff cycles, not only within five minutes.
BEGIN;
SELECT campaign_test.seed(610,'browse'); SELECT campaign_test.seed(611,'browse'); SELECT campaign_test.seed(612,'browse');
UPDATE private.lifecycle_campaign_scan SET next_check_at=clock_timestamp()-interval '1 second';
DO $$ DECLARE candidate jsonb; seen text[]:=array[]::text[]; attempts integer; BEGIN
 FOR attempts IN 1..8 LOOP
   candidate:=public.list_lifecycle_campaigns(1)->0;
   IF candidate IS NULL THEN EXIT; END IF;
   PERFORM campaign_test.assert(NOT (candidate->>'sourceKey'=ANY(seen)),'expired backoff must not reset unfair UUID order');
   seen:=array_append(seen,candidate->>'sourceKey');
   IF candidate->>'email'='campaign612@example.invalid' THEN
     PERFORM campaign_test.assert(public.admit_lifecycle_campaign((candidate->>'subscriberId')::uuid,'browse',candidate->>'sourceKey',null),'later eligible recipient actually admits after unavailable candidates');
   END IF;
   -- Simulate a scheduler cadence slower than the retry delay without changing scan history.
   UPDATE private.lifecycle_campaign_scan SET next_check_at=clock_timestamp()-interval '1 second';
   EXIT WHEN (SELECT count(*)=3 FROM unnest(seen) key WHERE key LIKE 'browse:'||payment_contract_test.id('user',610)||':%' OR key LIKE 'browse:'||payment_contract_test.id('user',611)||':%' OR key LIKE 'browse:'||payment_contract_test.id('user',612)||':%');
 END LOOP;
 PERFORM campaign_test.assert((SELECT count(*)=3 FROM unnest(seen) key WHERE key LIKE 'browse:'||payment_contract_test.id('user',610)||':%' OR key LIKE 'browse:'||payment_contract_test.id('user',611)||':%' OR key LIKE 'browse:'||payment_contract_test.id('user',612)||':%'),'later eligible recipients reached across multiple retry cycles');
END $$;
ROLLBACK;
