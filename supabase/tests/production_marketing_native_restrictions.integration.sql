-- Test-only installer/controller. Every addressed mailbox, credential digest,
-- provider id and event in this networkless fixture is synthetic.
CREATE FUNCTION proof.ready() RETURNS boolean LANGUAGE sql AS $$
  SELECT public.production_marketing_enrollment_ready(proof.hash(delivery_contract_text),repeat('b',64))
    FROM private.production_marketing_controls WHERE singleton
$$;
SELECT proof.check(NOT proof.ready(),'P5 cold install closes enrollment');
SELECT proof.check((SELECT to_jsonb(current)=to_jsonb(old) FROM proof.old_raw_state current JOIN proof.frozen_raw old USING(id)),
  'P5 leaves a pre-P4 raw message and reservation intact');
INSERT INTO private.production_marketing_native_epochs VALUES
  (repeat('c',64),'welcome@updates.helixskin.us','00000000-0000-4000-8000-000000000598'),
  (repeat('a',64),'retired@helixskin.us','00000000-0000-4000-8000-000000000597');
UPDATE private.production_marketing_controls SET events_enabled=true,native_welcome_enabled=true,native_welcome_contract_hash=repeat('c',64),
  native_welcome_publisher_project_id='prj_native598',native_welcome_publisher_deployment_id='dpl_native598',native_welcome_publisher_git_sha=repeat('d',40),
  native_welcome_qualified_until=clock_timestamp()+interval '1 hour';
UPDATE private.production_marketing_native_policy q SET contract_hash=c.native_welcome_contract_hash,evidence_sha256=repeat('e',64),
  confirmation_contract_hash=proof.hash(c.delivery_contract_text),confirmation_worker_binding_hash=c.confirmation_worker_binding_hash,
  publisher_project_id=c.native_welcome_publisher_project_id,publisher_deployment_id=c.native_welcome_publisher_deployment_id,
  publisher_git_sha=c.native_welcome_publisher_git_sha,daily_limit=c.daily_limit,monthly_limit=c.monthly_limit,
  observed_at=clock_timestamp()-interval '10 minutes',qualified_until=clock_timestamp()+interval '40 minutes',
  provider_qualified=true,routing_qualified=true,quota_qualified=true,sender_exclusive=true FROM private.production_marketing_controls c;
SELECT proof.check(proof.ready(),'independently matched P2/P4/P5 evidence opens enrollment');
DO $$ DECLARE mutation text; BEGIN
  FOREACH mutation IN ARRAY ARRAY['provider_qualified=false','routing_qualified=false','quota_qualified=false','sender_exclusive=false',
     'evidence_sha256=NULL','qualified_until=clock_timestamp()-interval ''1 second''','confirmation_contract_hash=repeat(''0'',64)',
     'confirmation_worker_binding_hash=repeat(''0'',64)','publisher_project_id=''prj_drift''','publisher_deployment_id=''dpl_drift''',
     'publisher_git_sha=repeat(''0'',40)','daily_limit=daily_limit+1','monthly_limit=monthly_limit+1'] LOOP
    BEGIN EXECUTE 'UPDATE private.production_marketing_native_policy SET '||mutation;
      PERFORM proof.check(NOT proof.ready(),'readiness accepted changed '||mutation);
      BEGIN PERFORM proof.request('unqualified','unqualified',true); RAISE EXCEPTION 'qualified request accepted drift'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
      RAISE SQLSTATE 'P0599';
    EXCEPTION WHEN SQLSTATE 'P0599' THEN NULL; END;
  END LOOP;
  FOREACH mutation IN ARRAY ARRAY['events_enabled=false','dispatch_enabled=false','native_welcome_enabled=false','enrollment_enabled=false',
    'native_welcome_contract_hash=repeat(''7'',64)','native_welcome_qualified_until=clock_timestamp()-interval ''1 second'''] LOOP
    BEGIN EXECUTE 'UPDATE private.production_marketing_controls SET '||mutation;
      PERFORM proof.check(NOT proof.ready(),'old control drift accepted '||mutation); RAISE SQLSTATE 'P0599';
    EXCEPTION WHEN SQLSTATE 'P0599' THEN NULL; END;
  END LOOP;
END $$;

DO $$ DECLARE name text; sig regprocedure; BEGIN
  FOREACH sig IN ARRAY ARRAY['public.record_native_welcome_restriction(text,text,text,timestamptz,text,text,boolean,uuid[],text)'::regprocedure,
    'public.production_marketing_native_alerts()'::regprocedure,'public.production_marketing_enrollment_ready(text,text)'::regprocedure] LOOP
    PERFORM proof.check(has_function_privilege('service_role',sig,'EXECUTE'),'missing gateway grant');
    FOREACH name IN ARRAY ARRAY['anon','authenticated','unexpected','helix_native_welcome_worker'] LOOP
      PERFORM proof.check(NOT has_function_privilege(name,sig,'EXECUTE'),'unexpected callback/status access');
    END LOOP;
  END LOOP;
  FOREACH name IN ARRAY ARRAY['anon','authenticated','unexpected','helix_native_welcome_worker','service_role'] LOOP
    PERFORM proof.check(NOT has_table_privilege(name,'private.production_marketing_native_receipts','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(name,'private.production_marketing_native_epochs','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(name,'private.production_marketing_native_holds','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(name,'private.production_marketing_native_resolutions','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(name,'private.production_marketing_native_policy','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_function_privilege(name,'private.resolve_native_welcome_hold(text,text,text)','EXECUTE'), 'private evidence/controller authority leaked');
  END LOOP;
  BEGIN UPDATE private.production_marketing_native_epochs SET sender='changed@helixskin.us';
    RAISE EXCEPTION 'epoch rewritten'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Native callback facts are immutable' THEN RAISE; END IF; END;
  BEGIN TRUNCATE private.production_marketing_native_resolutions; RAISE EXCEPTION 'resolution history erased';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Native callback facts are immutable' THEN RAISE; END IF; END;
END $$;
CREATE FUNCTION proof.observation(id text,event text,recipient text,sender text DEFAULT NULL,denied boolean DEFAULT false,
  topics uuid[] DEFAULT '{}',ambiguity text DEFAULT NULL,digest text DEFAULT repeat('c',64),at_time timestamptz DEFAULT statement_timestamp())
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result text;
BEGIN SET LOCAL ROLE service_role;
  result:=public.record_native_welcome_restriction(digest,id,event,at_time,sender,recipient,denied,topics,ambiguity);
  RESET ROLE; RETURN result;
END $$;
CREATE FUNCTION proof.resolve(id text) RETURNS boolean LANGUAGE sql AS $$
  SELECT bool_and(private.resolve_native_welcome_hold(event_id,fingerprint,repeat('e',64)))
    FROM private.production_marketing_native_holds WHERE event_id=id
$$;
CREATE FUNCTION proof.reserve() RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result uuid;
BEGIN SET LOCAL SESSION AUTHORIZATION helix_native_welcome_worker;
  SELECT intent_id INTO result FROM helix_welcome_worker.reserve(repeat('c',64),'prj_native598','dpl_native598',repeat('d',40));
  SET LOCAL SESSION AUTHORIZATION DEFAULT; RETURN result;
END $$;

BEGIN;
DO $$ DECLARE n int; t timestamptz:=clock_timestamp(); id uuid; original_id uuid; BEGIN
  SELECT count(*) INTO n FROM private.production_marketing_subscribers;
  PERFORM proof.check(proof.observation('absent','contact.updated','unknown@example.invalid',denied=>true,at_time=>t)='ignored','no subscriber for unknown address');
  PERFORM proof.check((SELECT count(*)=n FROM private.production_marketing_subscribers),'no implicit new subscriber');
  original_id:=proof.confirmed('confirmed','confirmed',true);
  PERFORM proof.check(proof.observation('topic-foreign','contact.topics.updated','confirmed@example.invalid',topics=>ARRAY[gen_random_uuid()])='ignored','unrelated topic');
  PERFORM proof.check(proof.observation('foreign','email.complained',NULL,'support@helixskin.us',digest=>NULL)='ignored','verified foreign sender ignored under app drift');
  PERFORM proof.check(proof.observation('topic-ambiguous','contact.topics.updated','confirmed@example.invalid',topics=>ARRAY['00000000-0000-4000-8000-000000000598']::uuid[],
    ambiguity=>'invalid_contact_deny')='held','malformed or contradictory topic cannot suppress');
  PERFORM proof.check((SELECT state='confirmed' FROM private.production_marketing_subscribers WHERE normalized_email='confirmed@example.invalid'),'ambiguous topic retained state');
  PERFORM proof.check(NOT proof.ready() AND proof.reserve() IS NULL,'held blocks both enrollment and worker');
  UPDATE private.production_marketing_native_policy SET qualified_until=clock_timestamp()+interval '1 hour',evidence_sha256=repeat('f',64),publisher_deployment_id='dpl_refresh598';
  UPDATE private.production_marketing_controls SET native_welcome_publisher_deployment_id='dpl_refresh598';
  PERFORM proof.check(NOT proof.ready(),'rebinding the same epoch cannot lift a hold');
  UPDATE private.production_marketing_native_policy SET publisher_deployment_id='dpl_native598';
  UPDATE private.production_marketing_controls SET native_welcome_publisher_deployment_id='dpl_native598';
  PERFORM proof.check(NOT proof.ready(),'refresh cannot clear signed hold');
  PERFORM proof.check(proof.resolve('topic-ambiguous') AND proof.ready(),'evidenced owner-only resolution');
  PERFORM proof.check(proof.observation('early-denial','email.bounced','confirmed@example.invalid','welcome@updates.helixskin.us')='held','native sender alone is not local attempt evidence');
  PERFORM proof.check(proof.resolve('early-denial'),'review held sender');
  PERFORM proof.check(proof.observation('retired-topic','contact.topics.updated','confirmed@example.invalid',topics=>ARRAY['00000000-0000-4000-8000-000000000597']::uuid[])='held',
    'retired formerly owned Topic requires reconciliation');
  PERFORM proof.check(proof.resolve('retired-topic'),'retired topic reviewed');
  id:=proof.reserve();
  PERFORM proof.check(id=original_id,'exact authenticated native worker reserves');
  PERFORM proof.check(proof.observation('bound-denial','email.complained','confirmed@example.invalid','welcome@updates.helixskin.us',at_time=>clock_timestamp())='applied','bound restrictive delivery facts suppress address');
  PERFORM proof.check((SELECT state='native_reserved' AND delivery_status='pending' AND provider_id IS NULL FROM private.production_marketing_messages m WHERE m.id=original_id),
    'address suppression does not claim positive message attribution');
  PERFORM proof.check((SELECT reason='complained' FROM private.production_marketing_suppressions r JOIN private.production_marketing_subscribers s ON s.id=r.subscriber_id
    WHERE s.normalized_email='confirmed@example.invalid'),'first restrictive reason persists');
  PERFORM proof.check(proof.observation('hard-deny','contact.updated','confirmed@example.invalid',denied=>true,at_time=>t)='applied','out of order denial remains restrictive');
  PERFORM proof.check(proof.observation('hard-deny','contact.updated','confirmed@example.invalid',denied=>true,digest=>NULL,at_time=>t)='duplicate','retry across deployment deduplicated');
  PERFORM proof.check(proof.observation('hard-deny','contact.updated','other@example.invalid',denied=>true,at_time=>t)='held','conflicting signed event id held');
  PERFORM proof.check(proof.observation('hard-deny','contact.updated','other@example.invalid',denied=>true,at_time=>t)='duplicate','conflicting retry creates one hold');
  PERFORM proof.check(public.production_marketing_native_alerts()='{"uncertainAttempts":0,"unresolvedHolds":1}'::jsonb,'only exact bounded alert counts visible');
  PERFORM proof.check(proof.resolve('hard-deny'),'selective reviewed resolution');
  PERFORM proof.check(proof.observation('marker-conflict','email.suppressed',NULL,'support@helixskin.us',ambiguity=>'ownership_conflict')='held','foreign sender + native markers must hold');
  PERFORM proof.check(proof.resolve('marker-conflict'),'ownership conflict resolved');
  PERFORM proof.check(proof.observation('claimed-drift','email.suppressed','confirmed@example.invalid','no-epoch@helixskin.us')='held','claimed local sender absent in DB held');
  PERFORM proof.check(proof.resolve('claimed-drift'),'wrong sender resolved');
  PERFORM proof.check(proof.observation('retained','email.suppressed',NULL,'retired@helixskin.us')='held','retained epoch sender without confirmed local recipient held');
  PERFORM proof.check(proof.resolve('retained'),'retired native sender reconciled');
  PERFORM proof.request('topic-denied','topic-denied',true);
  UPDATE private.production_marketing_controls SET events_enabled=false,enrollment_enabled=false,dispatch_enabled=false,native_welcome_enabled=false;
  PERFORM proof.check(proof.observation('hard-deny','contact.updated','confirmed@example.invalid',denied=>true,at_time=>t)='duplicate',
    'acknowledged signed receipt can be retried without mutation during event pause');
  BEGIN
    PERFORM proof.observation('hard-deny','contact.updated','new-conflict@example.invalid',denied=>true,at_time=>t);
    RAISE EXCEPTION 'paused receiver acknowledged a new conflicting observation';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    PERFORM proof.observation('topic-true','contact.topics.updated','topic-denied@example.invalid',
      topics=>ARRAY['00000000-0000-4000-8000-000000000598']::uuid[],at_time=>t);
    RAISE EXCEPTION 'paused receiver acknowledged a new restrictive observation';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  PERFORM proof.check((SELECT state='pending' FROM private.production_marketing_subscribers WHERE normalized_email='topic-denied@example.invalid')
    AND NOT EXISTS (SELECT FROM private.production_marketing_native_receipts WHERE event_id='topic-true')
    AND private.production_marketing_native_unresolved_holds()=0,'explicit event pause leaves subscriber, receipt and hold ledger untouched');
  UPDATE private.production_marketing_controls SET events_enabled=true;
  PERFORM proof.check(proof.observation('topic-true','contact.topics.updated','topic-denied@example.invalid',
    topics=>ARRAY['00000000-0000-4000-8000-000000000598']::uuid[],at_time=>t)='applied','same signed retry applies with sends and enrollment still paused');
  PERFORM proof.check(NOT public.confirm_production_marketing_subscription(proof.hash('topic-denied-c')),'withdrawn pending cannot confirm later');
  PERFORM proof.check((SELECT i.state='cancelled' AND i.delivery_payload IS NULL FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_subscribers s ON s.id=i.subscriber_id
    WHERE s.normalized_email='topic-denied@example.invalid'),'pending ciphertext cleared');
  UPDATE private.production_marketing_controls SET events_enabled=true,enrollment_enabled=true,dispatch_enabled=true,native_welcome_enabled=true;
  BEGIN PERFORM proof.request('topic-denied','fresh-retry',false); RAISE EXCEPTION 'legacy explicit request reactivated suppressed recipient';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic consent request failed' THEN RAISE; END IF; END;
  BEGIN PERFORM proof.request('topic-denied','fresh-qualified',true); RAISE EXCEPTION 'native explicit request reactivated suppressed recipient';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic consent request failed' THEN RAISE; END IF; END;
  PERFORM proof.request('global-drift','global-drift',true);
  PERFORM proof.check(proof.observation('no-time','contact.updated','global-drift@example.invalid',denied=>true,
    ambiguity=>'invalid_contact_deny',digest=>NULL,at_time=>NULL)='held','known global opt out survives absent runtime identity or event creation time');
  PERFORM proof.check((SELECT state='withdrawn' FROM private.production_marketing_subscribers WHERE normalized_email='global-drift@example.invalid')
    AND NOT proof.ready(),'independent global deny applied while lane held');
  PERFORM proof.check(proof.resolve('no-time'),'timestamp evidence reviewed');
  PERFORM proof.check((SELECT bool_and(NOT (to_jsonb(r)::text LIKE '%example.invalid%' OR to_jsonb(r)::text LIKE '%helixskin.us%'))
    FROM private.production_marketing_native_receipts r),'receipt does not retain mailbox or raw event');
  SELECT native_attempt_id INTO id FROM private.production_marketing_messages m WHERE m.id=original_id;
  SET LOCAL SESSION AUTHORIZATION helix_native_welcome_worker;
  IF NOT helix_welcome_worker.finish(original_id,id,'unknown') THEN RAISE EXCEPTION 'failed to record uncertainty'; END IF;
  SET LOCAL SESSION AUTHORIZATION DEFAULT;
  PERFORM proof.check(public.production_marketing_native_alerts()='{"uncertainAttempts":1,"unresolvedHolds":0}'::jsonb,'ambiguity alerts immediately');
END $$;
-- Isolate subsequent crash timing from the preceding deliberately uncertain fixture.
-- Both facts are proved in a real transaction; production has no reset operation.
ROLLBACK;
