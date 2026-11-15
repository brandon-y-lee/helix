RESET ROLE;
-- Isolated synthetic enrollment window, after retained rate-limit proofs.
UPDATE private.marketing_request_limits SET occurrences=ARRAY(SELECT t-interval '2 hours' FROM unnest(occurrences) t);
CREATE SCHEMA guest_invitation_test;
CREATE FUNCTION guest_invitation_test.seed(n integer) RETURNS void LANGUAGE plpgsql AS $$
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
 VALUES(oid,'HX-REVIEW-'||n,NULL,email,payment_contract_test.id('cart',n),2500,2500,'review:'||n,'paid',clock_timestamp()-interval '16 days',clock_timestamp()-interval '17 days','cs_test_review'||n);
 INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
 VALUES(oid,'cs_test_review'||n,'checkout_v2','pi_review'||n,0,0,0,2500,'[]','Synthetic','{}');
 INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
 VALUES(payment_contract_test.id('guest-line',n),oid,payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
 INSERT INTO review_test.delivery VALUES(oid,jsonb_build_object('orderId',oid,'status','complete','genuine',true,'evidenceId','delivery:'||n,'revision','1','deliveredAt',clock_timestamp()-interval '14 days 1 hour'));
 INSERT INTO review_test.risk VALUES(oid,jsonb_build_object('orderId',oid,'userId',NULL,'mode','sandbox','status','safe','evidenceId','risk:'||n,'revision','1','observedAt',clock_timestamp()));
 PERFORM campaign_test.observe(email);
END $$;
-- Contracts are test fixtures only; the joint harness supplies actual consumer code.
DO $$ BEGIN
 IF to_regprocedure('public.issue_guest_review_link_v1(uuid,text,text,timestamp with time zone)') IS NULL THEN
  PERFORM guest_invitation_test.seed(1000);
  PERFORM campaign_test.assert(review_test.source(1000) IS NULL,'missing consumer cannot admit or grant guest');
  EXECUTE 'CREATE TABLE guest_invitation_test.links(order_id uuid primary key,email text,hash text,expires_at timestamptz)';
  EXECUTE $def$CREATE FUNCTION public.issue_guest_review_link_v1(p_order_id uuid,p_recipient text,p_token text,p_expires_at timestamptz) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $body$
  BEGIN
   INSERT INTO guest_invitation_test.links VALUES(p_order_id,p_recipient,encode(extensions.digest(p_token,'sha256'),'hex'),p_expires_at);
   RETURN true;
  END $body$ $def$;
  EXECUTE $def$CREATE FUNCTION public.guest_review_link_valid_v1(p_order_id uuid,p_recipient text,p_token text) RETURNS boolean LANGUAGE sql SET search_path='' AS $body$
   SELECT EXISTS(SELECT 1 FROM guest_invitation_test.links WHERE order_id=p_order_id AND email=p_recipient AND hash=encode(extensions.digest(p_token,'sha256'),'hex') AND expires_at>clock_timestamp())
  $body$ $def$;
  EXECUTE 'REVOKE ALL ON FUNCTION public.issue_guest_review_link_v1(uuid,text,text,timestamptz),public.guest_review_link_valid_v1(uuid,text,text) FROM public,anon,authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.issue_guest_review_link_v1(uuid,text,text,timestamptz),public.guest_review_link_valid_v1(uuid,text,text) TO service_role';
  EXECUTE 'GRANT ALL ON guest_invitation_test.links TO service_role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA guest_invitation_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA guest_invitation_test TO service_role;
SELECT guest_invitation_test.seed(1001);
-- Delayed evidence and scheduler outage beyond day15 must not permanently drop first admission.
UPDATE review_test.delivery SET evidence=jsonb_set(evidence,'{deliveredAt}',to_jsonb((clock_timestamp()-interval '15 days 1 hour')::text)) WHERE order_id=payment_contract_test.id('order',1001);
SELECT campaign_test.assert(review_test.source(1001) IS NOT NULL,'late guest source retained');
SELECT campaign_test.assert(review_test.admit(1001),'guest admits without account');
DO $$ DECLARE saved jsonb; current_token text; oid uuid:=payment_contract_test.id('order',1001); grantid uuid; blocked boolean:=false; BEGIN
 SELECT receipt INTO saved FROM private.email_intents WHERE recipient='review1001@example.invalid' AND purpose='lifecycle_review_winback';
 current_token:=saved->'lifecycle'->>'guestReviewToken';
 PERFORM campaign_test.assert(current_token ~ '^[A-Za-z0-9_-]{43}$','strong capability');
 PERFORM campaign_test.assert(public.guest_review_link_valid_v1(oid,'review1001@example.invalid',current_token),'binding valid');
 PERFORM campaign_test.assert(NOT public.guest_review_link_valid_v1(oid,'other@example.invalid',current_token),'wrong recipient rejected');
 PERFORM campaign_test.assert(NOT public.guest_review_link_valid_v1(payment_contract_test.id('order',1002),'review1001@example.invalid',current_token),'wrong order rejected');
 PERFORM campaign_test.assert(NOT review_test.admit(1001),'retry does not rotate grant');
 PERFORM campaign_test.assert((SELECT receipt=saved FROM private.email_intents WHERE recipient='review1001@example.invalid' AND purpose='lifecycle_review_winback'),'frozen receipt unchanged');
 SELECT id INTO grantid FROM private.lifecycle_offers WHERE source_order_id=oid;
 PERFORM campaign_test.assert((SELECT source_user_id IS NULL AND user_id IS NULL FROM private.lifecycle_offers WHERE id=grantid),'guest source remains guest');
 PERFORM campaign_test.assert(public.read_lifecycle_offer_for_delivery(grantid,'review1001@example.invalid') IS NOT NULL,'gift independent of review');
 PERFORM campaign_test.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.read_lifecycle_offers(payment_contract_test.id('user',1002))) x WHERE x->>'id'=grantid::text),'different account cannot claim offer');
 -- Fixture retains a matching confirmed account solely for offer redemption proof.
 PERFORM campaign_test.assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.read_lifecycle_offers(payment_contract_test.id('user',1001))) x WHERE x->>'id'=grantid::text),'matching verified account can read guest gift');
 PERFORM campaign_test.assert(review_test.prepare(1001) IS NOT NULL,'late first send passes shared capacity without24h loss');
 UPDATE private.email_intents SET state='accepted',provider_email_id='synthetic-guest-accepted' WHERE recipient='review1001@example.invalid' AND purpose='lifecycle_review_winback';
 PERFORM campaign_test.assert(NOT review_test.admit(1001),'terminal message not replayed');
END $$;
SELECT guest_invitation_test.seed(1020);
SELECT campaign_test.assert(NOT has_function_privilege('anon','public.has_guest_review_winback_offer_v1(uuid,uuid,text)','EXECUTE'),'guest disclosure private');
SELECT campaign_test.assert(NOT has_function_privilege('authenticated','private.review_guest_capability_valid(uuid,text,text)','EXECUTE'),'capability checker private');
SELECT guest_invitation_test.seed(1021); SELECT review_test.admit(1021);
DO $$ BEGIN
 IF to_regclass('private.guest_review_links') IS NOT NULL THEN
  EXECUTE 'UPDATE private.guest_review_links SET revoked_at=clock_timestamp() WHERE order_id=$1' USING payment_contract_test.id('order',1021);
 ELSE
  UPDATE guest_invitation_test.links SET expires_at=clock_timestamp()-interval '1 second' WHERE order_id=payment_contract_test.id('order',1021);
 END IF;
 PERFORM campaign_test.assert(review_test.prepare(1021) IS NULL,'invalidated capability blocks first handoff');
 PERFORM campaign_test.assert(NOT review_test.admit(1021),'blocked admission never reissues token or gift');
END $$;
SELECT guest_invitation_test.seed(1022); SELECT review_test.admit(1022);
-- Occupy the shared cap using another already-existing synthetic intent identity.
INSERT INTO private.marketing_send_reservations(subscriber_id,generation,intent_id,purpose,reserved_at,last_handoff_at)
SELECT s.id,s.generation,e.id,'welcome_initial',clock_timestamp(),clock_timestamp()
FROM private.marketing_subscribers s JOIN private.email_intents e ON e.recipient=s.normalized_email AND e.purpose='marketing_confirmation'
WHERE s.normalized_email='review1022@example.invalid' LIMIT 1;
SELECT campaign_test.assert(review_test.prepare(1022) IS NULL,'shared cap defers guest');
SELECT campaign_test.assert((SELECT state='retry' AND next_attempt_at>clock_timestamp() FROM private.email_intents WHERE recipient='review1022@example.invalid' AND purpose='lifecycle_review_winback'),'review retry not clamped to elapsed24h window');
-- Test-only clock travel; restore immutable history guard before exercising recovery.
ALTER TABLE private.marketing_send_reservations DISABLE TRIGGER preserve_marketing_reservation;
UPDATE private.marketing_send_reservations SET reserved_at=clock_timestamp()-interval '25 hours',last_handoff_at=clock_timestamp()-interval '25 hours' WHERE subscriber_id=(SELECT id FROM private.marketing_subscribers WHERE normalized_email='review1022@example.invalid');
ALTER TABLE private.marketing_send_reservations ENABLE TRIGGER preserve_marketing_reservation;
SELECT campaign_test.assert(review_test.prepare(1022) IS NOT NULL,'cap recovery sends same invitation');
SELECT guest_invitation_test.seed(1023); SELECT review_test.admit(1023);
SELECT public.withdraw_marketing_subscription(rpad('review-pref-1023',43,'0'),'global');
SELECT campaign_test.assert(review_test.prepare(1023) IS NULL,'guest withdrawal wins');
SELECT guest_invitation_test.seed(1024);
DO $$ BEGIN
 IF to_regprocedure('public.submit_guest_product_review(text,uuid,integer,text,integer,text,text,boolean)') IS NOT NULL THEN
  PERFORM public.issue_guest_review_link_v1(payment_contract_test.id('order',1024),'review1024@example.invalid',repeat('q',43),clock_timestamp()+interval '1 day');
  EXECUTE 'select public.submit_guest_product_review($1,$2,0,$3,1,$4,$5,true)' USING repeat('q',43),payment_contract_test.id('guest-line',1024),'Synthetic guest','Honest feedback','A genuinely mixed synthetic experience.';
  EXECUTE 'select campaign_test.assert(not private.guest_public_review_offer_notice($1,$2,$3),$4)' USING payment_contract_test.id('order',1024),payment_contract_test.id('product',1),'sandbox','guest review initially no offer';
 END IF;
END $$;
-- A later guest order for same immutable email/product qualifies historical disclosure.
INSERT INTO public.orders(id,order_number,customer_email,merchandise_subtotal_cents,total_cents,idempotency_key,status,paid_at,created_at,stripe_checkout_session_id)
VALUES(payment_contract_test.id('order',1025),'HX-GUEST-1025','review1024@example.invalid',2500,2500,'guest:1025','paid',clock_timestamp()-interval '16 days',clock_timestamp()-interval '17 days','cs_test_guest1025');
INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
VALUES(payment_contract_test.id('order',1025),'cs_test_guest1025','checkout_v2','pi_guest1025',0,0,0,2500,'[]','Synthetic','{}');
INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
VALUES(payment_contract_test.id('guest-line',1025),payment_contract_test.id('order',1025),payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
INSERT INTO review_test.delivery SELECT payment_contract_test.id('order',1025),jsonb_set(evidence,'{orderId}',to_jsonb(payment_contract_test.id('order',1025)::text)) FROM review_test.delivery WHERE order_id=payment_contract_test.id('order',1024);
INSERT INTO review_test.risk SELECT payment_contract_test.id('order',1025),jsonb_set(evidence,'{orderId}',to_jsonb(payment_contract_test.id('order',1025)::text)) FROM review_test.risk WHERE order_id=payment_contract_test.id('order',1024);
SELECT public.grant_review_winback_offer((SELECT id FROM private.marketing_subscribers WHERE normalized_email='review1024@example.invalid'),payment_contract_test.id('order',1025),'coupon_review');
SELECT campaign_test.assert(public.has_guest_review_winback_offer_v1(payment_contract_test.id('order',1024),payment_contract_test.id('product',1),'sandbox'),'later guest offer affects earlier guest review');
SELECT campaign_test.assert(NOT public.has_guest_review_winback_offer_v1(payment_contract_test.id('order',1023),payment_contract_test.id('product',1),'live'),'mode isolation');
-- Real reservation binds a guest-origin gift only to a verified matching account.
SELECT guest_invitation_test.seed(1026); SELECT review_test.grant(1026);
INSERT INTO public.orders(id,order_number,user_id,customer_email,cart_id,merchandise_subtotal_cents,discount_cents,total_cents,idempotency_key,metadata)
SELECT payment_contract_test.id('order',2026),'HX-GUEST-CLAIM-2026',payment_contract_test.id('user',1026),'review1026@example.invalid',payment_contract_test.id('cart',1026),2500,250,2250,'guest-claim:2026',jsonb_build_object('offer_id',id,'offer_coupon_id',coupon_id)
FROM private.lifecycle_offers WHERE source_order_id=payment_contract_test.id('order',1026);
SELECT private.reserve_lifecycle_offer(payment_contract_test.id('order',2026),(SELECT id FROM private.lifecycle_offers WHERE source_order_id=payment_contract_test.id('order',1026)));
SELECT campaign_test.assert((SELECT user_id=payment_contract_test.id('user',1026) AND source_user_id IS NULL AND reserved_order_id=payment_contract_test.id('order',2026) FROM private.lifecycle_offers WHERE source_order_id=payment_contract_test.id('order',1026)),'real redemption binds matching account without changing guest source');
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN UPDATE private.lifecycle_offers SET user_id=payment_contract_test.id('user',1023) WHERE source_order_id=payment_contract_test.id('order',1026);
 EXCEPTION WHEN integrity_constraint_violation THEN denied:=true; END;
 PERFORM campaign_test.assert(denied,'claimed guest benefit cannot transfer accounts');
END $$;

DO $$ BEGIN
 IF to_regprocedure('private.guest_public_review_offer_notice(uuid,uuid,text)') IS NOT NULL THEN
  EXECUTE 'select campaign_test.assert(private.guest_public_review_offer_notice($1,$2,$3),$4)' USING payment_contract_test.id('order',1024),payment_contract_test.id('product',1),'sandbox','actual consumer sees later guest offer';
 END IF;
END $$;
