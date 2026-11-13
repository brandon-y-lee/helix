CREATE SCHEMA lifecycle_test;
CREATE FUNCTION lifecycle_test.seed(n integer,buyer integer DEFAULT NULL,kind text DEFAULT 'cart') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE uid uuid:=payment_contract_test.id('user',coalesce(buyer,n)); email text:='buyer'||coalesce(buyer,n)||'@example.invalid'; offer uuid; pct integer; BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(uid,email,now()) ON CONFLICT(id) DO NOTHING;
  PERFORM public.ensure_rewards_account(uid);
  offer:=public.grant_lifecycle_offer(kind,email,'source:'||coalesce(buyer,n),CASE WHEN kind='welcome' THEN 'coupon_welcome' ELSE 'coupon_cart' END);
  SELECT percent_off INTO pct FROM private.lifecycle_offers WHERE id=offer;
  INSERT INTO public.carts(id,user_id,expires_at,checkout_generation) VALUES(payment_contract_test.id('cart',coalesce(buyer,n)),uid,now()+interval '1 day',payment_contract_test.id('generation',n)) ON CONFLICT DO NOTHING;
  INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity) VALUES(payment_contract_test.id('cart',coalesce(buyer,n)),payment_contract_test.id('product',1),'30ml',1) ON CONFLICT DO NOTHING;
  UPDATE public.carts SET checkout_generation=payment_contract_test.id('generation',n) WHERE id=payment_contract_test.id('cart',coalesce(buyer,n));
  INSERT INTO public.orders(id,order_number,user_id,customer_email,cart_id,merchandise_subtotal_cents,discount_cents,
    shipping_cents,total_cents,idempotency_key,checkout_generation,checkout_attempt_token,checkout_attempt_started_at,metadata)
  VALUES(payment_contract_test.id('order',n),'HX-OFFER-FIXTURE-'||n,uid,email,payment_contract_test.id('cart',coalesce(buyer,n)),2500,25*pct,
    500,3000-25*pct,'fixture-offer:'||n,payment_contract_test.id('generation',n),payment_contract_test.id('claim',n),now(),
    jsonb_build_object('stripe_idempotency_key',payment_contract_test.key(n),'stripe_creation_outcome','creating',
      'shipping_rate_id','shr_fixture','automatic_tax_enabled',true,'tax_behavior','exclusive','offer_id',offer,
      'offer_coupon_id',CASE WHEN kind='welcome' THEN 'coupon_welcome' ELSE 'coupon_cart' END));
  INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
  VALUES(payment_contract_test.id('line',n),payment_contract_test.id('order',n),payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
  RETURN offer;
END $$;
CREATE FUNCTION lifecycle_test.reserve(n integer) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
  PERFORM private.reserve_lifecycle_offer(payment_contract_test.id('order',n),(SELECT (metadata->>'offer_id')::uuid FROM public.orders WHERE id=payment_contract_test.id('order',n)));
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE FUNCTION lifecycle_test.prepare(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE o public.orders; result jsonb; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=payment_contract_test.id('order',n);
 result:=public.prepare_checkout_attempt_once(o.id,payment_contract_test.id('claim',n),payment_contract_test.key(n),
   payment_contract_test.terms(n)||jsonb_build_object('discountCents',o.discount_cents,'preTaxTotalCents',o.total_cents,'offerId',o.metadata->>'offer_id','couponId',o.metadata->>'offer_coupon_id'));
 PERFORM public.admit_checkout_creation('acct_1Tm9WRFEzyaKzdmq',o.id,payment_contract_test.id('claim',n),payment_contract_test.key(n));
 RETURN result;
END $$;
GRANT USAGE ON SCHEMA lifecycle_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA lifecycle_test TO service_role;
SET ROLE service_role;
SELECT payment_contract_test.assert(public.grant_lifecycle_offer('welcome','off@example.invalid','off','coupon_welcome') IS NULL,'default-off grant admission');
SELECT payment_contract_test.assert(NOT has_function_privilege('authenticated','public.grant_lifecycle_offer(text,text,text,text)','execute'),'browser cannot mint offers');
SELECT payment_contract_test.assert(NOT has_table_privilege('authenticated','private.lifecycle_offers','select'),'offer ledger is private');
UPDATE private.lifecycle_offer_control SET enabled=true;
SELECT lifecycle_test.seed(500,NULL,'welcome');
SELECT payment_contract_test.assert(lifecycle_test.reserve(500),'valid welcome reserve');
SELECT payment_contract_test.assert(lifecycle_test.reserve(500),'same order retry stable');
SELECT payment_contract_test.assert((public.read_lifecycle_offers(payment_contract_test.id('user',500)))='[]'::jsonb,'held offer not offered to another checkout');
SELECT payment_contract_test.assert(public.grant_lifecycle_offer('welcome','buyer500@example.invalid','reconfirm','coupon_welcome')=(SELECT id FROM private.lifecycle_offers WHERE email='buyer500@example.invalid'),'reconfirm cannot reissue welcome');
DO $$ BEGIN
  BEGIN
    UPDATE private.lifecycle_offers SET email='changed@example.invalid' WHERE email='buyer500@example.invalid';
    RAISE EXCEPTION 'identity rewrite accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;
-- Cross-user ownership and stacking are checked in the transaction, not only UI.
SELECT lifecycle_test.seed(501);
UPDATE public.orders SET user_id=payment_contract_test.id('user',500) WHERE id=payment_contract_test.id('order',501);
SELECT payment_contract_test.assert(NOT lifecycle_test.reserve(501),'cross-user reservation denied');
SELECT lifecycle_test.seed(502);
UPDATE public.orders SET reward_points_redeemed=200,reward_discount_cents=250 WHERE id=payment_contract_test.id('order',502);
SELECT payment_contract_test.assert(NOT lifecycle_test.reserve(502),'stacking denied');
-- A confirmed terminal unpaid cancellation releases; preparation can reacquire an unexpired grant.
SELECT lifecycle_test.seed(503);
SELECT lifecycle_test.prepare(503);
SELECT public.cancel_checkout_order_without_session(payment_contract_test.id('order',503),'synthetic cancellation');
SELECT payment_contract_test.assert((SELECT reserved_order_id IS NULL FROM private.lifecycle_offers WHERE email='buyer503@example.invalid'),'known unsent cancellation releases');
-- Unknown provider invocation does not release on cancellation or expiry of the grant.
SELECT lifecycle_test.seed(504);
SELECT lifecycle_test.prepare(504);
SELECT public.start_checkout_attempt_send(payment_contract_test.id('order',504),(public.read_pending_checkout_attempt(payment_contract_test.id('order',504))->>'attemptId')::uuid,payment_contract_test.id('claim',504),payment_contract_test.key(504));
SELECT payment_contract_test.assert(NOT public.cancel_checkout_order_without_session(payment_contract_test.id('order',504),'unknown provider'),'uncertain cancellation denied');
SELECT payment_contract_test.assert((SELECT reserved_order_id=payment_contract_test.id('order',504) FROM private.lifecycle_offers WHERE email='buyer504@example.invalid'),'uncertain reservation retained');
-- Actual verified-payment finalization consumes atomically and refund never restores.
SELECT lifecycle_test.seed(505);
SELECT lifecycle_test.prepare(505);
SELECT public.start_checkout_attempt_send(payment_contract_test.id('order',505),(public.read_pending_checkout_attempt(payment_contract_test.id('order',505))->>'attemptId')::uuid,payment_contract_test.id('claim',505),payment_contract_test.key(505));
SELECT public.bind_checkout_attempt_session(payment_contract_test.id('order',505),(public.read_pending_checkout_attempt(payment_contract_test.id('order',505))->>'attemptId')::uuid,payment_contract_test.key(505),'cs_test_contract505',NULL);
SELECT payment_contract_test.assert((public.read_checkout_payment_contract(payment_contract_test.id('order',505),'cs_test_contract505')->>'offerId')=(SELECT id::text FROM private.lifecycle_offers WHERE email='buyer505@example.invalid'),'accepted contract freezes offer identity');
SELECT public.finalize_verified_checkout_payment(payment_contract_test.id('order',505),(public.read_pending_checkout_attempt(payment_contract_test.id('order',505))->>'attemptId')::uuid,'cs_test_contract505','checkout_v2',
  payment_contract_test.facts(505)||jsonb_build_object('discountCents',250,'totalCents',2990),22);
SELECT payment_contract_test.assert((SELECT consumed_at IS NOT NULL FROM private.lifecycle_offers WHERE email='buyer505@example.invalid'),'verified payment consumes');
UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',505);
SELECT payment_contract_test.assert((SELECT consumed_order_id=payment_contract_test.id('order',505) FROM private.lifecycle_offers WHERE email='buyer505@example.invalid'),'refund preserves consumption');
-- Confirmation expiry never makes a held original checkout reusable elsewhere.
INSERT INTO private.lifecycle_offers(kind,email,source_key,percent_off,coupon_id,expires_at)
VALUES('cart','buyer506@example.invalid','source:506',10,'coupon_cart',clock_timestamp()-interval '1 second');
SELECT lifecycle_test.seed(506);
SELECT payment_contract_test.assert(NOT lifecycle_test.reserve(506),'expired unreserved grant denied');
INSERT INTO private.lifecycle_offers(kind,email,source_key,percent_off,coupon_id,expires_at)
VALUES('cart','buyer508@example.invalid','source:508',10,'coupon_cart',clock_timestamp()+interval '400 milliseconds');
SELECT lifecycle_test.seed(508);
SELECT payment_contract_test.assert(lifecycle_test.reserve(508),'grant reserved while valid');
SELECT pg_sleep(0.45);
SELECT payment_contract_test.assert(lifecycle_test.reserve(508),'expired held original reservation remains recoverable');
SELECT payment_contract_test.assert(jsonb_array_length(public.read_lifecycle_offers(payment_contract_test.id('user',508),payment_contract_test.id('cart',508)))=1,'crashed unsent original checkout can be retried');
SELECT payment_contract_test.assert(public.read_lifecycle_offer_for_delivery((SELECT id FROM private.lifecycle_offers WHERE email='buyer508@example.invalid'),'buyer508@example.invalid') IS NULL,'held expired grant not advertised');
-- A second email cannot reset the first verified account welcome entitlement.
SELECT lifecycle_test.seed(507,NULL,'welcome');
UPDATE auth.users SET email='buyer507@example.invalid' WHERE id=payment_contract_test.id('user',500);
UPDATE public.orders SET user_id=payment_contract_test.id('user',500) WHERE id=payment_contract_test.id('order',507);
SELECT payment_contract_test.assert(NOT lifecycle_test.reserve(507),'account email change cannot reissue welcome');
SELECT lifecycle_test.seed(509);
DO $$ DECLARE o public.orders; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=payment_contract_test.id('order',509);
 BEGIN
  PERFORM public.prepare_checkout_attempt_once(o.id,payment_contract_test.id('claim',509),payment_contract_test.key(509),
    payment_contract_test.terms(509)||jsonb_build_object('discountCents',250,'preTaxTotalCents',2750,'offerId',payment_contract_test.id('substitute',509),'couponId','coupon_cart'));
  RAISE EXCEPTION 'substituted offer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Offer terms differ' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.prepare_checkout_attempt_once(o.id,payment_contract_test.id('claim',509),payment_contract_test.key(509),
    payment_contract_test.terms(509)||jsonb_build_object('discountCents',250,'preTaxTotalCents',2750,'offerId',o.metadata->>'offer_id','couponId','another_coupon'));
  RAISE EXCEPTION 'substituted coupon accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Offer coupon differs' THEN RAISE; END IF; END;
END $$;
-- Exercise the actual server snapshot wrapper: a failed entitlement check rolls the new Order back.
RESET ROLE;
CREATE FUNCTION lifecycle_test.snapshot(n integer,wrong_amount boolean) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE uid uuid:=payment_contract_test.id('user',n); offer uuid; lines jsonb; BEGIN
 SELECT id INTO offer FROM private.lifecycle_offers WHERE email='buyer'||n||'@example.invalid';
 SELECT jsonb_agg(to_jsonb(i)-'id'-'order_id'-'created_at') INTO lines FROM public.order_items i WHERE order_id=payment_contract_test.id('order',n);
 DELETE FROM public.order_items WHERE order_id=payment_contract_test.id('order',n);
 DELETE FROM public.orders WHERE id=payment_contract_test.id('order',n);
 PERFORM public.reserve_checkout_order_with_offer('checkout:sandbox:'||md5('wrapper:'||n)||md5('wrapper:'||n),uid,payment_contract_test.id('cart',n),payment_contract_test.id('generation',n),
  'buyer'||n||'@example.invalid','USD',2500,CASE WHEN wrong_amount THEN 1 ELSE 250 END,500,0,CASE WHEN wrong_amount THEN 2999 ELSE 2750 END,
  NULL,0,0,'sandbox','{}',lines,offer);
 RETURN true;
EXCEPTION WHEN OTHERS THEN
 IF wrong_amount AND SQLERRM='Offer unavailable' THEN RETURN false; END IF;
 RAISE;
END $$;
GRANT EXECUTE ON FUNCTION lifecycle_test.snapshot(integer,boolean) TO service_role;
SET ROLE service_role;
SELECT lifecycle_test.seed(530);
SELECT payment_contract_test.assert(NOT lifecycle_test.snapshot(530,true),'incorrect server discount cannot reserve');
SELECT payment_contract_test.assert(NOT EXISTS(SELECT 1 FROM public.orders WHERE idempotency_key='checkout:sandbox:'||md5('wrapper:530')||md5('wrapper:530')),'failed offer check rolls back Order');
SELECT payment_contract_test.assert(lifecycle_test.snapshot(530,false),'actual snapshot and offer reserve atomically');
SELECT payment_contract_test.assert((SELECT reserved_order_id IS NOT NULL FROM private.lifecycle_offers WHERE email='buyer530@example.invalid'),'snapshot holds the grant');
