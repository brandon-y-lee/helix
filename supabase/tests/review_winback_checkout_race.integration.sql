RESET ROLE;
-- Force original/source UUID to sort before consuming UUID, the previous inversion.
CREATE FUNCTION review_test.checkout_seed(n integer,m integer,held boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid:=payment_contract_test.id('user',n); offer uuid; BEGIN
 PERFORM review_test.seed(n); PERFORM review_test.admit(n); offer:=review_test.grant(n);
 PERFORM campaign_test.assert(payment_contract_test.id('order',n)<payment_contract_test.id('order',m),'source must sort first to reproduce inversion');
 PERFORM public.ensure_rewards_account(uid);
 UPDATE public.carts SET checkout_generation=payment_contract_test.id('generation',m),expires_at=now()+interval '1 day' WHERE id=payment_contract_test.id('cart',n);
 INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity) VALUES(payment_contract_test.id('cart',n),payment_contract_test.id('product',1),'30ml',1);
 INSERT INTO public.orders(id,order_number,user_id,customer_email,cart_id,merchandise_subtotal_cents,discount_cents,shipping_cents,total_cents,idempotency_key,checkout_generation,checkout_attempt_token,checkout_attempt_started_at,metadata)
 VALUES(payment_contract_test.id('order',m),'HX-REVIEW-RACE-'||m,uid,'review'||n||'@example.invalid',payment_contract_test.id('cart',n),2500,250,500,2750,'review-race:'||m,payment_contract_test.id('generation',m),payment_contract_test.id('claim',m),now(),
 jsonb_build_object('stripe_idempotency_key',payment_contract_test.key(m),'stripe_creation_outcome','creating','shipping_rate_id','shr_fixture','automatic_tax_enabled',true,'tax_behavior','exclusive','offer_id',offer,'offer_coupon_id','coupon_review'));
 INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
 VALUES(payment_contract_test.id('line',m),payment_contract_test.id('order',m),payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
 IF held THEN PERFORM review_test.checkout_prepare(m); END IF;
END $$;
CREATE FUNCTION review_test.checkout_prepare(m integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.prepare_checkout_attempt_once(payment_contract_test.id('order',m),payment_contract_test.id('claim',m),payment_contract_test.key(m),payment_contract_test.terms(m)||jsonb_build_object('offerId',(SELECT metadata->>'offer_id' FROM public.orders WHERE id=payment_contract_test.id('order',m)),'couponId','coupon_review','discountCents',250,'preTaxTotalCents',2750))
$$;
GRANT EXECUTE ON FUNCTION review_test.checkout_prepare(integer),review_test.checkout_seed(integer,integer,boolean) TO service_role;
SELECT review_test.checkout_seed(970,1970,false);
SELECT review_test.checkout_seed(972,1972,true);
-- Controlled scheduling barrier only. Real auth lookup remains unchanged underneath.
ALTER FUNCTION private.lifecycle_offer_verified_email(uuid,boolean) RENAME TO lifecycle_offer_verified_email_race_original;
CREATE FUNCTION private.lifecycle_offer_verified_email(p_user_id uuid,p_lock boolean default false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE result text; BEGIN
 result:=private.lifecycle_offer_verified_email_race_original(p_user_id,p_lock);
 IF p_lock AND current_setting('helix_test.review_checkout_barrier',true)='on' THEN
   PERFORM pg_advisory_xact_lock(4981970);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.lifecycle_offer_verified_email(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.lifecycle_offer_verified_email(uuid,boolean) TO service_role;
SELECT review_test.checkout_seed(976,1976,false);
CREATE FUNCTION review_test.try_checkout(m integer) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
 PERFORM review_test.checkout_prepare(m); RETURN true;
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='Offer source unavailable' THEN RETURN false; END IF;
 RAISE;
END $$;
GRANT EXECUTE ON FUNCTION review_test.try_checkout(integer) TO service_role;
