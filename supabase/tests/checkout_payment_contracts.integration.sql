-- Synthetic fixtures only; the runner refuses databases outside its labeled local container.
CREATE SCHEMA payment_contract_test;
CREATE FUNCTION payment_contract_test.assert(ok boolean, description text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', description; END IF;
END $$;
CREATE FUNCTION payment_contract_test.id(kind text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-payment-contract:' || kind || ':' || n)::uuid $$;
CREATE FUNCTION payment_contract_test.key(n integer) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT 'stripe-session:' || payment_contract_test.id('order', n) || ':initial' $$;

INSERT INTO public.system_steps VALUES ('TREAT', 3, 'core');
INSERT INTO public.products (id, slug, display_name, product_type, swatch_from, swatch_to,
  sort_order, editorial_description, editorial_how_to_use, routine_group, routine_sort, system_step_name)
VALUES (payment_contract_test.id('product',1), 'synthetic-serum', 'Synthetic serum', 'Serum',
  '#ffffff', '#ffffff', 1, 'Synthetic description', 'Synthetic guidance', 'core', 1, 'TREAT');
INSERT INTO public.product_variants (product_id, variant_key, label, price_cents, sort_order)
VALUES (payment_contract_test.id('product',1), '30ml', '30 mL', 2500, 1);

CREATE FUNCTION payment_contract_test.seed(n integer, owned boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE owner_id uuid; BEGIN
  IF owned THEN
    owner_id := payment_contract_test.id('user',n);
    INSERT INTO auth.users(id) VALUES (owner_id);
    PERFORM public.ensure_rewards_account(owner_id);
  END IF;
  INSERT INTO public.carts(id,user_id,guest_token_hash,expires_at,checkout_generation)
  VALUES (payment_contract_test.id('cart',n),owner_id,
    CASE WHEN NOT owned THEN md5('guest:' || n) || md5('guest:' || n) END,
    now()+interval '1 day',payment_contract_test.id('generation',n));
  INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity)
  VALUES (payment_contract_test.id('cart',n),payment_contract_test.id('product',1),'30ml',1);
  UPDATE public.carts SET checkout_generation=payment_contract_test.id('generation',n)
  WHERE id=payment_contract_test.id('cart',n);
  INSERT INTO public.orders(id,order_number,user_id,cart_id,merchandise_subtotal_cents,
    shipping_cents,total_cents,idempotency_key,checkout_generation,checkout_attempt_token,
    checkout_attempt_started_at,metadata)
  VALUES (payment_contract_test.id('order',n),'HX-PAYMENT-FIXTURE-' || n,owner_id,
    payment_contract_test.id('cart',n),2500,500,3000,'fixture-payment:' || n,
    payment_contract_test.id('generation',n),payment_contract_test.id('claim',n),now(),
    jsonb_build_object('stripe_idempotency_key',payment_contract_test.key(n),
      'stripe_creation_outcome','creating','shipping_rate_id','shr_fixture',
      'automatic_tax_enabled',true,'tax_behavior','exclusive'));
  INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,
    variant_label,unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
  VALUES (payment_contract_test.id('line',n),payment_contract_test.id('order',n),
    payment_contract_test.id('product',1),'synthetic-serum','Synthetic serum','30ml',
    '30 mL',2500,1,2500,'{}'::jsonb);
END $$;

CREATE FUNCTION payment_contract_test.terms(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('orderId',payment_contract_test.id('order',n),
    'accountId','acct_1Tm9WRFEzyaKzdmq','apiVersion','2026-06-24.dahlia',
    'environment','sandbox','currency','USD','customerId',NULL,
    'lines',jsonb_build_array(jsonb_build_object('lineId',payment_contract_test.id('line',n),
      'productId',payment_contract_test.id('product',1),'productSlug','synthetic-serum',
      'variantKey','30ml','quantity',1,'unitAmountCents',2500)),
    'merchandiseSubtotalCents',2500,'discountCents',0,'shippingCents',500,'preTaxTotalCents',3000,
    'couponId',NULL,'shippingRateId','shr_fixture','freeShipping',false,
    'automaticTaxEnabled',true,'taxBehavior','exclusive')
$$;
GRANT USAGE ON SCHEMA payment_contract_test TO service_role, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_contract_test TO service_role;

-- The migration must freeze eligibility from local rows that existed beforehand.
SELECT payment_contract_test.seed(0);
SELECT payment_contract_test.seed(1);
UPDATE public.orders SET stripe_checkout_session_id='cs_test_contract1'
WHERE id=payment_contract_test.id('order',1);
INSERT INTO public.payment_attempts(order_id,amount_cents,stripe_checkout_session_id,idempotency_key)
VALUES (payment_contract_test.id('order',1),3000,'cs_test_contract1','fixture-existing-attempt1');

-- Reproduce the old billing-as-shipping record before the migration snapshots it.
SELECT payment_contract_test.seed(18);
UPDATE public.orders SET status='paid',stripe_checkout_session_id='cs_test_contract18',
  stripe_payment_intent_id='pi_contract18',tax_cents=240,total_cents=3240,paid_at=now()-interval '1 day',
  shipping_name='Historical billing name',
  shipping_address='{"line1":"999 Billing St","line2":null,"city":"Billing City","state":"NY","postal_code":"10001","country":"US"}'::jsonb,
  billing_address='{"line1":"999 Billing St","line2":null,"city":"Billing City","state":"NY","postal_code":"10001","country":"US"}'::jsonb
WHERE id=payment_contract_test.id('order',18);
INSERT INTO public.payment_attempts(order_id,status,amount_cents,stripe_checkout_session_id,stripe_payment_intent_id,idempotency_key)
VALUES (payment_contract_test.id('order',18),'paid',3240,'cs_test_contract18','pi_contract18','fixture-existing-attempt18');
CREATE TABLE payment_contract_test.historical_delivery_order AS SELECT to_jsonb(o) snapshot FROM public.orders o
WHERE id=payment_contract_test.id('order',18);
GRANT SELECT ON payment_contract_test.historical_delivery_order TO service_role;

-- APPLY PAYMENT CONTRACT MIGRATION

SELECT payment_contract_test.assert(
  to_regprocedure('public.prepare_checkout_payment_contract(uuid,uuid,text,jsonb)') IS NOT NULL,
  'immutable checkout payment contract preparation exists');
SELECT payment_contract_test.assert(
  to_regprocedure('public.read_verified_checkout_delivery(uuid,text)') IS NOT NULL,
  'verified delivery facts can be reloaded independently of historical Order addresses');

CREATE FUNCTION payment_contract_test.prepare(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.prepare_checkout_payment_contract(payment_contract_test.id('order',n),
    payment_contract_test.id('claim',n),payment_contract_test.key(n),payment_contract_test.terms(n))
$$;
CREATE FUNCTION payment_contract_test.prepare_and_bind(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE contract jsonb; BEGIN
  contract := payment_contract_test.prepare(n);
  UPDATE public.orders SET stripe_checkout_session_id='cs_test_contract' || n
  WHERE id=payment_contract_test.id('order',n);
  PERFORM payment_contract_test.assert(public.bind_checkout_payment_session(payment_contract_test.id('order',n),
    (contract->>'attemptId')::uuid,'cs_test_contract' || n,payment_contract_test.key(n)),
    'the current stable attempt can bind its current Session');
  RETURN public.read_checkout_payment_contract(payment_contract_test.id('order',n),'cs_test_contract' || n);
END $$;
CREATE FUNCTION payment_contract_test.facts(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('orderId',payment_contract_test.id('order',n),
    'attemptId',(public.read_checkout_payment_contract(payment_contract_test.id('order',n),
      'cs_test_contract' || n)->>'attemptId')::uuid,
    'sessionId','cs_test_contract' || n,'contractVersion','checkout_v2',
    'paymentIntentId','pi_contract' || n,'customerId',NULL,'customerEmail','synthetic@example.invalid',
    'paymentMethodType','card',
    'currency','USD','merchandiseSubtotalCents',2500,'discountCents',0,'shippingCents',500,
    'taxCents',240,'totalCents',3240,'shippingName','Synthetic buyer',
    'shippingAddress',jsonb_build_object('line1','123 Synthetic St','line2',NULL,'city','Synthetic',
      'state','CA','postal_code','90001','country','US'),'billingAddress',NULL,
    'taxBreakdown',jsonb_build_array(jsonb_build_object('source','line',
      'lineId','li_contract' || n,'rateId','txr_fixture','amountCents',240,
      'taxableAmountCents',3000,'inclusive',false,'reason','standard_rated')))
$$;
CREATE FUNCTION payment_contract_test.finalize(n integer, overrides jsonb DEFAULT '{}'::jsonb)
RETURNS SETOF public.orders LANGUAGE sql AS $$
  SELECT * FROM public.finalize_verified_checkout_payment(payment_contract_test.id('order',n),
    (payment_contract_test.facts(n)->>'attemptId')::uuid,'cs_test_contract' || n,'checkout_v2',
    payment_contract_test.facts(n) || overrides,25)
$$;
-- Model the same real RPC effects used by the application. This helper introduces
-- no idempotence of its own: both calls must be safe under independent retries.
CREATE FUNCTION payment_contract_test.settle(n integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE paid_order public.orders%rowtype; BEGIN
  SELECT * INTO paid_order FROM payment_contract_test.finalize(n);
  PERFORM payment_contract_test.assert(paid_order.status='paid','verified finalizer returned a paid Order');
  IF paid_order.user_id IS NOT NULL THEN
    PERFORM public.award_rewards_points(paid_order.user_id,25,'purchase_earn',
      'purchase:' || paid_order.id,'Synthetic purchase reward',paid_order.id);
  END IF;
  RETURN public.clear_paid_order_cart(paid_order.id);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_contract_test TO service_role;

BEGIN;
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(public.is_legacy_checkout_session(payment_contract_test.id('order',1),
  'cs_test_contract1'),'pre-migration Session retains trusted local legacy eligibility');
SELECT payment_contract_test.assert(NOT public.is_legacy_checkout_session(payment_contract_test.id('order',1),
  'cs_test_other'),'legacy eligibility is bound to the exact historical Session');
SELECT payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',1),
  'cs_test_contract1')->>'version'='checkout_v1','historical contract is explicitly versioned locally');
SELECT payment_contract_test.assert(public.is_legacy_checkout_order(payment_contract_test.id('order',0)),
  'a historical attempt whose provider response was lost retains frozen legacy origin');
UPDATE public.orders SET metadata=jsonb_set(metadata,'{stripe_idempotency_key}',to_jsonb('different-legacy-key'::text))
WHERE id=payment_contract_test.id('order',0);
SELECT payment_contract_test.assert(NOT public.is_legacy_checkout_order(payment_contract_test.id('order',0)),
  'a new provider key cannot reuse frozen eligibility from a historical attempt');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(2);
UPDATE public.orders SET stripe_checkout_session_id='cs_test_contract2',
  metadata=metadata || '{"contract_version":"checkout_v1","legacyEligible":true}'::jsonb
WHERE id=payment_contract_test.id('order',2);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(NOT public.is_legacy_checkout_session(payment_contract_test.id('order',2),
  'cs_test_contract2'),'new provider metadata cannot opt a Session into legacy validation');
SELECT payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',2),
  'cs_test_contract2') IS NULL,'an unprepared new Session has no accepted contract');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(3);
SET LOCAL ROLE service_role;
DO $$ DECLARE first_contract jsonb; rotated_contract jsonb; BEGIN
  first_contract := payment_contract_test.prepare(3);
  PERFORM payment_contract_test.assert(first_contract->>'version'='checkout_v2'
    AND (first_contract->>'attemptId')::uuid IS NOT NULL AND first_contract->>'sessionId' IS NULL,
    'preparation persists a stable attempt before provider Session creation');
  UPDATE public.orders SET checkout_attempt_token=payment_contract_test.id('rotated',3)
  WHERE id=payment_contract_test.id('order',3);
  rotated_contract := public.prepare_checkout_payment_contract(payment_contract_test.id('order',3),
    payment_contract_test.id('rotated',3),payment_contract_test.key(3),
    payment_contract_test.terms(3)||'{"shippingCents":999}'::jsonb);
  PERFORM payment_contract_test.assert(rotated_contract=first_contract,
    'execution-claim rotation preserves exactly the same accepted contract and stable attempt');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM public.payment_attempts
    WHERE order_id=payment_contract_test.id('order',3)), 'claim retry cannot create another Payment Attempt');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(4);
SET LOCAL ROLE service_role;
DO $$ DECLARE fields jsonb; invalid jsonb; accepted boolean; BEGIN
  FOREACH fields IN ARRAY ARRAY[
    '{"merchandiseSubtotalCents":2499}'::jsonb,'{"discountCents":1}'::jsonb,
    '{"shippingCents":0}'::jsonb,'{"preTaxTotalCents":2999}'::jsonb,
    '{"environment":"live"}'::jsonb,'{"currency":"EUR"}'::jsonb
  ] LOOP
    accepted := false;
    BEGIN
      PERFORM public.prepare_checkout_payment_contract(payment_contract_test.id('order',4),
        payment_contract_test.id('claim',4),payment_contract_test.key(4),payment_contract_test.terms(4)||fields);
      accepted := true;
    EXCEPTION WHEN invalid_parameter_value OR raise_exception OR check_violation THEN NULL; END;
    PERFORM payment_contract_test.assert(NOT accepted,'accepted contract refuses mismatched canonical amounts or environment');
  END LOOP;
  invalid := jsonb_set(payment_contract_test.terms(4),'{lines,0,quantity}','2'::jsonb);
  accepted := false;
  BEGIN
    PERFORM public.prepare_checkout_payment_contract(payment_contract_test.id('order',4),
      payment_contract_test.id('claim',4),payment_contract_test.key(4),invalid);
    accepted := true;
  EXCEPTION WHEN invalid_parameter_value OR raise_exception OR check_violation THEN NULL; END;
  PERFORM payment_contract_test.assert(NOT accepted,'accepted contract refuses altered canonical line quantity');
  accepted := false;
  BEGIN
    PERFORM public.prepare_checkout_payment_contract(payment_contract_test.id('order',4),
      payment_contract_test.id('wrong-claim',4),payment_contract_test.key(4),payment_contract_test.terms(4));
    accepted := true;
  EXCEPTION WHEN invalid_parameter_value OR raise_exception OR check_violation THEN NULL; END;
  PERFORM payment_contract_test.assert(NOT accepted,'stale execution claim cannot freeze accepted terms');
  PERFORM payment_contract_test.assert((SELECT count(*)=0 FROM public.payment_attempts
    WHERE order_id=payment_contract_test.id('order',4)), 'invalid preparation has no partial Payment Attempt writes');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(5);
SET LOCAL ROLE service_role;
DO $$ DECLARE contract jsonb; accepted boolean; BEGIN
  contract := payment_contract_test.prepare_and_bind(5);
  PERFORM payment_contract_test.assert(public.bind_checkout_payment_session(payment_contract_test.id('order',5),
    (contract->>'attemptId')::uuid,'cs_test_contract5',payment_contract_test.key(5)),
    'binding the same current Session is idempotent');
  PERFORM payment_contract_test.assert(NOT public.bind_checkout_payment_session(payment_contract_test.id('order',5),
    payment_contract_test.id('wrong-attempt',5),'cs_test_contract5',payment_contract_test.key(5)),
    'a different stable attempt cannot bind the Session');
  PERFORM payment_contract_test.assert(NOT public.bind_checkout_payment_session(payment_contract_test.id('order',5),
    (contract->>'attemptId')::uuid,'cs_test_stale',payment_contract_test.key(5)),
    'a stale Session cannot bind the current attempt');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',5),
    'cs_test_stale') IS NULL, 'a different Session cannot read another attempt contract');
  accepted := false;
  BEGIN
    UPDATE private.checkout_payment_contracts SET terms='{}'::jsonb
    WHERE order_id=payment_contract_test.id('order',5);
    accepted := true;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN NULL; END;
  PERFORM payment_contract_test.assert(NOT accepted,'accepted terms cannot be mutated even by service_role');
  accepted := false;
  BEGIN
    DELETE FROM private.checkout_payment_contracts WHERE order_id=payment_contract_test.id('order',5);
    accepted := true;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN NULL; END;
  PERFORM payment_contract_test.assert(NOT accepted,'accepted terms cannot be deleted by service_role');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(6);
SET LOCAL ROLE service_role;
DO $$ DECLARE contract jsonb; paid_order public.orders%rowtype; BEGIN
  contract := payment_contract_test.prepare_and_bind(6);
  SELECT * INTO paid_order FROM payment_contract_test.finalize(6);
  PERFORM payment_contract_test.assert(paid_order.status='paid' AND paid_order.total_cents=3240
    AND paid_order.tax_cents=240,'verified final tax is persisted as paid Order facts');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',6),
    'cs_test_contract6')=contract,'settlement preserves original pre-tax accepted contract byte for byte');
  PERFORM payment_contract_test.assert((SELECT status='paid' AND amount_cents=3240 FROM public.payment_attempts
    WHERE id=(contract->>'attemptId')::uuid),'the exact stable Payment Attempt receives final payment facts');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(7);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(7);
DO $$ DECLARE changes jsonb; changed boolean; BEGIN
  FOREACH changes IN ARRAY ARRAY[
    '{"merchandiseSubtotalCents":2499}'::jsonb,'{"discountCents":100,"totalCents":3140}'::jsonb,
    '{"shippingCents":0,"totalCents":2740}'::jsonb,'{"taxCents":240,"totalCents":3241}'::jsonb,
    '{"sessionId":"cs_test_other"}'::jsonb,'{"currency":"EUR"}'::jsonb
  ] LOOP
    changed := false;
    BEGIN
      changed := EXISTS(SELECT 1 FROM payment_contract_test.finalize(7,changes));
    EXCEPTION WHEN invalid_parameter_value OR raise_exception OR check_violation THEN NULL; END;
    PERFORM payment_contract_test.assert(NOT changed,'finalization refuses facts outside the accepted payment contract');
  END LOOP;
  PERFORM payment_contract_test.assert((SELECT status='pending_payment' AND total_cents=3000 FROM public.orders
    WHERE id=payment_contract_test.id('order',7)),'invalid facts leave original Order state untouched');
END $$;
ROLLBACK;

-- Inject an actual failure after the Order write, then prove the same request can retry.
CREATE FUNCTION payment_contract_test.reject_paid_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.status='paid' THEN RAISE EXCEPTION 'synthetic payment attempt write failure'; END IF;
  RETURN NEW;
END $$;
BEGIN;
SELECT payment_contract_test.seed(8,true);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(8);
RESET ROLE;
CREATE TRIGGER synthetic_payment_failure BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION payment_contract_test.reject_paid_attempt();
SET LOCAL ROLE service_role;
DO $$ DECLARE failed boolean := false; BEGIN
  BEGIN
    PERFORM payment_contract_test.settle(8);
  EXCEPTION WHEN raise_exception THEN failed := SQLERRM='synthetic payment attempt write failure'; END;
  PERFORM payment_contract_test.assert(failed,'the deliberate payment-write failure was reached');
  PERFORM payment_contract_test.assert((SELECT status='pending_payment' AND tax_cents=0 FROM public.orders
    WHERE id=payment_contract_test.id('order',8)),'a failed attempt write rolls back the paid Order update');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM public.cart_items
    WHERE cart_id=payment_contract_test.id('cart',8)),'failed finalization preserves the cart');
  PERFORM payment_contract_test.assert((SELECT count(*)=0 FROM public.rewards_ledger_entries
    WHERE order_id=payment_contract_test.id('order',8)),'failed finalization awards no reward');
END $$;
RESET ROLE;
DROP TRIGGER synthetic_payment_failure ON public.payment_attempts;
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(payment_contract_test.settle(8)=1,'the same verified payment can retry after rollback');
SELECT payment_contract_test.assert(payment_contract_test.settle(8)=0,'repeated successful settlement does not clear again');
SELECT payment_contract_test.assert((SELECT count(*)=1 FROM public.rewards_ledger_entries
  WHERE order_id=payment_contract_test.id('order',8)),'repeated settlement produces one reward ledger entry');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(9);
SET LOCAL ROLE service_role;
DO $$ DECLARE contract jsonb; recovered jsonb; BEGIN
  contract := payment_contract_test.prepare(9);
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',9),
    'cs_test_contract9') IS NULL,'an unattached provider Session cannot bind an attempt');
  UPDATE public.orders SET stripe_checkout_session_id='cs_test_contract9'
  WHERE id=payment_contract_test.id('order',9);
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',9),
    'cs_test_wrong9') IS NULL,'recovery cannot bind a different Session than the committed Order attachment');
  UPDATE public.orders SET metadata=jsonb_set(metadata,'{stripe_idempotency_key}',to_jsonb('wrong-key'::text))
  WHERE id=payment_contract_test.id('order',9);
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',9),
    'cs_test_contract9') IS NULL,'recovery cannot bind an attempt with a mismatched current Stripe key');
  UPDATE public.orders SET metadata=jsonb_set(metadata,'{stripe_idempotency_key}',to_jsonb(payment_contract_test.key(9)))
  WHERE id=payment_contract_test.id('order',9);
  recovered := public.read_checkout_payment_contract(payment_contract_test.id('order',9),'cs_test_contract9');
  PERFORM payment_contract_test.assert(recovered=contract||'{"sessionId":"cs_test_contract9"}'::jsonb,
    'read recovers the exact attached Session after the attempt-binding response was lost');
  PERFORM payment_contract_test.assert((SELECT stripe_checkout_session_id='cs_test_contract9' FROM public.payment_attempts
    WHERE id=(contract->>'attemptId')::uuid),'attachment recovery persists the stable attempt binding');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(10);
SELECT payment_contract_test.seed(11);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(10);
DO $$ DECLARE field text; value text; denied boolean; BEGIN
  FOR field,value IN SELECT * FROM (VALUES
    ('id',payment_contract_test.id('changed-attempt',10)::text),
    ('order_id',payment_contract_test.id('order',11)::text),
    ('contract_version','checkout_v1'),('stripe_idempotency_key','changed-key'),
    ('idempotency_key','changed-attempt-key'),('currency','EUR'),
    ('stripe_checkout_session_id','cs_test_changed10')) changes(field,value)
  LOOP
    denied := false;
    BEGIN
      EXECUTE format('UPDATE public.payment_attempts SET %I=%L WHERE order_id=%L',field,value,
        payment_contract_test.id('order',10));
    EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true; END;
    PERFORM payment_contract_test.assert(denied,'the immutable identity trigger rejects changing ' || field);
  END LOOP;
  denied := false;
  BEGIN
    UPDATE public.payment_attempts SET checkout_environment=NULL
    WHERE order_id=payment_contract_test.id('order',10);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'the immutable identity trigger rejects clearing the environment');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(12);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(12);
DO $$ DECLARE identity jsonb; denied boolean := false; BEGIN
  identity := payment_contract_test.facts(12);
  PERFORM payment_contract_test.assert(NOT EXISTS(SELECT 1 FROM public.finalize_verified_checkout_payment(
    payment_contract_test.id('order',12),payment_contract_test.id('wrong-attempt',12),
    'cs_test_contract12','checkout_v2',identity,25)), 'a stale stable-attempt ID cannot finalize another payment');
  PERFORM payment_contract_test.assert(NOT EXISTS(SELECT 1 FROM public.finalize_verified_checkout_payment(
    payment_contract_test.id('order',12),(identity->>'attemptId')::uuid,
    'cs_test_wrong12','checkout_v2',identity,25)), 'a stale Session cannot finalize the current Order');
  PERFORM payment_contract_test.assert(NOT EXISTS(SELECT 1 FROM public.finalize_verified_checkout_payment(
    payment_contract_test.id('order',12),(identity->>'attemptId')::uuid,
    'cs_test_contract12','checkout_v1',identity,25)), 'provider metadata cannot select the legacy finalizer');
  BEGIN
    PERFORM public.finalize_paid_checkout_order(payment_contract_test.id('order',12),'cs_test_contract12',
      NULL,0,500,240,3240,'pi_contract12',NULL,25,'Synthetic buyer',identity->'shippingAddress',NULL,'card','paid');
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'the old public finalizer refuses new contract-version payments');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(13);
SELECT payment_contract_test.seed(14);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(13);
SELECT payment_contract_test.prepare_and_bind(14);
DO $$ DECLARE attempt_id uuid; wrong_attempt uuid; denied boolean; snapshot jsonb; BEGIN
  attempt_id := (payment_contract_test.facts(13)->>'attemptId')::uuid;
  wrong_attempt := (payment_contract_test.facts(14)->>'attemptId')::uuid;
  PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',13),attempt_id,
    'cs_test_contract13','amount_mismatch','pi_contract13','paid',3001);
  PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',13),attempt_id,
    'cs_test_contract13','amount_mismatch','pi_contract13','paid',3001);
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM private.checkout_payment_exceptions
    WHERE order_id=payment_contract_test.id('order',13)),'duplicate mismatch events have one durable exception');
  snapshot := public.read_checkout_payment_exception(payment_contract_test.id('order',13),'cs_test_contract13');
  PERFORM payment_contract_test.assert(snapshot='{"code":"amount_mismatch","paymentStatus":"paid","paymentIntentId":"pi_contract13","amountCents":3001}'::jsonb,
    'exception read exposes only bounded status, reference and amount fields');
  PERFORM payment_contract_test.assert((SELECT status='pending_payment' FROM public.orders
    WHERE id=payment_contract_test.id('order',13)),'an observed provider payment with mismatched facts is not locally finalized');
  denied := false;
  BEGIN
    PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',13),wrong_attempt,
      'cs_test_contract13','amount_mismatch','pi_contract13','paid',3001);
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'exception references cannot cross Order ownership');
  denied := false;
  BEGIN
    PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',13),attempt_id,
      'cs_test_contract13','provider says synthetic@example.invalid','pi_contract13','paid',3001);
  EXCEPTION WHEN check_violation THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'raw provider error text cannot enter bounded exception codes');
  PERFORM public.resolve_checkout_payment_exceptions(payment_contract_test.id('order',13),'cs_test_contract13');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_exception(payment_contract_test.id('order',13),
    'cs_test_contract13') IS NULL,'resolving an exception clears the active state');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 AND bool_and(resolved_at IS NOT NULL)
    FROM private.checkout_payment_exceptions WHERE order_id=payment_contract_test.id('order',13)),
    'resolution preserves durable mismatch history');
  PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',13),attempt_id,
    'cs_test_contract13','full_refund_reconciliation_failed','pi_contract13','refunded',3240);
  PERFORM public.resolve_checkout_payment_exceptions(payment_contract_test.id('order',13),'cs_test_contract13');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_exception(payment_contract_test.id('order',13),
    'cs_test_contract13')->>'code'='full_refund_reconciliation_failed',
    'ordinary payment reconciliation cannot erase an unresolved refund failure');
  PERFORM public.resolve_checkout_payment_exceptions(payment_contract_test.id('order',13),'cs_test_contract13',
    'full_refund_reconciliation_failed');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_exception(payment_contract_test.id('order',13),
    'cs_test_contract13') IS NULL,'explicit refund recovery can resolve its own exception');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(15,true);
SELECT payment_contract_test.seed(16,true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',payment_contract_test.id('user',15)::text,true);
SELECT payment_contract_test.assert((SELECT count(*)=1 FROM public.orders),'authenticated RLS permits only owned Orders');
SELECT payment_contract_test.assert((SELECT count(*)=1 FROM public.order_items),'authenticated RLS permits only owned Order items');
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    PERFORM 1 FROM private.checkout_payment_contracts;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'an authenticated browser cannot read private accepted terms');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    PERFORM 1 FROM private.checkout_payment_exceptions;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'anonymous clients cannot read payment exceptions');
  denied := false;
  BEGIN
    PERFORM public.record_checkout_payment_exception(payment_contract_test.id('order',15),NULL,
      'cs_test_contract15','missing_contract',NULL,'unknown',NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'anonymous clients cannot write provider exceptions');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE contract jsonb; verified_facts jsonb; paid_order public.orders%rowtype; BEGIN
  contract := public.read_checkout_payment_contract(payment_contract_test.id('order',1),'cs_test_contract1');
  verified_facts := payment_contract_test.facts(1)||'{"contractVersion":"checkout_v1","paymentMethodType":"us_bank_account"}'::jsonb;
  SELECT * INTO paid_order FROM public.finalize_verified_checkout_payment(payment_contract_test.id('order',1),
    (contract->>'attemptId')::uuid,'cs_test_contract1','checkout_v1',verified_facts,25);
  PERFORM payment_contract_test.assert(paid_order.status='paid'
    AND paid_order.metadata->>'payment_method_type'='us_bank_account',
    'a verified historical delayed payment preserves its actual payment method');
  PERFORM payment_contract_test.assert((SELECT metadata->>'payment_method_type'='us_bank_account'
    FROM public.payment_attempts WHERE id=(contract->>'attemptId')::uuid),
    'historical Payment Attempt keeps the verified method instead of claiming card');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(17);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(17);
SELECT status FROM payment_contract_test.finalize(17);
RESET ROLE;
DO $$ DECLARE denied boolean; relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['checkout_payment_contracts','checkout_verified_payments'] LOOP
    denied := false;
    BEGIN
      EXECUTE format('DELETE FROM private.%I WHERE order_id=%L',relation_name,payment_contract_test.id('order',17));
    EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true; END;
    PERFORM payment_contract_test.assert(denied,'immutable facts remain protected even when table grants are bypassed');
  END LOOP;
  denied := false;
  BEGIN
    UPDATE private.checkout_payment_contracts SET terms='{}'::jsonb
    WHERE order_id=payment_contract_test.id('order',17);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'the trigger prevents accepted-term rewrites beyond revoked service grants');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE accepted jsonb; verified_facts jsonb; expected_delivery jsonb; changed jsonb; denied boolean; BEGIN
  accepted := public.read_checkout_payment_contract(payment_contract_test.id('order',18),'cs_test_contract18');
  verified_facts := payment_contract_test.facts(18)||jsonb_build_object('contractVersion','checkout_v1',
    'billingAddress',(SELECT snapshot->'billing_address' FROM payment_contract_test.historical_delivery_order));
  expected_delivery := jsonb_build_object('shippingName',verified_facts->'shippingName',
    'shippingAddress',verified_facts->'shippingAddress','billingAddress',verified_facts->'billingAddress');
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_contract18') IS NULL,'an old paid flag alone does not establish verified delivery facts');
  PERFORM public.finalize_verified_checkout_payment(payment_contract_test.id('order',18),
    (accepted->>'attemptId')::uuid,'cs_test_contract18','checkout_v1',verified_facts,25);
  PERFORM payment_contract_test.assert((SELECT to_jsonb(o)=history.snapshot FROM public.orders o
    CROSS JOIN payment_contract_test.historical_delivery_order history WHERE o.id=payment_contract_test.id('order',18)),
    'reverification preserves the complete historical paid Order without rewriting its old billing-as-shipping record');
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_contract18')=expected_delivery,'reload returns the verified collected shipping address separately from billing');
  PERFORM payment_contract_test.assert((SELECT shipping_name=verified_facts->>'shippingName'
    AND shipping_address=verified_facts->'shippingAddress' AND billing_address=verified_facts->'billingAddress'
    FROM private.checkout_verified_payments WHERE order_id=payment_contract_test.id('order',18)),
    'verified delivery is durably stored with the immutable payment proof');
  PERFORM public.finalize_verified_checkout_payment(payment_contract_test.id('order',18),
    (accepted->>'attemptId')::uuid,'cs_test_contract18','checkout_v1',verified_facts,25);
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM private.checkout_verified_payments
    WHERE order_id=payment_contract_test.id('order',18)),'duplicate historical revalidation creates one verified delivery record');
  FOREACH changed IN ARRAY ARRAY[
    verified_facts||'{"shippingName":"Changed recipient"}'::jsonb,
    jsonb_set(verified_facts,'{shippingAddress,line1}','"999 Different Shipping St"'::jsonb),
    jsonb_set(verified_facts,'{billingAddress,line1}','"999 Different Billing St"'::jsonb)
  ] LOOP
    denied := false;
    BEGIN
      PERFORM public.finalize_verified_checkout_payment(payment_contract_test.id('order',18),
        (accepted->>'attemptId')::uuid,'cs_test_contract18','checkout_v1',changed,25);
    EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
    PERFORM payment_contract_test.assert(denied,'a duplicate verification cannot rewrite accepted delivery facts');
  END LOOP;
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_contract18')=expected_delivery,'rejected duplicate addresses preserve the original verified delivery');
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_wrong18') IS NULL,'verified delivery does not cross Session identity');
  UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',18);
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_contract18')=expected_delivery,'verified historical delivery remains available after refund');
  UPDATE public.orders SET status='pending_payment' WHERE id=payment_contract_test.id('order',18);
  PERFORM payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',18),
    'cs_test_contract18') IS NULL,'a nonterminal Order cannot expose delivery via a stale verified proof');
END $$;
ROLLBACK;

CREATE FUNCTION payment_contract_test.reject_verified_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'synthetic verified delivery persistence failure';
END $$;
BEGIN;
SELECT payment_contract_test.seed(19,true);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(19);
RESET ROLE;
CREATE TRIGGER synthetic_verified_delivery_failure BEFORE INSERT ON private.checkout_verified_payments
FOR EACH ROW EXECUTE FUNCTION payment_contract_test.reject_verified_insert();
SET LOCAL ROLE service_role;
DO $$ DECLARE failed boolean := false; BEGIN
  BEGIN
    PERFORM payment_contract_test.settle(19);
  EXCEPTION WHEN raise_exception THEN failed := SQLERRM='synthetic verified delivery persistence failure'; END;
  PERFORM payment_contract_test.assert(failed,'the deliberate verified-delivery persistence failure was reached');
  PERFORM payment_contract_test.assert((SELECT status='pending_payment' AND tax_cents=0 FROM public.orders
    WHERE id=payment_contract_test.id('order',19)),'failed verification persistence rolls back the Order payment transition');
  PERFORM payment_contract_test.assert((SELECT status='requires_payment' FROM public.payment_attempts
    WHERE order_id=payment_contract_test.id('order',19)),'failed verification persistence rolls back the Payment Attempt transition');
  PERFORM payment_contract_test.assert((SELECT count(*)=0 FROM private.checkout_verified_payments
    WHERE order_id=payment_contract_test.id('order',19)),'failed verification leaves no partial payment or delivery proof');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM public.cart_items
    WHERE cart_id=payment_contract_test.id('cart',19)),'failed verification persistence preserves the cart');
  PERFORM payment_contract_test.assert((SELECT count(*)=0 FROM public.rewards_ledger_entries
    WHERE order_id=payment_contract_test.id('order',19)),'failed verification persistence awards no reward');
END $$;
RESET ROLE;
DROP TRIGGER synthetic_verified_delivery_failure ON private.checkout_verified_payments;
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(payment_contract_test.settle(19)=1,'the same verified delivery can retry after persistence rollback');
SELECT payment_contract_test.assert(public.read_verified_checkout_delivery(payment_contract_test.id('order',19),'cs_test_contract19')
  =jsonb_build_object('shippingName',payment_contract_test.facts(19)->'shippingName',
    'shippingAddress',payment_contract_test.facts(19)->'shippingAddress','billingAddress',NULL),
  'successful retry durably reloads verified delivery with a nullable billing address');
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    PERFORM public.read_verified_checkout_delivery(payment_contract_test.id('order',18),'cs_test_contract18');
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'anonymous clients cannot invoke verified delivery lookup');
  denied := false;
  BEGIN
    PERFORM shipping_name,shipping_address,billing_address FROM private.checkout_verified_payments;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'anonymous clients cannot read private verified delivery columns');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    PERFORM public.read_verified_checkout_delivery(payment_contract_test.id('order',18),'cs_test_contract18');
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'authenticated clients cannot bypass server ownership checks through delivery lookup');
  denied := false;
  BEGIN
    PERFORM shipping_name,shipping_address,billing_address FROM private.checkout_verified_payments;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'authenticated clients cannot read private verified delivery columns');
END $$;
ROLLBACK;

DO $$ DECLARE signature text; role_name text; relation_name text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.prepare_checkout_payment_contract(uuid,uuid,text,jsonb)',
    'public.bind_checkout_payment_session(uuid,uuid,text,text)',
    'public.read_checkout_payment_contract(uuid,text)',
    'public.read_verified_checkout_delivery(uuid,text)',
    'public.is_legacy_checkout_session(uuid,text)',
    'public.is_legacy_checkout_order(uuid)',
    'public.record_checkout_payment_exception(uuid,uuid,text,text,text,text,integer)',
    'public.read_checkout_payment_exception(uuid,text)',
    'public.resolve_checkout_payment_exceptions(uuid,text,text)',
    'public.finalize_verified_checkout_payment(uuid,uuid,text,text,jsonb,integer)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM payment_contract_test.assert(NOT has_function_privilege(role_name,signature,'EXECUTE'),
        role_name || ' cannot invoke payment contract RPC ' || signature);
    END LOOP;
    PERFORM payment_contract_test.assert(has_function_privilege('service_role',signature,'EXECUTE'),
      'trusted server can invoke ' || signature);
    PERFORM payment_contract_test.assert((SELECT proconfig=ARRAY['search_path=""']
      FROM pg_proc WHERE oid=signature::regprocedure),'payment contract RPC has a fixed empty search path');
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['private.checkout_payment_contracts','private.checkout_legacy_contracts',
    'private.checkout_payment_exceptions','private.checkout_verified_payments','private.checkout_legacy_order_origins'] LOOP
    PERFORM payment_contract_test.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
      WHERE oid=relation_name::regclass),'private contracts retain forced RLS');
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM payment_contract_test.assert(NOT has_table_privilege(role_name,relation_name,'SELECT,INSERT,UPDATE,DELETE'),
        role_name || ' cannot read or write private contracts');
    END LOOP;
  END LOOP;
  PERFORM payment_contract_test.assert(NOT has_table_privilege('service_role','private.checkout_legacy_contracts','INSERT'),
    'the application cannot mint new legacy eligibility after migration');
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    PERFORM public.read_checkout_payment_contract(payment_contract_test.id('order',1),'cs_test_contract1');
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM payment_contract_test.assert(denied,'an authenticated browser cannot invoke privileged contract lookup');
END $$;
ROLLBACK;
