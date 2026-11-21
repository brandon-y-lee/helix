-- Disposable PostgreSQL17 only. Synthetic fixtures are never an installation package.
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_messages),'P2 never backfills old confirmed subscribers');
SELECT public.test_assert((SELECT NOT dispatch_enabled AND daily_limit=0 AND monthly_limit=0 AND delivery_contract_text IS NULL FROM private.production_marketing_controls),'new delivery configuration empty/off');
SELECT public.test_assert(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'default-off claim');

BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT public.test_assert(public.production_marketing_enrollment_ready(repeat('a',64),repeat('b',64)) IS FALSE,
  'fresh delivery controls hold enrollment and permit a read-only service observation');
COMMIT;

BEGIN;
DO $$
DECLARE
  contract text := '{"from":"synthetic@example.invalid"}';
  digest text := encode(sha256(convert_to(contract,'UTF8')),'hex');
  binding text := repeat('b',64);
  rotated_binding text := repeat('c',64);
  rpc regprocedure;
BEGIN
  FOREACH rpc IN ARRAY ARRAY[
    'public.production_marketing_enrollment_ready(text,text)'::regprocedure,
    'public.request_qualified_production_marketing_subscription(text,text,text,text,text,text,boolean,text,jsonb)'::regprocedure
  ] LOOP
    PERFORM public.test_assert(has_function_privilege('service_role',rpc,'EXECUTE')
      AND (SELECT p.prorettype='boolean'::regtype FROM pg_proc p WHERE p.oid=rpc)
      AND NOT has_function_privilege('anon',rpc,'EXECUTE') AND NOT has_function_privilege('authenticated',rpc,'EXECUTE')
      AND NOT EXISTS (SELECT FROM pg_proc p, LATERAL aclexplode(p.proacl) acl
        WHERE p.oid=rpc AND acl.grantee NOT IN (p.proowner,'service_role'::regrole::oid)),
      'qualified entry and readiness expose only booleans to the service role');
  END LOOP;
  PERFORM public.test_assert(NOT has_column_privilege('service_role','private.production_marketing_controls',
    'confirmation_worker_binding_hash','SELECT,UPDATE'), 'the runtime cannot read or set the private qualification');

  UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,
    daily_limit=1,monthly_limit=2,delivery_contract_text=contract;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS FALSE,
    'enabled flags, quotas and the right contract are insufficient without operator qualification');
  UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=binding;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(repeat('a',64),binding) IS FALSE,
    'a qualified worker cannot substitute for the actual stored contract bytes');
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS TRUE
    AND public.production_marketing_enrollment_ready(NULL,binding) IS FALSE
    AND public.production_marketing_enrollment_ready(digest,NULL) IS FALSE,
    'only the explicitly qualified content and worker binding are ready');
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,rotated_binding) IS FALSE,
    'unchanged content cannot mask a worker credential change');
  UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=rotated_binding;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,rotated_binding) IS TRUE
    AND public.production_marketing_enrollment_ready(digest,binding) IS FALSE,
    'operator requalification admits the current binding and rejects the old one');

  UPDATE private.production_marketing_controls SET delivery_contract_text=contract || ' ';
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,rotated_binding) IS FALSE
    AND public.production_marketing_enrollment_ready(encode(sha256(convert_to(contract || ' ','UTF8')),'hex'),rotated_binding) IS FALSE,
    'even equivalent JSON with different bytes requires qualification');
  UPDATE private.production_marketing_controls SET delivery_contract_text=contract;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,rotated_binding) IS FALSE,
    'returning to an earlier contract does not restore its previous qualification');
  UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=binding,enrollment_enabled=false;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS FALSE,'stored enrollment pause holds entry');
  UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=false;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS FALSE,'stored dispatch pause holds entry');
  UPDATE private.production_marketing_controls SET dispatch_enabled=true,daily_limit=0;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS FALSE,'zero daily allocation holds entry');
  UPDATE private.production_marketing_controls SET daily_limit=1,monthly_limit=0;
  PERFORM public.test_assert(public.production_marketing_enrollment_ready(digest,binding) IS FALSE,'zero monthly allocation holds entry');
END $$;
ROLLBACK;

UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL;
DELETE FROM private.production_marketing_request_limits;
UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,daily_limit=100,monthly_limit=1000,
  delivery_contract_text='{"version":"production_welcome_delivery_v1","from":"news@helixskin.us","replyTo":"support@helixskin.us","topicId":"11111111-1111-4111-8111-111111111111","postalAddress":"Synthetic test only","templateHash":"synthetic-local-sql-contract"}';
CREATE FUNCTION public.test_delivery(p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid; BEGIN
  PERFORM public.test_assert(public.request_production_marketing_subscription(p_label||'@example.invalid',md5(p_label||'c')||md5(p_label||'c'),md5(p_label||'p')||md5(p_label||'p'),md5(p_label||'r')||md5(p_label||'r'),true,'production_welcome_v1',public.test_envelope()),'synthetic request');
  PERFORM public.test_assert(public.confirm_production_marketing_subscription(md5(p_label||'c')||md5(p_label||'c')),'synthetic confirm');
  SELECT m.id INTO result FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE s.normalized_email=p_label||'@example.invalid' AND m.purpose='welcome';
  RETURN result;
END $$;
CREATE FUNCTION public.test_delivery_token(p_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT rtrim(translate(encode(sha256(convert_to(p_id::text,'UTF8')),'base64'),'+/','-_'),'=') $$;
CREATE FUNCTION public.test_delivery_body(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('from','news@helixskin.us','to',jsonb_build_array(s.normalized_email),'reply_to','support@helixskin.us','subject','Synthetic welcome',
    'html','<p>Synthetic welcome</p>','text','Synthetic welcome',
    'headers',jsonb_build_object('List-Unsubscribe','<https://www.helixskin.us/api/marketing/production/unsubscribe?token='||public.test_delivery_token(m.id)||'>','List-Unsubscribe-Post','List-Unsubscribe=One-Click'),
    'tags',jsonb_build_array(jsonb_build_object('name','environment','value','production'),jsonb_build_object('name','helix_message_id','value',m.id),jsonb_build_object('name','helix_purpose','value',m.purpose),jsonb_build_object('name','helix_contract','value','production_welcome_delivery_v1')))::text
  FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE m.id=p_id;
$$;
CREATE FUNCTION public.test_prepare(p_id uuid,p_lease uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.prepare_production_marketing_message(p_id,p_lease,public.test_delivery_body(p_id),encode(sha256(convert_to(public.test_delivery_token(p_id),'UTF8')),'hex'),
    (SELECT encode(sha256(convert_to(delivery_contract_text,'UTF8')),'hex') FROM private.production_marketing_controls));
$$;
CREATE FUNCTION public.test_reconfirm(p_id uuid,p_label text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_subscriber uuid; v_email text; v_preference text; v_result uuid; BEGIN
  SELECT s.id,s.normalized_email,g.preference_hash INTO v_subscriber,v_email,v_preference
    FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id
    JOIN private.production_marketing_generations g ON g.subscriber_id=s.id AND g.generation=s.generation WHERE m.id=p_id;
  PERFORM public.test_assert(public.withdraw_production_marketing_subscription(v_preference),'withdraw before fresh explicit consent');
  PERFORM public.test_assert(public.request_production_marketing_subscription(' '||upper(v_email)||' ',md5(p_label||'c')||md5(p_label||'c'),
    md5(p_label||'p')||md5(p_label||'p'),md5(p_label||'r')||md5(p_label||'r'),true,'production_welcome_v1',public.test_envelope()),'fresh explicit request');
  PERFORM public.test_assert(public.confirm_production_marketing_subscription(md5(p_label||'c')||md5(p_label||'c')),'fresh explicit confirmation');
  SELECT m.id INTO v_result FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s
    ON s.id=m.subscriber_id AND s.generation=m.generation WHERE s.id=v_subscriber AND m.purpose='welcome';
  RETURN v_result;
END $$;
-- Historical synthetic admissions are seeded directly because the real request
-- API deliberately refuses backdating. The new generation still uses real RPCs.
CREATE FUNCTION public.test_frequency_history(p_label text,p_latest_ages interval[],p_first_ages interval[] DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_subscriber uuid:=gen_random_uuid(); v_id uuid; v_result uuid; v_count integer:=cardinality(p_latest_ages);
  v_first timestamptz; v_latest timestamptz; v_now timestamptz:=clock_timestamp(); BEGIN
  INSERT INTO private.production_marketing_subscribers(id,normalized_email,generation,revision,state)
    VALUES(v_subscriber,p_label||'@example.invalid',v_count,v_count*2+1,'withdrawn');
  FOR i IN 1..v_count LOOP
    v_id:=gen_random_uuid();v_latest:=v_now-p_latest_ages[i];v_first:=v_now-coalesce(p_first_ages[i],p_latest_ages[i]);
    INSERT INTO private.production_marketing_generations(subscriber_id,generation,request_revision,wording_version,requested_at,expires_at,confirmation_hash,preference_hash)
      VALUES(v_subscriber,i,i*2-1,'production_welcome_v1',v_first-interval '1 minute',v_first+interval '24 hours',
        md5(p_label||i||'c')||md5(p_label||i||'c'),md5(p_label||i||'p')||md5(p_label||i||'p'));
    INSERT INTO private.production_marketing_messages(id,subscriber_id,generation,revision,purpose,state,created_at,first_prepared_at,last_admitted_at,
      payload_expires_at,body_hash,contract_hash,sender,recipient,idempotency_key)
      VALUES(v_id,v_subscriber,i,i*2,'welcome',CASE i WHEN 1 THEN 'accepted' WHEN 2 THEN 'uncertain' ELSE 'cancelled' END,
        v_first,v_first,v_latest,v_first+interval '24 hours',repeat('a',64),repeat('b',64),'news@helixskin.us',p_label||'@example.invalid','production-marketing/'||v_id);
  END LOOP;
  PERFORM public.test_assert(public.request_production_marketing_subscription(p_label||'@example.invalid',md5(p_label||'newc')||md5(p_label||'newc'),
    md5(p_label||'newp')||md5(p_label||'newp'),md5(p_label||'newr')||md5(p_label||'newr'),true,'production_welcome_v1',public.test_envelope()),'fresh request after historical consent');
  PERFORM public.test_assert(public.confirm_production_marketing_subscription(md5(p_label||'newc')||md5(p_label||'newc')),'explicit confirmation after historical consent');
  SELECT id INTO v_result FROM private.production_marketing_messages WHERE subscriber_id=v_subscriber AND generation=v_count+1 AND purpose='welcome';
  RETURN v_result;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('single'); lease uuid:=gen_random_uuid(); old_lease uuid; prepared jsonb; again jsonb; BEGIN
  PERFORM public.confirm_production_marketing_subscription(md5('singlec')||md5('singlec'));
  PERFORM public.test_assert((SELECT count(*)=1 FROM private.production_marketing_messages),'repeat confirmation produces one unique welcome');
  PERFORM public.test_assert(public.test_prepare(id,NULL) IS NULL,'cannot prepare without a lease');
  PERFORM public.test_assert(public.claim_production_marketing_message(lease)->>'id'=id::text,'one real claim');
  PERFORM public.test_assert(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'competing claim cannot take lease');
  PERFORM public.test_assert(public.test_prepare(id,gen_random_uuid()) IS NULL,'wrong lease cannot reserve quota');
  PERFORM public.test_assert((SELECT count(*)=0 FROM private.production_marketing_quota_reservations),'denied preparation does not charge');
  prepared:=public.test_prepare(id,lease);
  PERFORM public.test_assert(prepared IS NOT NULL,'atomic prepare');
  PERFORM public.test_assert((SELECT count(*)=2 FROM private.production_marketing_quota_reservations WHERE message_id=id),'one day and month charge');
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NULL,'preparation cannot run twice');
  PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'uncertain',NULL),'persist unknown provider outcome');
  UPDATE private.production_marketing_messages SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE private.production_marketing_messages.id=id;
  old_lease:=lease;lease:=gen_random_uuid();
  PERFORM public.test_assert(public.claim_production_marketing_message(lease)->>'id'=id::text,'known uncertainty can be leased for a same-identity retry');
  again:=public.retry_production_marketing_message(id,lease,(SELECT contract_hash FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id));
  PERFORM public.test_assert(again->>'body'=prepared->>'body' AND again->>'idempotencyKey'=prepared->>'idempotencyKey' AND again->>'firstPreparedAt'=prepared->>'firstPreparedAt' AND again->>'payloadExpiresAt'=prepared->>'payloadExpiresAt','retry preserves exact frozen bytes, key and clocks');
  PERFORM public.test_assert((SELECT count(*)=2 FROM private.production_marketing_quota_reservations WHERE message_id=id),'same-period retry does not charge twice');
  PERFORM public.test_assert(NOT public.finish_production_marketing_message(id,old_lease,'accepted',gen_random_uuid()),'stale worker cannot finish');
  PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'accepted',gen_random_uuid()),'acceptance recorded separately');
  PERFORM public.test_assert(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'accepted work never automatically repeats');
END $$;
DO $$
#variable_conflict use_variable
DECLARE first_id uuid:=public.test_delivery('frequency-day'); next_id uuid; lease uuid:=gen_random_uuid(); BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE id=first_id;
  PERFORM public.test_assert(public.test_prepare(first_id,lease) IS NOT NULL,'first promotion takes a frequency slot');
  PERFORM public.test_assert(public.finish_production_marketing_message(first_id,lease,'uncertain',NULL),'uncertain outcome retains admission');
  next_id:=public.test_reconfirm(first_id,'frequency-day-new');
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE id=next_id;
  PERFORM public.test_assert(public.test_prepare(next_id,lease) IS NULL,'fresh consent generation cannot bypass rolling daily promotion cap');
  PERFORM public.test_assert((SELECT state='held' AND body_text IS NULL AND first_prepared_at IS NULL FROM private.production_marketing_messages WHERE id=next_id),'capped welcome remains unfrozen and held');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=next_id),'frequency refusal does not consume budget');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE id IN (first_id,next_id);
END $$;
DO $$
#variable_conflict use_variable
DECLARE blocked uuid:=public.test_frequency_history('frequency-week',ARRAY[interval '2 days',interval '4 days',interval '6 days']);
  allowed uuid:=public.test_frequency_history('frequency-aged',ARRAY[interval '2 days',interval '4 days',interval '8 days']);
  lease uuid:=gen_random_uuid(); confirmation uuid; body text; BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE id IN (blocked,allowed);
  PERFORM public.test_assert(public.test_prepare(blocked,lease) IS NULL,'three distinct promotions block the week even outside the daily window');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=blocked),'weekly refusal does not consume budget');
  PERFORM public.test_assert(public.test_prepare(allowed,lease) IS NOT NULL,'erased history beyond seven days releases a slot without double-counting identities');
  -- Confirmations neither consume nor wait for a promotional frequency slot.
  PERFORM public.test_assert(public.withdraw_production_marketing_subscription(md5('frequency-weeknewp')||md5('frequency-weeknewp')),'withdraw capped generation');
  PERFORM public.test_assert(public.request_production_marketing_subscription('frequency-week@example.invalid',md5('frequency-confirmc')||md5('frequency-confirmc'),
    md5('frequency-confirmp')||md5('frequency-confirmp'),md5('frequency-confirmr')||md5('frequency-confirmr'),true,'production_welcome_v1',public.test_envelope()),'request confirmation while promotion capped');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE purpose='welcome' AND first_prepared_at IS NULL;
  confirmation:=(public.claim_production_marketing_message(lease)->>'id')::uuid;
  body:=jsonb_set(public.test_delivery_body(confirmation)::jsonb,'{headers}','{}'::jsonb)::text;
  PERFORM public.test_assert(public.prepare_production_marketing_message(confirmation,lease,body,NULL,
    (SELECT encode(sha256(convert_to(delivery_contract_text,'UTF8')),'hex') FROM private.production_marketing_controls)) IS NOT NULL,'confirmation preparation ignores promotional cap');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE id IN (blocked,allowed,confirmation);
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_frequency_history('frequency-retry',ARRAY[interval '3 hours'],ARRAY[interval '25 hours']);
  lease uuid:=gen_random_uuid(); BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id;
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NULL,'a later retry handoff postpones a distinct promotion beyond its original 24-hour preparation window');
  PERFORM public.test_assert((SELECT count(*)=1 FROM private.production_marketing_messages m
    WHERE m.subscriber_id=(SELECT subscriber_id FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id)
      AND m.first_prepared_at IS NOT NULL),'retry occupies one distinct promotion slot');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('withdraw-before'); lease uuid:=gen_random_uuid(); BEGIN
  PERFORM public.claim_production_marketing_message(lease);
  PERFORM public.withdraw_production_marketing_subscription(md5('withdraw-beforep')||md5('withdraw-beforep'));
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NULL,'withdrawal committed before prepare blocks handoff');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=id),'withdrawal before prepare does not reserve quota');
  PERFORM public.defer_production_marketing_message(id,lease);
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('withdraw-after'); lease uuid:=gen_random_uuid(); cap text; BEGIN
  PERFORM public.claim_production_marketing_message(lease);
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NOT NULL,'first prepare linearizes admission');
  cap:=encode(sha256(convert_to(public.test_delivery_token(id),'UTF8')),'hex');
  PERFORM public.test_assert(public.withdraw_production_marketing_subscription(cap),'independent welcome capability withdraws');
  PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'uncertain',NULL),'already prepared first handoff may finish after withdrawal');
  UPDATE private.production_marketing_messages SET next_attempt_at=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id RETURNING lease_token INTO lease;
  PERFORM public.test_assert(public.retry_production_marketing_message(id,lease,(SELECT contract_hash FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id)) IS NULL,'retry after withdrawal denied');
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('prepare-unknown'); lease uuid:=gen_random_uuid(); BEGIN
  PERFORM public.claim_production_marketing_message(lease);
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NOT NULL,'prepare succeeds before simulated lost durable result');
  UPDATE private.production_marketing_messages SET lease_until=clock_timestamp()-interval '1 second' WHERE private.production_marketing_messages.id=id;
  PERFORM public.test_assert(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'unknown prepare/finish cannot be recovered by automatic lease reclaim');
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('rollover'); old_count integer; future_time timestamptz:=clock_timestamp()+interval '1 month 1 day'; BEGIN
  PERFORM public.test_assert(private.production_marketing_reserve(id,clock_timestamp()),'initial UTC allocation');
  SELECT count(*) INTO old_count FROM private.production_marketing_quota_reservations WHERE message_id=id;
  UPDATE private.production_marketing_controls SET daily_limit=1;
  INSERT INTO private.production_marketing_quota_counters VALUES('day',(future_time AT TIME ZONE 'UTC')::date,1);
  PERFORM public.test_assert(NOT private.production_marketing_reserve(id,future_time),'rollover requires current allocation even for an old logical identity');
  PERFORM public.test_assert((SELECT count(*)=old_count FROM private.production_marketing_quota_reservations WHERE message_id=id),'denied rollover preserves old charges');
  UPDATE private.production_marketing_controls SET daily_limit=100;
  PERFORM public.test_assert(private.production_marketing_reserve(id,future_time),'new UTC day/month reserve');
  PERFORM public.test_assert(private.production_marketing_reserve(id,future_time),'same-period reservation idempotent');
  PERFORM public.test_assert((SELECT count(*)=old_count+2 FROM private.production_marketing_quota_reservations WHERE message_id=id),'current periods charged once and old periods retained');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid; kind text; ids uuid[]:='{}'; cap text; n integer; BEGIN
  FOREACH kind IN ARRAY ARRAY['accepted','cancelled','prepared','uncertain'] LOOP
    id:=public.test_delivery('retention-'||kind); ids:=array_append(ids,id);
    UPDATE private.production_marketing_messages SET first_prepared_at=clock_timestamp()-interval '25 hours',payload_expires_at=clock_timestamp()-interval '1 hour',body_text='synthetic-secret-copy',body_hash=repeat('a',64),contract_hash=repeat('b',64),sender='news@helixskin.us',recipient='synthetic@example.invalid',state=kind WHERE private.production_marketing_messages.id=id;
    PERFORM public.test_assert(private.production_marketing_reserve(id,clock_timestamp()-interval '25 hours'),'historical ambiguous charge fixture');
    cap:=encode(sha256(convert_to(public.test_delivery_token(id),'UTF8')),'hex');
    INSERT INTO private.production_marketing_withdrawal_capabilities VALUES(cap,(SELECT subscriber_id FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),id);
  END LOOP;
  n:=public.cleanup_production_marketing_delivery();
  PERFORM public.test_assert(n=4,'cleanup erases accepted, cancelled, prepared and uncertain payload copies');
  PERFORM public.test_assert(public.cleanup_production_marketing_delivery()=0,'prepared cleanup idempotent');
  PERFORM public.test_assert((SELECT bool_and(body_text IS NULL AND body_hash=repeat('a',64) AND contract_hash=repeat('b',64)) FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=ANY(ids)),'payload erasure retains digests/identity');
  PERFORM public.test_assert((SELECT count(*)=4 FROM private.production_marketing_withdrawal_capabilities WHERE message_id=ANY(ids)),'erasure retains restrictive hashes');
  PERFORM public.test_assert((SELECT count(*)=8 FROM private.production_marketing_quota_reservations WHERE message_id=ANY(ids)),'erasure retains every historical quota reservation');
  PERFORM public.test_assert((SELECT bool_and(reconciliation_required) FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=ANY(ids) AND state='uncertain'),'uncertain erasure retains hold');
  BEGIN UPDATE private.production_marketing_messages SET body_text='regenerated' WHERE private.production_marketing_messages.id=ids[1]; RAISE EXCEPTION 'expected immutable rejection';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='expected immutable rejection' THEN RAISE; END IF; END;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('locally-suppressed'); lease uuid:=gen_random_uuid(); BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id;
  INSERT INTO private.production_marketing_suppressions(subscriber_id,reason) SELECT subscriber_id,'complained' FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id;
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NULL,'local provider suppression blocks new prepare');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=id),'suppressed work does not allocate quota');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('retry-window'); lease uuid:=gen_random_uuid(); BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds',first_prepared_at=clock_timestamp()-interval '23 hours 1 minute',
    payload_expires_at=clock_timestamp()+interval '59 minutes',body_text='synthetic frozen payload',body_hash=repeat('d',64),contract_hash=repeat('e',64),sender='news@helixskin.us',recipient='retry-window@example.invalid',state='uncertain' WHERE private.production_marketing_messages.id=id;
  PERFORM public.test_assert(public.retry_production_marketing_message(id,lease,repeat('e',64)) IS NULL,'23h horizon denies retry even before payload erasure');
  BEGIN UPDATE private.production_marketing_messages SET first_prepared_at=clock_timestamp() WHERE private.production_marketing_messages.id=id;RAISE EXCEPTION 'expected immutable rejection';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='expected immutable rejection' THEN RAISE; END IF;END;
  UPDATE private.production_marketing_messages SET state='cancelled',reconciliation_required=true WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('stored-pause'); lease uuid:=gen_random_uuid(); BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id;
  UPDATE private.production_marketing_controls SET dispatch_enabled=false;
  PERFORM public.test_assert(public.test_prepare(id,lease) IS NULL,'stored pause after claim blocks preparation');
  PERFORM public.test_assert(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'stored pause blocks claim with otherwise complete configuration');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=id),'paused preparation never allocates');
  UPDATE private.production_marketing_controls SET dispatch_enabled=true;
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('wrong-payload'); lease uuid:=gen_random_uuid(); fingerprint text; BEGIN
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id;
  SELECT encode(sha256(convert_to(delivery_contract_text,'UTF8')),'hex') INTO fingerprint FROM private.production_marketing_controls;
  PERFORM public.test_assert(public.prepare_production_marketing_message(id,lease,jsonb_set(public.test_delivery_body(id)::jsonb,'{to}','["other@example.invalid"]')::text,
    encode(sha256(convert_to(public.test_delivery_token(id),'UTF8')),'hex'),fingerprint) IS NULL,'frozen recipient mismatch blocked');
  PERFORM public.test_assert(public.prepare_production_marketing_message(id,lease,public.test_delivery_body(id),encode(sha256(convert_to(public.test_delivery_token(id),'UTF8')),'hex'),repeat('f',64)) IS NULL,'unknown contract blocked');
  PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=id),'invalid frozen payload never allocates');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('old-restrictive-cap'); BEGIN
  PERFORM public.test_assert(public.withdraw_production_marketing_subscription(md5('old-restrictive-capp')||md5('old-restrictive-capp')),'old generation initially withdraws');
  PERFORM public.test_assert(public.request_production_marketing_subscription('old-restrictive-cap@example.invalid',md5('fresh-generation-c')||md5('fresh-generation-c'),md5('fresh-generation-p')||md5('fresh-generation-p'),md5('fresh-generation-r')||md5('fresh-generation-r'),true,'production_welcome_v1',public.test_envelope()),'new explicit generation after withdrawal');
  PERFORM public.test_assert(public.withdraw_production_marketing_subscription(md5('old-restrictive-capp')||md5('old-restrictive-capp')),'old erased-input hash still restricts newer pending generation after P2 replacement');
  PERFORM public.test_assert(NOT public.confirm_production_marketing_subscription(md5('fresh-generation-c')||md5('fresh-generation-c')),'new confirmation cannot undo the later old-hash withdrawal');
  UPDATE private.production_marketing_messages SET state='cancelled' WHERE private.production_marketing_messages.id=id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE t text; role_name text; fn record; BEGIN
  FOREACH t IN ARRAY ARRAY['messages','withdrawal_capabilities','suppressions','quota_counters','quota_reservations'] LOOP
    PERFORM public.test_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('private.production_marketing_'||t)::regclass),'delivery tables force RLS');
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      PERFORM public.test_assert(NOT has_table_privilege(role_name,'private.production_marketing_'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'delivery tables have no direct grants');
    END LOOP;
  END LOOP;
  FOR fn IN SELECT p.oid,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'production_marketing_%') OR (n.nspname='public' AND p.proname IN ('cleanup_production_marketing_delivery','claim_production_marketing_message','prepare_production_marketing_message','retry_production_marketing_message','finish_production_marketing_message','defer_production_marketing_message')) LOOP
    PERFORM public.test_assert(NOT has_function_privilege('anon',fn.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',fn.oid,'EXECUTE'),'public callers cannot invoke delivery');
    PERFORM public.test_assert(has_function_privilege('service_role',fn.oid,'EXECUTE')=(fn.nspname='public'),'only narrow service RPCs executable');
  END LOOP;
END $$;
BEGIN;
GRANT USAGE ON SCHEMA private TO anon;
GRANT SELECT ON private.production_marketing_messages TO anon;
SET LOCAL ROLE anon;
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_messages),'actual RLS denies rows even under temporary explicit SELECT grant');
ROLLBACK;
