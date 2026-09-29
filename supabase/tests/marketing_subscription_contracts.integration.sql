CREATE SCHEMA marketing_contract_test;
CREATE FUNCTION marketing_contract_test.assert(p_condition boolean,p_message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message; END IF;
END $$;
GRANT USAGE ON SCHEMA marketing_contract_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA marketing_contract_test TO service_role;
CREATE FUNCTION marketing_contract_test.contract() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('version','welcome_v1','siteOrigin','https://helixskin.vercel.app',
    'from','Helix <onboarding@resend.dev>','replyTo','support@example.invalid',
    'postalAddress','Synthetic fixture address','topicId','topic_synthetic',
    'templates',jsonb_build_object(
      'marketing_confirmation',jsonb_build_object('id','confirmation_synthetic','sha256',repeat('a',64)),
      'welcome_initial',jsonb_build_object('id','welcome_synthetic','sha256',repeat('b',64)),
      'welcome_education',jsonb_build_object('id','education_synthetic','sha256',repeat('c',64))))
$$;

-- APPLY MARKETING SUBSCRIPTION MIGRATION

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN
    PERFORM public.request_marketing_subscription('synthetic@example.invalid','footer','welcome_v1',
      repeat('a',64),repeat('b',64),false,null);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM marketing_contract_test.assert(denied,'unchecked consent is refused by the database boundary');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('sync@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE work jsonb; v_id uuid; v_revision bigint; v_generation bigint; BEGIN
  work:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(work->>'subscriberId')::uuid; v_revision:=(work->>'revision')::bigint; v_generation:=(work->>'generation')::bigint;
  PERFORM marketing_contract_test.assert(work->>'syncScope'='confirmed' AND work->>'topicId'='topic_synthetic',
    'only explicit confirmation schedules provider opt-in with the frozen Topic');
  PERFORM marketing_contract_test.assert(public.validate_marketing_sync(v_id,v_revision,
    '00000000-0000-0000-0000-000000000001'),'current lease authorizes one provider synchronization');
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'topic');
  PERFORM marketing_contract_test.assert(NOT public.validate_marketing_sync(v_id,v_revision,
    '00000000-0000-0000-0000-000000000001'),'withdrawal fences a claimed opt-in before external work');
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_sync(v_id,v_revision,
    '00000000-0000-0000-0000-000000000001','contact_synthetic','topic_synthetic','synced'),
    'late opt-in completion cannot restore withdrawn local state');
  work:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM marketing_contract_test.assert(work->>'syncScope'='welcome','Topic withdrawal repairs only Topic preference');
  PERFORM marketing_contract_test.assert(public.finish_marketing_sync(v_id,(work->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000002','contact_synthetic','topic_synthetic','synced'),
    'the current deny revision may complete its provider repair');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_provider_observation(v_id,v_generation,v_revision,
    'contact_synthetic','topic_synthetic',true,true),'an old observation cannot restore withdrawn consent');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT marketing_contract_test.assert(public.request_marketing_subscription(
  '  Synthetic@Example.invalid  ','footer','welcome_v1',repeat('a',64),repeat('b',64),true,
  marketing_contract_test.contract())='{"status":"accepted"}'::jsonb,
  'a valid request has a generic public result');
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_subscribers
  WHERE normalized_email='synthetic@example.invalid' AND generation=1 AND status='pending'),
  'new permission starts pending under a normalized address');
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_consent_evidence
  WHERE event='requested' AND source='footer' AND wording_version='welcome_v1'),
  'the exact consent evidence is retained');
SELECT public.request_marketing_subscription('synthetic@example.invalid','footer','welcome_v1',
  repeat('c',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_confirmation_tokens),
  'immediate resend creates no token or duplicate evidence');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('a',64),repeat('p',64))->>'status'='confirmed',
  'only an address confirmation activates the current generation');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('a',64),repeat('q',64))->>'status'='confirmed',
  'repeated confirmation is idempotent');
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_preference_tokens),
  'repeated confirmation cannot issue another preferences capability');
SELECT public.withdraw_marketing_subscription(repeat('p',64),'topic');
SELECT marketing_contract_test.assert((SELECT status='withdrawn' AND NOT topic_allowed FROM private.marketing_subscribers
  WHERE normalized_email='synthetic@example.invalid'),'topic withdrawal prevents welcome');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('a',64),repeat('q',64))->>'status'='invalid',
  'a consumed confirmation cannot restore withdrawn consent');
UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
SELECT public.request_marketing_subscription('synthetic@example.invalid','footer','welcome_v1',
  repeat('d',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT marketing_contract_test.assert((SELECT generation=2 AND status='pending' FROM private.marketing_subscribers),
  'explicit reconfirmation creates a new pending generation');
SELECT public.confirm_marketing_subscription(repeat('d',64),repeat('r',64));
SELECT public.withdraw_marketing_subscription(repeat('p',64),'global');
SELECT marketing_contract_test.assert((SELECT generation=2 AND status='withdrawn' AND NOT global_allowed
  FROM private.marketing_subscribers),'an older delivered unsubscribe capability can withdraw current consent');
ROLLBACK;

-- Pending resends rotate only the latest token; expired and replaced links cannot opt in.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('rotation@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
SELECT public.request_marketing_subscription('rotation@example.invalid','footer','welcome_v1',
  repeat('c',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('a',64),repeat('p',64))->>'status'='invalid',
  'a replaced pending confirmation token is invalid');
UPDATE private.marketing_confirmation_tokens SET expires_at=clock_timestamp()-interval '1 second'
  WHERE token_hash=encode(extensions.digest(repeat('c',64),'sha256'),'hex');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('c',64),repeat('p',64))->>'status'='invalid',
  'an expired confirmation token is invalid');
SELECT marketing_contract_test.assert((SELECT status='pending' AND NOT global_allowed AND NOT topic_allowed
  FROM private.marketing_subscribers),'invalid confirmations never confer permission');
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN UPDATE private.marketing_consent_evidence SET source='import';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM marketing_contract_test.assert(denied,'consent evidence cannot be rewritten');
  denied:=false;
  BEGIN UPDATE private.marketing_generations SET template_contract=template_contract||'{"version":"changed"}'::jsonb;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM marketing_contract_test.assert(denied,'a generation remains bound to its approved template contract');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN
  FOR n IN 1..4 LOOP
    PERFORM public.request_marketing_subscription('limited@example.invalid','footer','welcome_v1',
      lpad(n::text,64,'a'),repeat('b',64),true,marketing_contract_test.contract());
    UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
  END LOOP;
  PERFORM marketing_contract_test.assert((SELECT count(*)=3 FROM private.marketing_confirmation_tokens),
    'one normalized address receives at most three confirmation requests per rolling hour');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN
  FOR n IN 1..31 LOOP
    PERFORM public.request_marketing_subscription('limited-'||n||'@example.invalid','footer','welcome_v1',
      lpad(n::text,64,'a'),lpad(n::text,64,'b'),true,marketing_contract_test.contract());
  END LOOP;
  PERFORM marketing_contract_test.assert((SELECT count(*)=30 FROM private.marketing_subscribers),
    'the global thirty-per-hour ceiling cannot be bypassed with different addresses or abuse keys');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('denied@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; context jsonb; v_id uuid; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid;
  context:=public.read_marketing_send_context(v_id,1);
  PERFORM marketing_contract_test.assert((context->>'subscribed')::boolean AND NOT (context->>'syncReady')::boolean,
    'an unsynchronized confirmed generation is eligible to wait rather than permanently blocked');
  PERFORM public.finish_marketing_sync(v_id,(job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000001','contact_synthetic','topic_synthetic','synced');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_wrong','topic_synthetic',true,true),'provider observation requires the bound Contact');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_synthetic','topic_wrong',true,true),'provider observation requires the bound Topic');
  PERFORM marketing_contract_test.assert(public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_synthetic','topic_synthetic',true,true),'a current matching observation is saved');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_synthetic','topic_synthetic',false,true),'observed global withdrawal fails closed');
  context:=public.read_marketing_send_context(v_id,1);
  PERFORM marketing_contract_test.assert(NOT (context->>'subscribed')::boolean,
    'a provider withdrawal becomes sticky local denial');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_synthetic','topic_synthetic',true,true),'later provider opt-in cannot recreate local consent');
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM marketing_contract_test.assert(job->>'syncScope'='all','a global withdrawal never queues an opt-in repair');
END $$;
ROLLBACK;

SELECT marketing_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'marketing_%' AND c.relkind='r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)), 'all marketing persistence has forced private RLS');
SELECT marketing_contract_test.assert(NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.proname LIKE '%marketing%'
    AND (has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('authenticated',p.oid,'execute'))),
  'marketing RPCs are service-only, including composable private operations');

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('late-sync@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE old_job jsonb; new_job jsonb; v_id uuid; BEGIN
  old_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(old_job->>'subscriberId')::uuid;
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  UPDATE private.marketing_provider_sync SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  new_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM public.finish_marketing_sync(v_id,(new_job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000002','contact_synthetic','topic_synthetic','synced');
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_sync(v_id,(old_job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000001','contact_synthetic','topic_synthetic','synced'),
    'a replaced opt-in lease cannot mark synchronization complete');
  new_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000003',3)->0;
  PERFORM marketing_contract_test.assert(new_job->>'syncScope'='all',
    'late opt-in completion after completed denial queues a current denial repair');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('boundary@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
UPDATE private.marketing_request_limits SET occurrences=array_fill(clock_timestamp()-interval '1 hour',array[30]);
UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '60 seconds';
SELECT public.request_marketing_subscription('boundary@example.invalid','footer','welcome_v1',
  repeat('c',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT marketing_contract_test.assert((SELECT count(*)=2 FROM private.marketing_confirmation_tokens),
  'occurrences at the rolling-hour boundary expire and sixty-second resend becomes eligible');
SELECT marketing_contract_test.assert((SELECT bool_and(cardinality(occurrences)=1) FROM private.marketing_request_limits),
  'rolling abuse storage prunes expired occurrences');
ROLLBACK;

-- The database capacity seam is used inside shared dispatch preparation, never in a separate scheduler.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('capacity@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; v_id uuid; v_revision bigint; prepared jsonb; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid; v_revision:=(job->>'revision')::bigint;
  PERFORM public.finish_marketing_sync(v_id,v_revision,'00000000-0000-0000-0000-000000000001',
    'contact_synthetic','topic_synthetic','synced');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000001',
    'welcome_initial',clock_timestamp(),null,false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='preferences_unverified',
    'promotional preparation requires a fresh provider observation');
  PERFORM public.record_marketing_provider_observation(v_id,1,v_revision,'contact_synthetic','topic_synthetic',true,true);
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000001',
    'welcome_initial',clock_timestamp(),null,false);
  PERFORM marketing_contract_test.assert((prepared->>'eligible')::boolean,'the first eligible message reserves promotional capacity');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000001',
    'welcome_initial',clock_timestamp()-interval '2 days',clock_timestamp(),false);
  PERFORM marketing_contract_test.assert((prepared->>'eligible')::boolean,'an uncertain retry retains its one reservation after due expiry');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000002',
    'welcome_initial',clock_timestamp(),null,false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='frequency_limited',
    'another message cannot consume the same rolling daily slot');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000003',
    'welcome_education',clock_timestamp(),null,false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='initial_not_accepted',
    'education requires accepted initial welcome');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000004',
    'welcome_initial',clock_timestamp()-interval '24 hours',null,false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='expired','unsubmitted work expires twenty-four hours after due time');
  UPDATE private.marketing_provider_sync SET observed_at=clock_timestamp()-interval '31 seconds';
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000001',
    'welcome_initial',clock_timestamp(),clock_timestamp(),false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='preferences_unverified','every retry requires a fresh provider observation');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('weekly@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; v_id uuid; v_revision bigint; prepared jsonb; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid; v_revision:=(job->>'revision')::bigint;
  PERFORM public.finish_marketing_sync(v_id,v_revision,'00000000-0000-0000-0000-000000000001',
    'contact_synthetic','topic_synthetic','synced');
  PERFORM public.record_marketing_provider_observation(v_id,1,v_revision,'contact_synthetic','topic_synthetic',true,true);
  INSERT INTO private.marketing_send_reservations(intent_id,subscriber_id,generation,purpose,reserved_at) VALUES
    ('10000000-0000-0000-0000-000000000001',v_id,1,'welcome_initial',clock_timestamp()-interval '25 hours'),
    ('10000000-0000-0000-0000-000000000002',v_id,1,'welcome_initial',clock_timestamp()-interval '49 hours'),
    ('10000000-0000-0000-0000-000000000003',v_id,1,'welcome_initial',clock_timestamp()-interval '73 hours');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000004',
    'welcome_education',clock_timestamp(),null,true);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='frequency_limited',
    'three recent reservations block a fourth even when the daily slot is available');
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
  PERFORM public.request_marketing_subscription('weekly@example.invalid','footer','welcome_v1',
    repeat('c',64),repeat('b',64),true,marketing_contract_test.contract());
  PERFORM public.confirm_marketing_subscription(repeat('c',64),repeat('q',64));
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM public.finish_marketing_sync(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000002',
    'contact_synthetic','topic_synthetic','synced');
  PERFORM public.record_marketing_provider_observation(v_id,2,(job->>'revision')::bigint,
    'contact_synthetic','topic_synthetic',true,true);
  prepared:=private.reserve_marketing_capacity(v_id,2,(job->>'revision')::bigint,'10000000-0000-0000-0000-000000000005',
    'welcome_initial',clock_timestamp(),null,false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='frequency_limited',
    'withdrawal and reconfirmation cannot reset address-wide promotional capacity');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000001',
    'welcome_initial',clock_timestamp()-interval '3 days',clock_timestamp()-interval '1 hour',false);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='consent_ineligible',
    'an uncertain earlier-generation message cannot retry after reconfirmation');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('capacity-boundary@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; v_id uuid; v_revision bigint; prepared jsonb; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid; v_revision:=(job->>'revision')::bigint;
  PERFORM public.finish_marketing_sync(v_id,v_revision,'00000000-0000-0000-0000-000000000001',
    'contact_synthetic','topic_synthetic','synced');
  PERFORM public.record_marketing_provider_observation(v_id,1,v_revision,'contact_synthetic','topic_synthetic',true,true);
  INSERT INTO private.marketing_send_reservations(intent_id,subscriber_id,generation,purpose,reserved_at) VALUES
    ('10000000-0000-0000-0000-000000000001',v_id,1,'welcome_initial',clock_timestamp()-interval '24 hours'),
    ('10000000-0000-0000-0000-000000000002',v_id,1,'welcome_initial',clock_timestamp()-interval '49 hours'),
    ('10000000-0000-0000-0000-000000000003',v_id,1,'welcome_initial',clock_timestamp()-interval '7 days');
  prepared:=private.reserve_marketing_capacity(v_id,1,v_revision,'10000000-0000-0000-0000-000000000004',
    'welcome_education',clock_timestamp(),null,true);
  PERFORM marketing_contract_test.assert((prepared->>'eligible')::boolean,
    'exact rolling twenty-four-hour and seven-day boundaries release capacity');
END $$;
ROLLBACK;


BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('dirty-sync@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE old_job jsonb; current_job jsonb; repair_job jsonb; v_id uuid; BEGIN
  old_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(old_job->>'subscriberId')::uuid;
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  UPDATE private.marketing_provider_sync SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  current_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  -- The newer deny has reached the provider, then the old opt-in lands while its lease is still active.
  PERFORM public.finish_marketing_sync(v_id,(old_job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000001','contact_synthetic','topic_synthetic','synced');
  PERFORM marketing_contract_test.assert((SELECT lease_token='00000000-0000-0000-0000-000000000002'
    FROM private.marketing_provider_sync WHERE subscriber_id=v_id),'late completion preserves the newer active lease');
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_sync(v_id,(current_job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000002','contact_synthetic','topic_synthetic','synced'),
    'the active lease cannot erase a repair requested after its provider write');
  repair_job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000003',3)->0;
  PERFORM marketing_contract_test.assert(repair_job->>'syncScope'='all',
    'a dirty active lease must perform another current denial repair');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('late-retry@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; v_id uuid; prepared jsonb; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid;
  PERFORM public.finish_marketing_sync(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000001',
    'contact_synthetic','topic_synthetic','synced');
  PERFORM public.record_marketing_provider_observation(v_id,1,(job->>'revision')::bigint,
    'contact_synthetic','topic_synthetic',true,true);
  -- First handoff was twenty-five hours ago; its eligible retry happened three hours ago.
  INSERT INTO private.marketing_send_reservations(intent_id,subscriber_id,generation,purpose,reserved_at,last_handoff_at)
    VALUES('10000000-0000-0000-0000-000000000001',v_id,1,'welcome_initial',
      clock_timestamp()-interval '25 hours',clock_timestamp()-interval '3 hours');
  prepared:=private.reserve_marketing_capacity(v_id,1,(job->>'revision')::bigint,'10000000-0000-0000-0000-000000000002',
    'welcome_education',clock_timestamp(),null,true);
  PERFORM marketing_contract_test.assert(prepared->>'reason'='frequency_limited',
    'a late retry retains the rolling cap from its latest possible successful handoff');
END $$;
ROLLBACK;



BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('changed-contract@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
SELECT public.request_marketing_subscription('changed-contract@example.invalid','footer','welcome_v2',
  repeat('c',64),repeat('b',64),true,
  jsonb_set(marketing_contract_test.contract(),'{templates,welcome_initial,id}','"welcome_new_approved"'::jsonb));
SELECT marketing_contract_test.assert((SELECT generation=2 AND status='pending' FROM private.marketing_subscribers),
  'a changed pending approval or wording starts a fresh generation');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription(repeat('a',64),repeat('p',64))->>'status'='invalid',
  'the replaced approval token cannot confirm the new generation');
SELECT public.confirm_marketing_subscription(repeat('c',64),repeat('q',64));
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_generations
  WHERE generation=1 AND template_contract=marketing_contract_test.contract() AND wording_version='welcome_v1'),
  'the original generation retains its original consent wording and approved template');
UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
SELECT public.request_marketing_subscription('changed-contract@example.invalid','footer','welcome_v3',
  repeat('d',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT marketing_contract_test.assert((SELECT generation=2 AND status='confirmed' FROM private.marketing_subscribers),
  'a repeated signup cannot restart an already confirmed welcome series');
ROLLBACK;


BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('import-once@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; admitted jsonb; again jsonb; polled jsonb; v_id uuid; v_revision bigint; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid; v_revision:=(job->>'revision')::bigint;
  admitted:=public.admit_marketing_contact_import(v_id,v_revision,'00000000-0000-0000-0000-000000000001');
  PERFORM marketing_contract_test.assert((admitted->>'allowSubmit')::boolean,'only new durable admission authorizes import submission');
  again:=public.admit_marketing_contact_import(v_id,v_revision,'00000000-0000-0000-0000-000000000001');
  PERFORM marketing_contract_test.assert(NOT (again->>'allowSubmit')::boolean
    AND again->>'admissionToken'=admitted->>'admissionToken','an admission retry cannot authorize a duplicate POST');
  UPDATE private.marketing_provider_sync SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  again:=public.admit_marketing_contact_import(v_id,v_revision,'00000000-0000-0000-0000-000000000002');
  PERFORM marketing_contract_test.assert(NOT (again->>'allowSubmit')::boolean,'replacement leases cannot resubmit an import');
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  PERFORM marketing_contract_test.assert(public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
    '20000000-0000-0000-0000-000000000001','submitted'),'late import UUID remains durable after withdrawal');
  polled:=public.claim_marketing_contact_imports('00000000-0000-0000-0000-000000000003',3)->0;
  PERFORM marketing_contract_test.assert(polled->>'importId'='20000000-0000-0000-0000-000000000001'
    AND NOT (polled->>'currentSubscribed')::boolean,'old import polling observes current restrictive choice');
  PERFORM marketing_contract_test.assert(public.finish_marketing_contact_import(v_id,1,
    '00000000-0000-0000-0000-000000000003','completed'),'known provider import completion is retained');
  UPDATE private.marketing_provider_sync SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000004',3)->0;
  PERFORM marketing_contract_test.assert(job->>'syncScope'='all','late import completion queues current denial synchronization');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('ambiguous-import@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; admitted jsonb; polled jsonb; again jsonb; v_id uuid; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid;
  admitted:=public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000001');
  -- A worker disappears after POST; absence of a returned UUID cannot authorize another submission.
  UPDATE private.marketing_contact_imports SET next_poll_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  polled:=public.claim_marketing_contact_imports('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM marketing_contract_test.assert(polled->>'state'='uncertain' AND polled->>'importId' IS NULL,
    'abandoned import admission becomes visible unresolved polling work');
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_contact_import(v_id,1,
    '00000000-0000-0000-0000-000000000002','completed'),'mere Contact presence cannot resolve an unknown import identity');
  PERFORM public.finish_marketing_contact_import(v_id,1,'00000000-0000-0000-0000-000000000002','pending');
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  UPDATE private.marketing_subscribers SET last_requested_at=clock_timestamp()-interval '61 seconds';
  PERFORM public.request_marketing_subscription('ambiguous-import@example.invalid','footer','welcome_v1',
    repeat('c',64),repeat('b',64),true,marketing_contract_test.contract());
  PERFORM public.confirm_marketing_subscription(repeat('c',64),repeat('q',64));
  UPDATE private.marketing_provider_sync SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE subscriber_id=v_id;
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000003',3)->0;
  again:=public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000003');
  PERFORM marketing_contract_test.assert(NOT (again->>'allowSubmit')::boolean AND (again->>'generation')::bigint=1,
    'one unresolved import blocks submission across later confirmed generations');
  PERFORM public.finish_marketing_sync(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000003',
    'contact_late','topic_synthetic','synced');
  PERFORM marketing_contract_test.assert(NOT (public.read_marketing_send_context(v_id,2)->>'syncReady')::boolean,
    'contact presence and local confirmation never bypass unresolved import admission');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('sticky-contact@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; v_id uuid; admitted jsonb; denied boolean:=false; BEGIN
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000001',3)->0;
  v_id:=(job->>'subscriberId')::uuid;
  admitted:=public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000001');
  PERFORM public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
    '20000000-0000-0000-0000-000000000001','submitted');
  PERFORM marketing_contract_test.assert(NOT public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
    '20000000-0000-0000-0000-000000000002','submitted'),'a second provider import identity cannot replace the admitted operation');
  BEGIN UPDATE private.marketing_contact_imports SET admission_token='20000000-0000-0000-0000-000000000003' WHERE subscriber_id=v_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM marketing_contract_test.assert(denied,'durable admission identity cannot be rewritten');
  PERFORM public.finish_marketing_sync(v_id,(job->>'revision')::bigint,'00000000-0000-0000-0000-000000000001',
    'contact_original','topic_synthetic','synced');
  PERFORM public.withdraw_marketing_subscription(repeat('p',64),'global');
  job:=public.claim_marketing_sync('00000000-0000-0000-0000-000000000002',3)->0;
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_sync(v_id,(job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000002','contact_replacement','topic_synthetic','synced'),
    'a bound Contact is never silently replaced');
  PERFORM marketing_contract_test.assert(NOT public.finish_marketing_sync(v_id,(job->>'revision')::bigint,
    '00000000-0000-0000-0000-000000000002',null,'topic_synthetic','synced'),
    'a missing bound Contact cannot be converted into permission to recreate it');
END $$;
ROLLBACK;

-- Import polling must not perpetually move already-queued withdrawal repairs behind other retries.
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; polled jsonb; item jsonb; claimed jsonb;
  oldest_due timestamptz:=clock_timestamp()-interval '10 minutes'; BEGIN
  FOR n IN 1..4 LOOP
    PERFORM public.request_marketing_subscription('poll-fairness-'||n||'@example.invalid','footer','welcome_v1',
      lpad(n::text,64,'a'),repeat('b',64),true,marketing_contract_test.contract());
    PERFORM public.confirm_marketing_subscription(lpad(n::text,64,'a'),lpad(n::text,64,'p'));
  END LOOP;
  FOR n IN 1..2 LOOP
    PERFORM public.withdraw_marketing_subscription(lpad(n::text,64,'p'),'global');
  END LOOP;
  INSERT INTO private.marketing_contact_imports(subscriber_id,generation,confirmation_revision,topic_id,state,next_poll_at)
    SELECT id,1,2,'topic_synthetic','uncertain',clock_timestamp()-interval '1 second'
      FROM private.marketing_subscribers WHERE normalized_email IN ('poll-fairness-1@example.invalid','poll-fairness-2@example.invalid');
  UPDATE private.marketing_provider_sync SET next_attempt_at=CASE WHEN desired_subscribed
    THEN clock_timestamp()-interval '1 minute' ELSE oldest_due END,
    state=CASE WHEN desired_subscribed THEN 'retry' ELSE 'pending' END;
  FOR n IN 1..3 LOOP
    UPDATE private.marketing_contact_imports SET next_poll_at=clock_timestamp()-interval '1 second';
    polled:=public.claim_marketing_contact_imports('30000000-0000-0000-0000-000000000001',2);
    FOR item IN SELECT value FROM jsonb_array_elements(polled) LOOP
      PERFORM public.finish_marketing_contact_import((item->>'subscriberId')::uuid,1,
        '30000000-0000-0000-0000-000000000001','pending');
    END LOOP;
    PERFORM marketing_contract_test.assert((SELECT count(*)=2 FROM private.marketing_provider_sync
      WHERE NOT desired_subscribed AND next_attempt_at=oldest_due),
      'repeated unknown-import polls preserve the original withdrawal repair queue position');
  END LOOP;
  claimed:=public.claim_marketing_sync('30000000-0000-0000-0000-000000000002',2);
  PERFORM marketing_contract_test.assert(jsonb_array_length(claimed)=2 AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(claimed) j WHERE j->>'syncScope'<>'all'),
    'bounded workers select waiting withdrawal repairs ahead of repeatedly failing later jobs');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('unknown-terminal@example.invalid','footer','welcome_v1',
  repeat('a',64),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('a',64),repeat('p',64));
DO $$ DECLARE job jsonb; admitted jsonb; v_id uuid; denied boolean:=false; BEGIN
  job:=public.claim_marketing_sync('30000000-0000-0000-0000-000000000001',1)->0;
  v_id:=(job->>'subscriberId')::uuid;
  admitted:=public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,'30000000-0000-0000-0000-000000000001');
  PERFORM public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,null,'uncertain');
  BEGIN PERFORM public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,null,'failed');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM marketing_contract_test.assert(denied,'submission cannot terminalize an import without provider identity');
  PERFORM marketing_contract_test.assert((SELECT state='uncertain' FROM private.marketing_contact_imports WHERE subscriber_id=v_id),
    'an unknown submission remains an unresolved barrier');
  PERFORM marketing_contract_test.assert(public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
    '20000000-0000-0000-0000-000000000009','submitted'),'a late import UUID remains attachable for reconciliation');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; job jsonb; admitted jsonb; v_id uuid; evidence jsonb; bad jsonb; denied boolean; BEGIN
  FOR n IN 1..2 LOOP
    PERFORM public.request_marketing_subscription('failure-evidence-'||n||'@example.invalid','footer','welcome_v1',
      lpad(n::text,64,'a'),repeat('b',64),true,marketing_contract_test.contract());
    PERFORM public.confirm_marketing_subscription(lpad(n::text,64,'a'),lpad(n::text,64,'p'));
    job:=public.claim_marketing_sync('40000000-0000-0000-0000-000000000001',1)->0;
    v_id:=(job->>'subscriberId')::uuid;
    admitted:=public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,'40000000-0000-0000-0000-000000000001');
    evidence:=jsonb_build_object('category',CASE WHEN n=1 THEN 'rate_limited' ELSE 'configuration_rejected' END,
      'httpStatus',CASE WHEN n=1 THEN 429 ELSE 401 END,
      'providerName',CASE WHEN n=1 THEN 'rate_limit_exceeded' ELSE 'invalid_api_key' END,
      'retryAfterSeconds',CASE WHEN n=1 THEN 9 ELSE null END);
    PERFORM marketing_contract_test.assert(public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
      null,'uncertain',evidence),'finite failure classification can be retained');
    PERFORM marketing_contract_test.assert((SELECT state='uncertain' AND first_failure=evidence
      FROM private.marketing_contact_imports WHERE subscriber_id=v_id),'failure diagnostics never prove non-admission');
    PERFORM marketing_contract_test.assert(NOT (public.admit_marketing_contact_import(v_id,(job->>'revision')::bigint,
      '40000000-0000-0000-0000-000000000001')->>'allowSubmit')::boolean,
      'neither rate limits nor configuration classifications authorize replay');
    PERFORM public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,null,'uncertain',
      jsonb_build_object('category','provider_unavailable','httpStatus',503,'providerName',null,'retryAfterSeconds',null));
    PERFORM marketing_contract_test.assert((SELECT first_failure=evidence FROM private.marketing_contact_imports WHERE subscriber_id=v_id),
      'later finite diagnostics cannot rewrite the first failure evidence');
    FOREACH bad IN ARRAY ARRAY[
      evidence||'{"message":"Never retain raw provider text"}'::jsonb,
      evidence||'{"category":"anything_else"}'::jsonb,
      evidence||'{"httpStatus":"429"}'::jsonb,
      evidence||'{"httpStatus":99}'::jsonb,
      evidence||'{"httpStatus":600}'::jsonb,
      evidence||'{"providerName":"untrusted@example.invalid"}'::jsonb,
      evidence||'{"retryAfterSeconds":86401}'::jsonb,
      evidence||'{"retryAfterSeconds":0.5}'::jsonb,
      evidence-'providerName'
    ] LOOP
      denied:=false;
      BEGIN PERFORM public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,null,'uncertain',bad);
      EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
      PERFORM marketing_contract_test.assert(denied,'unbounded or unrecognized provider diagnostics are rejected');
    END LOOP;
    PERFORM marketing_contract_test.assert(public.record_marketing_contact_import(v_id,1,(admitted->>'admissionToken')::uuid,
      ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'submitted',null),
      'a recovered import identity remains recordable after a classified failure');
    PERFORM marketing_contract_test.assert((SELECT state='submitted' AND first_failure=evidence
      FROM private.marketing_contact_imports WHERE subscriber_id=v_id),'recovery retains the immutable historical diagnostics');
    denied:=false;
    BEGIN UPDATE private.marketing_contact_imports SET first_failure=null WHERE subscriber_id=v_id;
    EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
    PERFORM marketing_contract_test.assert(denied,'the first failure evidence cannot be erased');
  END LOOP;
END $$;
ROLLBACK;
