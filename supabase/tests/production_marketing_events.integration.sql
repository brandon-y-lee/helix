-- Owned networkless PostgreSQL17 only. No hosted project or actual admin provisioning.
SELECT public.test_assert((SELECT NOT events_enabled AND NOT status_enabled FROM private.production_marketing_controls),'events/status default off');
SELECT public.test_assert(public.record_production_marketing_event('off',gen_random_uuid(),gen_random_uuid(),'email.sent',clock_timestamp(),'news@helixskin.us','x@example.invalid','welcome','production_welcome_delivery_v1','production')='paused','off receipt');
UPDATE private.production_marketing_controls SET events_enabled=true,status_enabled=true,enrollment_enabled=true,dispatch_enabled=true,daily_limit=1000,monthly_limit=10000;
UPDATE private.production_marketing_messages SET state='cancelled' WHERE state IN ('held','uncertain');
CREATE FUNCTION public.test_event(p_id uuid,p_provider uuid,p_event text,p_type text DEFAULT 'email.sent',p_time timestamptz DEFAULT clock_timestamp()) RETURNS text LANGUAGE sql AS $$
 SELECT public.record_production_marketing_event(p_event,p_id,p_provider,p_type,p_time,m.sender,m.recipient,m.purpose,'production_welcome_delivery_v1','production') FROM private.production_marketing_messages m WHERE m.id=p_id;
$$;
CREATE FUNCTION public.test_event_prepared(p_label text,p_lease uuid) RETURNS uuid LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery(p_label);BEGIN
 UPDATE private.production_marketing_messages SET lease_token=p_lease,lease_until=clock_timestamp()+interval '60 seconds' WHERE private.production_marketing_messages.id=id;
 PERFORM public.test_assert(public.test_prepare(id,p_lease) IS NOT NULL,'real event fixture preparation');RETURN id;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid; provider uuid:=gen_random_uuid();lease uuid:=gen_random_uuid();time timestamptz:=clock_timestamp();before_n integer; BEGIN
 id:=public.test_delivery('event-unprepared');
 PERFORM public.test_assert(public.test_event(id,provider,'unprepared')='rejected','unprepared identity cannot bind');
 SELECT count(*) INTO before_n FROM private.production_marketing_subscribers;
 PERFORM public.test_assert(public.record_production_marketing_event('unknown',gen_random_uuid(),provider,'email.sent',time,'news@helixskin.us','unknown@example.invalid','welcome','production_welcome_delivery_v1','production')='rejected','unknown identity rejected');
 PERFORM public.test_assert((SELECT count(*)=before_n FROM private.production_marketing_subscribers),'event never imports identities');
 id:=public.test_event_prepared('event-normal',lease);
 UPDATE private.production_marketing_controls SET enrollment_enabled=false,dispatch_enabled=false;
 PERFORM public.test_assert(public.test_event(id,provider,'normal','email.delivered',time)='recorded','events persist while enrollment/dispatch paused');
 PERFORM public.test_assert(public.test_event(id,provider,'normal','email.delivered',time)='recorded','exact duplicate idempotent');
 PERFORM public.test_assert(public.test_event(id,provider,'normal','email.failed',time)='rejected','changed duplicate ID rejected');
 PERFORM public.test_assert((SELECT state='prepared' AND provider_id=provider AND NOT reconciliation_required AND delivery_status='delivered' FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),'early event retains live finish eligibility');
 PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'accepted',provider),'same provider response finishes');
 PERFORM public.test_assert(public.test_event(id,provider,'late-sent','email.sent',time-interval '1 second')='recorded','out of order accepted');
 PERFORM public.test_assert((SELECT state='accepted' AND delivery_status='delivered' FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),'sent cannot downgrade delivery or acceptance');
 UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid; provider uuid:=gen_random_uuid();lease uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();BEGIN
 id:=public.test_event_prepared('event-conflict',lease);
 PERFORM public.test_event(id,provider,'first-binding');
 PERFORM public.test_event(id,other,'conflicting-binding','email.complained');
 PERFORM public.test_assert((SELECT provider_id=provider AND reconciliation_required AND state='uncertain' FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),'conflicting event retains first identity and holds');
 PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'accepted',other),'late conflicting response recorded');
 PERFORM public.test_assert((SELECT count(*)=2 FROM private.production_marketing_identity_conflicts WHERE message_id=id AND provider_id=other),'both normalized conflicting event/response evidence retained');
 PERFORM public.test_assert((SELECT s.reason='complained' FROM private.production_marketing_suppressions s JOIN private.production_marketing_messages m USING(subscriber_id) WHERE m.id=id),'conflict still restricts');
 PERFORM public.test_event(id,provider,'later-bounce','email.bounced');
 PERFORM public.test_event(id,provider,'later-suppression','email.suppressed');
 PERFORM public.test_event(id,provider,'later-delivery','email.delivered');
 PERFORM public.test_assert((SELECT s.reason='complained' AND m.delivery_status='suppressed' AND m.provider_id=provider FROM private.production_marketing_suppressions s JOIN private.production_marketing_messages m USING(subscriber_id) WHERE m.id=id),'monotonic complaint/summary/binding');
 FOR i IN 1..2 LOOP
  lease:=gen_random_uuid();id:=public.test_event_prepared('event-uncertain-'||i,lease);provider:=gen_random_uuid();
  IF i=1 THEN PERFORM public.test_event(id,provider,'uncertain-'||i);END IF;
  PERFORM public.test_assert(public.finish_production_marketing_message(id,lease,'uncertain',NULL),'known uncertainty finishes');
  IF i=2 THEN PERFORM public.test_event(id,provider,'uncertain-'||i);END IF;
  PERFORM public.test_assert((SELECT state='uncertain' AND reconciliation_required FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),'both event/uncertainty orderings forbid automatic replay');
  UPDATE private.production_marketing_messages SET lease_token=lease,lease_until=clock_timestamp()+interval '60 seconds',next_attempt_at=clock_timestamp()-interval '1 second' WHERE private.production_marketing_messages.id=id;
  PERFORM public.test_assert(public.retry_production_marketing_message(id,lease,(SELECT contract_hash FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id)) IS NULL,'signed evidence hold denies retry');
 END LOOP;
END $$;
DO $$
#variable_conflict use_variable
DECLARE id uuid:=public.test_delivery('event-erased');provider uuid:=gen_random_uuid();BEGIN
 UPDATE private.production_marketing_messages SET first_prepared_at=clock_timestamp()-interval '25 hours',payload_expires_at=clock_timestamp()-interval '1 hour',body_text='synthetic payload',body_hash=repeat('a',64),contract_hash=repeat('b',64),sender='news@helixskin.us',recipient='event-erased@example.invalid',state='accepted',provider_id=provider WHERE private.production_marketing_messages.id=id;
 PERFORM public.cleanup_production_marketing_delivery();
 PERFORM public.test_assert((SELECT body_text IS NULL FROM private.production_marketing_messages WHERE private.production_marketing_messages.id=id),'fixture physically erased');
 PERFORM public.withdraw_production_marketing_subscription(md5('event-erasedp')||md5('event-erasedp'));
 PERFORM public.test_assert(public.request_production_marketing_subscription('event-erased@example.invalid',md5('erased-new-c')||md5('erased-new-c'),md5('erased-new-p')||md5('erased-new-p'),md5('erased-new-r')||md5('erased-new-r'),true,'production_welcome_v1',public.test_envelope()),'new explicit generation');
 PERFORM public.test_assert(public.confirm_production_marketing_subscription(md5('erased-new-c')||md5('erased-new-c')),'new generation confirmed');
 PERFORM public.test_assert(public.test_event(id,provider,'erased-restriction','email.bounced')='recorded','old-generation erased body still correlates restrictive event');
 PERFORM public.test_assert((SELECT count(*)=1 FROM private.production_marketing_suppressions s JOIN private.production_marketing_messages m USING(subscriber_id) WHERE m.id=id),'restriction follows stable subscriber');
END $$;
INSERT INTO public.admin_memberships VALUES('11111111-1111-4111-8111-111111111111','admin',true),('22222222-2222-4222-8222-222222222222','admin',false),('33333333-3333-4333-8333-333333333333','viewer',true);
SELECT public.test_assert(public.read_production_marketing_status('22222222-2222-4222-8222-222222222222') IS NULL AND public.read_production_marketing_status('33333333-3333-4333-8333-333333333333') IS NULL AND public.read_production_marketing_status(gen_random_uuid()) IS NULL,'canonical active admin only');
SET ROLE service_role;
SELECT public.test_assert((SELECT count(*)=11 FROM jsonb_object_keys(public.read_production_marketing_status('11111111-1111-4111-8111-111111111111'))),'actual privileged status limited to eleven counts');
RESET ROLE;
DO $$ DECLARE t text;r text;f regprocedure;BEGIN
 FOREACH t IN ARRAY ARRAY['events','identity_conflicts'] LOOP
  PERFORM public.test_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('private.production_marketing_'||t)::regclass),'event forced RLS');
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP PERFORM public.test_assert(NOT has_table_privilege(r,'private.production_marketing_'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'no direct event table grants');END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['public.record_production_marketing_event(text,uuid,uuid,text,timestamp with time zone,text,text,text,text,text)'::regprocedure,'public.read_production_marketing_status(uuid)'::regprocedure] LOOP
  PERFORM public.test_assert(NOT has_function_privilege('anon',f,'EXECUTE') AND NOT has_function_privilege('authenticated',f,'EXECUTE') AND has_function_privilege('service_role',f,'EXECUTE'),'event RPCs service only');
 END LOOP;
END $$;
BEGIN;GRANT USAGE ON SCHEMA private TO anon;GRANT SELECT ON private.production_marketing_events TO anon;SET LOCAL ROLE anon;
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_events),'actual RLS hides event evidence');ROLLBACK;
