CREATE FUNCTION private.install_first_order_issuer() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $phase$
BEGIN
-- Preserve the historical sandbox namespace. Business test Sessions are valid
-- solely for an issued child binding and cannot occupy the original columns.
ALTER TABLE public.orders DROP CONSTRAINT orders_checkout_mode,
  ADD CONSTRAINT orders_checkout_mode CHECK (checkout_environment='sandbox' OR (
    checkout_environment IN ('live','business_sandbox') AND stripe_checkout_session_id IS NULL
    AND stripe_payment_intent_id IS NULL AND stripe_customer_id IS NULL
    AND starts_with(idempotency_key,checkout_environment::text||':')
    AND reward_points_redeemed=0 AND reward_points_earned=0 AND reward_discount_cents=0
    AND discount_cents=0 AND referral_code IS NULL));
ALTER TABLE public.payment_attempts DROP CONSTRAINT attempts_checkout_mode,
  ADD CONSTRAINT attempts_checkout_mode CHECK (checkout_environment='sandbox' OR (
    checkout_environment IN ('live','business_sandbox') AND stripe_checkout_session_id IS NULL
    AND stripe_payment_intent_id IS NULL AND stripe_idempotency_key IS NULL
    AND starts_with(idempotency_key,checkout_environment::text||':')));
ALTER TABLE private.live_checkout_bindings DROP CONSTRAINT live_checkout_bindings_check,
  ADD CONSTRAINT business_session_mode CHECK (session_id IS NULL OR (first_send_at IS NOT NULL AND
    CASE terms->>'environment'
      WHEN 'live' THEN session_id ~ '^cs_live_[A-Za-z0-9_]{1,200}$'
      WHEN 'business_sandbox' THEN session_id ~ '^cs_test_[A-Za-z0-9_]{1,200}$' ELSE false END));
CREATE FUNCTION private.business_checkout_target(p_environment text,p_account_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $issuer$
 SELECT p_account_id IS NOT NULL AND p_account_id<>'acct_1Tm9WRFEzyaKzdmq' AND EXISTS (
   SELECT FROM private.helix_environment e WHERE e.singleton AND
   ((p_environment='live' AND (e.environment,e.project_ref)=('production','erasogmsqpgiirovubjh')) OR
    (p_environment='business_sandbox' AND (e.environment,e.project_ref)=('development','zyfkunnpnlmgvrojmrbg')))
   AND (EXISTS (SELECT FROM private.live_checkout_sale_policy p WHERE p.singleton AND
     (p.project_ref,p.provider_environment,p.account_id)=(e.project_ref,p_environment,p_account_id))
   OR (p_environment='live' AND EXISTS (SELECT FROM private.live_checkout_bindings b
         WHERE b.account_id=p_account_id AND b.terms->>'environment'='live'))))
$issuer$;
CREATE FUNCTION private.valid_business_checkout_binding(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $issuer$
 SELECT private.business_checkout_target(p_environment,p_account_id) AND EXISTS (
   SELECT FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
   JOIN public.payment_attempts a ON a.id=b.attempt_id AND a.order_id=o.id
   WHERE b.account_id=p_account_id AND b.order_id=p_order_id AND b.attempt_id=p_attempt_id
     AND b.terms->>'environment'=p_environment AND o.checkout_environment::text=p_environment
     AND a.checkout_environment=o.checkout_environment AND a.provider='stripe')
$issuer$;
REVOKE ALL ON FUNCTION private.business_checkout_target(text,text),private.valid_business_checkout_binding(text,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_live_checkout_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  ord public.orders%ROWTYPE;
  att public.payment_attempts%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Live payment binding is retained'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.account_id,NEW.order_id,NEW.attempt_id,NEW.idempotency_key,NEW.terms,NEW.binding_nonce)
       IS DISTINCT FROM (OLD.account_id,OLD.order_id,OLD.attempt_id,OLD.idempotency_key,OLD.terms,OLD.binding_nonce)
       OR (OLD.first_send_at IS NOT NULL AND OLD.first_send_at IS DISTINCT FROM NEW.first_send_at)
       OR (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id)
       OR (OLD.verified_facts IS NOT NULL AND (OLD.verified_facts,OLD.payment_intent_id) IS DISTINCT FROM (NEW.verified_facts,NEW.payment_intent_id))
       OR (OLD.charge_id IS NOT NULL AND OLD.charge_id IS DISTINCT FROM NEW.charge_id)
       OR (OLD.receipt_hash,OLD.receipt_ownership_version) IS DISTINCT FROM (NEW.receipt_hash,NEW.receipt_ownership_version)
       OR NEW.receipt_expires_at>OLD.receipt_expires_at
       OR NEW.refunded_cents < OLD.refunded_cents THEN RAISE EXCEPTION 'Immutable live payment binding changed'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NOT private.business_checkout_target(NEW.terms->>'environment',NEW.account_id) THEN
      RAISE EXCEPTION 'Unrecognized checkout issuer'; END IF;
    SELECT * INTO STRICT ord FROM public.orders WHERE id=NEW.order_id AND checkout_environment::text=NEW.terms->>'environment' FOR SHARE;
    SELECT * INTO STRICT att FROM public.payment_attempts WHERE id=NEW.attempt_id AND order_id=NEW.order_id AND checkout_environment::text=NEW.terms->>'environment' FOR SHARE;
    IF (NEW.terms->>'version',NEW.terms->>'orderId',NEW.terms->>'accountId',NEW.terms->>'environment',NEW.terms->>'currency')
      IS DISTINCT FROM ('checkout_v2',ord.id::text,NEW.account_id,ord.checkout_environment::text,'USD')
      OR ord.status<>'pending_payment' OR att.status NOT IN ('requires_payment','processing')
      OR (att.idempotency_key,att.amount_cents,att.currency,att.provider) IS DISTINCT FROM
        (NEW.idempotency_key,ord.merchandise_subtotal_cents-ord.discount_cents+ord.shipping_cents,ord.currency,'stripe')
      OR pg_column_size(NEW.terms)>64000
      OR NEW.first_send_at>clock_timestamp()
      OR (NEW.terms ? 'attemptId' AND NEW.terms->>'attemptId' IS DISTINCT FROM NEW.attempt_id::text)
      OR (NEW.terms ? 'bindingNonce' AND NEW.terms->>'bindingNonce' IS DISTINCT FROM NEW.binding_nonce::text)
      OR (NEW.terms->>'sessionId' IS NOT NULL AND NEW.terms->>'sessionId' IS DISTINCT FROM NEW.session_id)
      OR NEW.terms->'legacyEligible' IS DISTINCT FROM 'false'::jsonb
      OR jsonb_typeof(NEW.terms->'automaticTaxEnabled') IS DISTINCT FROM 'boolean'
      OR NEW.terms->>'taxBehavior' IS DISTINCT FROM 'exclusive'
      OR NEW.terms->'couponId' IS DISTINCT FROM 'null'::jsonb OR NEW.terms->>'offerId' IS NOT NULL
      OR NOT (NEW.terms ?& ARRAY['customerId','shippingRateId'])
      OR jsonb_typeof(NEW.terms->'customerId') NOT IN ('string','null')
      OR jsonb_typeof(NEW.terms->'shippingRateId') NOT IN ('string','null')
      OR (NEW.terms->>'shippingRateId' IS NOT NULL AND NEW.terms->>'shippingRateId' !~ '^shr_[A-Za-z0-9_]{1,200}$')
      OR NEW.terms->>'discountCents' IS DISTINCT FROM '0'
      OR jsonb_typeof(NEW.terms->'freeShipping') IS DISTINCT FROM 'boolean'
      OR NEW.terms->'freeShipping' IS DISTINCT FROM to_jsonb(ord.shipping_cents=0)
      OR (ord.shipping_cents>0 AND coalesce(NEW.terms->>'shippingRateId','') !~ '^shr_[A-Za-z0-9_]{1,200}$')
      OR NEW.terms->>'apiVersion' IS DISTINCT FROM '2026-06-24.dahlia'
      OR NEW.terms->>'merchandiseSubtotalCents' IS DISTINCT FROM ord.merchandise_subtotal_cents::text
      OR NEW.terms->>'discountCents' IS DISTINCT FROM ord.discount_cents::text
      OR NEW.terms->>'shippingCents' IS DISTINCT FROM ord.shipping_cents::text
      OR NEW.terms->>'preTaxTotalCents' IS DISTINCT FROM (ord.merchandise_subtotal_cents-ord.discount_cents+ord.shipping_cents)::text
      OR NEW.terms->'lines' IS DISTINCT FROM private.checkout_order_lines(ord.id)
      OR jsonb_array_length(NEW.terms->'lines')=0
      OR (NEW.terms->>'customerId' IS NOT NULL AND NOT EXISTS(SELECT FROM private.live_stripe_customers
          WHERE account_id=NEW.account_id AND user_id=ord.user_id AND customer_id=NEW.terms->>'customerId'))
      OR (NEW.receipt_hash IS NOT NULL AND (ord.user_id IS NOT NULL OR NEW.receipt_ownership_version<>ord.receipt_ownership_version
        OR NEW.receipt_expires_at>clock_timestamp()+interval '24 hours'))
    THEN RAISE EXCEPTION 'Live binding does not match the original checkout contract'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE FUNCTION private.read_business_checkout_payment_contract(p_environment text,p_account_id text,p_order_id uuid,p_session_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
 SELECT b.terms||jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,'bindingNonce',b.binding_nonce)
 FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.order_id=p_order_id
 AND b.session_id=p_session_id AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
$runtime$;
CREATE FUNCTION public.read_business_checkout_payment_contract(p_environment text,p_account_id text,p_order_id uuid,p_session_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_payment_contract(p_environment,p_account_id,p_order_id,p_session_id)
$api$;
REVOKE ALL ON FUNCTION private.read_business_checkout_payment_contract(text,text,uuid,text),public.read_business_checkout_payment_contract(text,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_payment_contract(text,text,uuid,text),public.read_business_checkout_payment_contract(text,text,uuid,text) TO service_role;

CREATE FUNCTION private.read_pending_business_checkout_contract(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
 SELECT b.terms||jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,'bindingNonce',b.binding_nonce)
 FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.order_id=p_order_id AND b.attempt_id=p_attempt_id
 AND b.first_send_at IS NOT NULL AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
$runtime$;
CREATE FUNCTION public.read_pending_business_checkout_contract(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_pending_business_checkout_contract(p_environment,p_account_id,p_order_id,p_attempt_id)
$api$;
REVOKE ALL ON FUNCTION private.read_pending_business_checkout_contract(text,text,uuid,uuid),public.read_pending_business_checkout_contract(text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_pending_business_checkout_contract(text,text,uuid,uuid),public.read_pending_business_checkout_contract(text,text,uuid,uuid) TO service_role;

CREATE FUNCTION private.classify_business_checkout_attempt(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_payment_intent_id text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
 SELECT coalesce((
   SELECT CASE
     WHEN b.payment_intent_id=p_payment_intent_id THEN 'matched'
     WHEN b.payment_intent_id IS NULL AND o.status='pending_payment'
       AND a.status IN ('requires_payment','processing') THEN 'pending'
     ELSE 'conflict' END
   FROM private.live_checkout_bindings b
   JOIN public.orders o ON o.id=b.order_id
   JOIN public.payment_attempts a ON a.id=b.attempt_id AND a.order_id=o.id
   WHERE b.account_id=p_account_id AND b.order_id=p_order_id AND b.attempt_id=p_attempt_id
     AND b.binding_nonce=p_binding_nonce AND b.first_send_at IS NOT NULL
     AND p_payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'
     AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
 ),'unmatched')
$runtime$;
CREATE FUNCTION public.classify_business_checkout_attempt(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_payment_intent_id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.classify_business_checkout_attempt(p_environment,p_account_id,p_order_id,p_attempt_id,p_binding_nonce,p_payment_intent_id)
$api$;
REVOKE ALL ON FUNCTION private.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text),public.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text),public.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION private.read_business_checkout_order_id(p_environment text,p_account_id text,p_session_id text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
 SELECT b.order_id FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.session_id=p_session_id
 AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
$runtime$;
CREATE FUNCTION public.read_business_checkout_order_id(p_environment text,p_account_id text,p_session_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_order_id(p_environment,p_account_id,p_session_id)
$api$;
REVOKE ALL ON FUNCTION private.read_business_checkout_order_id(text,text,text),public.read_business_checkout_order_id(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_order_id(text,text,text),public.read_business_checkout_order_id(text,text,text) TO service_role;

CREATE FUNCTION private.bind_recovered_business_checkout_session(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_binding_nonce uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
BEGIN
 IF p_session_id IS NULL OR p_session_id !~ (CASE p_environment WHEN 'live' THEN '^cs_live_[A-Za-z0-9_]{1,200}$' WHEN 'business_sandbox' THEN '^cs_test_[A-Za-z0-9_]{1,200}$' END) OR
    NOT private.valid_business_checkout_binding(p_environment,p_account_id,p_order_id,p_attempt_id) THEN RETURN false; END IF;
 UPDATE private.live_checkout_bindings SET session_id=p_session_id WHERE account_id=p_account_id AND order_id=p_order_id
   AND attempt_id=p_attempt_id AND binding_nonce=p_binding_nonce AND first_send_at IS NOT NULL
   AND (session_id IS NULL OR session_id=p_session_id);
 RETURN FOUND;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$runtime$;
CREATE FUNCTION public.bind_recovered_business_checkout_session(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_binding_nonce uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.bind_recovered_business_checkout_session(p_environment,p_account_id,p_order_id,p_attempt_id,p_session_id,p_binding_nonce)
$api$;
REVOKE ALL ON FUNCTION private.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid),public.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid),public.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid) TO service_role;

CREATE FUNCTION private.claim_business_stripe_event(p_environment text,p_account_id text,p_event_id text,p_event_type text,p_object_id text,p_lease_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
DECLARE
  prior private.live_stripe_events%ROWTYPE;
  object_pattern text := CASE
    WHEN p_event_type IN ('checkout.session.completed','checkout.session.expired',
      'checkout.session.async_payment_succeeded','checkout.session.async_payment_failed') THEN (CASE p_environment WHEN 'live' THEN '^cs_live_[A-Za-z0-9_]{1,200}$' WHEN 'business_sandbox' THEN '^cs_test_[A-Za-z0-9_]{1,200}$' END)
    WHEN p_event_type='charge.refunded' THEN '^ch_[A-Za-z0-9_]{1,200}$'
    WHEN p_event_type='charge.dispute.created' THEN '^dp_[A-Za-z0-9_]{1,200}$'
  END;
BEGIN
  IF NOT private.business_checkout_target(p_environment,p_account_id) OR p_lease_id IS NULL OR p_account_id IS NULL OR p_account_id !~ '^acct_[A-Za-z0-9]{1,120}$'
    OR p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{1,200}$' OR object_pattern IS NULL
    OR p_object_id IS NULL OR p_object_id !~ object_pattern THEN RETURN 'conflict'; END IF;
  INSERT INTO private.live_stripe_events(account_id,event_id,event_type,object_id,outcome,lease_id,lease_until)
    VALUES(p_account_id,p_event_id,p_event_type,p_object_id,'processing',p_lease_id,clock_timestamp()+interval '2 minutes')
    ON CONFLICT (account_id,event_id) DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;
  SELECT * INTO STRICT prior FROM private.live_stripe_events WHERE account_id=p_account_id AND event_id=p_event_id FOR UPDATE;
  IF (prior.event_type,prior.object_id) IS DISTINCT FROM (p_event_type,p_object_id) THEN
    UPDATE private.live_stripe_events SET identity_conflict=true WHERE account_id=p_account_id AND event_id=p_event_id;
    RETURN 'conflict';
  END IF;
  IF prior.identity_conflict THEN RETURN 'conflict'; END IF;
  IF prior.outcome IN ('processed','ignored','exception') THEN RETURN 'processed'; END IF;
  IF prior.outcome='processing' AND prior.lease_until>clock_timestamp() THEN
    IF prior.lease_id=p_lease_id THEN RETURN 'claimed'; END IF;
    RETURN 'busy';
  END IF;
  -- A retry has a fresh lease identity, even if the old request lost its reply.
  IF prior.lease_id=p_lease_id THEN RETURN 'busy'; END IF;
  UPDATE private.live_stripe_events SET outcome='processing',lease_id=p_lease_id,
    lease_until=clock_timestamp()+interval '2 minutes',reason_code=NULL
    WHERE account_id=p_account_id AND event_id=p_event_id;
  RETURN 'claimed';
END;
$runtime$;
CREATE FUNCTION public.claim_business_stripe_event(p_environment text,p_account_id text,p_event_id text,p_event_type text,p_object_id text,p_lease_id uuid) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.claim_business_stripe_event(p_environment,p_account_id,p_event_id,p_event_type,p_object_id,p_lease_id)
$api$;
REVOKE ALL ON FUNCTION private.claim_business_stripe_event(text,text,text,text,text,uuid),public.claim_business_stripe_event(text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.claim_business_stripe_event(text,text,text,text,text,uuid),public.claim_business_stripe_event(text,text,text,text,text,uuid) TO service_role;

CREATE FUNCTION private.finish_business_stripe_event(p_environment text,p_account_id text,p_event_id text,p_lease_id uuid,p_outcome text,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
BEGIN
  IF NOT private.business_checkout_target(p_environment,p_account_id) OR p_outcome IS NULL OR p_outcome NOT IN ('processed','ignored','retryable','exception')
    OR (p_outcome IN ('processed','ignored')) IS DISTINCT FROM (p_code IS NULL)
    OR (p_code IS NOT NULL AND p_code !~ '^[a-z][a-z0-9_]{0,63}$') THEN RETURN false; END IF;
  UPDATE private.live_stripe_events SET outcome=p_outcome,reason_code=p_code
    WHERE account_id=p_account_id AND event_id=p_event_id AND lease_id=p_lease_id AND outcome='processing'
      AND lease_until>clock_timestamp() AND NOT identity_conflict;
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT FROM private.live_stripe_events WHERE account_id=p_account_id AND event_id=p_event_id
    AND lease_id=p_lease_id AND outcome=p_outcome AND reason_code IS NOT DISTINCT FROM p_code AND NOT identity_conflict);
END;
$runtime$;
CREATE FUNCTION public.finish_business_stripe_event(p_environment text,p_account_id text,p_event_id text,p_lease_id uuid,p_outcome text,p_code text) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.finish_business_stripe_event(p_environment,p_account_id,p_event_id,p_lease_id,p_outcome,p_code)
$api$;
REVOKE ALL ON FUNCTION private.finish_business_stripe_event(text,text,text,uuid,text,text),public.finish_business_stripe_event(text,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.finish_business_stripe_event(text,text,text,uuid,text,text),public.finish_business_stripe_event(text,text,text,uuid,text,text) TO service_role;

CREATE FUNCTION private.finalize_business_checkout_payment(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_facts jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
DECLARE
  b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE;
  v_terms jsonb; v_key text; v_tax_component jsonb; v_tax_sum bigint := 0;
  v_shipping_address jsonb; v_billing_address jsonb; p_contract_version constant text := 'checkout_v2';
BEGIN
  IF NOT private.valid_business_checkout_binding(p_environment,p_account_id,p_order_id,p_attempt_id) THEN RETURN 'unmatched'; END IF;
  SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=p_order_id
    AND attempt_id=p_attempt_id AND session_id=p_session_id AND first_send_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unmatched'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment::text=p_environment FOR UPDATE;
  v_terms:=b.terms;
  IF p_facts IS NULL OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object' OR pg_column_size(p_facts)>64000
    OR NOT (p_facts ?& ARRAY['orderId','attemptId','sessionId','contractVersion','paymentIntentId','paymentMethodType','customerId',
      'customerEmail','currency','merchandiseSubtotalCents','discountCents','shippingCents','taxCents','totalCents',
      'shippingName','shippingAddress','billingAddress','taxBreakdown'])
    OR p_facts-ARRAY['orderId','attemptId','sessionId','contractVersion','paymentIntentId','paymentMethodType','customerId',
      'customerEmail','currency','merchandiseSubtotalCents','discountCents','shippingCents','taxCents','totalCents',
      'shippingName','shippingAddress','billingAddress','taxBreakdown']<>'{}'::jsonb
    OR jsonb_typeof(p_facts->'shippingName') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_facts->'customerEmail') NOT IN ('string','null')
    OR length(p_facts->>'customerEmail')>254
    OR EXISTS (SELECT FROM unnest(ARRAY['merchandiseSubtotalCents','discountCents','shippingCents','taxCents','totalCents']) key
       WHERE jsonb_typeof(p_facts->key) IS DISTINCT FROM 'number')
    OR p_facts->>'customerId' IS DISTINCT FROM v_terms->>'customerId'
    OR (v_terms->'automaticTaxEnabled'='false'::jsonb AND p_facts->>'taxCents' IS DISTINCT FROM '0')
    OR v_terms->'lines' IS DISTINCT FROM private.checkout_order_lines(o.id)
    OR (o.currency,o.merchandise_subtotal_cents::text,o.discount_cents::text,o.shipping_cents::text) IS DISTINCT FROM
       ('USD',v_terms->>'merchandiseSubtotalCents',v_terms->>'discountCents',v_terms->>'shippingCents')
    THEN RETURN 'conflict'; END IF;
  if p_facts is null or pg_catalog.jsonb_typeof(p_facts)<>'object'
    or p_facts->>'orderId' is distinct from p_order_id::text
    or p_facts->>'sessionId' is distinct from p_session_id
    or p_facts->>'attemptId' is distinct from p_attempt_id::text
    or p_facts->>'contractVersion' is distinct from p_contract_version
    or p_facts->>'currency' is distinct from 'USD'
    or p_facts->>'paymentMethodType' is null or p_facts->>'paymentMethodType' !~ '^[a-z][a-z0-9_]{0,63}$'
    or (p_contract_version='checkout_v2' and p_facts->>'paymentMethodType'<>'card')
    or p_facts->>'merchandiseSubtotalCents' is distinct from v_terms->>'merchandiseSubtotalCents'
    or p_facts->>'discountCents' is distinct from v_terms->>'discountCents'
    or p_facts->>'shippingCents' is distinct from v_terms->>'shippingCents'
    or p_facts->>'paymentIntentId' is null or p_facts->>'paymentIntentId' !~ '^pi_[A-Za-z0-9_]{1,200}$'
    or (p_facts->>'customerId' is distinct from v_terms->>'customerId')
    or pg_catalog.jsonb_typeof(p_facts->'shippingAddress') is distinct from 'object'
    or p_facts->'shippingAddress'->>'country' is distinct from 'US'
    or (p_facts->'shippingAddress')-array['line1','line2','city','state','postal_code','country']<>'{}'::jsonb
    or (jsonb_typeof(p_facts->'billingAddress')='object' and (p_facts->'billingAddress')-array['line1','line2','city','state','postal_code','country']<>'{}'::jsonb)
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->>'shippingName')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'line1')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'city')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'state')),0)=0
    or coalesce(pg_catalog.length(pg_catalog.btrim(p_facts->'shippingAddress'->>'postal_code')),0)=0
    or pg_catalog.jsonb_typeof(p_facts->'taxBreakdown') is distinct from 'array'
    or (p_facts->'billingAddress' is not null and pg_catalog.jsonb_typeof(p_facts->'billingAddress') not in ('object','null'))
  then raise exception using errcode='22023',message='verified checkout facts do not match accepted terms'; end if;
  foreach v_key in array array['line1','line2','city','state','postal_code','country'] loop
    if (p_facts->'shippingAddress'->v_key is not null and pg_catalog.jsonb_typeof(p_facts->'shippingAddress'->v_key) not in ('string','null'))
      or (p_facts->'billingAddress'->v_key is not null and pg_catalog.jsonb_typeof(p_facts->'billingAddress'->v_key) not in ('string','null')) then
      raise exception using errcode='22023',message='verified checkout address fields invalid';
    end if;
  end loop;
  -- Persist only the address contract, never an expanded/raw provider object.
  select pg_catalog.jsonb_object_agg(field,p_facts->'shippingAddress'->field) into v_shipping_address
    from pg_catalog.unnest(array['line1','line2','city','state','postal_code','country']) field;
  if p_facts->'billingAddress' is not null and p_facts->'billingAddress'<>'null'::jsonb then
    select pg_catalog.jsonb_object_agg(field,p_facts->'billingAddress'->field) into v_billing_address
      from pg_catalog.unnest(array['line1','line2','city','state','postal_code','country']) field;
  end if;
  foreach v_key in array array['merchandiseSubtotalCents','discountCents','shippingCents','taxCents','totalCents'] loop
    if p_facts->>v_key is null or p_facts->>v_key !~ '^[0-9]{1,10}$'
      or (p_facts->>v_key)::bigint>2147483647 then
      raise exception using errcode='22023',message='verified checkout amount invalid';
    end if;
  end loop;
  if (p_facts->>'totalCents')::bigint<>(v_terms->>'preTaxTotalCents')::bigint+(p_facts->>'taxCents')::bigint
    or (p_facts->>'totalCents')::integer<=0
    or ((v_terms->>'automaticTaxEnabled')='false' and (p_facts->>'taxCents')::integer<>0)
    or jsonb_array_length(p_facts->'taxBreakdown')>1000
  then raise exception using errcode='22023',message='verified checkout arithmetic invalid'; end if;
  for v_tax_component in select value from pg_catalog.jsonb_array_elements(p_facts->'taxBreakdown') loop
    if pg_catalog.jsonb_typeof(v_tax_component)<>'object'
      or v_tax_component-array['source','lineId','rateId','amountCents','taxableAmountCents','inclusive','reason']<>'{}'::jsonb
      or v_tax_component->>'source' not in ('line','shipping') or v_tax_component->>'source' is null
      or v_tax_component->'inclusive' is distinct from 'false'::jsonb
      or v_tax_component->>'rateId' is null or v_tax_component->>'rateId' !~ '^txr_[A-Za-z0-9_]{1,200}$'
      or v_tax_component->>'amountCents' is null or v_tax_component->>'amountCents' !~ '^[0-9]{1,10}$'
      or (v_tax_component->>'amountCents')::bigint>2147483647
      or (v_tax_component->>'lineId' is not null and v_tax_component->>'lineId' !~ '^li_[A-Za-z0-9_]{1,200}$')
      or (v_tax_component->>'reason' is not null and v_tax_component->>'reason' !~ '^[a-z_]{1,100}$')
      or (v_tax_component->>'taxableAmountCents' is not null and
        (v_tax_component->>'taxableAmountCents' !~ '^[0-9]{1,10}$' or (v_tax_component->>'taxableAmountCents')::bigint>2147483647))
    then raise exception using errcode='22023',message='verified checkout tax breakdown invalid'; end if;
    v_tax_sum:=v_tax_sum+(v_tax_component->>'amountCents')::bigint;
  end loop;
  if v_tax_sum<>(p_facts->>'taxCents')::bigint then
    raise exception using errcode='22023',message='verified checkout tax breakdown differs from tax';
  end if;
  IF b.verified_facts IS NOT NULL THEN
    IF b.verified_facts IS DISTINCT FROM p_facts THEN RETURN 'conflict'; END IF;
    IF o.status='refunded' THEN RETURN 'refunded'; END IF;
    IF o.status='paid' THEN RETURN 'already_paid'; END IF;
    RETURN 'conflict';
  END IF;
  IF o.status<>'pending_payment' THEN RETURN 'conflict'; END IF;
  PERFORM FROM public.payment_attempts WHERE id=b.attempt_id AND order_id=o.id AND checkout_environment::text=p_environment
    AND status IN ('requires_payment','processing') FOR UPDATE;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  UPDATE private.live_checkout_bindings SET verified_facts=p_facts,payment_intent_id=p_facts->>'paymentIntentId'
    WHERE attempt_id=b.attempt_id;
  UPDATE public.payment_attempts SET status='paid',amount_cents=(p_facts->>'totalCents')::integer,raw_status='paid'
    WHERE id=b.attempt_id AND order_id=o.id;
  UPDATE public.orders SET status='paid',paid_at=clock_timestamp(),tax_cents=(p_facts->>'taxCents')::integer,
    total_cents=(p_facts->>'totalCents')::integer,shipping_name=p_facts->>'shippingName',shipping_address=v_shipping_address,
    billing_address=coalesce(nullif(v_billing_address,'null'::jsonb),'{}'::jsonb),customer_email=p_facts->>'customerEmail'
    WHERE id=o.id;
  RETURN 'paid';
EXCEPTION WHEN unique_violation OR invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
  RETURN 'conflict';
END;
$runtime$;
CREATE FUNCTION public.finalize_business_checkout_payment(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_facts jsonb) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.finalize_business_checkout_payment(p_environment,p_account_id,p_order_id,p_attempt_id,p_session_id,p_facts)
$api$;
REVOKE ALL ON FUNCTION private.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb),public.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb),public.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb) TO service_role;

CREATE FUNCTION private.record_business_checkout_unpaid(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_outcome text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
DECLARE b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE; next_order_status public.order_status;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('failed','expired') THEN RETURN 'conflict'; END IF;
  IF NOT private.valid_business_checkout_binding(p_environment,p_account_id,p_order_id,p_attempt_id) THEN RETURN 'unmatched'; END IF;
  SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=p_order_id AND attempt_id=p_attempt_id
    AND session_id=p_session_id AND first_send_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unmatched'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment::text=p_environment FOR UPDATE;
  IF b.verified_facts IS NOT NULL AND o.status IN ('paid','refunded') THEN RETURN 'already_paid'; END IF;
  next_order_status:=CASE p_outcome WHEN 'failed' THEN 'payment_failed'::public.order_status ELSE 'cancelled'::public.order_status END;
  IF o.status=next_order_status THEN RETURN 'already_recorded'; END IF;
  IF o.status<>'pending_payment' OR b.verified_facts IS NOT NULL THEN RETURN 'conflict'; END IF;
  UPDATE public.payment_attempts SET status=CASE p_outcome WHEN 'failed' THEN 'failed'::public.payment_attempt_status ELSE 'cancelled'::public.payment_attempt_status END,
    raw_status=p_outcome WHERE id=b.attempt_id AND order_id=o.id AND checkout_environment::text=p_environment AND status IN ('requires_payment','processing');
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  UPDATE public.orders SET status=next_order_status,cancelled_at=CASE WHEN p_outcome='expired' THEN clock_timestamp() ELSE cancelled_at END WHERE id=o.id;
  RETURN 'recorded';
END;
$runtime$;
CREATE FUNCTION public.record_business_checkout_unpaid(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_outcome text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.record_business_checkout_unpaid(p_environment,p_account_id,p_order_id,p_attempt_id,p_session_id,p_outcome)
$api$;
REVOKE ALL ON FUNCTION private.record_business_checkout_unpaid(text,text,uuid,uuid,text,text),public.record_business_checkout_unpaid(text,text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.record_business_checkout_unpaid(text,text,uuid,uuid,text,text),public.record_business_checkout_unpaid(text,text,uuid,uuid,text,text) TO service_role;

CREATE FUNCTION private.read_business_checkout_refund_target(p_environment text,p_account_id text,p_payment_intent_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
  SELECT jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,
    'paymentIntentId',b.payment_intent_id,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',b.refunded_cents,'status',o.status)
  FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
  WHERE b.account_id=p_account_id AND b.payment_intent_id=p_payment_intent_id AND b.verified_facts IS NOT NULL AND o.status IN ('paid','refunded')
    AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
$runtime$;
CREATE FUNCTION public.read_business_checkout_refund_target(p_environment text,p_account_id text,p_payment_intent_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_refund_target(p_environment,p_account_id,p_payment_intent_id)
$api$;
REVOKE ALL ON FUNCTION private.read_business_checkout_refund_target(text,text,text),public.read_business_checkout_refund_target(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_refund_target(text,text,text),public.read_business_checkout_refund_target(text,text,text) TO service_role;

CREATE FUNCTION private.record_business_checkout_refund(p_environment text,p_account_id text,p_payment_intent_id text,p_charge_id text,p_refunded_cents integer,p_currency text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $runtime$
DECLARE b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 IF p_currency IS DISTINCT FROM 'USD' OR p_refunded_cents IS NULL OR p_refunded_cents<=0
   OR p_charge_id IS NULL OR p_charge_id !~ '^ch_[A-Za-z0-9_]{1,200}$' THEN RETURN 'conflict'; END IF;
 SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND payment_intent_id=p_payment_intent_id
   AND verified_facts IS NOT NULL FOR UPDATE;
 IF NOT FOUND OR NOT private.valid_business_checkout_binding(p_environment,p_account_id,b.order_id,b.attempt_id) THEN RETURN 'unmatched'; END IF;
 SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment::text=p_environment FOR UPDATE;
 IF o.status NOT IN ('paid','refunded') OR p_refunded_cents>o.total_cents
   OR (b.charge_id IS NOT NULL AND b.charge_id<>p_charge_id) THEN RETURN 'conflict'; END IF;
 -- Independent provider reads may finish in reverse order. The locked binding
 -- already includes every smaller cumulative observation for this same charge.
 IF p_refunded_cents<=b.refunded_cents THEN RETURN 'already_recorded'; END IF;
 UPDATE private.live_checkout_bindings SET refunded_cents=p_refunded_cents,charge_id=p_charge_id WHERE attempt_id=b.attempt_id;
 IF p_refunded_cents<o.total_cents THEN RETURN 'partial'; END IF;
 UPDATE public.payment_attempts SET status='refunded',raw_status='refunded' WHERE id=b.attempt_id AND order_id=o.id;
 UPDATE public.orders SET status='refunded',refunded_at=clock_timestamp() WHERE id=o.id;
 RETURN 'refunded';
EXCEPTION WHEN unique_violation THEN RETURN 'conflict';
END;
$runtime$;
CREATE FUNCTION public.record_business_checkout_refund(p_environment text,p_account_id text,p_payment_intent_id text,p_charge_id text,p_refunded_cents integer,p_currency text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.record_business_checkout_refund(p_environment,p_account_id,p_payment_intent_id,p_charge_id,p_refunded_cents,p_currency)
$api$;
REVOKE ALL ON FUNCTION private.record_business_checkout_refund(text,text,text,text,integer,text),public.record_business_checkout_refund(text,text,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.record_business_checkout_refund(text,text,text,text,integer,text),public.record_business_checkout_refund(text,text,text,text,integer,text) TO service_role;

CREATE FUNCTION private.authorize_business_checkout_receipt(p_environment text,p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $runtime$
  SELECT EXISTS (
    SELECT FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
    WHERE b.account_id=p_account_id AND o.checkout_environment::text=p_environment
      AND b.session_id ~ (CASE p_environment WHEN 'live' THEN '^cs_live_[A-Za-z0-9_]+$' WHEN 'business_sandbox' THEN '^cs_test_[A-Za-z0-9_]+$' END)
      AND (p_order_id IS NOT NULL OR p_session_id IS NOT NULL)
      AND (p_order_id IS NULL OR p_order_id=b.order_id)
      AND (p_session_id IS NULL OR p_session_id=b.session_id)
      AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
      AND (o.user_id=p_user_id OR (
        o.user_id IS NULL AND p_receipt_token_hash ~ '^[a-f0-9]{64}$'
        AND b.receipt_hash=p_receipt_token_hash AND b.receipt_expires_at>statement_timestamp()
        AND b.receipt_ownership_version=o.receipt_ownership_version
      ))
  );
$runtime$;
CREATE FUNCTION public.authorize_business_checkout_receipt(p_environment text,p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.authorize_business_checkout_receipt(p_environment,p_account_id,p_order_id,p_session_id,p_user_id,p_receipt_token_hash)
$api$;
REVOKE ALL ON FUNCTION private.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text),public.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text),public.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text) TO service_role;

CREATE FUNCTION private.read_business_checkout_receipt(p_environment text,p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $runtime$
  SELECT jsonb_build_object(
    'orderId',o.id,'orderNumber',o.order_number,'status',o.status,'createdAt',o.created_at,'currency',o.currency,
    'merchandiseSubtotalCents',o.merchandise_subtotal_cents,'discountCents',o.discount_cents,
    'shippingCents',o.shipping_cents,'taxCents',o.tax_cents,'totalCents',o.total_cents,
    'refundedCents',b.refunded_cents,'items',coalesce((
      SELECT jsonb_agg(jsonb_build_object('productName',i.product_name,'variantLabel',i.variant_label,
        'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'lineSubtotalCents',i.line_subtotal_cents)
        ORDER BY i.created_at,i.id) FROM public.order_items i WHERE i.order_id=o.id
    ),'[]'::jsonb))
  FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
  WHERE b.account_id=p_account_id AND (p_order_id IS NOT NULL OR p_session_id IS NOT NULL)
    AND (p_order_id IS NULL OR b.order_id=p_order_id) AND (p_session_id IS NULL OR b.session_id=p_session_id)
    AND private.authorize_business_checkout_receipt(p_environment,p_account_id,b.order_id,b.session_id,p_user_id,p_receipt_token_hash);
$runtime$;
CREATE FUNCTION public.read_business_checkout_receipt(p_environment text,p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_receipt(p_environment,p_account_id,p_order_id,p_session_id,p_user_id,p_receipt_token_hash)
$api$;
REVOKE ALL ON FUNCTION private.read_business_checkout_receipt(text,text,uuid,text,uuid,text),public.read_business_checkout_receipt(text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_receipt(text,text,uuid,text,uuid,text),public.read_business_checkout_receipt(text,text,uuid,text,uuid,text) TO service_role;

CREATE FUNCTION private.read_business_checkout_order_history(p_environment text,p_account_id text, p_user_id uuid, p_limit integer, p_before_created_at timestamptz, p_before_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $runtime$
  SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',s.id,'orderNumber',s.order_number,'status',s.status,
      'createdAt',s.created_at,'currency',s.currency,'totalCents',s.total_cents,'refundedCents',s.refunded_cents)
      ORDER BY s.created_at DESC,s.id DESC),'[]'::jsonb)
  FROM (
    SELECT o.id,o.order_number,o.status,o.created_at,o.currency,o.total_cents,b.refunded_cents
    FROM public.orders o JOIN private.live_checkout_bindings b ON b.order_id=o.id
    WHERE o.user_id=p_user_id AND o.checkout_environment::text=p_environment AND b.account_id=p_account_id
      AND private.valid_business_checkout_binding(p_environment,b.account_id,b.order_id,b.attempt_id)
      AND p_limit BETWEEN 1 AND 50 AND ((p_before_created_at IS NULL)=(p_before_id IS NULL))
      AND (p_before_id IS NULL OR (o.created_at,o.id)<(p_before_created_at,p_before_id))
    ORDER BY o.created_at DESC,o.id DESC LIMIT least(greatest(p_limit,0),50)
  ) s;
$runtime$;
CREATE FUNCTION public.read_business_checkout_order_history(p_environment text,p_account_id text, p_user_id uuid, p_limit integer, p_before_created_at timestamptz, p_before_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_order_history(p_environment,p_account_id,p_user_id,p_limit,p_before_created_at,p_before_id)
$api$;
REVOKE ALL ON FUNCTION private.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid),public.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid),public.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid) TO service_role;
END;
$phase$;
