-- Synthetic cases against the real migration and real reward-release functions.
CREATE SCHEMA single_send_test;
CREATE FUNCTION single_send_test.prepare(n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE terms jsonb:=payment_contract_test.terms(n); result jsonb; o public.orders; BEGIN
  SELECT * INTO o FROM public.orders WHERE id=payment_contract_test.id('order',n);
  IF o.discount_cents>0 THEN terms:=terms||jsonb_build_object('discountCents',o.discount_cents,
    'preTaxTotalCents',o.total_cents,'couponId','coupon_fixture'); END IF;
  result:=public.prepare_checkout_attempt_once(o.id,payment_contract_test.id('claim',n),payment_contract_test.key(n),terms);
  PERFORM public.admit_checkout_creation('acct_1Tm9WRFEzyaKzdmq',o.id,payment_contract_test.id('claim',n),payment_contract_test.key(n));
  RETURN (result->>'attemptId')::uuid;
END $$;
CREATE FUNCTION single_send_test.send(n integer) RETURNS boolean LANGUAGE sql AS $$
 SELECT public.start_checkout_attempt_send(payment_contract_test.id('order',n),
  (public.read_pending_checkout_attempt(payment_contract_test.id('order',n))->>'attemptId')::uuid,
  payment_contract_test.id('claim',n),payment_contract_test.key(n))
$$;
CREATE FUNCTION single_send_test.bind(n integer, suffix text DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$
 SELECT public.bind_checkout_attempt_session(payment_contract_test.id('order',n),
  (public.read_pending_checkout_attempt(payment_contract_test.id('order',n))->>'attemptId')::uuid,
  payment_contract_test.key(n),'cs_test_once'||coalesce(suffix,n::text),NULL)
$$;
GRANT USAGE ON SCHEMA single_send_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA single_send_test TO service_role;
SET ROLE service_role;
SELECT payment_contract_test.assert(NOT has_function_privilege('authenticated','public.start_checkout_attempt_send(uuid,uuid,uuid,text)','execute'),
  'customers cannot grant provider-send permission');
SELECT payment_contract_test.assert(NOT has_table_privilege('authenticated','private.checkout_provider_sends','select'),
  'send provenance is private');
SELECT payment_contract_test.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.checkout_provider_sends'::regclass),
  'send markers enforce RLS');
SELECT payment_contract_test.assert(NOT public.prepare_checkout_attempt(payment_contract_test.id('order',90),payment_contract_test.id('claim',90),NULL,false,payment_contract_test.key(90)),
  'old deployment cannot prepare an unfenced Session');
SELECT payment_contract_test.assert(NOT single_send_test.send(90),'pre-cutover unbound attempt is never treated as unsent');

RESET ROLE;
SELECT payment_contract_test.seed(100,true);
SET ROLE service_role;
UPDATE public.rewards_accounts SET points_balance=100 WHERE user_id=payment_contract_test.id('user',100);
UPDATE public.orders SET discount_cents=100,total_cents=2900,reward_points_redeemed=100,reward_discount_cents=100 WHERE id=payment_contract_test.id('order',100);
SELECT public.reserve_rewards_points(payment_contract_test.id('user',100),100,100,'single-send:100','Synthetic checkout',payment_contract_test.id('order',100));
SELECT single_send_test.prepare(100);
SELECT payment_contract_test.assert(single_send_test.send(100),'first permission commits before transmission');
SELECT payment_contract_test.assert(NOT single_send_test.send(100),'same request never obtains a second provider invocation');
SELECT payment_contract_test.assert(NOT public.fail_checkout_attempt(payment_contract_test.id('order',100),payment_contract_test.id('claim',100),'Transport response lost',true),
  'transport failure cannot release uncertain payment');
SELECT payment_contract_test.assert(NOT public.cancel_checkout_order_without_session(payment_contract_test.id('order',100),'Customer cancelled'),
  'unknown unbound payment cannot be cancelled locally');
SELECT payment_contract_test.assert((SELECT points_balance=0 FROM public.rewards_accounts WHERE user_id=payment_contract_test.id('user',100))
  AND (SELECT status='applied' FROM public.rewards_reservations WHERE order_id=payment_contract_test.id('order',100)),
  'unknown result retains the original reward reservation');
UPDATE public.carts SET checkout_generation=gen_random_uuid() WHERE id=payment_contract_test.id('cart',100);
SELECT payment_contract_test.assert(public.find_unresolved_checkout_order(payment_contract_test.id('cart',100))=payment_contract_test.id('order',100),
  'cart edits cannot hide the original unknown payment');
DO $$ BEGIN
  PERFORM public.reserve_checkout_order_snapshot('another-quote',NULL,payment_contract_test.id('cart',100),NULL,'USD',2500,0,500,0,3000,NULL,0,0,'sandbox','{}','[]');
  RAISE EXCEPTION 'New quote bypassed unknown payment';
EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END $$;
UPDATE public.orders SET checkout_attempt_token=NULL,checkout_attempt_started_at=NULL WHERE id=payment_contract_test.id('order',100);
SELECT payment_contract_test.assert(single_send_test.bind(100),'trusted early webhook binds after browser lease loss');
SELECT payment_contract_test.assert(single_send_test.bind(100),'same binding is idempotent');
SELECT payment_contract_test.assert(NOT single_send_test.bind(100,'contradiction'),'second Session cannot replace original mapping');
SELECT payment_contract_test.assert((SELECT stripe_checkout_session_id='cs_test_once100' FROM public.orders WHERE id=payment_contract_test.id('order',100))
  AND (SELECT stripe_checkout_session_id='cs_test_once100' FROM public.payment_attempts WHERE order_id=payment_contract_test.id('order',100)),
  'Order and Attempt share the atomic original binding');

-- A failure before the permanent send marker must remain retryable.
SELECT payment_contract_test.seed(103);
DO $$ DECLARE original jsonb; retried jsonb; claim uuid; admission jsonb; BEGIN
  original:=public.prepare_checkout_attempt_once(payment_contract_test.id('order',103),payment_contract_test.id('claim',103),payment_contract_test.key(103),payment_contract_test.terms(103));
  PERFORM payment_contract_test.assert(public.fail_checkout_attempt(payment_contract_test.id('order',103),payment_contract_test.id('claim',103),'Receipt setup failed before sending',true),
    'a definite pre-send failure uses the existing local cleanup');
  PERFORM payment_contract_test.assert((SELECT metadata->>'stripe_creation_outcome'='failed' FROM public.orders WHERE id=payment_contract_test.id('order',103)),
    'regression reproduces the failed creation marker');
  claim:=public.claim_checkout_attempt(payment_contract_test.id('order',103));
  retried:=public.prepare_checkout_attempt_once(payment_contract_test.id('order',103),claim,payment_contract_test.key(103),payment_contract_test.terms(103));
  PERFORM payment_contract_test.assert(retried->>'attemptId'=original->>'attemptId' AND retried->'contract'=original->'contract',
    'unsent retry keeps the original Attempt and accepted terms');
  admission:=public.admit_checkout_creation('acct_1Tm9WRFEzyaKzdmq',payment_contract_test.id('order',103),claim,payment_contract_test.key(103));
  PERFORM payment_contract_test.assert((admission->>'allowed')::boolean,'unsent retry restores normal creation admission');
  PERFORM payment_contract_test.assert(public.start_checkout_attempt_send(payment_contract_test.id('order',103),(retried->>'attemptId')::uuid,claim,payment_contract_test.key(103)),
    'retry permits its first provider invocation');
  PERFORM public.prepare_checkout_attempt_once(payment_contract_test.id('order',103),claim,payment_contract_test.key(103),payment_contract_test.terms(103));
  PERFORM payment_contract_test.assert((SELECT metadata->>'stripe_creation_outcome'='unknown' FROM public.orders WHERE id=payment_contract_test.id('order',103))
    AND NOT public.start_checkout_attempt_send(payment_contract_test.id('order',103),(retried->>'attemptId')::uuid,claim,payment_contract_test.key(103)),
    'preparation never reopens an already sent unknown Attempt');
END $$;

-- Editing the cart after a proven pre-send failure can prepare a new quote.
SELECT payment_contract_test.seed(104);
SELECT public.prepare_checkout_attempt_once(payment_contract_test.id('order',104),payment_contract_test.id('claim',104),payment_contract_test.key(104),payment_contract_test.terms(104));
SELECT payment_contract_test.assert(public.fail_checkout_attempt(payment_contract_test.id('order',104),payment_contract_test.id('claim',104),'Local setup failed before sending',true),
  'changed-cart regression begins with a definite unsent failure');
UPDATE public.carts SET checkout_generation=gen_random_uuid() WHERE id=payment_contract_test.id('cart',104);
SELECT payment_contract_test.seed(105);
UPDATE public.orders SET cart_id=payment_contract_test.id('cart',104),
  checkout_generation=(SELECT checkout_generation FROM public.carts WHERE id=payment_contract_test.id('cart',104))
  WHERE id=payment_contract_test.id('order',105);
SELECT single_send_test.prepare(105);
SELECT payment_contract_test.assert(single_send_test.send(105),'new quote may use the cart after a proven unsent failure');
DO $$ DECLARE claim uuid; original jsonb; BEGIN
  claim:=public.claim_checkout_attempt(payment_contract_test.id('order',104));
  original:=public.prepare_checkout_attempt_once(payment_contract_test.id('order',104),claim,payment_contract_test.key(104),payment_contract_test.terms(104));
  PERFORM public.admit_checkout_creation('acct_1Tm9WRFEzyaKzdmq',payment_contract_test.id('order',104),claim,payment_contract_test.key(104));
  PERFORM payment_contract_test.assert(NOT public.start_checkout_attempt_send(payment_contract_test.id('order',104),(original->>'attemptId')::uuid,claim,payment_contract_test.key(104)),
    'the competing old unsent Attempt cannot create after the new quote obtained permission');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM private.checkout_provider_sends s JOIN public.payment_attempts a ON a.id=s.attempt_id
    JOIN public.orders o ON o.id=a.order_id WHERE o.cart_id=payment_contract_test.id('cart',104) AND s.first_send_at IS NOT NULL),
    'changed-cart quotes retain one permitted provider invocation');
END $$;

SELECT payment_contract_test.seed(101);
SELECT single_send_test.prepare(101);
SELECT payment_contract_test.assert(public.cancel_checkout_order_without_session(payment_contract_test.id('order',101),'Cancelled before sending'),
  'proven unsent checkout can cancel normally');
SELECT payment_contract_test.assert(NOT single_send_test.send(101),'cancelled unsent checkout cannot subsequently send');
SELECT payment_contract_test.seed(102);
SELECT single_send_test.prepare(102);
SELECT single_send_test.send(102);
DO $$ BEGIN
  PERFORM public.merge_guest_cart(payment_contract_test.id('new-user',102),md5('guest:102')||md5('guest:102'));
  RAISE EXCEPTION 'Merge bypassed unknown guest payment';
EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END $$;
RESET ROLE;
