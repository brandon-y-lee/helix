-- Execute after the checkout checkpoint, fixtures, and the two additive migrations.
BEGIN;
SET LOCAL ROLE service_role;
SELECT checkout_test.assert((SELECT order_number = 'HX-BBBBBBBBBBBB' FROM checkout_test.reserve('b',12)),
  'new Orders use the current HX prefix through the actual reservation chain');
SELECT checkout_test.assert((SELECT order_number = 'MP-AAAAAAAAAAAA' FROM checkout_test.reserve('a',11)),
  'replaying an existing Order preserves its historical number');
SELECT checkout_test.assert((SELECT count(*) = 1 FROM checkout_test.reserve('b',12)),
  'retry returns one existing Order');
DO $$ BEGIN
  PERFORM checkout_test.reserve('d',12);
  RAISE EXCEPTION 'A sibling intent incorrectly reserved the same cart generation';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'checkout already reserved for cart generation' THEN RAISE; END IF;
END $$;
RESET ROLE;
SELECT checkout_test.assert((SELECT snapshot = to_jsonb(o) FROM checkout_test.historical_order h
  JOIN public.orders o ON o.id = (h.snapshot->>'id')::uuid), 'historical Order facts remain unchanged');
SELECT checkout_test.assert((SELECT snapshot = to_jsonb(i) FROM checkout_test.historical_items h
  JOIN public.order_items i ON i.id = (h.snapshot->>'id')::uuid), 'historical Order Lines remain unchanged');
SELECT checkout_test.assert(to_regprocedure('public.fail_checkout_order_from_stripe(uuid,text)') IS NULL,
  'only the obsolete failure signature is absent');
SELECT checkout_test.assert(NOT EXISTS (
  SELECT 1 FROM checkout_test.unchanged_functions expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR (p.prosrc,p.proacl,p.proconfig,p.prosecdef)
    IS DISTINCT FROM (expected.prosrc,expected.proacl,expected.proconfig,expected.prosecdef)
), 'current reservation wrapper and session-qualified failure are unchanged');

DO $$ DECLARE signature text; role_name text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.reserve_checkout_order_snapshot(text,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)',
    'public.reserve_checkout_order_snapshot_v2(text,uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)',
    'public.fail_checkout_order_from_stripe(uuid,text,text)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM checkout_test.assert(NOT has_function_privilege(role_name, signature, 'EXECUTE'),
        role_name || ' cannot invoke ' || signature);
    END LOOP;
    PERFORM checkout_test.assert(has_function_privilege('service_role', signature, 'EXECUTE'),
      'service_role retains ' || signature);
    PERFORM checkout_test.assert((SELECT NOT prosecdef AND proconfig = ARRAY['search_path=""']
      FROM pg_proc WHERE oid = signature::regprocedure), 'invoker and fixed search path remain');
  END LOOP;
END $$;

UPDATE public.orders SET stripe_checkout_session_id = 'cs_test_current',
  checkout_attempt_token = 'a6000000-0000-4000-8000-000000000099',
  checkout_attempt_started_at = now() WHERE order_number = 'HX-BBBBBBBBBBBB';
INSERT INTO public.payment_attempts (order_id, stripe_checkout_session_id, amount_cents, idempotency_key)
SELECT id, 'cs_test_current', total_cents, 'fixture:payment-attempt' FROM public.orders WHERE order_number = 'HX-BBBBBBBBBBBB';
SET LOCAL ROLE service_role;
SELECT checkout_test.assert(NOT public.fail_checkout_order_from_stripe(
  (SELECT id FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'cs_test_stale', 'Stale failure'),
  'an out-of-order failure for a stale session cannot change the Order');
SELECT checkout_test.assert((SELECT status='pending_payment' AND checkout_attempt_token IS NOT NULL
  FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'stale event retains status and attempt lease');
SELECT checkout_test.assert(public.fail_checkout_order_from_stripe(
  (SELECT id FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'cs_test_current', 'Current failure'),
  'matching session transitions the pending Order');
SELECT checkout_test.assert(public.fail_checkout_order_from_stripe(
  (SELECT id FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'cs_test_current', 'Current failure'),
  'matching failure retry is safe');
SELECT checkout_test.assert((SELECT status='payment_failed' AND checkout_attempt_token IS NULL
  FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'current failure clears the attempt lease');
SELECT checkout_test.assert((SELECT status='failed' FROM public.payment_attempts
  WHERE stripe_checkout_session_id='cs_test_current'), 'current failure updates its Payment Attempt');
RESET ROLE;
UPDATE public.orders SET status='paid' WHERE order_number='HX-BBBBBBBBBBBB';
UPDATE public.payment_attempts SET status='paid' WHERE stripe_checkout_session_id='cs_test_current';
SET LOCAL ROLE service_role;
SELECT checkout_test.assert(NOT public.fail_checkout_order_from_stripe(
  (SELECT id FROM public.orders WHERE order_number='HX-BBBBBBBBBBBB'), 'cs_test_current', 'Delayed failure'),
  'delayed failure cannot regress a paid Order');
SELECT checkout_test.assert((SELECT status='paid' FROM public.payment_attempts
  WHERE stripe_checkout_session_id='cs_test_current'), 'paid Payment Attempt remains paid');
RESET ROLE;
ROLLBACK;
