RESET ROLE;
CREATE SCHEMA disclosure_test;
SELECT review_test.seed(990);
INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
VALUES(payment_contract_test.id('line',990),payment_contract_test.id('order',990),payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml','30mL',2500,1,2500,'{}');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'sandbox'),'purchase alone is not an offer');
SELECT review_test.grant(990);
SELECT campaign_test.assert(public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'sandbox'),'issued unconditional offer associates original account and product');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'live'),'sandbox must not become live association');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',991),payment_contract_test.id('product',1),'sandbox'),'different account denied');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',990),notification_contract_test.id('already-available'),'sandbox'),'different product denied');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(NULL,payment_contract_test.id('product',1),'sandbox'),'missing identity false');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'production'),'unexpected mode false');
UPDATE auth.users SET email='new990@example.invalid' WHERE id=payment_contract_test.id('user',990);
UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',990);
UPDATE review_test.risk SET evidence=jsonb_set(evidence,'{status}','"disputed"') WHERE order_id=payment_contract_test.id('order',990);
SELECT public.withdraw_marketing_subscription(rpad('review-pref-990',43,'0'),'global');
UPDATE private.email_controls SET enabled=false WHERE purpose='lifecycle_review_winback';
SELECT campaign_test.assert(public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'sandbox'),'emailchange refund risk withdrawal pause do not erase historic offer');
UPDATE private.email_controls SET enabled=true WHERE purpose='lifecycle_review_winback';
-- Owned fixture time travel only; immutable identity trigger is immediately restored.
ALTER TABLE private.lifecycle_offers DISABLE TRIGGER lifecycle_offer_immutable;
UPDATE private.lifecycle_offers SET issued_at=clock_timestamp()-interval '16 days',expires_at=clock_timestamp()-interval '2 days' WHERE source_order_id=payment_contract_test.id('order',990);
ALTER TABLE private.lifecycle_offers ENABLE TRIGGER lifecycle_offer_immutable;
UPDATE private.lifecycle_offers SET reserved_order_id=payment_contract_test.id('order',990),consumed_order_id=payment_contract_test.id('order',990),consumed_at=clock_timestamp() WHERE source_order_id=payment_contract_test.id('order',990);
SELECT campaign_test.assert(public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'sandbox'),'expired consumed offer remains historical association');
DO $$ BEGIN
 BEGIN UPDATE private.lifecycle_offers SET expires_at=clock_timestamp() WHERE source_order_id=payment_contract_test.id('order',990); RAISE EXCEPTION 'fixture failed to restore identity guard';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;
-- No review table or email intent is consulted; only the historical issued benefit.
SELECT campaign_test.assert(NOT has_function_privilege('anon','public.has_review_winback_offer_v1(uuid,uuid,text)','EXECUTE'),'anonymous cannot probe benefits');
SELECT campaign_test.assert(NOT has_function_privilege('authenticated','public.has_review_winback_offer_v1(uuid,uuid,text)','EXECUTE'),'account cannot probe benefits');
SELECT campaign_test.assert(has_function_privilege('service_role','public.has_review_winback_offer_v1(uuid,uuid,text)','EXECUTE'),'service contract executable');
SET ROLE service_role;
SELECT campaign_test.assert(pg_typeof(public.has_review_winback_offer_v1(payment_contract_test.id('user',990),payment_contract_test.id('product',1),'sandbox'))::text='boolean','boolean only, no private fields');
RESET ROLE;
-- Negative privileged-fixture corruption: a stored association cannot replace payment proof.
INSERT INTO public.orders(id,order_number,user_id,customer_email,status,paid_at,merchandise_subtotal_cents,total_cents,idempotency_key,stripe_checkout_session_id)
VALUES(payment_contract_test.id('order',993),'HX-DISCLOSURE-NO-PROOF',payment_contract_test.id('user',990),'review990@example.invalid','paid',clock_timestamp()-interval '1 day',2500,2500,'disclosure-no-proof','cs_missing_proof');
INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
VALUES(payment_contract_test.id('line',993),payment_contract_test.id('order',993),notification_contract_test.id('already-available'),'synthetic-already-available','Synthetic','30ml','30mL',2500,1,2500,'{}');
INSERT INTO private.lifecycle_offers(kind,email,user_id,source_key,percent_off,coupon_id,source_order_id,source_user_id,delivery_evidence_id,delivery_revision,risk_evidence_id,risk_revision)
VALUES('review_winback','review990@example.invalid',payment_contract_test.id('user',990),'review_winback:'||payment_contract_test.id('order',993),10,'coupon_synthetic',payment_contract_test.id('order',993),payment_contract_test.id('user',990),'untrusted-id','1','untrusted-risk','1');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',990),notification_contract_test.id('already-available'),'sandbox'),'association requires exact original verified payment, not paid status');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',500),payment_contract_test.id('product',1),'sandbox'),'welcome offer never reports review incentive');
SELECT campaign_test.assert(NOT public.has_review_winback_offer_v1(payment_contract_test.id('user',510),payment_contract_test.id('product',1),'sandbox'),'cart offer never reports review incentive');
