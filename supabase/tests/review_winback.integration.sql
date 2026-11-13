RESET ROLE;
CREATE SCHEMA review_test;
CREATE TABLE review_test.delivery(order_id uuid primary key,evidence jsonb);
CREATE TABLE review_test.risk(order_id uuid primary key,evidence jsonb);
CREATE FUNCTION review_test.contract() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_set(campaign_test.contract()||'{"version":"lifecycle_v2"}', '{templates}', (campaign_test.contract()->'templates')||jsonb_build_object('lifecycle_review_winback',campaign_test.contract()->'templates'->'welcome_initial')) $$;
CREATE FUNCTION review_test.seed(n integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid:=payment_contract_test.id('user',n); oid uuid:=payment_contract_test.id('order',n); email text:='review'||n||'@example.invalid'; BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(uid,email,clock_timestamp());
 INSERT INTO public.carts(id,user_id) VALUES(payment_contract_test.id('cart',n),uid);
 PERFORM public.request_marketing_subscription(email,'welcome_popup','2026-11-13-lifecycle-v2',rpad('review-confirm-'||n,43,'0'),md5(n::text)||md5(n::text),true,review_test.contract());
 PERFORM campaign_test.assert(public.confirm_marketing_subscription_scoped(rpad('review-confirm-'||n,43,'0'),rpad('review-pref-'||n,43,'0'),'lifecycle')->>'status'='invalid','v2 cannot confirm displayedv1');
 PERFORM campaign_test.assert(public.confirm_marketing_subscription_scoped(rpad('review-confirm-'||n,43,'0'),rpad('review-pref-'||n,43,'0'),'lifecycle_reviews')->>'status'='confirmed','explicit v2 confirmation');
 -- Fixture-only time travel after exercising real v2 enrollment. Restore immutable guard before any eligibility operation.
 ALTER TABLE private.marketing_generations DISABLE TRIGGER preserve_marketing_generation_identity;
 UPDATE private.marketing_generations SET requested_at=clock_timestamp()-interval '20 days',confirmed_at=clock_timestamp()-interval '20 days' WHERE subscriber_id=(SELECT id FROM private.marketing_subscribers WHERE normalized_email=email);
 ALTER TABLE private.marketing_generations ENABLE TRIGGER preserve_marketing_generation_identity;
 INSERT INTO public.orders(id,order_number,user_id,customer_email,cart_id,merchandise_subtotal_cents,total_cents,idempotency_key,status,paid_at,created_at,stripe_checkout_session_id)
 VALUES(oid,'HX-REVIEW-'||n,uid,email,payment_contract_test.id('cart',n),2500,2500,'review:'||n,'paid',clock_timestamp()-interval '16 days',clock_timestamp()-interval '17 days','cs_test_review'||n);
 INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
 VALUES(oid,'cs_test_review'||n,'checkout_v2','pi_review'||n,0,0,0,2500,'[]','Synthetic','{}');
 INSERT INTO review_test.delivery VALUES(oid,jsonb_build_object('orderId',oid,'status','complete','genuine',true,'evidenceId','delivery:'||n,'revision','1','deliveredAt',clock_timestamp()-interval '14 days 1 hour'));
 INSERT INTO review_test.risk VALUES(oid,jsonb_build_object('orderId',oid,'userId',uid,'mode','sandbox','status','safe','evidenceId','risk:'||n,'revision','1','observedAt',clock_timestamp()));
 PERFORM campaign_test.observe(email);
END $$;
CREATE FUNCTION review_test.source(n integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.review_winback_source(s.id,payment_contract_test.id('order',n)) FROM private.marketing_subscribers s WHERE s.normalized_email='review'||n||'@example.invalid' $$;
CREATE FUNCTION review_test.grant(n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT public.grant_review_winback_offer(s.id,payment_contract_test.id('order',n),'coupon_review') FROM private.marketing_subscribers s WHERE s.normalized_email='review'||n||'@example.invalid' $$;
CREATE FUNCTION review_test.admit(n integer) RETURNS boolean LANGUAGE sql AS $$ SELECT public.admit_lifecycle_campaign(s.id,'review_winback','review_winback:'||payment_contract_test.id('order',n),review_test.grant(n)) FROM private.marketing_subscribers s WHERE s.normalized_email='review'||n||'@example.invalid' $$;
CREATE FUNCTION review_test.prepare(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE eid uuid; lease uuid:=payment_contract_test.id('reviewlease',n); BEGIN
 PERFORM campaign_test.observe('review'||n||'@example.invalid');
 UPDATE private.email_intents SET state='leased',lease_token=lease,lease_expires_at=clock_timestamp()+interval '1 minute' WHERE recipient='review'||n||'@example.invalid' AND purpose='lifecycle_review_winback' RETURNING id INTO eid;
 RETURN public.prepare_email_attempt(eid,lease,marketing_contract_test.payload(eid));
END $$;
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '30 days';
SELECT review_test.seed(900);
SELECT campaign_test.assert(review_test.source(900) IS NULL,'runtime delivery/risk always unknown even all controls enabled');
SELECT campaign_test.assert(review_test.grant(900) IS NULL,'runtime cannot grant');
SELECT campaign_test.assert(NOT review_test.admit(900),'runtime cannot admit');
SELECT campaign_test.assert(NOT has_function_privilege('authenticated','private.verified_order_delivery(uuid)','EXECUTE'),'browser cannot read delivery');
SELECT campaign_test.assert(NOT has_function_privilege('authenticated','private.verified_order_payment_risk(uuid,uuid,text)','EXECUTE'),'browser cannot assert risk');
-- Test-only authoritative source replacement, never installed in application migrations.
CREATE OR REPLACE FUNCTION private.verified_order_delivery(p_order_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT evidence FROM review_test.delivery WHERE order_id=p_order_id $$;
SELECT campaign_test.assert(review_test.source(900) IS NULL,'delivery alone cannot admit without risk');
CREATE OR REPLACE FUNCTION private.verified_order_payment_risk(p_order_id uuid,p_user_id uuid,p_mode text) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT evidence FROM review_test.risk WHERE order_id=p_order_id $$;
SELECT campaign_test.assert(review_test.source(900) IS NOT NULL,'genuine synthetic verified eligible due source');
DO $$ DECLARE state text; original jsonb; BEGIN
 SELECT evidence INTO original FROM review_test.risk WHERE order_id=payment_contract_test.id('order',900);
 FOREACH state IN ARRAY ARRAY['unknown','partial_refund','disputed','chargeback','cancelled'] LOOP
 UPDATE review_test.risk SET evidence=jsonb_set(original,'{status}',to_jsonb(state)) WHERE order_id=payment_contract_test.id('order',900);
 PERFORM campaign_test.assert(review_test.grant(900) IS NULL,'unsafe risk suppresses grant: '||state);
 END LOOP;
 UPDATE review_test.risk SET evidence=jsonb_set(original,'{observedAt}',to_jsonb((clock_timestamp()-interval '6 minutes')::text)) WHERE order_id=payment_contract_test.id('order',900);
 PERFORM campaign_test.assert(review_test.grant(900) IS NULL,'stale risk blocks');
 UPDATE review_test.risk SET evidence=original WHERE order_id=payment_contract_test.id('order',900);
 SELECT evidence INTO original FROM review_test.delivery WHERE order_id=payment_contract_test.id('order',900);
 FOREACH state IN ARRAY ARRAY['partial','revoked','returned','corrected'] LOOP
 UPDATE review_test.delivery SET evidence=jsonb_set(original,'{status}',to_jsonb(state)) WHERE order_id=payment_contract_test.id('order',900);
 PERFORM campaign_test.assert(review_test.grant(900) IS NULL,'incomplete delivery suppresses: '||state);
 END LOOP;
 UPDATE review_test.delivery SET evidence=jsonb_set(original,'{deliveredAt}',to_jsonb((clock_timestamp()-interval '13 days')::text)) WHERE order_id=payment_contract_test.id('order',900);
 PERFORM campaign_test.assert(review_test.source(900) IS NULL,'not due before14days');
 UPDATE review_test.delivery SET evidence=jsonb_set(original,'{deliveredAt}',to_jsonb((clock_timestamp()-interval '15 days 1 hour')::text)) WHERE order_id=payment_contract_test.id('order',900);
 PERFORM campaign_test.assert(review_test.source(900) IS NULL,'24h admission window expires');
 UPDATE review_test.delivery SET evidence=original WHERE order_id=payment_contract_test.id('order',900);
END $$;
SELECT campaign_test.assert(review_test.admit(900),'eligible invitation admits');
SELECT campaign_test.assert(NOT review_test.admit(900),'duplicate invitation suppressed');
SELECT campaign_test.assert(review_test.prepare(900) IS NOT NULL,'verified finalhandoff through sharedcap');
SELECT campaign_test.assert((SELECT count(*)=1 FROM private.marketing_send_reservations WHERE purpose='lifecycle_review_winback'),'review uses sharedcap');
SELECT review_test.seed(901); SELECT review_test.seed(902); SELECT review_test.seed(903); SELECT review_test.seed(904); SELECT review_test.seed(905);
SELECT review_test.admit(902); SELECT review_test.admit(903); SELECT review_test.admit(904); SELECT review_test.admit(905);
GRANT USAGE ON SCHEMA review_test TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA review_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA review_test TO service_role;
-- Exact identity, provenance and rollout cannot be supplied by customer input.
SELECT review_test.seed(906);
DO $$ DECLARE d jsonb; r jsonb; BEGIN
 SELECT evidence INTO d FROM review_test.delivery WHERE order_id=payment_contract_test.id('order',906);
 SELECT evidence INTO r FROM review_test.risk WHERE order_id=payment_contract_test.id('order',906);
 UPDATE review_test.risk SET evidence=jsonb_set(r,'{userId}',to_jsonb(payment_contract_test.id('user',900)::text)) WHERE order_id=payment_contract_test.id('order',906);
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'risk evidence must match account');
 UPDATE review_test.risk SET evidence=jsonb_set(r,'{mode}','"live"') WHERE order_id=payment_contract_test.id('order',906);
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'risk mode must match original payment');
 UPDATE review_test.risk SET evidence=r WHERE order_id=payment_contract_test.id('order',906);
 UPDATE review_test.delivery SET evidence=jsonb_set(d,'{genuine}','false') WHERE order_id=payment_contract_test.id('order',906);
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'simulation is not genuine');
 UPDATE review_test.delivery SET evidence=jsonb_set(d,'{orderId}',to_jsonb(payment_contract_test.id('order',900)::text)) WHERE order_id=payment_contract_test.id('order',906);
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'delivery bound to exact order');
 UPDATE review_test.delivery SET evidence=d WHERE order_id=payment_contract_test.id('order',906);
 UPDATE auth.users SET email='changed906@example.invalid' WHERE id=payment_contract_test.id('user',906);
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'verified current email must match original recipient');
 UPDATE auth.users SET email='review906@example.invalid' WHERE id=payment_contract_test.id('user',906);
 UPDATE private.email_controls SET accepted_after=clock_timestamp() WHERE purpose='lifecycle_review_winback';
 PERFORM campaign_test.assert(review_test.source(906) IS NULL,'new rollout cannot backfill old enrollment');
 UPDATE private.email_controls SET accepted_after=clock_timestamp()-interval '30 days' WHERE purpose='lifecycle_review_winback';
 PERFORM campaign_test.assert(review_test.source(906) IS NOT NULL,'restored synthetic source qualifies');
 BEGIN
  UPDATE private.marketing_generations SET requested_at=clock_timestamp() WHERE subscriber_id=(SELECT id FROM private.marketing_subscribers WHERE normalized_email='review906@example.invalid');
  RAISE EXCEPTION 'generation fixture failed to restore immutable guard';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;
-- An existing v1 confirmation is not review consent. A new v2 token is required.
SELECT campaign_test.seed(907,'browse');
SELECT public.request_marketing_subscription('campaign907@example.invalid','email_preferences','2026-11-13-lifecycle-v2',rpad('upgrade907',43,'0'),repeat('9',64),true,review_test.contract());
SELECT campaign_test.assert((SELECT g.template_contract->>'version'='lifecycle_v1' FROM private.marketing_subscribers s JOIN private.marketing_generations g ON g.subscriber_id=s.id AND g.generation=s.generation WHERE s.normalized_email='campaign907@example.invalid'),'pending upgrade leaves old generation unchanged');
SELECT campaign_test.assert(public.confirm_marketing_subscription_scoped(rpad('upgrade907',43,'0'),rpad('upref907',43,'0'),'welcome')->>'status'='invalid','missing scope cannot silently grant v2');
SELECT campaign_test.assert(public.confirm_marketing_subscription_scoped(rpad('upgrade907',43,'0'),rpad('upref907',43,'0'),'lifecycle_reviews')->>'status'='confirmed','explicit confirmed v2 upgrade');
SELECT campaign_test.assert((SELECT count(*)=1 FROM private.marketing_generations g JOIN private.marketing_subscribers s ON s.id=g.subscriber_id WHERE s.normalized_email='campaign907@example.invalid' AND g.template_contract->>'version'='lifecycle_v1'),'old consent evidence retained');
