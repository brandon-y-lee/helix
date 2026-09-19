-- Real RPC contracts in a disposable synthetic database. No provider or customer data.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TYPE public.checkout_environment AS ENUM ('sandbox');
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA private;
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),checkout_environment public.checkout_environment NOT NULL DEFAULT 'sandbox',
  stripe_checkout_session_id text NOT NULL,stripe_payment_intent_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('paid','refunded')),total_cents integer NOT NULL,currency text NOT NULL DEFAULT 'USD'
);
CREATE TABLE public.payment_attempts(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.orders(id));
GRANT SELECT,INSERT,UPDATE ON public.orders,public.payment_attempts TO service_role;
CREATE TABLE public.admin_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('admin','catalog_publisher','catalog_editor')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  checkout_environment public.checkout_environment NOT NULL DEFAULT 'sandbox',
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (checkout_environment='sandbox'), CHECK (livemode=false)
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.admin_memberships TO service_role;
INSERT INTO auth.users(id) SELECT md5('payment-inbox:actor:'||n)::uuid FROM generate_series(1,4) n;
INSERT INTO public.admin_memberships(user_id,role,active) VALUES
  (md5('payment-inbox:actor:1')::uuid,'admin',true),
  (md5('payment-inbox:actor:2')::uuid,'admin',false),
  (md5('payment-inbox:actor:3')::uuid,'catalog_publisher',true),
  (md5('payment-inbox:actor:4')::uuid,'catalog_editor',true);
INSERT INTO public.stripe_webhook_events(stripe_event_id,type,payload,processed_at,processing_error,created_at) VALUES
  ('evt_legacyProcessed','checkout.session.completed',
    '{"event_id":"evt_legacyProcessed","type":"checkout.session.completed","object_id":"cs_test_legacyProcessed","api_version":"2026-06-24.dahlia","request_id":"req_preserve"}',
    '2026-09-18T12:00:01Z',NULL,'2026-09-18T12:00:00Z'),
  ('evt_legacyRecover','checkout.session.completed',
    '{"event_id":"evt_legacyRecover","type":"checkout.session.completed","object_id":"cs_test_legacyRecover","api_version":"2026-06-24.dahlia","request_id":null}',
    NULL,'processing:'||to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'2026-09-19T00:00:00.123456Z'),
  ('evt_legacyCharge','charge.refunded',
    '{"event_id":"evt_legacyCharge","type":"charge.refunded","object_id":"ch_legacyCharge","api_version":"2026-06-24.dahlia","request_id":null}',
    NULL,NULL,'2026-09-19T00:00:00.987654Z'),
  ('evt_legacyInvalid','checkout.session.completed',
    '{"event_id":"evt_legacyInvalid","type":"checkout.session.completed","object_id":null,"api_version":null,"request_id":null}',
    NULL,'Original diagnostic is preserved only in the legacy table','2026-09-18T12:00:00Z');
INSERT INTO public.stripe_webhook_events(stripe_event_id,type,payload,created_at)
SELECT 'evt_legacyOverdue'||n,'checkout.session.completed',jsonb_build_object(
  'event_id','evt_legacyOverdue'||n,'type','checkout.session.completed',
  'object_id','cs_test_legacyOverdue'||n,'api_version','2026-06-24.dahlia','request_id',NULL),
  clock_timestamp()-interval '16 minutes' FROM generate_series(1,21) n;
CREATE TABLE public.payment_inbox_legacy_snapshot AS
  SELECT stripe_event_id,to_jsonb(e)::text AS snapshot FROM public.stripe_webhook_events e;

-- APPLY PAYMENT INBOX MIGRATION
CREATE SCHEMA payment_inbox_test;
CREATE FUNCTION payment_inbox_test.assert(ok boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',description; END IF;
END $$;
SELECT payment_inbox_test.assert(to_regprocedure('public.receive_payment_event(jsonb)') IS NOT NULL,
  'verified event receipt has a durable database entry point');
CREATE FUNCTION payment_inbox_test.envelope(n integer,kind text DEFAULT 'checkout.session') RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('accountId','acct_1Tm9WRFEzyaKzdmq','environment','sandbox',
    'eventId','evt_inbox'||n,'eventType',CASE kind WHEN 'charge' THEN 'charge.refunded' WHEN 'refund' THEN 'refund.updated' ELSE 'checkout.session.completed' END,
    'apiVersion','2026-06-24.dahlia','createdAt','2026-09-18T16:00:00.000Z','objectKind',kind,
    'objectId',CASE kind WHEN 'charge' THEN 'ch_inbox'||n WHEN 'refund' THEN 're_inbox'||n ELSE 'cs_test_inbox'||n END,
    'chargeId',CASE WHEN kind IN ('charge','refund') THEN 'ch_inbox'||n END,'paymentIntentId','pi_inbox'||n)
$$;
GRANT USAGE ON SCHEMA payment_inbox_test TO service_role,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_inbox_test TO service_role,anon,authenticated;
SET ROLE service_role;
SELECT payment_inbox_test.assert(public.receive_payment_event(payment_inbox_test.envelope(1))->>'status'='received',
  'a verified event is durably received');
SELECT payment_inbox_test.assert(public.receive_payment_event(payment_inbox_test.envelope(1))->>'status'='duplicate',
  'redelivery resolves the existing receipt without starting new work');
SELECT payment_inbox_test.assert(public.receive_payment_event(payment_inbox_test.envelope(1)
  ||jsonb_build_object('objectId','cs_test_conflicting'))->>'status'='conflict',
  'an event identifier cannot silently change its payment object');
RESET ROLE;
SELECT payment_inbox_test.assert((SELECT count(*)=1 AND min(object_id)='cs_test_inbox1'
  FROM private.payment_event_inbox WHERE event_id='evt_inbox1'),
  'duplicate and conflicting receipts preserve the original immutable identity');
SELECT payment_inbox_test.assert((SELECT count(*)=1 FROM private.payment_event_incidents i
  JOIN private.payment_event_inbox e ON e.id=i.item_id WHERE e.event_id='evt_inbox1' AND i.code='identity_conflict'),
  'conflicting receipt has one durable visible incident');
SELECT payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM public.stripe_webhook_events e
  JOIN public.payment_inbox_legacy_snapshot s USING(stripe_event_id) WHERE to_jsonb(e)::text<>s.snapshot),
  'migration preserves original legacy audit rows byte for byte');
SELECT payment_inbox_test.assert((SELECT status='processed' AND provenance='legacy'
  AND original_processed_at='2026-09-18T12:00:01Z' FROM private.payment_event_inbox WHERE event_id='evt_legacyProcessed'),
  'processed legacy event becomes a tombstone retaining original completion');
SELECT payment_inbox_test.assert((SELECT status='pending' AND attempts=0 FROM private.payment_event_inbox
  WHERE event_id='evt_legacyRecover'),'fresh legacy processing marker remains recoverable pending work');
SELECT payment_inbox_test.assert((SELECT private.payment_inbox_envelope(e)->>'createdAt'='2026-09-19T00:00:00.000Z'
  FROM private.payment_event_inbox e WHERE event_id='evt_legacyRecover'),
  'legacy recovery envelope uses canonical provider seconds while preserving original receipt precision');
SELECT payment_inbox_test.assert((SELECT charge_id=object_id AND object_kind='charge'
  FROM private.payment_event_inbox WHERE event_id='evt_legacyCharge'),
  'legacy charge recovery preserves the charge reference required by the provider adapter');
SELECT payment_inbox_test.assert((SELECT status='dead_letter' FROM private.payment_event_inbox
  WHERE event_id='evt_legacyInvalid'),'unusable legacy envelope is retained as a dead letter');
SELECT payment_inbox_test.assert((SELECT count(*)=1 FROM private.payment_event_incidents i
  JOIN private.payment_event_inbox e ON e.id=i.item_id
  WHERE e.event_id='evt_legacyInvalid' AND i.code='invalid_legacy_envelope'),
  'unusable legacy work has a durable incident');

SET ROLE service_role;
DO $$ DECLARE v_run jsonb; BEGIN
  v_run:=public.claim_payment_worker_run();
  PERFORM payment_inbox_test.assert((SELECT count(*)=20 FROM private.payment_event_incidents WHERE code='overdue'),
    'one worker start bounds overdue incident maintenance to twenty receipts');
  PERFORM public.finish_payment_worker_run((v_run->>'token')::uuid,0,0);
  v_run:=public.claim_payment_worker_run();
  PERFORM payment_inbox_test.assert((SELECT count(*)>20 FROM private.payment_event_incidents WHERE code='overdue'),
    'next worker start advances beyond already visible overdue receipts');
  PERFORM public.finish_payment_worker_run((v_run->>'token')::uuid,0,0);
END $$;
RESET ROLE;

DO $$ DECLARE v_table text; v_role text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['payment_event_inbox','payment_worker_health','payment_event_incidents',
    'payment_refund_observations','payment_replay_audit'] LOOP
    PERFORM payment_inbox_test.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
      WHERE oid=('private.'||v_table)::regclass),'private payment records force row security: '||v_table);
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM payment_inbox_test.assert(NOT has_table_privilege(v_role,'private.'||v_table,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'customer role has no direct payment table privilege: '||v_role||'/'||v_table);
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM payment_inbox_test.assert(NOT has_function_privilege(v_role,
      'public.receive_payment_event(jsonb)','EXECUTE'),'receipt RPC denies customer role: '||v_role);
  END LOOP;
END $$;

CREATE FUNCTION payment_inbox_test.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF new.event_id='evt_inbox99' THEN RAISE EXCEPTION 'synthetic receipt persistence failure'; END IF; RETURN new; END $$;
CREATE TRIGGER payment_inbox_test_receipt_failure BEFORE INSERT ON private.payment_event_inbox
  FOR EACH ROW EXECUTE FUNCTION payment_inbox_test.fail_receipt();
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.receive_payment_event(payment_inbox_test.envelope(99));
    RAISE EXCEPTION 'receipt unexpectedly acknowledged an uncommitted event';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic receipt persistence failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

CREATE FUNCTION payment_inbox_test.start(n integer,kind text DEFAULT 'checkout.session') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_run jsonb; v_claim jsonb;
BEGIN
  UPDATE private.payment_event_inbox SET next_attempt_at=clock_timestamp()+interval '1 day'
    WHERE status IN ('pending','processing');
  v_id:=(public.receive_payment_event(payment_inbox_test.envelope(n,kind))->>'itemId')::uuid;
  v_run:=public.claim_payment_worker_run();
  PERFORM payment_inbox_test.assert(v_run IS NOT NULL,'synthetic case starts a new worker run');
  v_claim:=public.claim_payment_events((v_run->>'token')::uuid,1)->0;
  PERFORM payment_inbox_test.assert((v_claim->>'id')::uuid=v_id,'synthetic case claims its received event');
  RETURN v_claim||jsonb_build_object('runToken',v_run->>'token');
END $$;
CREATE FUNCTION payment_inbox_test.finish(c jsonb, disposition text DEFAULT 'processed',code text DEFAULT NULL,delay integer DEFAULT NULL)
RETURNS boolean LANGUAGE sql AS $$ SELECT public.finish_payment_event((c->>'runToken')::uuid,
  (c->>'id')::uuid,(c->>'leaseToken')::uuid,(c->>'version')::integer,disposition,code,delay) $$;
CREATE FUNCTION payment_inbox_test.refund(n integer,status text DEFAULT 'succeeded') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('refundId','re_inbox'||n,'chargeId','ch_inbox'||n,
    'paymentIntentId','pi_inbox'||n,'orderId',NULL,'amountCents',2500,'currency','usd','status',status)
$$;
CREATE FUNCTION payment_inbox_test.record_refund(c jsonb,facts jsonb) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.record_payment_refund_observations((c->>'runToken')::uuid,(c->>'id')::uuid,
    (c->>'leaseToken')::uuid,(c->>'version')::integer,facts)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_inbox_test TO service_role;

SET ROLE service_role;
DO $$ DECLARE v_old jsonb; v_new jsonb; v_run jsonb; v_item uuid; BEGIN
  v_old:=payment_inbox_test.start(200,'charge');
  v_item:=(v_old->>'id')::uuid;
  PERFORM payment_inbox_test.assert(public.claim_payment_worker_run() IS NULL,
    'an overlapping worker cannot acquire the current account lease');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.finish(v_old||jsonb_build_object('leaseToken',NULL)),
    'null item lease cannot finish payment work');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.finish(v_old||jsonb_build_object('version',NULL)),
    'null expected version cannot finish payment work');
  PERFORM payment_inbox_test.assert(payment_inbox_test.record_refund(v_old,jsonb_build_array(payment_inbox_test.refund(200))),
    'verified refund facts commit before a simulated worker crash');
  UPDATE private.payment_worker_health SET run_expires_at=clock_timestamp()-interval '1 second';
  UPDATE private.payment_event_inbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=v_item;
  v_run:=public.claim_payment_worker_run();
  v_new:=public.claim_payment_events((v_run->>'token')::uuid,1)->0;
  v_new:=v_new||jsonb_build_object('runToken',v_run->>'token');
  PERFORM payment_inbox_test.assert((v_new->>'id')::uuid=v_item AND (v_new->>'attempts')::integer=2,
    'an expired processing claim is recovered as the next counted attempt');
  PERFORM payment_inbox_test.assert(v_new->>'leaseToken'<>v_old->>'leaseToken','takeover rotates the item lease');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.finish(v_old),
    'stale worker cannot complete a claim after takeover');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.record_refund(v_old,jsonb_build_array(payment_inbox_test.refund(200,'pending'))),
    'stale worker cannot persist refund observations after takeover');
  BEGIN
    PERFORM payment_inbox_test.record_refund(v_new,jsonb_build_array(payment_inbox_test.refund(299)));
    RAISE EXCEPTION 'foreign refund facts escaped their leased event identity';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM payment_inbox_test.assert(payment_inbox_test.record_refund(v_new,jsonb_build_array(payment_inbox_test.refund(200))),
    'current claim persists its authoritative refund observation');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.record_refund(v_old,jsonb_build_array(payment_inbox_test.refund(200,'pending'))),
    'late stale observation cannot overwrite a newer authoritative refund state');
  PERFORM payment_inbox_test.assert((SELECT status='succeeded' FROM private.payment_refund_observations WHERE refund_id='re_inbox200'),
    'newer refund observation survives stale writer');
  PERFORM payment_inbox_test.assert((SELECT count(*)=1 FROM private.payment_refund_observations WHERE refund_id='re_inbox200'),
    'recovery after facts commit does not duplicate the financial observation');
  PERFORM payment_inbox_test.assert(payment_inbox_test.finish(v_new),'takeover worker completes once');
  PERFORM payment_inbox_test.assert(NOT payment_inbox_test.finish(v_new),'duplicate completion cannot advance terminal receipt');
  PERFORM payment_inbox_test.assert(NOT public.finish_payment_worker_run((v_old->>'runToken')::uuid,1,0),
    'stale run cannot overwrite the heartbeat of its replacement');
  PERFORM payment_inbox_test.assert(public.finish_payment_worker_run((v_new->>'runToken')::uuid,1,0),'current run completes');
END $$;

DO $$ DECLARE v_claim jsonb; v_run jsonb; v_item uuid; BEGIN
  v_claim:=payment_inbox_test.start(201); v_item:=(v_claim->>'id')::uuid;
  UPDATE private.payment_event_inbox SET attempts=11,lifetime_attempts=11,
    lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=v_item;
  UPDATE private.payment_worker_health SET run_expires_at=clock_timestamp()-interval '1 second';
  v_run:=public.claim_payment_worker_run();
  v_claim:=public.claim_payment_events((v_run->>'token')::uuid,1)->0;
  PERFORM payment_inbox_test.assert((v_claim->>'attempts')::integer=12,'twelfth claim is the last provider attempt');
  UPDATE private.payment_event_inbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=v_item;
  UPDATE private.payment_worker_health SET run_expires_at=clock_timestamp()-interval '1 second';
  v_run:=public.claim_payment_worker_run();
  PERFORM payment_inbox_test.assert(public.claim_payment_events((v_run->>'token')::uuid,1)='[]'::jsonb,
    'crashed twelfth claim is never issued as attempt thirteen');
  PERFORM payment_inbox_test.assert((SELECT status='dead_letter' AND attempts=12 AND lifetime_attempts=12
    FROM private.payment_event_inbox WHERE id=v_item),'exhausted crash retains exact attempt counts');
  PERFORM payment_inbox_test.assert(EXISTS(SELECT 1 FROM private.payment_event_incidents
    WHERE item_id=v_item AND code='attempts_exhausted' AND resolved_at IS NULL),'exhausted crash is visible to the operator');
  PERFORM public.finish_payment_worker_run((v_run->>'token')::uuid,0,0);
END $$;

DO $$ DECLARE v_run jsonb; v_claims jsonb; v_claim jsonb; BEGIN
  UPDATE private.payment_event_inbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE status='pending';
  PERFORM public.receive_payment_event(payment_inbox_test.envelope(n)) FROM generate_series(300,324) n;
  v_run:=public.claim_payment_worker_run();
  v_claims:=public.claim_payment_events((v_run->>'token')::uuid,20);
  PERFORM payment_inbox_test.assert(jsonb_array_length(v_claims)=20,'worker claims at most twenty due items');
  PERFORM payment_inbox_test.assert(public.claim_payment_events((v_run->>'token')::uuid,20)='[]'::jsonb,
    'additional claim calls cannot bypass the per-run budget');
  FOR v_claim IN SELECT value FROM jsonb_array_elements(v_claims) LOOP
    PERFORM payment_inbox_test.finish(v_claim||jsonb_build_object('runToken',v_run->>'token'));
  END LOOP;
  PERFORM payment_inbox_test.assert(public.finish_payment_worker_run((v_run->>'token')::uuid,20,0),
    'bounded worker records its completed twenty-item run');
END $$;
DO $$ DECLARE v_run jsonb; BEGIN
  UPDATE private.payment_event_inbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE status='pending';
  PERFORM public.receive_payment_event(payment_inbox_test.envelope(n)) FROM generate_series(700,720) n;
  UPDATE private.payment_event_inbox SET attempts=12,lifetime_attempts=12
    WHERE event_id IN (SELECT 'evt_inbox'||n FROM generate_series(700,720) n);
  v_run:=public.claim_payment_worker_run();
  PERFORM public.claim_payment_events((v_run->>'token')::uuid,1);
  PERFORM payment_inbox_test.assert((SELECT count(*)=20 FROM private.payment_event_inbox WHERE status='dead_letter'
    AND event_id IN (SELECT 'evt_inbox'||n FROM generate_series(700,720) n)),
    'one claim call bounds exhausted-attempt maintenance to twenty receipts');
  PERFORM public.claim_payment_events((v_run->>'token')::uuid,1);
  PERFORM payment_inbox_test.assert((SELECT count(*)=21 FROM private.payment_event_inbox WHERE status='dead_letter'
    AND event_id IN (SELECT 'evt_inbox'||n FROM generate_series(700,720) n)),
    'subsequent bounded maintenance progresses to the remaining exhausted receipt');
  PERFORM public.finish_payment_worker_run((v_run->>'token')::uuid,0,0);
END $$;
RESET ROLE;
SELECT payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM private.payment_event_inbox WHERE event_id='evt_inbox99'),
  'receipt failure rolls back without a durable duplicate identity');
DROP TRIGGER payment_inbox_test_receipt_failure ON private.payment_event_inbox;
SET ROLE service_role;
SELECT payment_inbox_test.assert(public.receive_payment_event(payment_inbox_test.envelope(99))->>'status'='received',
  'provider retry can durably receive the event after storage recovers');
RESET ROLE;

SET ROLE service_role;
SELECT payment_inbox_test.assert(public.finish_payment_worker_run(NULL,0,0)=false,
  'a null run token cannot fabricate a completed worker heartbeat');
DO $$
DECLARE v_run jsonb; v_claim jsonb; v_completed timestamptz; v_item uuid; v_version integer;
  v_actor uuid:=md5('payment-inbox:actor:1')::uuid; v_request uuid:=md5('payment-inbox:replay:100')::uuid;
BEGIN
  UPDATE private.payment_event_inbox SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE status='pending';
  v_item:=(public.receive_payment_event(payment_inbox_test.envelope(100))->>'itemId')::uuid;
  v_run:=public.claim_payment_worker_run();
  v_claim:=public.claim_payment_events((v_run->>'token')::uuid,1)->0;
  PERFORM payment_inbox_test.assert((v_claim->>'id')::uuid=v_item,'current event is claimed');
  PERFORM payment_inbox_test.assert(public.finish_payment_event((v_run->>'token')::uuid,v_item,
    (v_claim->>'leaseToken')::uuid,(v_claim->>'version')::integer,'processed'),
    'verified event finishes durably');
  SELECT processed_at,version INTO v_completed,v_version FROM private.payment_event_inbox WHERE id=v_item;
  PERFORM payment_inbox_test.assert(public.finish_payment_worker_run((v_run->>'token')::uuid,1,0),
    'current worker records completion');
  PERFORM payment_inbox_test.assert(public.replay_payment_event(v_actor,v_item,v_version,
    'Recheck synthetic settlement after provider correction',v_request,true)->>'status'='eligible',
    'active admin previews an exact completed event replay');
  PERFORM payment_inbox_test.assert(public.replay_payment_event(v_actor,v_item,v_version,
    'Recheck synthetic settlement after provider correction',v_request,false)->>'status'='applied',
    'matching approved preview requeues the completed event');
  PERFORM payment_inbox_test.assert((SELECT count(*)=2 FROM private.payment_replay_audit a
    WHERE request_id=v_request AND to_jsonb(a)->>'prior_status'='processed'
      AND (to_jsonb(a)->>'prior_processed_at')::timestamptz=v_completed),
    'replay retains the prior processed status and exact completion time in immutable history');
END $$;
RESET ROLE;

CREATE FUNCTION payment_inbox_test.seed_replay(n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item uuid; BEGIN
  v_item:=(public.receive_payment_event(payment_inbox_test.envelope(n))->>'itemId')::uuid;
  UPDATE private.payment_event_inbox SET status='dead_letter',attempts=12,lifetime_attempts=12,
    error_code='attempts_exhausted' WHERE id=v_item;
  RETURN v_item;
END $$;
CREATE FUNCTION payment_inbox_test.replay(n integer,request_n integer,dry_run boolean DEFAULT true,
  expected_version integer DEFAULT 1,actor_n integer DEFAULT 1,reason text DEFAULT 'Retry synthetic event after provider recovery')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.replay_payment_event(md5('payment-inbox:actor:'||actor_n)::uuid,
    (SELECT id FROM private.payment_event_inbox WHERE event_id='evt_inbox'||n),expected_version,
    reason,md5('payment-inbox:request:'||request_n)::uuid,dry_run)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_inbox_test TO service_role;
SET ROLE service_role;
DO $$ DECLARE v_item uuid; v_actor integer; BEGIN
  v_item:=payment_inbox_test.seed_replay(400);
  FOR v_actor IN 2..4 LOOP
    PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400,true,1,v_actor)->>'status'='denied',
      'inactive admin and catalog roles cannot authorize payment replay');
    BEGIN
      PERFORM public.read_payment_operations(md5('payment-inbox:actor:'||v_actor)::uuid);
      RAISE EXCEPTION 'unauthorized operator read was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  PERFORM payment_inbox_test.assert(public.read_payment_operations(md5('payment-inbox:actor:1')::uuid)->>'environment'='sandbox',
    'active administrator reads the protected operations projection');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400,false)->>'status'='dry_run_required',
    'replay requires an exact durable preview before application');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400)->>'status'='eligible','active admin creates preview');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400)->>'status'='eligible','same preview is repeat safe');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400,false,1,1,'Different reason cannot reuse request')->>'status'='conflict',
    'request UUID cannot be reused for different operator intent');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400,false)->>'status'='applied','exact preview applies');
  PERFORM payment_inbox_test.assert(payment_inbox_test.replay(400,400,false)->>'status'='duplicate','same apply is idempotent');
  PERFORM payment_inbox_test.assert((SELECT attempts=0 AND lifetime_attempts=12 AND version=2
    FROM private.payment_event_inbox WHERE id=v_item),'replay resets only cycle attempts and advances one row version');
  PERFORM payment_inbox_test.assert((SELECT count(*)=2 AND min(prior_attempts)=12 FROM private.payment_replay_audit
    WHERE request_id=md5('payment-inbox:request:400')::uuid),'one immutable preview and apply retain previous attempts');
  BEGIN
    UPDATE private.payment_replay_audit SET reason='Forbidden history overwrite' WHERE item_id=v_item;
    RAISE EXCEPTION 'service role rewrote audit history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Even an authenticated administrator cannot bypass the server-only RPC boundary.
SET ROLE authenticated;
DO $$ DECLARE v_actor integer; BEGIN
  FOR v_actor IN 1..4 LOOP
    PERFORM set_config('request.jwt.claim.sub',md5('payment-inbox:actor:'||v_actor)::uuid::text,true);
    BEGIN
      PERFORM public.replay_payment_event(md5('payment-inbox:actor:'||v_actor)::uuid,
        gen_random_uuid(),1,'Direct client replay must fail',gen_random_uuid(),true);
      RAISE EXCEPTION 'authenticated client called payment mutation directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
DO $$ DECLARE v_function record; v_role text; BEGIN
  FOR v_function IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('receive_payment_event','claim_payment_worker_run','claim_payment_events','finish_payment_event',
      'record_payment_event_incident','record_payment_refund_observations','finish_payment_worker_run',
      'read_payment_operations','replay_payment_event') LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM payment_inbox_test.assert(NOT has_function_privilege(v_role,v_function.signature,'EXECUTE'),
        'all inbox entry points deny direct customer execution: '||v_function.signature::text);
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION payment_inbox_test.fail_replay_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF new.phase='apply' AND new.request_id=md5('payment-inbox:request:401')::uuid THEN
    RAISE EXCEPTION 'synthetic replay audit storage failure'; END IF; RETURN new;
END $$;
CREATE TRIGGER payment_inbox_test_audit_failure BEFORE INSERT ON private.payment_replay_audit
  FOR EACH ROW EXECUTE FUNCTION payment_inbox_test.fail_replay_audit();
SET ROLE service_role;
DO $$ DECLARE v_item uuid; BEGIN
  v_item:=payment_inbox_test.seed_replay(401);
  PERFORM payment_inbox_test.replay(401,401);
  BEGIN
    PERFORM payment_inbox_test.replay(401,401,false);
    RAISE EXCEPTION 'replay escaped failed audit persistence';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic replay audit storage failure' THEN RAISE; END IF;
  END;
  PERFORM payment_inbox_test.assert((SELECT status='dead_letter' AND attempts=12 AND lifetime_attempts=12 AND version=1
    FROM private.payment_event_inbox WHERE id=v_item),'audit failure rolls back the replay reset');
  PERFORM payment_inbox_test.assert((SELECT count(*)=1 FROM private.payment_replay_audit WHERE item_id=v_item),
    'failed replay leaves only its successful preview');
END $$;
RESET ROLE;
DROP TRIGGER payment_inbox_test_audit_failure ON private.payment_replay_audit;
SET ROLE service_role;
SELECT payment_inbox_test.assert(payment_inbox_test.replay(401,401,false)->>'status'='applied',
  'retry applies once after audit storage recovers');
RESET ROLE;

CREATE FUNCTION payment_inbox_test.binding(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('orderId',md5('payment-inbox:order:'||n)::uuid,
    'sessionId','cs_test_inbox'||n,'paymentIntentId','pi_inbox'||n)
$$;
CREATE FUNCTION payment_inbox_test.bound_refund(c jsonb,n integer,status text,
  exception_status text DEFAULT NULL,resolve_exception boolean DEFAULT false)
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.record_payment_refund_observations((c->>'runToken')::uuid,(c->>'id')::uuid,
    (c->>'leaseToken')::uuid,(c->>'version')::integer,
    jsonb_build_array(payment_inbox_test.refund(n,status)||jsonb_build_object('orderId',md5('payment-inbox:order:'||n)::uuid)),
    CASE WHEN exception_status IS NOT NULL THEN payment_inbox_test.binding(n)||jsonb_build_object(
      'paymentStatus',exception_status,'amountCents',CASE WHEN status='succeeded' THEN 2500 ELSE 0 END) END,
    CASE WHEN resolve_exception THEN payment_inbox_test.binding(n) END)
$$;
CREATE TABLE payment_inbox_test.current_claim(c jsonb NOT NULL);
GRANT SELECT,INSERT,DELETE ON payment_inbox_test.current_claim TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payment_inbox_test TO service_role;
INSERT INTO public.orders(id,stripe_checkout_session_id,stripe_payment_intent_id,status,total_cents)
VALUES(md5('payment-inbox:order:600')::uuid,'cs_test_inbox600','pi_inbox600','paid',2500);
CREATE FUNCTION payment_inbox_test.fail_exception_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF new.order_id=md5('payment-inbox:order:600')::uuid THEN
    RAISE EXCEPTION 'synthetic private exception persistence failure'; END IF; RETURN new;
END $$;
CREATE TRIGGER payment_inbox_test_exception_failure BEFORE INSERT OR UPDATE ON private.checkout_payment_exceptions
  FOR EACH ROW EXECUTE FUNCTION payment_inbox_test.fail_exception_write();
SET ROLE service_role;
DO $$ DECLARE v_claim jsonb; BEGIN
  v_claim:=payment_inbox_test.start(600,'charge');
  INSERT INTO payment_inbox_test.current_claim VALUES(v_claim);
  BEGIN
    PERFORM payment_inbox_test.bound_refund(v_claim,600,'succeeded','refunded');
    RAISE EXCEPTION 'refund facts escaped failed private exception persistence';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic private exception persistence failure' THEN RAISE; END IF;
  END;
  PERFORM payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM private.payment_refund_observations WHERE refund_id='re_inbox600'),
    'private exception write failure rolls back the matching refund fact');
  PERFORM payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM private.checkout_payment_exceptions
    WHERE order_id=md5('payment-inbox:order:600')::uuid),'failed exception persistence creates no false recorded outcome');
END $$;
RESET ROLE;
DROP TRIGGER payment_inbox_test_exception_failure ON private.checkout_payment_exceptions;
CREATE FUNCTION payment_inbox_test.fail_exception_resolution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF new.resolved_at IS NOT NULL AND current_setting('payment_inbox_test.fail_resolution',true)='on' THEN
    RAISE EXCEPTION 'synthetic private exception resolution failure'; END IF; RETURN new;
END $$;
CREATE TRIGGER payment_inbox_test_resolution_failure BEFORE UPDATE ON private.checkout_payment_exceptions
  FOR EACH ROW EXECUTE FUNCTION payment_inbox_test.fail_exception_resolution();
SET ROLE service_role;
DO $$ DECLARE v_claim jsonb; v_observed_before timestamptz; BEGIN
  SELECT c INTO v_claim FROM payment_inbox_test.current_claim;
  PERFORM payment_inbox_test.assert(payment_inbox_test.bound_refund(v_claim,600,'succeeded','refunded'),
    'recovery atomically records refund money returned and unresolved local reconciliation');
  PERFORM payment_inbox_test.assert((SELECT payment_status='refunded' AND amount_cents=2500 AND resolved_at IS NULL
    FROM private.checkout_payment_exceptions WHERE order_id=md5('payment-inbox:order:600')::uuid
      AND code='full_refund_reconciliation_failed'),'exception reports actual returned money without claiming local completion');
  PERFORM public.record_checkout_payment_exception(md5('payment-inbox:order:600')::uuid,NULL,'cs_test_inbox600',
    'tax_mismatch','pi_inbox600','unknown',2500);
  UPDATE public.orders SET status='refunded' WHERE id=md5('payment-inbox:order:600')::uuid;
  SELECT observed_at INTO v_observed_before FROM private.payment_refund_observations WHERE refund_id='re_inbox600';
  PERFORM set_config('payment_inbox_test.fail_resolution','on',true);
  BEGIN
    PERFORM payment_inbox_test.bound_refund(v_claim,600,'succeeded',NULL,true);
    RAISE EXCEPTION 'refund facts escaped failed exception resolution';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic private exception resolution failure' THEN RAISE; END IF;
  END;
  PERFORM set_config('payment_inbox_test.fail_resolution','off',true);
  PERFORM payment_inbox_test.assert((SELECT observed_at=v_observed_before FROM private.payment_refund_observations
    WHERE refund_id='re_inbox600'),'exception resolution storage failure rolls back the fresh observation');
  PERFORM payment_inbox_test.assert((SELECT resolved_at IS NULL FROM private.checkout_payment_exceptions
    WHERE order_id=md5('payment-inbox:order:600')::uuid AND code='full_refund_reconciliation_failed'),
    'failed resolution leaves the reconciliation exception unresolved');
  PERFORM payment_inbox_test.assert(payment_inbox_test.bound_refund(v_claim,600,'succeeded',NULL,true),
    'verified full reconciliation resolves only its matching refund exception');
  PERFORM payment_inbox_test.assert((SELECT resolved_at IS NULL FROM private.checkout_payment_exceptions
    WHERE order_id=md5('payment-inbox:order:600')::uuid AND code='tax_mismatch'),
    'refund reconciliation preserves unrelated verification exceptions');
  PERFORM payment_inbox_test.assert(payment_inbox_test.bound_refund(v_claim,600,'requires_action','unknown'),
    'later provider reversal is persisted even after an earlier succeeded observation');
  PERFORM payment_inbox_test.assert((SELECT status='requires_action' AND succeeded_previously
    FROM private.payment_refund_observations WHERE refund_id='re_inbox600'),
    'current refund status changes while retaining history of prior success');
  PERFORM payment_inbox_test.assert(EXISTS(SELECT 1 FROM private.payment_event_incidents
    WHERE item_id=(v_claim->>'id')::uuid AND code='refund_status_reversed' AND resolved_at IS NULL),
    'non-monotone refund reversal creates an unresolved incident');
  BEGIN
    PERFORM payment_inbox_test.bound_refund(v_claim,600,'pending',NULL,true);
    RAISE EXCEPTION 'pending refund falsely resolved completed money movement';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM payment_inbox_test.assert((SELECT status='requires_action' FROM private.payment_refund_observations WHERE refund_id='re_inbox600'),
    'rejected refund resolution rolls its observation back');
  PERFORM payment_inbox_test.assert(payment_inbox_test.bound_refund(v_claim,600,'succeeded',NULL,true),
    'fresh succeeded facts allow recovery of a previously reversed refund');
  PERFORM payment_inbox_test.assert((SELECT resolved_at IS NOT NULL FROM private.checkout_payment_exceptions
    WHERE order_id=md5('payment-inbox:order:600')::uuid AND code='full_refund_reconciliation_failed'),
    'matching refund exception resolves with verified completion');
  PERFORM payment_inbox_test.finish(v_claim);
  PERFORM public.finish_payment_worker_run((v_claim->>'runToken')::uuid,1,0);
END $$;
RESET ROLE;
DROP TRIGGER payment_inbox_test_resolution_failure ON private.checkout_payment_exceptions;

CREATE FUNCTION payment_inbox_test.fail_refund_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF new.refund_id='re_fail602' THEN RAISE EXCEPTION 'synthetic second refund persistence failure'; END IF; RETURN new;
END $$;
CREATE TRIGGER payment_inbox_test_refund_failure BEFORE INSERT ON private.payment_refund_observations
  FOR EACH ROW EXECUTE FUNCTION payment_inbox_test.fail_refund_fact();
SET ROLE service_role;
DO $$ DECLARE v_claim jsonb; BEGIN
  v_claim:=payment_inbox_test.start(602,'charge');
  BEGIN
    PERFORM payment_inbox_test.record_refund(v_claim,jsonb_build_array(payment_inbox_test.refund(602,'pending'),
      payment_inbox_test.refund(602,'pending')||jsonb_build_object('refundId','re_fail602')));
    RAISE EXCEPTION 'partial refund batch escaped failed persistence';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic second refund persistence failure' THEN RAISE; END IF;
  END;
  PERFORM payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM private.payment_refund_observations
    WHERE refund_id IN ('re_inbox602','re_fail602')),'failed refund batch rolls back every earlier fact');
  PERFORM payment_inbox_test.assert(NOT EXISTS(SELECT 1 FROM private.payment_event_incidents
    WHERE item_id=(v_claim->>'id')::uuid),'failed refund batch rolls back its earlier incident');
  PERFORM payment_inbox_test.assert(public.record_payment_event_incident((v_claim->>'runToken')::uuid,
    (v_claim->>'id')::uuid,(v_claim->>'leaseToken')::uuid,(v_claim->>'version')::integer,'storage_unavailable'),
    'worker records a safe storage incident separately after transactional rollback');
  PERFORM payment_inbox_test.finish(v_claim,'pending','storage_unavailable',7200);
  PERFORM payment_inbox_test.assert((SELECT next_attempt_at > clock_timestamp()+interval '119 minutes'
    FROM private.payment_event_inbox WHERE id=(v_claim->>'id')::uuid),'provider retry-after longer than one hour is preserved');
  PERFORM public.finish_payment_worker_run((v_claim->>'runToken')::uuid,0,1);
END $$;
RESET ROLE;
DROP TRIGGER payment_inbox_test_refund_failure ON private.payment_refund_observations;

SELECT payment_inbox_test.assert(to_regprocedure('public.read_account_order_payment_exceptions(uuid,uuid[])') IS NOT NULL,
  'account order history has a bounded owner-scoped current-exception entry point');
INSERT INTO public.orders(id,user_id,stripe_checkout_session_id,stripe_payment_intent_id,status,total_cents)
SELECT md5('payment-inbox:order:'||n)::uuid,md5('payment-inbox:actor:'||CASE WHEN n=801 THEN 2 ELSE 1 END)::uuid,
  'cs_test_inbox'||n,'pi_inbox'||n,CASE WHEN n=800 THEN 'refunded' ELSE 'paid' END,2500 FROM generate_series(800,809) n;
SET ROLE service_role;
SELECT public.record_checkout_payment_exception(md5('payment-inbox:order:'||n)::uuid,NULL,
  CASE WHEN n=802 THEN 'cs_test_old802' ELSE 'cs_test_inbox'||n END,
  'full_refund_reconciliation_failed','pi_inbox'||n,'unknown',0) FROM unnest(ARRAY[800,801,802,803,805]) n;
SELECT public.record_checkout_payment_exception(md5('payment-inbox:order:805')::uuid,NULL,
  'cs_test_inbox805','tax_mismatch','pi_inbox805','unknown',2500);
SELECT public.resolve_checkout_payment_exceptions(md5('payment-inbox:order:803')::uuid,
  'cs_test_inbox803','full_refund_reconciliation_failed');
DO $$ DECLARE v_result jsonb; v_user uuid:=md5('payment-inbox:actor:1')::uuid;
  v_order uuid:=md5('payment-inbox:order:800')::uuid; BEGIN
  v_result:=public.read_account_order_payment_exceptions(v_user,
    ARRAY(SELECT md5('payment-inbox:order:'||n)::uuid FROM generate_series(800,809) n));
  PERFORM payment_inbox_test.assert(jsonb_array_length(v_result)=2 AND v_result @> jsonb_build_array(
    v_order,md5('payment-inbox:order:805')::uuid),
    'ten-order history includes only owned current unresolved exceptions once per Order');
  PERFORM payment_inbox_test.assert(public.read_account_order_payment_exceptions(v_user,
    ARRAY[md5('payment-inbox:order:801')::uuid])='[]'::jsonb,
    'foreign Order identifiers never reveal another account exception');
  PERFORM payment_inbox_test.assert(public.read_account_order_payment_exceptions(md5('payment-inbox:actor:2')::uuid,
    ARRAY[md5('payment-inbox:order:801')::uuid])=jsonb_build_array(md5('payment-inbox:order:801')::uuid),
    'an account can read its own current exception flag');
  PERFORM payment_inbox_test.assert(public.read_account_order_payment_exceptions(v_user,ARRAY[]::uuid[])='[]'::jsonb,
    'empty history returns no exception identifiers');
  BEGIN
    PERFORM public.read_account_order_payment_exceptions(NULL,ARRAY[v_order]);
    RAISE EXCEPTION 'null history owner accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.read_account_order_payment_exceptions(v_user,NULL);
    RAISE EXCEPTION 'null history input accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.read_account_order_payment_exceptions(v_user,ARRAY[NULL]::uuid[]);
    RAISE EXCEPTION 'null history element accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.read_account_order_payment_exceptions(v_user,ARRAY[v_order,v_order]);
    RAISE EXCEPTION 'duplicate history identifiers accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.read_account_order_payment_exceptions(v_user,
      ARRAY(SELECT md5('payment-inbox:order:'||n)::uuid FROM generate_series(800,810) n));
    RAISE EXCEPTION 'unbounded history batch accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT payment_inbox_test.assert(has_function_privilege('service_role',
  'public.read_account_order_payment_exceptions(uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('anon','public.read_account_order_payment_exceptions(uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.read_account_order_payment_exceptions(uuid,uuid[])','EXECUTE'),
  'bounded account history exception projection remains server-only');
