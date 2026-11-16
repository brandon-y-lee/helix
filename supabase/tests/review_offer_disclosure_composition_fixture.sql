-- Installed only by the pinned two-checkout disposable-PostgreSQL harness.
-- Fresh live rows are synthetic evidence; existing sandbox provenance is never promoted.
-- Start a separate synthetic enrollment time window after the retained rate-limit proofs.
UPDATE private.marketing_request_limits SET occurrences=ARRAY(SELECT t-interval '2 hours' FROM unnest(occurrences) t);
ALTER TYPE public.checkout_environment ADD VALUE IF NOT EXISTS 'live';
ALTER TABLE public.orders DROP CONSTRAINT orders_sandbox_only;
ALTER TABLE private.lifecycle_offers DROP CONSTRAINT lifecycle_offers_environment_check;
CREATE FUNCTION disclosure_test.seed(n integer,mode text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid uuid:=payment_contract_test.id('user',n); source_id uuid:=payment_contract_test.id('order',n+10000); review_order uuid:=payment_contract_test.id('order',n+20000); oid uuid; idx integer; admin_id uuid:=payment_contract_test.id('admin',n); BEGIN
 IF mode NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'invalid fixture mode'; END IF;
 PERFORM review_test.seed(n);
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(admin_id,'admin'||n||'@example.invalid',clock_timestamp());
 INSERT INTO public.admin_memberships(user_id,role,active) VALUES(admin_id,'admin',true);
 FOR idx IN 1..2 LOOP
 oid:=CASE WHEN idx=1 THEN source_id ELSE review_order END;
 INSERT INTO public.orders(id,order_number,user_id,customer_email,merchandise_subtotal_cents,total_cents,idempotency_key,status,paid_at,created_at,stripe_checkout_session_id,checkout_environment)
 VALUES(oid,'HX-DISCLOSURE-'||n||'-'||idx,uid,'review'||n||'@example.invalid',2500,2500,'disclosure:'||n||':'||idx,'paid',clock_timestamp()-interval '16 days',clock_timestamp()-interval '17 days','cs_disclosure_'||n||'_'||idx,mode::public.checkout_environment);
 INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
 VALUES(payment_contract_test.id('disclosure-line',n*10+idx),oid,payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
 INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
 VALUES(oid,'cs_disclosure_'||n||'_'||idx,'checkout_v2','pi_disclosure_'||n||'_'||idx,0,0,0,2500,'[]','Synthetic','{}');
 END LOOP;
 INSERT INTO review_test.delivery VALUES(source_id,jsonb_build_object('orderId',source_id,'status','complete','genuine',true,'evidenceId','disclosure-delivery:'||n,'revision','1','deliveredAt',clock_timestamp()-interval '14 days 1 hour'));
 INSERT INTO review_test.risk VALUES(source_id,jsonb_build_object('orderId',source_id,'userId',uid,'mode',mode,'status','safe','evidenceId','disclosure-risk:'||n,'revision','1','observedAt',clock_timestamp()));
 RETURN jsonb_build_object('userId',uid,'productId',payment_contract_test.id('product',1),'productSlug','synthetic-serum',
 'orderItemId',payment_contract_test.id('disclosure-line',n*10+2),'subscriberId',(SELECT id FROM private.marketing_subscribers WHERE normalized_email='review'||n||'@example.invalid'),
 'sourceOrderId',source_id,'adminId',admin_id,'environment',mode);
END $$;
CREATE FUNCTION disclosure_test.grant_offer(context jsonb) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE result uuid; BEGIN
 -- Fixture-only provider-mode qualification: the runtime still permits sandbox only.
 IF context->>'environment'='live' THEN ALTER TABLE private.lifecycle_offers ALTER COLUMN environment SET DEFAULT 'live'; END IF;
 result:=public.grant_review_winback_offer((context->>'subscriberId')::uuid,(context->>'sourceOrderId')::uuid,'coupon_disclosure');
 ALTER TABLE private.lifecycle_offers ALTER COLUMN environment SET DEFAULT 'sandbox';
 RETURN result;
END $$;
