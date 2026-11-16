-- Synthetic data only, loaded by the labeled disposable PostgreSQL runner.
CREATE SCHEMA email_contract_test;
CREATE FUNCTION email_contract_test.assert(ok boolean, description text) RETURNS void
LANGUAGE sql AS $$ SELECT payment_contract_test.assert(ok, description) $$;
GRANT USAGE ON SCHEMA email_contract_test TO service_role, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA email_contract_test TO service_role, anon, authenticated;

SELECT payment_contract_test.seed(201);
SELECT payment_contract_test.seed(202);
SET ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(201);
SELECT payment_contract_test.prepare_and_bind(202);
SELECT status FROM payment_contract_test.finalize(202);
RESET ROLE;
UPDATE public.orders SET created_at=now()-interval '1 day'
WHERE id IN (payment_contract_test.id('order',201),payment_contract_test.id('order',202));

-- APPLY ORDER EMAIL MIGRATION

SELECT email_contract_test.assert((SELECT NOT enabled FROM private.email_controls
  WHERE environment='sandbox' AND purpose='order_confirmation'), 'confirmation starts disabled');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'installation never backfills old paid Orders');

BEGIN;
SELECT payment_contract_test.seed(203);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(203);
SELECT status FROM payment_contract_test.finalize(203);
RESET ROLE;
SELECT email_contract_test.assert((SELECT status='paid' FROM public.orders
  WHERE id=payment_contract_test.id('order',203)), 'disabled email does not block payment');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'disabled email produces no delivery intent');
ROLLBACK;



-- Administrative controls are set only inside this disposable synthetic database.
UPDATE private.email_controls SET enabled=true,accepted_after=now()
WHERE environment='sandbox' AND purpose='order_confirmation';
BEGIN;
SET LOCAL ROLE service_role;
SELECT status FROM payment_contract_test.finalize(201);
SELECT status FROM payment_contract_test.finalize(202);
RESET ROLE;
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.email_intents),
  'historical accepted Orders and already-paid replays never gain a confirmation');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(204,true);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(204);
RESET ROLE;
UPDATE public.orders SET shipping_name='Untrusted old order name',
  shipping_address='{"line1":"999 Old billing address"}'::jsonb
WHERE id=payment_contract_test.id('order',204);
SET LOCAL ROLE service_role;
SELECT status FROM payment_contract_test.finalize(204);
SELECT status FROM payment_contract_test.finalize(204);
RESET ROLE;
SELECT email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
  WHERE order_id=payment_contract_test.id('order',204)), 'repeated verification persists one logical message');
SELECT email_contract_test.assert((SELECT environment='sandbox' AND purpose='order_confirmation'
  AND recipient='synthetic@example.invalid' AND receipt->>'orderNumber'='HX-PAYMENT-FIXTURE-204'
  AND receipt->>'currency'='USD' AND receipt->>'shippingName'='Synthetic buyer'
  AND receipt#>>'{shippingAddress,line1}'='123 Synthetic St'
  AND receipt->'items'='[{"name":"Synthetic serum — 30 mL","quantity":1,"unitPriceCents":2500,"lineSubtotalCents":2500}]'::jsonb
  AND (receipt->>'merchandiseSubtotalCents')::integer=2500 AND (receipt->>'discountCents')::integer=0
  AND (receipt->>'shippingCents')::integer=500 AND (receipt->>'taxCents')::integer=240
  AND (receipt->>'totalCents')::integer=3240
  FROM private.email_intents WHERE order_id=payment_contract_test.id('order',204)),
  'receipt freezes verified customer delivery and original Order items with final totals');
UPDATE public.orders SET status='refunded',refunded_at=now()
WHERE id=payment_contract_test.id('order',204);
SET LOCAL ROLE service_role;
SELECT status FROM payment_contract_test.finalize(204);
RESET ROLE;
SELECT email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
  WHERE order_id=payment_contract_test.id('order',204)), 'refund and subsequent payment replay do not add a confirmation');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(205);
SELECT payment_contract_test.seed(206);
SELECT payment_contract_test.seed(214);
SELECT payment_contract_test.seed(215);
SELECT payment_contract_test.seed(216);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(205);
SELECT payment_contract_test.prepare_and_bind(206);
SELECT payment_contract_test.prepare_and_bind(214);
SELECT payment_contract_test.prepare_and_bind(215);
SELECT payment_contract_test.prepare_and_bind(216);
SELECT status FROM payment_contract_test.finalize(205,'{"customerEmail":null}'::jsonb);
SELECT status FROM payment_contract_test.finalize(206,'{"customerEmail":"not an email"}'::jsonb);
SELECT status FROM payment_contract_test.finalize(214,'{"customerEmail":"one,two@example.invalid"}'::jsonb);
SELECT status FROM payment_contract_test.finalize(215,'{"customerEmail":"name(comment)@example.invalid"}'::jsonb);
SELECT status FROM payment_contract_test.finalize(216,'{"customerEmail":"name@invalid_domain.example"}'::jsonb);
RESET ROLE;
SELECT email_contract_test.assert((SELECT count(*)=5 AND bool_and(status='paid') FROM public.orders
  WHERE id IN (payment_contract_test.id('order',205),payment_contract_test.id('order',206),
    payment_contract_test.id('order',214),payment_contract_test.id('order',215),payment_contract_test.id('order',216))),
  'missing and malformed customer emails never reject legitimate settlement');
SELECT email_contract_test.assert((SELECT count(*)=5 AND bool_and(state='unsendable') FROM private.email_intents
  WHERE order_id IN (payment_contract_test.id('order',205),payment_contract_test.id('order',206),
    payment_contract_test.id('order',214),payment_contract_test.id('order',215),payment_contract_test.id('order',216))),
  'invalid recipients remain inspectable as unsendable and are never replaced');
ROLLBACK;

CREATE FUNCTION email_contract_test.reject_intent_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'synthetic email intent insert failure';
END $$;
BEGIN;
SELECT payment_contract_test.seed(207,true);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(207);
RESET ROLE;
CREATE TRIGGER synthetic_email_intent_failure BEFORE INSERT ON private.email_intents
FOR EACH ROW EXECUTE FUNCTION email_contract_test.reject_intent_insert();
SET LOCAL ROLE service_role;
DO $$ DECLARE rejected boolean := false; BEGIN
  BEGIN
    PERFORM payment_contract_test.settle(207);
  EXCEPTION WHEN raise_exception THEN rejected := SQLERRM='synthetic email intent insert failure'; END;
  PERFORM email_contract_test.assert(rejected,'the deliberate intent-persistence failure was reached');
END $$;
RESET ROLE;
SELECT email_contract_test.assert((SELECT status='pending_payment' FROM public.orders
  WHERE id=payment_contract_test.id('order',207)), 'intent failure rolls back paid Order state');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.checkout_verified_payments
  WHERE order_id=payment_contract_test.id('order',207)), 'intent failure rolls back immutable verified payment proof');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.email_intents
  WHERE order_id=payment_contract_test.id('order',207)), 'intent failure leaves no partial intent');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM public.rewards_ledger_entries
  WHERE order_id=payment_contract_test.id('order',207)), 'intent failure awards no reward');
SELECT email_contract_test.assert((SELECT count(*)=1 FROM public.cart_items
  WHERE cart_id=payment_contract_test.id('cart',207)), 'intent failure preserves the original cart');
DROP TRIGGER synthetic_email_intent_failure ON private.email_intents;
SET LOCAL ROLE service_role;
SELECT email_contract_test.assert(payment_contract_test.settle(207)=1,
  'the same verified payment safely retries after transactional rollback');
RESET ROLE;
SELECT email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
  WHERE order_id=payment_contract_test.id('order',207)), 'successful retry commits one intent');
ROLLBACK;

-- Execute browser calls as the real roles, in addition to examining grants.
BEGIN;
SELECT payment_contract_test.seed(208,true);
SELECT payment_contract_test.seed(209,true);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(208);
SELECT status FROM payment_contract_test.finalize(208);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',payment_contract_test.id('user',209)::text,true);
DO $$ DECLARE relation_name text; denied boolean; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['email_controls','email_intents'] LOOP
    denied := false;
    BEGIN EXECUTE format('SELECT 1 FROM private.%I',relation_name);
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    PERFORM email_contract_test.assert(denied,'authenticated client cannot read private ' || relation_name);
  END LOOP;
  denied := false;
  BEGIN PERFORM public.claim_email_intents('sandbox',payment_contract_test.id('lease',208),1);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'authenticated client cannot claim another customer delivery');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN PERFORM public.claim_email_intents('sandbox',payment_contract_test.id('lease',208),1);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'anonymous client cannot claim delivery');
  denied := false;
  BEGIN PERFORM 1 FROM private.email_intents;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'anonymous client cannot read recipient or receipt data');
END $$;
RESET ROLE;
SELECT email_contract_test.assert((SELECT bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class WHERE oid IN ('private.email_controls'::regclass,'private.email_intents'::regclass,
    'private.email_event_receipts'::regclass)),
  'private email tables enable and force RLS');
SELECT email_contract_test.assert((SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('claim_email_intents','prepare_email_attempt',
    'finish_email_attempt','record_email_delivery_event','inspect_email_deliveries','retry_email_delivery',
    'configure_order_confirmation_email','read_order_confirmation_email_control')),
  'all email operational RPCs are service-only');
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE control jsonb; changed jsonb; activation_started_at timestamptz; BEGIN
  control := public.read_order_confirmation_email_control();
  PERFORM email_contract_test.assert(public.configure_order_confirmation_email(false,
    (control->>'acceptedAfter')::timestamptz,(control->>'updatedAt')::timestamptz),
    'operator can disable email using the current control version');
  PERFORM email_contract_test.assert(NOT public.configure_order_confirmation_email(true,
    (control->>'acceptedAfter')::timestamptz,(control->>'updatedAt')::timestamptz),
    'a stale operator update cannot overwrite the current activation control');
  changed := public.read_order_confirmation_email_control();
  PERFORM email_contract_test.assert(NOT public.configure_order_confirmation_email(true,
    (changed->>'acceptedAfter')::timestamptz-interval '1 day',(changed->>'updatedAt')::timestamptz),
    'operator cannot move the activation boundary backwards to backfill old Orders');
  activation_started_at := clock_timestamp();
  PERFORM email_contract_test.assert(public.configure_order_confirmation_email(true,
    (changed->>'acceptedAfter')::timestamptz,(changed->>'updatedAt')::timestamptz),
    'operator can activate a new forward-only confirmation boundary');
  changed := public.read_order_confirmation_email_control();
  PERFORM email_contract_test.assert((changed->>'enabled')::boolean
    AND (changed->>'acceptedAfter')::timestamptz>=activation_started_at,
    'reactivation clamps the accepted boundary to its actual activation time');
END $$;
ROLLBACK;

CREATE FUNCTION email_contract_test.payload(recipient text, message_id uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('from','Helix Demo <onboarding@resend.dev>','to',jsonb_build_array(recipient),
    'subject','Demo order confirmation','reply_to','support@example.invalid',
    'html','<p>A synthetic payment was verified. No real charge or shipment.</p>',
    'text','A synthetic payment was verified. No real charge or shipment.',
    'tags',jsonb_build_array(jsonb_build_object('name','helix_environment','value','sandbox'),
      jsonb_build_object('name','helix_message_id','value',message_id::text)))
$$;
GRANT EXECUTE ON FUNCTION email_contract_test.payload(text,uuid) TO service_role;

BEGIN;
SELECT payment_contract_test.seed(210);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(210);
SELECT status FROM payment_contract_test.finalize(210);
DO $$ DECLARE work jsonb; prepared jsonb; first_attempt jsonb; changed jsonb; denied boolean := false; BEGIN
  work := public.claim_email_intents('sandbox',payment_contract_test.id('lease',210),1)->0;
  PERFORM email_contract_test.assert(work->>'recipient'='synthetic@example.invalid',
    'dispatcher claims the immutable actual recipient');
  PERFORM email_contract_test.assert(public.prepare_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('wrong-lease',210),email_contract_test.payload(work->>'recipient',(work->>'id')::uuid)) IS NULL,
    'another worker cannot prepare a leased message');
  FOREACH changed IN ARRAY ARRAY[
    '{"to":["different@example.invalid"]}'::jsonb,
    '{"tags":[{"name":"helix_environment","value":"live"}]}'::jsonb,
    '{"cc":["unexpected@example.invalid"]}'::jsonb
  ] LOOP
    denied := false;
    BEGIN
      PERFORM public.prepare_email_attempt((work->>'id')::uuid,payment_contract_test.id('lease',210),
        email_contract_test.payload(work->>'recipient',(work->>'id')::uuid)||changed);
    EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
    PERFORM email_contract_test.assert(denied,'prepared requests cannot change recipients, correlation tags or add CC');
  END LOOP;
  PERFORM email_contract_test.assert((SELECT attempt_count=0 AND first_attempt_at IS NULL AND request_payload IS NULL
    FROM private.email_intents WHERE id=(work->>'id')::uuid),
    'rejected envelopes do not consume a provider attempt or freeze an invalid request');
  prepared := public.prepare_email_attempt((work->>'id')::uuid,payment_contract_test.id('lease',210),
    email_contract_test.payload(work->>'recipient',(work->>'id')::uuid));
  first_attempt := prepared->'firstAttemptAt';
  PERFORM email_contract_test.assert((prepared->>'attemptCount')::integer=1 AND first_attempt<>'null'::jsonb
    AND prepared->'requestPayload'=email_contract_test.payload(work->>'recipient',(work->>'id')::uuid),
    'durable payload and attempt identity are recorded before provider I/O');
  denied := false;
  BEGIN
    PERFORM public.prepare_email_attempt((work->>'id')::uuid,payment_contract_test.id('lease',210),
      email_contract_test.payload(work->>'recipient',(work->>'id')::uuid)||'{"subject":"Changed receipt"}'::jsonb);
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'a retry cannot change the frozen provider request');
  PERFORM email_contract_test.assert(NOT public.finish_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('wrong-lease',210),'accepted','email_synthetic_210',null),
    'another worker cannot complete a leased message');
  PERFORM email_contract_test.assert(public.finish_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('lease',210),'uncertain',null,'provider_timeout'),
    'a lost provider response persists uncertainty independently of payment');
  PERFORM email_contract_test.assert(jsonb_array_length(public.claim_email_intents('sandbox',
    payment_contract_test.id('retry-too-soon',210),1))=0,'retry backoff prevents immediate reclaim');
  UPDATE private.email_intents SET next_attempt_at=now()-interval '1 second' WHERE id=(work->>'id')::uuid;
  work := public.claim_email_intents('sandbox',payment_contract_test.id('retry-lease',210),1)->0;
  prepared := public.prepare_email_attempt((work->>'id')::uuid,payment_contract_test.id('retry-lease',210),
    work->'requestPayload');
  PERFORM email_contract_test.assert((prepared->>'attemptCount')::integer=2
    AND prepared->'firstAttemptAt'=first_attempt,
    'uncertain retry keeps the same first attempt and request inside provider idempotency window');
  PERFORM email_contract_test.assert(public.finish_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('retry-lease',210),'accepted','email_synthetic_210',null),
    'current retry can record the provider acceptance');
  PERFORM email_contract_test.assert(jsonb_array_length(public.claim_email_intents('sandbox',
    payment_contract_test.id('third-lease',210),1))=0,'accepted messages are never sent again');
END $$;
RESET ROLE;
SELECT email_contract_test.assert((SELECT status='paid' FROM public.orders
  WHERE id=payment_contract_test.id('order',210)), 'delivery uncertainty never reverses financial settlement');
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(211);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(211);
SELECT status FROM payment_contract_test.finalize(211);
DO $$ DECLARE work jsonb; reclaimed jsonb; BEGIN
  work := public.claim_email_intents('sandbox',payment_contract_test.id('lease',211),1)->0;
  UPDATE private.email_intents SET lease_expires_at=now()-interval '1 second' WHERE id=(work->>'id')::uuid;
  reclaimed := public.claim_email_intents('sandbox',payment_contract_test.id('new-lease',211),1)->0;
  PERFORM email_contract_test.assert(reclaimed->>'id'=work->>'id' AND (reclaimed->>'attemptCount')::integer=0,
    'an expired claim with no attempt is safely reclaimed');
  PERFORM email_contract_test.assert(public.prepare_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('lease',211),email_contract_test.payload(work->>'recipient',(work->>'id')::uuid)) IS NULL,
    'a stale worker cannot prepare after a new worker claims');
  PERFORM email_contract_test.assert(NOT public.finish_email_attempt((work->>'id')::uuid,
    payment_contract_test.id('lease',211),'blocked',null,'recipient_not_allowed'),
    'a stale worker cannot overwrite the replacement worker outcome');
  -- Model a crashed old attempt without changing a previously frozen attempt clock.
  UPDATE private.email_intents SET first_attempt_at=now()-interval '24 hours',attempt_count=1,
    request_payload=email_contract_test.payload(recipient,id),lease_expires_at=now()-interval '1 second'
    WHERE id=(work->>'id')::uuid;
  PERFORM email_contract_test.assert(jsonb_array_length(public.claim_email_intents('sandbox',
    payment_contract_test.id('expired-window',211),1))=0,
    'an uncertain send outside the provider window is never blindly retried');
  PERFORM email_contract_test.assert((SELECT state='uncertain' AND error_code='reconciliation_required'
    AND lease_token IS NULL FROM private.email_intents WHERE id=(work->>'id')::uuid),
    'an expired idempotency window becomes inspectable reconciliation work');
  PERFORM email_contract_test.assert(NOT public.retry_email_delivery((work->>'id')::uuid,
    (SELECT updated_at FROM private.email_intents WHERE id=(work->>'id')::uuid)),
    'manual retry cannot bypass expired idempotency protection');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(212);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(212);
SELECT status FROM payment_contract_test.finalize(212);
DO $$ DECLARE work jsonb; current_lease uuid; n integer; BEGIN
  FOR n IN 1..5 LOOP
    current_lease := payment_contract_test.id('attempt-lease',212+n);
    work := public.claim_email_intents('sandbox',current_lease,1)->0;
    PERFORM public.prepare_email_attempt((work->>'id')::uuid,current_lease,
      email_contract_test.payload(work->>'recipient',(work->>'id')::uuid));
    PERFORM public.finish_email_attempt((work->>'id')::uuid,current_lease,'uncertain',null,'provider_timeout');
    UPDATE private.email_intents SET next_attempt_at=now()-interval '1 second' WHERE id=(work->>'id')::uuid;
  END LOOP;
  PERFORM email_contract_test.assert(jsonb_array_length(public.claim_email_intents('sandbox',
    payment_contract_test.id('sixth-lease',212),1))=0,'bounded retries stop after five provider attempts');
  PERFORM email_contract_test.assert((SELECT attempt_count=5 AND state='uncertain' FROM private.email_intents
    WHERE id=(work->>'id')::uuid),'exhausted uncertain work remains visible without repeated sending');
END $$;
ROLLBACK;

BEGIN;
SELECT payment_contract_test.seed(213);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.prepare_and_bind(213);
SELECT status FROM payment_contract_test.finalize(213);
DO $$ DECLARE work jsonb; message_id uuid; denied boolean := false; BEGIN
  work := public.claim_email_intents('sandbox',payment_contract_test.id('lease',213),1)->0;
  message_id := (work->>'id')::uuid;
  PERFORM public.prepare_email_attempt(message_id,payment_contract_test.id('lease',213),
    email_contract_test.payload(work->>'recipient',(work->>'id')::uuid));
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_wrong_envelope','sandbox',
    message_id,'email_synthetic_213','email.delivered',now(),'attacker@example.invalid',work->>'recipient')='unmatched',
    'a callback cannot correlate another sender to a prepared request');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_delivered','sandbox',
    message_id,'email_synthetic_213','email.delivered',now(),'Helix Demo <onboarding@resend.dev>',work->>'recipient')='matched',
    'a matching callback can reconcile acceptance before the lost send response returns');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_delivered','sandbox',
    message_id,'email_synthetic_213','email.delivered',now(),'Helix Demo <onboarding@resend.dev>',work->>'recipient')='duplicate',
    'a repeated provider event is durably deduplicated');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_late_sent','sandbox',
    message_id,'email_synthetic_213','email.sent',now()-interval '1 minute',
    'Helix Demo <onboarding@resend.dev>',work->>'recipient')='matched','out-of-order sent callbacks are accepted');
  PERFORM email_contract_test.assert((SELECT delivery_status='delivered' AND state='accepted'
    FROM private.email_intents WHERE id=message_id),'an older sent callback cannot regress delivered status');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_conflicting_provider','sandbox',
    message_id,'email_other_213','email.delivered',now(),'Helix Demo <onboarding@resend.dev>',work->>'recipient')='conflict',
    'another provider identity cannot replace the accepted one');
  PERFORM email_contract_test.assert(public.finish_email_attempt(message_id,payment_contract_test.id('lease',213),
    'uncertain',null,'provider_timeout'),'late worker result may close its current lease');
  PERFORM email_contract_test.assert((SELECT state='accepted' AND provider_email_id='email_synthetic_213'
    FROM private.email_intents WHERE id=message_id),'late timeout cannot overwrite verified provider acceptance');
  BEGIN
    PERFORM public.record_email_delivery_event('evt_live','live',message_id,'email_synthetic_213',
      'email.sent',now(),'Helix Demo <onboarding@resend.dev>',work->>'recipient');
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'wrong-environment callbacks cannot mutate a sandbox intent');
  PERFORM email_contract_test.assert(NOT (public.inspect_email_deliveries(message_id)->0 ?| ARRAY[
    'recipient','receipt','requestPayload']),'operational inspection does not expose receipt PII');
  PERFORM email_contract_test.assert((public.inspect_email_deliveries(message_id)->0->>'conflictCount')::integer=1,
    'provider identity conflicts remain visible for reconciliation');
  UPDATE private.email_intents SET content_deleted_at=now(),recipient=null,receipt=null,request_payload=null
  WHERE id=message_id;
  PERFORM email_contract_test.assert(NOT public.retry_email_delivery(message_id,
    (SELECT updated_at FROM private.email_intents WHERE id=message_id)),
    'cleaned message content cannot be reconstructed by retry');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_after_cleanup','sandbox',
    message_id,'email_synthetic_213','email.complained',now(),null,null)='matched',
    'a known provider identity can record a late complaint after receipt content is deleted');
  PERFORM email_contract_test.assert((SELECT delivery_status='complained' AND recipient IS NULL
    AND receipt IS NULL AND request_payload IS NULL FROM private.email_intents WHERE id=message_id),
    'late provider status preserves erased receipt content');
  denied := false;
  BEGIN DELETE FROM private.email_intents WHERE id=message_id;
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN denied := true; END;
  PERFORM email_contract_test.assert(denied,'deduplication identity survives content cleanup');
END $$;
ROLLBACK;

-- Each dispatch call must make bounded progress through maintenance as well as
-- sendable work. Exercise both cleanup cohorts with more rows than the batch size.
BEGIN;
DO $$ DECLARE n integer; BEGIN
  FOR n IN 300..314 LOOP PERFORM payment_contract_test.seed(n); END LOOP;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN
  FOR n IN 300..314 LOOP
    PERFORM payment_contract_test.prepare_and_bind(n);
    PERFORM payment_contract_test.finalize(n);
  END LOOP;
END $$;
-- The fixture ages these never-attempted rows once, modeling a worker crash at
-- either the idempotency time limit or attempt limit without rewriting history.
UPDATE private.email_intents i SET state='leased',
  first_attempt_at=CASE WHEN o.order_number IN ('HX-PAYMENT-FIXTURE-300','HX-PAYMENT-FIXTURE-301',
    'HX-PAYMENT-FIXTURE-302') THEN now()-interval '24 hours' ELSE now()-interval '1 minute' END,
  attempt_count=CASE WHEN o.order_number IN ('HX-PAYMENT-FIXTURE-303','HX-PAYMENT-FIXTURE-304') THEN 5 ELSE 1 END,
  request_payload=email_contract_test.payload(i.recipient,i.id),
  lease_token=payment_contract_test.id('maintenance-expired',300),lease_expires_at=now()-interval '1 minute'
FROM public.orders o WHERE o.id=i.order_id AND o.order_number IN ('HX-PAYMENT-FIXTURE-300',
  'HX-PAYMENT-FIXTURE-301','HX-PAYMENT-FIXTURE-302','HX-PAYMENT-FIXTURE-303','HX-PAYMENT-FIXTURE-304');
UPDATE private.email_intents i SET state='accepted',first_attempt_at=now()-interval '1 minute',attempt_count=1,
  request_payload=email_contract_test.payload(i.recipient,i.id),provider_email_id='maintenance_'||i.id::text,
  lease_token=payment_contract_test.id('maintenance-accepted',305),lease_expires_at=now()-interval '1 minute'
FROM public.orders o WHERE o.id=i.order_id AND o.order_number IN ('HX-PAYMENT-FIXTURE-305',
  'HX-PAYMENT-FIXTURE-306','HX-PAYMENT-FIXTURE-307','HX-PAYMENT-FIXTURE-308','HX-PAYMENT-FIXTURE-309');
DO $$ DECLARE before_rows jsonb; work jsonb; iteration integer; processed integer; cohort text; BEGIN
  SELECT jsonb_object_agg(i.id::text,to_jsonb(i)) INTO before_rows FROM private.email_intents i;
  PERFORM email_contract_test.assert((SELECT count(*)=15 FROM jsonb_each(before_rows)),
    'bounded maintenance fixture contains five expired, accepted and queued messages');
  FOR iteration IN 1..3 LOOP
    work := public.claim_email_intents('sandbox',payment_contract_test.id('maintenance-worker',iteration),2);
    processed := least(iteration*2,5);
    PERFORM email_contract_test.assert(jsonb_array_length(work)=least(2,7-iteration*2),
      'each claim returns at most its batch size and later calls claim remaining work');
    PERFORM email_contract_test.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(work) claimed
      WHERE before_rows->(claimed->>'id')->>'state' IS DISTINCT FROM 'queued'),
      'maintenance cohorts never become sendable work');
    PERFORM email_contract_test.assert((SELECT count(*)=processed FROM private.email_intents i
      WHERE before_rows->i.id::text->>'state'='leased' AND i.state='uncertain'
        AND i.error_code='reconciliation_required' AND i.lease_token IS NULL),
      'one claim cleans only the bounded expired or exhausted cohort');
    PERFORM email_contract_test.assert((SELECT count(*)=processed FROM private.email_intents i
      WHERE before_rows->i.id::text->>'state'='accepted' AND i.state='accepted' AND i.lease_token IS NULL),
      'one claim clears only the bounded accepted stale-lease cohort');
    PERFORM email_contract_test.assert((SELECT count(*)=processed FROM private.email_intents i
      WHERE before_rows->i.id::text->>'state'='queued' AND i.state='leased'),
      'sendable claims progress independently from both maintenance cohorts');
    FOREACH cohort IN ARRAY ARRAY['leased','accepted','queued'] LOOP
      PERFORM email_contract_test.assert((SELECT count(*)=5-processed FROM private.email_intents i
        WHERE before_rows->i.id::text->>'state'=cohort AND to_jsonb(i)=before_rows->i.id::text),
        'unprocessed rows in each cohort remain byte-for-byte unchanged');
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
