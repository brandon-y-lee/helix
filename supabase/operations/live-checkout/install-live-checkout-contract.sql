-- The owner enrolls this fixed migration capability. Its sole restricted writer
-- executes the reviewed database upgrade together with its normal CLI ledger entry.
CREATE FUNCTION private.install_live_checkout_contract() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '3s'
AS $capability$
BEGIN
  IF NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND
      (environment,project_ref) IN (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'))) THEN
    RAISE EXCEPTION 'Unexpected payment migration target';
  END IF;
  IF to_regprocedure('private.live_checkout_contract_installed()') IS NOT NULL THEN
    IF EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.live_checkout_contract_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prorettype='boolean'::regtype AND NOT p.proretset AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='7572f1b1b11e8212bb8db9417de87dc2370328b0aa4ea33b12094e24021d6ac4'
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE
        a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE'))))
    THEN
      IF private.live_checkout_contract_installed() IS TRUE THEN RETURN; END IF;
    END IF;
    RAISE EXCEPTION 'Existing live checkout contract drifted';
  END IF;
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.checkout_environment'::regtype)
      IS DISTINCT FROM ARRAY['sandbox','live']
    OR (SELECT count(*) FROM pg_constraint WHERE (conrelid,conname) IN
      (('public.orders'::regclass,'orders_sandbox_only'),('public.payment_attempts'::regclass,'payment_attempts_sandbox_only'))
      AND convalidated AND contype='c' AND pg_get_constraintdef(oid)='CHECK ((checkout_environment = ''sandbox''::public.checkout_environment))')<>2 THEN
    RAISE EXCEPTION 'Unexpected checkout predecessor';
  END IF;
-- Old readers continue to use their original unqualified provider ID columns.
-- New live references are scoped in private storage and never occupy those columns.
ALTER TABLE public.orders DROP CONSTRAINT orders_sandbox_only,
  ADD CONSTRAINT orders_checkout_mode CHECK (
    checkout_environment='sandbox' OR (checkout_environment='live' AND
    stripe_checkout_session_id IS NULL AND stripe_payment_intent_id IS NULL AND stripe_customer_id IS NULL
    AND idempotency_key LIKE 'live:%' AND reward_points_redeemed=0 AND reward_points_earned=0
    AND reward_discount_cents=0 AND discount_cents=0 AND referral_code IS NULL));
ALTER TABLE public.payment_attempts DROP CONSTRAINT payment_attempts_sandbox_only,
  ADD CONSTRAINT attempts_checkout_mode CHECK (
    checkout_environment='sandbox' OR (checkout_environment='live' AND
    stripe_checkout_session_id IS NULL AND stripe_payment_intent_id IS NULL
    AND stripe_idempotency_key IS NULL AND idempotency_key LIKE 'live:%'));
CREATE FUNCTION private.preserve_checkout_mode() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  IF OLD.checkout_environment IS DISTINCT FROM NEW.checkout_environment THEN
    RAISE EXCEPTION 'An existing payment record cannot change checkout mode';
  END IF;
  RETURN NEW;
END;
$guard$;
CREATE TRIGGER preserve_checkout_order_mode BEFORE UPDATE OF checkout_environment ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.preserve_checkout_mode();
CREATE TRIGGER preserve_checkout_attempt_mode BEFORE UPDATE OF checkout_environment ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION private.preserve_checkout_mode();

CREATE TABLE private.live_stripe_customers (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  customer_id text NOT NULL CHECK (customer_id ~ '^cus_[A-Za-z0-9]{1,120}$'),
  PRIMARY KEY (account_id,user_id), UNIQUE (account_id,customer_id)
);
CREATE TABLE private.live_checkout_bindings (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  attempt_id uuid PRIMARY KEY REFERENCES public.payment_attempts(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms)='object'),
  binding_nonce uuid NOT NULL UNIQUE,
  first_send_at timestamptz,
  session_id text CHECK (session_id IS NULL OR (session_id ~ '^cs_live_[A-Za-z0-9_]{1,200}$' AND first_send_at IS NOT NULL)),
  receipt_hash text UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  receipt_expires_at timestamptz, receipt_ownership_version bigint,
  payment_intent_id text CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'),
  verified_facts jsonb CHECK (jsonb_typeof(verified_facts)='object'),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents>=0),
  charge_id text CHECK (charge_id ~ '^ch_[A-Za-z0-9_]{1,200}$'),
  UNIQUE (account_id,idempotency_key), UNIQUE (account_id,session_id), UNIQUE (account_id,payment_intent_id),
  UNIQUE (account_id,charge_id),
  CHECK ((receipt_hash IS NULL)=(receipt_expires_at IS NULL) AND (receipt_hash IS NULL)=(receipt_ownership_version IS NULL)),
  CHECK ((payment_intent_id IS NULL)=(verified_facts IS NULL)),
  CHECK (verified_facts IS NULL OR session_id IS NOT NULL)
);
ALTER TABLE private.live_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_stripe_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE private.live_checkout_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_checkout_bindings FORCE ROW LEVEL SECURITY;

CREATE FUNCTION private.live_checkout_target() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND environment='production' AND project_ref='erasogmsqpgiirovubjh')
$fn$;
CREATE FUNCTION private.valid_live_checkout_binding(p_account_id text,p_order_id uuid,p_attempt_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT private.live_checkout_target() AND EXISTS (
    SELECT FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
      JOIN public.payment_attempts a ON a.id=b.attempt_id AND a.order_id=o.id
    WHERE b.account_id=p_account_id AND b.order_id=p_order_id AND b.attempt_id=p_attempt_id AND
      o.checkout_environment='live' AND a.checkout_environment='live' AND a.provider='stripe')
$fn$;
CREATE FUNCTION private.guard_live_checkout_binding() RETURNS trigger
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
    SELECT * INTO STRICT ord FROM public.orders WHERE id=NEW.order_id AND checkout_environment='live' FOR SHARE;
    SELECT * INTO STRICT att FROM public.payment_attempts WHERE id=NEW.attempt_id AND order_id=NEW.order_id AND checkout_environment='live' FOR SHARE;
    IF (NEW.terms->>'version',NEW.terms->>'orderId',NEW.terms->>'accountId',NEW.terms->>'environment',NEW.terms->>'currency')
      IS DISTINCT FROM ('checkout_v2',ord.id::text,NEW.account_id,'live','USD')
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
CREATE TRIGGER live_checkout_binding_immutable BEFORE INSERT OR UPDATE OR DELETE ON private.live_checkout_bindings
  FOR EACH ROW EXECUTE FUNCTION private.guard_live_checkout_binding();

CREATE FUNCTION private.read_live_checkout_payment_contract(p_account_id text,p_order_id uuid,p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
 SELECT b.terms||jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,'bindingNonce',b.binding_nonce)
 FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.order_id=p_order_id
 AND b.session_id=p_session_id AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
$fn$;
CREATE FUNCTION private.read_pending_live_checkout_contract(p_account_id text,p_order_id uuid,p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
 SELECT b.terms||jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,'bindingNonce',b.binding_nonce)
 FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.order_id=p_order_id AND b.attempt_id=p_attempt_id
 AND b.first_send_at IS NOT NULL AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
$fn$;
-- An authenticated provider event may arrive before we have recorded its
-- PaymentIntent. Classify an issued attempt without returning Order data.
CREATE FUNCTION private.classify_live_checkout_attempt(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_payment_intent_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
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
     AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
 ),'unmatched')
$fn$;
CREATE FUNCTION private.read_live_checkout_order_id(p_account_id text,p_session_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
 SELECT b.order_id FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id AND b.session_id=p_session_id
 AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
$fn$;
CREATE FUNCTION private.bind_recovered_live_checkout_session(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_binding_nonce uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
 IF p_session_id IS NULL OR p_session_id !~ '^cs_live_[A-Za-z0-9_]{1,200}$' OR
    NOT private.valid_live_checkout_binding(p_account_id,p_order_id,p_attempt_id) THEN RETURN false; END IF;
 UPDATE private.live_checkout_bindings SET session_id=p_session_id WHERE account_id=p_account_id AND order_id=p_order_id
   AND attempt_id=p_attempt_id AND binding_nonce=p_binding_nonce AND first_send_at IS NOT NULL
   AND (session_id IS NULL OR session_id=p_session_id);
 RETURN FOUND;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$fn$;

CREATE TABLE private.live_stripe_events (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  event_id text NOT NULL CHECK (event_id ~ '^evt_[A-Za-z0-9_]{1,200}$'),
  event_type text NOT NULL,
  object_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('processing','processed','ignored','retryable','exception')),
  lease_id uuid NOT NULL, lease_until timestamptz NOT NULL,
  reason_code text CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  identity_conflict boolean NOT NULL DEFAULT false,
  PRIMARY KEY(account_id,event_id)
);
ALTER TABLE private.live_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_stripe_events FORCE ROW LEVEL SECURITY;
CREATE FUNCTION private.claim_live_stripe_event(p_account_id text,p_event_id text,p_event_type text,p_object_id text,p_lease_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  prior private.live_stripe_events%ROWTYPE;
  object_pattern text := CASE
    WHEN p_event_type IN ('checkout.session.completed','checkout.session.expired',
      'checkout.session.async_payment_succeeded','checkout.session.async_payment_failed') THEN '^cs_live_[A-Za-z0-9_]{1,200}$'
    WHEN p_event_type='charge.refunded' THEN '^ch_[A-Za-z0-9_]{1,200}$'
    WHEN p_event_type='charge.dispute.created' THEN '^dp_[A-Za-z0-9_]{1,200}$'
  END;
BEGIN
  IF NOT private.live_checkout_target() OR p_lease_id IS NULL OR p_account_id IS NULL OR p_account_id !~ '^acct_[A-Za-z0-9]{1,120}$'
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
$fn$;
CREATE FUNCTION private.finish_live_stripe_event(p_account_id text,p_event_id text,p_lease_id uuid,p_outcome text,p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF NOT private.live_checkout_target() OR p_outcome IS NULL OR p_outcome NOT IN ('processed','ignored','retryable','exception')
    OR (p_outcome IN ('processed','ignored')) IS DISTINCT FROM (p_code IS NULL)
    OR (p_code IS NOT NULL AND p_code !~ '^[a-z][a-z0-9_]{0,63}$') THEN RETURN false; END IF;
  UPDATE private.live_stripe_events SET outcome=p_outcome,reason_code=p_code
    WHERE account_id=p_account_id AND event_id=p_event_id AND lease_id=p_lease_id AND outcome='processing'
      AND lease_until>clock_timestamp() AND NOT identity_conflict;
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT FROM private.live_stripe_events WHERE account_id=p_account_id AND event_id=p_event_id
    AND lease_id=p_lease_id AND outcome=p_outcome AND reason_code IS NOT DISTINCT FROM p_code AND NOT identity_conflict);
END;
$fn$;

CREATE FUNCTION private.finalize_live_checkout_payment(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_facts jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE;
  v_terms jsonb; v_key text; v_tax_component jsonb; v_tax_sum bigint := 0;
  v_shipping_address jsonb; v_billing_address jsonb; p_contract_version constant text := 'checkout_v2';
BEGIN
  IF NOT private.valid_live_checkout_binding(p_account_id,p_order_id,p_attempt_id) THEN RETURN 'unmatched'; END IF;
  SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=p_order_id
    AND attempt_id=p_attempt_id AND session_id=p_session_id AND first_send_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unmatched'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment='live' FOR UPDATE;
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
  PERFORM FROM public.payment_attempts WHERE id=b.attempt_id AND order_id=o.id AND checkout_environment='live'
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
$fn$;
CREATE FUNCTION private.record_live_checkout_unpaid(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_outcome text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE; next_order_status public.order_status;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('failed','expired') THEN RETURN 'conflict'; END IF;
  IF NOT private.valid_live_checkout_binding(p_account_id,p_order_id,p_attempt_id) THEN RETURN 'unmatched'; END IF;
  SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=p_order_id AND attempt_id=p_attempt_id
    AND session_id=p_session_id AND first_send_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unmatched'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment='live' FOR UPDATE;
  IF b.verified_facts IS NOT NULL AND o.status IN ('paid','refunded') THEN RETURN 'already_paid'; END IF;
  next_order_status:=CASE p_outcome WHEN 'failed' THEN 'payment_failed'::public.order_status ELSE 'cancelled'::public.order_status END;
  IF o.status=next_order_status THEN RETURN 'already_recorded'; END IF;
  IF o.status<>'pending_payment' OR b.verified_facts IS NOT NULL THEN RETURN 'conflict'; END IF;
  UPDATE public.payment_attempts SET status=CASE p_outcome WHEN 'failed' THEN 'failed'::public.payment_attempt_status ELSE 'cancelled'::public.payment_attempt_status END,
    raw_status=p_outcome WHERE id=b.attempt_id AND order_id=o.id AND checkout_environment='live' AND status IN ('requires_payment','processing');
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  UPDATE public.orders SET status=next_order_status,cancelled_at=CASE WHEN p_outcome='expired' THEN clock_timestamp() ELSE cancelled_at END WHERE id=o.id;
  RETURN 'recorded';
END;
$fn$;
CREATE FUNCTION private.read_live_checkout_refund_target(p_account_id text,p_payment_intent_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT jsonb_build_object('orderId',b.order_id,'attemptId',b.attempt_id,'sessionId',b.session_id,
    'paymentIntentId',b.payment_intent_id,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',b.refunded_cents,'status',o.status)
  FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
  WHERE b.account_id=p_account_id AND b.payment_intent_id=p_payment_intent_id AND b.verified_facts IS NOT NULL AND o.status IN ('paid','refunded')
    AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
$fn$;
CREATE FUNCTION private.record_live_checkout_refund(p_account_id text,p_payment_intent_id text,p_charge_id text,p_refunded_cents integer,p_currency text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE b private.live_checkout_bindings%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 IF p_currency IS DISTINCT FROM 'USD' OR p_refunded_cents IS NULL OR p_refunded_cents<=0
   OR p_charge_id IS NULL OR p_charge_id !~ '^ch_[A-Za-z0-9_]{1,200}$' THEN RETURN 'conflict'; END IF;
 SELECT * INTO b FROM private.live_checkout_bindings WHERE account_id=p_account_id AND payment_intent_id=p_payment_intent_id
   AND verified_facts IS NOT NULL FOR UPDATE;
 IF NOT FOUND OR NOT private.valid_live_checkout_binding(p_account_id,b.order_id,b.attempt_id) THEN RETURN 'unmatched'; END IF;
 SELECT * INTO STRICT o FROM public.orders WHERE id=b.order_id AND checkout_environment='live' FOR UPDATE;
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
$fn$;

ALTER POLICY orders_select_own ON public.orders USING (
  checkout_environment='sandbox' AND user_id=(SELECT auth.uid())
);
ALTER POLICY order_items_select_own_order ON public.order_items USING (
  EXISTS (SELECT FROM public.orders o WHERE o.id=order_items.order_id
    AND o.checkout_environment='sandbox' AND o.user_id=(SELECT auth.uid()))
);
ALTER POLICY payment_attempts_select_own_order ON public.payment_attempts USING (
  checkout_environment='sandbox' AND EXISTS (SELECT FROM public.orders o WHERE o.id=payment_attempts.order_id
    AND o.checkout_environment='sandbox' AND o.user_id=(SELECT auth.uid()))
);

CREATE FUNCTION private.authorize_live_checkout_receipt(
  p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $receipt_access$
  SELECT EXISTS (
    SELECT FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
    WHERE b.account_id=p_account_id AND o.checkout_environment='live'
      AND b.session_id ~ '^cs_live_[A-Za-z0-9_]+$'
      AND (p_order_id IS NOT NULL OR p_session_id IS NOT NULL)
      AND (p_order_id IS NULL OR p_order_id=b.order_id)
      AND (p_session_id IS NULL OR p_session_id=b.session_id)
      AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
      AND (o.user_id=p_user_id OR (
        o.user_id IS NULL AND p_receipt_token_hash ~ '^[a-f0-9]{64}$'
        AND b.receipt_hash=p_receipt_token_hash AND b.receipt_expires_at>statement_timestamp()
        AND b.receipt_ownership_version=o.receipt_ownership_version
      ))
  );
$receipt_access$;

CREATE FUNCTION private.read_live_checkout_receipt(
  p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $receipt$
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
    AND private.authorize_live_checkout_receipt(p_account_id,b.order_id,b.session_id,p_user_id,p_receipt_token_hash);
$receipt$;

CREATE FUNCTION private.read_live_checkout_order_history(
  p_account_id text, p_user_id uuid, p_limit integer, p_before_created_at timestamptz, p_before_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $history$
  SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',s.id,'orderNumber',s.order_number,'status',s.status,
      'createdAt',s.created_at,'currency',s.currency,'totalCents',s.total_cents,'refundedCents',s.refunded_cents)
      ORDER BY s.created_at DESC,s.id DESC),'[]'::jsonb)
  FROM (
    SELECT o.id,o.order_number,o.status,o.created_at,o.currency,o.total_cents,b.refunded_cents
    FROM public.orders o JOIN private.live_checkout_bindings b ON b.order_id=o.id
    WHERE o.user_id=p_user_id AND o.checkout_environment='live' AND b.account_id=p_account_id
      AND private.valid_live_checkout_binding(b.account_id,b.order_id,b.attempt_id)
      AND p_limit BETWEEN 1 AND 50 AND ((p_before_created_at IS NULL)=(p_before_id IS NULL))
      AND (p_before_id IS NULL OR (o.created_at,o.id)<(p_before_created_at,p_before_id))
    ORDER BY o.created_at DESC,o.id DESC LIMIT least(greatest(p_limit,0),50)
  ) s;
$history$;
CREATE FUNCTION public.read_live_checkout_payment_contract(p_account_id text,p_order_id uuid,p_session_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_live_checkout_payment_contract(p_account_id,p_order_id,p_session_id)
$api$;

CREATE FUNCTION public.read_pending_live_checkout_contract(p_account_id text,p_order_id uuid,p_attempt_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_pending_live_checkout_contract(p_account_id,p_order_id,p_attempt_id)
$api$;

CREATE FUNCTION public.classify_live_checkout_attempt(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_payment_intent_id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.classify_live_checkout_attempt(p_account_id,p_order_id,p_attempt_id,p_binding_nonce,p_payment_intent_id)
$api$;

CREATE FUNCTION public.read_live_checkout_order_id(p_account_id text,p_session_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_live_checkout_order_id(p_account_id,p_session_id)
$api$;

CREATE FUNCTION public.bind_recovered_live_checkout_session(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_binding_nonce uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.bind_recovered_live_checkout_session(p_account_id,p_order_id,p_attempt_id,p_session_id,p_binding_nonce)
$api$;

CREATE FUNCTION public.claim_live_stripe_event(p_account_id text,p_event_id text,p_event_type text,p_object_id text,p_lease_id uuid) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.claim_live_stripe_event(p_account_id,p_event_id,p_event_type,p_object_id,p_lease_id)
$api$;

CREATE FUNCTION public.finish_live_stripe_event(p_account_id text,p_event_id text,p_lease_id uuid,p_outcome text,p_code text) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.finish_live_stripe_event(p_account_id,p_event_id,p_lease_id,p_outcome,p_code)
$api$;

CREATE FUNCTION public.finalize_live_checkout_payment(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_facts jsonb) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.finalize_live_checkout_payment(p_account_id,p_order_id,p_attempt_id,p_session_id,p_facts)
$api$;

CREATE FUNCTION public.record_live_checkout_unpaid(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_session_id text,p_outcome text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.record_live_checkout_unpaid(p_account_id,p_order_id,p_attempt_id,p_session_id,p_outcome)
$api$;

CREATE FUNCTION public.read_live_checkout_refund_target(p_account_id text,p_payment_intent_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_live_checkout_refund_target(p_account_id,p_payment_intent_id)
$api$;

CREATE FUNCTION public.record_live_checkout_refund(p_account_id text,p_payment_intent_id text,p_charge_id text,p_refunded_cents integer,p_currency text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.record_live_checkout_refund(p_account_id,p_payment_intent_id,p_charge_id,p_refunded_cents,p_currency)
$api$;

CREATE FUNCTION public.authorize_live_checkout_receipt(p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.authorize_live_checkout_receipt(p_account_id,p_order_id,p_session_id,p_user_id,p_receipt_token_hash)
$api$;

CREATE FUNCTION public.read_live_checkout_receipt(p_account_id text, p_order_id uuid, p_session_id text, p_user_id uuid, p_receipt_token_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_live_checkout_receipt(p_account_id,p_order_id,p_session_id,p_user_id,p_receipt_token_hash)
$api$;

CREATE FUNCTION public.read_live_checkout_order_history(p_account_id text, p_user_id uuid, p_limit integer, p_before_created_at timestamptz, p_before_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $api$
  SELECT private.read_live_checkout_order_history(p_account_id,p_user_id,p_limit,p_before_created_at,p_before_id)
$api$;

REVOKE ALL ON FUNCTION private.preserve_checkout_mode() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.live_checkout_target() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.valid_live_checkout_binding(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_live_checkout_binding() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.read_live_checkout_payment_contract(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_live_checkout_payment_contract(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_live_checkout_payment_contract(text,uuid,text), public.read_live_checkout_payment_contract(text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.read_pending_live_checkout_contract(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_pending_live_checkout_contract(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_pending_live_checkout_contract(text,uuid,uuid), public.read_pending_live_checkout_contract(text,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.classify_live_checkout_attempt(text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.classify_live_checkout_attempt(text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.classify_live_checkout_attempt(text,uuid,uuid,uuid,text), public.classify_live_checkout_attempt(text,uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.read_live_checkout_order_id(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_live_checkout_order_id(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_live_checkout_order_id(text,text), public.read_live_checkout_order_id(text,text) TO service_role;
REVOKE ALL ON FUNCTION private.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid), public.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.claim_live_stripe_event(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_live_stripe_event(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.claim_live_stripe_event(text,text,text,text,uuid), public.claim_live_stripe_event(text,text,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.finish_live_stripe_event(text,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finish_live_stripe_event(text,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.finish_live_stripe_event(text,text,uuid,text,text), public.finish_live_stripe_event(text,text,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION private.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb), public.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.record_live_checkout_unpaid(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_live_checkout_unpaid(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.record_live_checkout_unpaid(text,uuid,uuid,text,text), public.record_live_checkout_unpaid(text,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION private.read_live_checkout_refund_target(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_live_checkout_refund_target(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_live_checkout_refund_target(text,text), public.read_live_checkout_refund_target(text,text) TO service_role;
REVOKE ALL ON FUNCTION private.record_live_checkout_refund(text,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_live_checkout_refund(text,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.record_live_checkout_refund(text,text,text,integer,text), public.record_live_checkout_refund(text,text,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION private.authorize_live_checkout_receipt(text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.authorize_live_checkout_receipt(text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.authorize_live_checkout_receipt(text,uuid,text,uuid,text), public.authorize_live_checkout_receipt(text,uuid,text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.read_live_checkout_receipt(text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_live_checkout_receipt(text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_live_checkout_receipt(text,uuid,text,uuid,text), public.read_live_checkout_receipt(text,uuid,text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid), public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid) TO service_role;
REVOKE ALL ON TABLE private.live_stripe_customers, private.live_checkout_bindings, private.live_stripe_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.live_checkout_contract_installed() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $verify$
SELECT
    (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.checkout_environment'::regtype)=ARRAY['sandbox','live']
    AND NOT EXISTS (SELECT FROM (VALUES
      ('private.preserve_checkout_mode()','e83c7e4ba7a87108651e6c3a5a456fc73ccea4b8b429e211c47f9e51c1184f35',false,'trigger','plpgsql','v'),
      ('private.live_checkout_target()','094513a67a99d83aa0d1c4bd5fd43ca0884e53ea07aad507372f8b89be6c4694',false,'boolean','sql','s'),
      ('private.valid_live_checkout_binding(text,uuid,uuid)','ea179142d5d6839b40f22e8015fa36c631845d77e65f6254d11c151002c06963',false,'boolean','sql','s'),
      ('private.guard_live_checkout_binding()','cd4f10380af4ecd7b410a81028f295aef8aa7be6f47f15282f92d983afd0ab54',false,'trigger','plpgsql','v'),
      ('private.read_live_checkout_payment_contract(text,uuid,text)','2aa426f8d8172e96b40cc51034bb3b68f6566106320f7eb54b165a987ec26bf3',true,'jsonb','sql','s'),
      ('public.read_live_checkout_payment_contract(text,uuid,text)','232d9f452dbc131a12795809b2b51c63faf743fd38e794a51d57cc182cbb35cc',false,'jsonb','sql','s'),
      ('private.read_pending_live_checkout_contract(text,uuid,uuid)','479921d4ae490b53c6f2c4f5d9d0632c34776125395060ad4c047da832e57cb3',true,'jsonb','sql','s'),
      ('public.read_pending_live_checkout_contract(text,uuid,uuid)','1813660dbc136bd6ee799d0e9d5b1be58ce195aa31fde3b7b447f14f43315326',false,'jsonb','sql','s'),
      ('private.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','345b74481d433483a457619bb2b0353f384ee1fafdeb437e7d11e4ec540e7a7a',true,'text','sql','s'),
      ('public.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','65b635ac2229e347de838a5018d11ca68ba1a4ee4891523249fb55fd05982626',false,'text','sql','s'),
      ('private.read_live_checkout_order_id(text,text)','0dfba40a837c1254d55906c679e631f85c6447e2c7cea4951c13a586a522b56f',true,'uuid','sql','s'),
      ('public.read_live_checkout_order_id(text,text)','115e42f5682047103c3d9ba1f93579cbb303ee86fc836011bbf2134a7cd753e9',false,'uuid','sql','s'),
      ('private.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','ab63effc968dcdf8a7aa5ddb25a3f1ce68149372f24b835c32b3f79f7d63a3b8',true,'boolean','plpgsql','v'),
      ('public.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','9a6c5e84b3aa912c59b4f0ea413659b3afa090243afb65a7a385d73d56db2fbc',false,'boolean','sql','v'),
      ('private.claim_live_stripe_event(text,text,text,text,uuid)','b0b9c16752bb9ee03c1c7a231b2c39a337efb2d3e7bd10bb36aaa9d97d8958b3',true,'text','plpgsql','v'),
      ('public.claim_live_stripe_event(text,text,text,text,uuid)','8e6f950f8ab0ea1061f6ab9df0c52094396c3e22220a08b8a03ccd5c32df679e',false,'text','sql','v'),
      ('private.finish_live_stripe_event(text,text,uuid,text,text)','1f770ce479f7a4c8e8d9ab3bac9c6e8af5633b71d544229dee230f0f5a9d411a',true,'boolean','plpgsql','v'),
      ('public.finish_live_stripe_event(text,text,uuid,text,text)','5b6501bd4d74ad8a1600fadfeffe54a85a1abba0febb1dc11dfd44f8bf624dd3',false,'boolean','sql','v'),
      ('private.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','4be6c5cf6746a21c4f859df0f1c1a291f1c0648209bd1af12f93b55530db79dd',true,'text','plpgsql','v'),
      ('public.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','bcbc13518575bc109ec62aac9cf9e8c3a016ead96686bb99e77515d8d7cc20fa',false,'text','sql','v'),
      ('private.record_live_checkout_unpaid(text,uuid,uuid,text,text)','81021d8b7443343f2554f171536f4f6adaf13093fd37050521ada81b11ab68d0',true,'text','plpgsql','v'),
      ('public.record_live_checkout_unpaid(text,uuid,uuid,text,text)','10e1119f3e665b7f6e6f84fb96e0833ccb004e3004402e9fa0ac86369c631076',false,'text','sql','v'),
      ('private.read_live_checkout_refund_target(text,text)','ea739dca359043a0b281783aaa521d7c53ab8df4047e0bb20cfc26da471a038e',true,'jsonb','sql','s'),
      ('public.read_live_checkout_refund_target(text,text)','7381945047d8ae1865d21c0f5e1cba29104f5c28479e6f5cd9c65975ebae1db3',false,'jsonb','sql','s'),
      ('private.record_live_checkout_refund(text,text,text,integer,text)','9635d89229a95977bb2e534616a948c2bfbaebdbe4675ecc315b40b5098ea514',true,'text','plpgsql','v'),
      ('public.record_live_checkout_refund(text,text,text,integer,text)','21eab5ba4a476fec817e37a0e126353fc58c1abb39094d4967a16eee3be8ecda',false,'text','sql','v'),
      ('private.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','7388b21f0980e483313a41ce6ab65a1751ad2c51e55a395a912f0bfcdfebd595',true,'boolean','sql','s'),
      ('public.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','3bca76f026a9e2a2d9cca35309c8c6707732661f14255018a92772318b01fe20',false,'boolean','sql','s'),
      ('private.read_live_checkout_receipt(text,uuid,text,uuid,text)','f10ff43e6958ab918615bb838229e6bd18679cf70bff7dd91dd5b4566db2f1d3',true,'jsonb','sql','s'),
      ('public.read_live_checkout_receipt(text,uuid,text,uuid,text)','cd18f60cbd3fd60aa4007c39ae536c7e473b54db57e2cc71b95b9ab93a06c319',false,'jsonb','sql','s'),
      ('private.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','bb7b4c6d5be0caf305af16346d3f3035d6f4102d59a485a4c9c335f94e71948e',true,'jsonb','sql','s'),
      ('public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','08ad65ca9dee56b47b86932eb712d0df3bb7454277712ec44246458a9ef68d56',false,'jsonb','sql','s')
    ) expected(signature,digest,is_definer,result_type,language,volatility)
      LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
      WHERE p.oid IS NULL OR p.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
        OR p.proretset OR p.proleakproof OR p.prokind<>'f' OR p.proisstrict OR p.proparallel<>'u'
        OR p.provolatile::text<>expected.volatility OR p.prorettype<>expected.result_type::regtype
        OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>expected.language
        OR ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)<>ARRAY['search_path=pg_catalog,pg_temp']
        OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
            (a.grantee<>'service_role'::regrole OR NOT (expected.is_definer OR expected.signature LIKE 'public.%')
             OR a.is_grantable OR a.privilege_type<>'EXECUTE')))
        OR p.prosecdef IS DISTINCT FROM expected.is_definer OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.digest
        OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM
           (expected.is_definer OR expected.signature LIKE 'public.%'))
    AND (SELECT count(*)=3 FROM pg_class c WHERE c.relnamespace='private'::regnamespace
      AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events')
      AND c.relrowsecurity AND c.relforcerowsecurity AND c.relkind='r'
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner OR a.grantor<>c.relowner)
      AND NOT EXISTS (SELECT FROM pg_attribute x, LATERAL aclexplode(x.attacl) a WHERE x.attrelid=c.oid AND (a.grantee<>c.relowner OR a.grantor<>c.relowner))
      AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    AND (SELECT count(*)=2 FROM pg_constraint WHERE (conrelid,conname) IN
       (('public.orders'::regclass,'orders_checkout_mode'),('public.payment_attempts'::regclass,'attempts_checkout_mode')) AND convalidated)
    AND (SELECT count(*)=3 FROM pg_trigger WHERE (tgrelid,tgname) IN
       (('public.orders'::regclass,'preserve_checkout_order_mode'),('public.payment_attempts'::regclass,'preserve_checkout_attempt_mode'),
        ('private.live_checkout_bindings'::regclass,'live_checkout_binding_immutable'))
       AND tgenabled='O' AND NOT tgisinternal)
    AND (
WITH cols AS (
  SELECT c.oid,c.relname,c.relnamespace FROM pg_class c WHERE c.relnamespace='private'::regnamespace
    AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events')
), components(details) AS (
  SELECT jsonb_build_array('column',c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
    a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) FROM cols c JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT jsonb_build_array('rel',c.relname,raw.relrowsecurity,raw.relforcerowsecurity,raw.relowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)) FROM cols c JOIN pg_class raw ON raw.oid=c.oid
  UNION ALL SELECT jsonb_build_array('constraint',k.conrelid::regclass::text,k.conname,k.contype,k.convalidated,
    k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid IN (SELECT oid FROM cols)
    OR (k.conrelid,k.conname) IN (('public.orders'::regclass,'orders_checkout_mode'),('public.payment_attempts'::regclass,'attempts_checkout_mode'))
  UNION ALL SELECT jsonb_build_array('index',i.indrelid::regclass::text,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) FROM pg_index i
    WHERE i.indrelid IN (SELECT oid FROM cols)
  UNION ALL SELECT jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgenabled,pg_get_triggerdef(t.oid)) FROM pg_trigger t WHERE NOT t.tgisinternal
    AND (t.tgrelid IN (SELECT oid FROM cols) OR (t.tgrelid,t.tgname) IN (
        ('public.orders'::regclass,'preserve_checkout_order_mode'),('public.payment_attempts'::regclass,'preserve_checkout_attempt_mode')))
  UNION ALL SELECT jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,
    (SELECT array_agg(CASE role_oid WHEN 0 THEN 'public' ELSE pg_get_userbyid(role_oid)::text END) FROM unnest(p.polroles) role_oid),
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) FROM pg_policy p
    WHERE p.polrelid IN (SELECT oid FROM cols) OR p.polrelid IN ('public.orders'::regclass,'public.payment_attempts'::regclass,'public.order_items'::regclass)
)
SELECT encode(sha256(convert_to(jsonb_agg(details ORDER BY details::text COLLATE "C")::text,'UTF8')),'hex') FROM components
    ) = '8dfd1872dc0c78a95e19ca16f30992d9d99a74594e57b7ee19ef554843a7dc03'
$verify$;

REVOKE ALL ON FUNCTION private.live_checkout_contract_installed() FROM PUBLIC,anon,authenticated,service_role;
-- session_user is the authenticated migration caller. Its execute grant is the
-- only additional privilege it needs to check the value-free installed contract.
EXECUTE format('GRANT EXECUTE ON FUNCTION private.live_checkout_contract_installed() TO %I',session_user);
IF private.live_checkout_contract_installed() IS NOT TRUE THEN
  RAISE EXCEPTION 'Live checkout postflight failed';
END IF;
END;
$capability$;
