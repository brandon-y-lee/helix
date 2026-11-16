-- Synthetic support data only. The runner refuses any unlabeled or remote database.
CREATE SCHEMA support_contract_test;
CREATE FUNCTION support_contract_test.assert(ok boolean, description text) RETURNS void
LANGUAGE sql AS $$ SELECT payment_contract_test.assert(ok, description) $$;
CREATE FUNCTION support_contract_test.id(kind text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-support:' || kind || ':' || n)::uuid $$;
CREATE FUNCTION support_contract_test.actor(kind text) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-support-actor:' || kind)::uuid $$;
CREATE FUNCTION support_contract_test.key(kind text, n integer) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT md5(kind || ':' || n) || md5(kind || ':' || n) $$;
INSERT INTO auth.users(id) SELECT support_contract_test.actor(kind)
FROM unnest(ARRAY['admin','catalog_publisher','catalog_editor','inactive','customer']) kind;
INSERT INTO public.admin_memberships(user_id,role,active) VALUES
  (support_contract_test.actor('admin'),'admin',true),
  (support_contract_test.actor('catalog_publisher'),'catalog_publisher',true),
  (support_contract_test.actor('catalog_editor'),'catalog_editor',true),
  (support_contract_test.actor('inactive'),'admin',false);
GRANT USAGE ON SCHEMA support_contract_test TO service_role,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support_contract_test TO service_role,anon,authenticated;

-- APPLY SUPPORT INTAKE MIGRATION

CREATE FUNCTION support_contract_test.submit(n integer, overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.submit_support_inquiry(
    coalesce((overrides->>'submissionId')::uuid,support_contract_test.id('submission',n)),
    coalesce(overrides->>'abuseKey',support_contract_test.key('source',n)),
    coalesce(overrides->>'emailAbuseKey',support_contract_test.key('email',n)),
    coalesce(overrides->>'name','Synthetic customer'),
    coalesce(overrides->>'email','synthetic-' || n || '@example.invalid'),
    coalesce(overrides->>'inquiryType','general'),
    coalesce(overrides->>'subject','Synthetic question'),
    coalesce(overrides->>'body','Private synthetic inquiry body'),
    (overrides->>'orderId')::uuid)
$$;
CREATE FUNCTION support_contract_test.try_conflicting_submission(n integer, overrides jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$ BEGIN
  RETURN support_contract_test.submit(n,overrides);
EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'submission_conflict' THEN RAISE; END IF;
  RETURN jsonb_build_object('conflict',true);
END $$;
CREATE FUNCTION support_contract_test.payload(recipient text, message_id uuid, subject text, body text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('from','Helix Demo <onboarding@resend.dev>','to',jsonb_build_array(recipient),
    'subject',subject,'reply_to','support@example.invalid','html',private.support_plain_html(body),'text',body,
    'tags',jsonb_build_array(jsonb_build_object('name','helix_environment','value','sandbox'),
      jsonb_build_object('name','helix_message_id','value',message_id::text)))
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support_contract_test TO service_role;

SELECT support_contract_test.assert((SELECT bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname IN ('support_controls','support_inquiries','support_messages',
    'support_drafts','support_reply_approvals','support_audit_events','support_intake_submissions','support_abuse_windows')),
  'all private support tables enable and force RLS');
SELECT support_contract_test.assert((SELECT count(*)=8 FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'
    AND c.relname IN ('support_controls','support_inquiries','support_messages','support_drafts',
      'support_reply_approvals','support_audit_events','support_intake_submissions','support_abuse_windows')),
  'all durable support records exist');
SELECT support_contract_test.assert((SELECT bool_and(NOT p.prosecdef
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('submit_support_inquiry','list_support_inquiries',
    'get_support_inquiry','mutate_support_inquiry','support_intake_available',
    'read_support_intake_control','configure_support_intake')),
  'support RPCs use service-only invoker authorization');
SELECT support_contract_test.assert((SELECT bool_and(
    NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'support_%' AND c.relkind='r'),
  'browser roles have no private support table privileges');

BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM 1 FROM private.support_inquiries; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'anonymous clients cannot read private Inquiries');
  denied:=false;
  BEGIN PERFORM public.submit_support_inquiry(support_contract_test.id('submission',1),
    support_contract_test.key('source',1),support_contract_test.key('email',1),'Synthetic customer',
    'synthetic@example.invalid','general','Synthetic question','Private body');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'anonymous clients cannot bypass intake admission');
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM 1 FROM private.support_messages; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'authenticated customers cannot read support messages');
  denied:=false;
  BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),'all');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'a browser cannot impersonate an Admin through a service RPC');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT support_contract_test.assert(NOT public.support_intake_available(),'intake is disabled on installation');
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM support_contract_test.submit(10); EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'disabled intake cannot admit work');
  PERFORM support_contract_test.assert((SELECT count(*)=0 FROM private.support_inquiries),
    'disabled intake creates no Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
UPDATE private.support_controls SET intake_enabled=true;
DO $$ DECLARE v_id uuid; intent private.email_intents%rowtype; lease uuid:=support_contract_test.id('disabled-lease',120); BEGIN
  v_id:=(support_contract_test.submit(120)->>'inquiryId')::uuid;
  SELECT * INTO intent FROM private.email_intents WHERE purpose='support_acknowledgement'
    AND receipt->>'inquiryId'=v_id::text;
  PERFORM public.claim_email_intents('sandbox',lease,5);
  PERFORM support_contract_test.assert(public.prepare_email_attempt(intent.id,lease,
    support_contract_test.payload(intent.recipient,intent.id,intent.receipt->>'subject',intent.receipt->>'body')) IS NULL,
    'enabling intake alone cannot prepare customer email');
  PERFORM support_contract_test.assert((SELECT state='blocked' AND error_code='support_delivery_disabled'
    AND first_attempt_at IS NULL FROM private.email_intents WHERE id=intent.id),
    'delivery defaults remain disabled independently of a healthy intake');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
    'Synthetic reply','Drafting works during an email outage');
  PERFORM support_contract_test.assert((SELECT current_draft_version=1 FROM private.support_inquiries WHERE id=v_id),
    'manual support work remains available while delivery is disabled');
END $$;
ROLLBACK;

-- Explicit activation affects only this disposable fixture database.
UPDATE private.support_controls SET intake_enabled=true;
UPDATE private.email_controls SET enabled=true WHERE purpose IN ('support_acknowledgement','support_reply');

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE first_result jsonb; second_result jsonb; v_id uuid; denied boolean:=false; BEGIN
  first_result:=support_contract_test.submit(11);
  v_id:=(first_result->>'inquiryId')::uuid;
  second_result:=support_contract_test.submit(11);
  PERFORM support_contract_test.assert(first_result=second_result,'same submission retry returns its original Inquiry');
  PERFORM support_contract_test.assert((SELECT count(*)=1 FROM private.support_inquiries WHERE id=v_id),
    'one durable Inquiry is admitted');
  PERFORM support_contract_test.assert((SELECT count(*)=1 FROM private.support_messages WHERE inquiry_id=v_id),
    'retry does not duplicate the inbound message');
  PERFORM support_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
    WHERE purpose='support_acknowledgement' AND receipt->>'inquiryId'=v_id::text),
    'one acknowledgement is stored atomically with intake');
  PERFORM support_contract_test.assert((SELECT bool_and(NOT(receipt ?| ARRAY['order','orderNumber','orderId'])
      AND receipt::text NOT LIKE '%Private synthetic inquiry body%')
    FROM private.email_intents WHERE purpose='support_acknowledgement'),
    'acknowledgements never quote submitted content or Order facts');
  BEGIN PERFORM support_contract_test.submit(11,'{"body":"Changed private body"}'::jsonb);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'reusing an idempotency identity with changed content is rejected');
  second_result:=support_contract_test.submit(12,jsonb_build_object('submissionId',support_contract_test.id('submission',11),
    'email','synthetic-11@example.invalid','emailAbuseKey',support_contract_test.key('email',11)));
  PERFORM support_contract_test.assert(first_result=second_result,
    'an identical submission retry retains its identity when the client source changes');
  PERFORM support_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.support_abuse_windows
    WHERE kind='source' AND abuse_key=support_contract_test.key('source',12)),
    'a retry from a new source does not consume another admission');
  denied:=false;
  BEGIN PERFORM support_contract_test.submit(12,jsonb_build_object('submissionId',support_contract_test.id('submission',11)));
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'changing canonical content conflicts even when the client source changes');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE field jsonb; denied boolean; BEGIN
  FOREACH field IN ARRAY ARRAY[
    jsonb_build_object('name',repeat('n',101)),jsonb_build_object('subject',repeat('s',201)),
    jsonb_build_object('body',repeat('b',10001)),jsonb_build_object('email','invalid-address'),
    jsonb_build_object('email',repeat('e',245)||'@example.invalid'),
    jsonb_build_object('inquiryType','unrecognized'),jsonb_build_object('abuseKey','raw-ip-address'),
    jsonb_build_object('emailAbuseKey','raw-address'),
    jsonb_build_object('name',E'header\ncontrol'),jsonb_build_object('subject',E'header\rcontrol'),
    jsonb_build_object('body','body'||chr(1)||'control')
  ] LOOP
    denied:=false;
    BEGIN PERFORM support_contract_test.submit(20,field); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'intake enforces bounded fields, known type and opaque abuse keys');
  END LOOP;
  PERFORM support_contract_test.assert((SELECT count(*)=0 FROM private.support_inquiries),
    'invalid submissions leave no partial Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; denied boolean:=false; BEGIN
  FOR n IN 30..34 LOOP
    PERFORM support_contract_test.submit(n,jsonb_build_object('abuseKey',support_contract_test.key('shared-source',30)));
  END LOOP;
  BEGIN PERFORM support_contract_test.submit(35,jsonb_build_object('abuseKey',support_contract_test.key('shared-source',30)));
  EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'a source cannot exceed five admissions per hour');
  PERFORM support_contract_test.assert((SELECT count(*)=5 FROM private.support_inquiries),
    'a rejected source admission creates no Inquiry');
  -- A successful retry remains possible at the limit and does not consume another admission.
  PERFORM support_contract_test.submit(30,jsonb_build_object('abuseKey',support_contract_test.key('shared-source',30)));
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; denied boolean:=false; BEGIN
  FOR n IN 40..42 LOOP
    PERFORM support_contract_test.submit(n,jsonb_build_object('emailAbuseKey',support_contract_test.key('shared-email',40),
      'email','same-synthetic@example.invalid'));
  END LOOP;
  BEGIN PERFORM support_contract_test.submit(43,jsonb_build_object('emailAbuseKey',support_contract_test.key('shared-email',40),
    'email','same-synthetic@example.invalid'));
  EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'an email address cannot exceed three admissions per hour');
  PERFORM support_contract_test.assert((SELECT count(*)=3 FROM private.support_inquiries),
    'a rejected address admission creates no Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE kind text; n integer:=90; denied boolean; changes jsonb; BEGIN
  FOREACH kind IN ARRAY ARRAY['source','email'] LOOP
    INSERT INTO private.support_abuse_windows(kind,abuse_key,bucket_start,count)
    VALUES(kind,support_contract_test.key('daily-'||kind,n),date_trunc('minute',clock_timestamp()-interval '2 hours'),
      CASE WHEN kind='source' THEN 19 ELSE 9 END);
    changes:=jsonb_build_object(CASE WHEN kind='source' THEN 'abuseKey' ELSE 'emailAbuseKey' END,
      support_contract_test.key('daily-'||kind,n));
    PERFORM support_contract_test.submit(n,changes);
    denied:=false;
    BEGIN PERFORM support_contract_test.submit(n+1,changes);
    EXCEPTION WHEN program_limit_exceeded THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'rolling daily admission limit survives an hourly boundary');
    n:=n+10;
  END LOOP;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE control jsonb; changed jsonb; BEGIN
  control:=public.read_support_intake_control();
  PERFORM support_contract_test.assert(public.configure_support_intake(false,(control->>'updatedAt')::timestamptz),
    'a current operator control version can disable intake');
  PERFORM support_contract_test.assert(NOT public.configure_support_intake(true,(control->>'updatedAt')::timestamptz),
    'a stale activation command cannot overwrite a newer intake decision');
  changed:=public.read_support_intake_control();
  PERFORM support_contract_test.assert(NOT(changed->>'enabled')::boolean,'failed activation keeps intake closed');
END $$;
ROLLBACK;

-- Force a failure at the final outbox insertion to prove the entire admission rolls back.
BEGIN;
CREATE FUNCTION support_contract_test.reject_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF new.purpose='support_acknowledgement' THEN RAISE EXCEPTION USING errcode='P0001',message='synthetic admission failure'; END IF;
  RETURN new;
END $$;
CREATE TRIGGER synthetic_support_ack_failure BEFORE INSERT ON private.email_intents
FOR EACH ROW EXECUTE FUNCTION support_contract_test.reject_ack();
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM support_contract_test.submit(50); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'injected acknowledgement storage failure is observable');
  PERFORM support_contract_test.assert((SELECT count(*)=0 FROM private.support_inquiries)
    AND (SELECT count(*)=0 FROM private.support_messages)
    AND (SELECT count(*)=0 FROM private.support_intake_submissions)
    AND (SELECT count(*)=0 FROM private.support_abuse_windows),
    'Inquiry, message, deduplication identity and admission counters roll back together');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; actor_kind text; denied boolean; BEGIN
  v_id:=(support_contract_test.submit(60)->>'inquiryId')::uuid;
  FOREACH actor_kind IN ARRAY ARRAY['catalog_publisher','catalog_editor','inactive','customer','unknown'] LOOP
    denied:=false;
    BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor(actor_kind),'all');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'only an active support Admin can list private Inquiries');
    denied:=false;
    BEGIN PERFORM public.get_support_inquiry(support_contract_test.actor(actor_kind),v_id);
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'catalog staff and inactive users cannot read an Inquiry');
    denied:=false;
    BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor(actor_kind),v_id,1,'add_note',null,null,'Private note');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'catalog staff and inactive users cannot modify an Inquiry');
  END LOOP;
  PERFORM support_contract_test.assert(public.get_support_inquiry(support_contract_test.actor('admin'),v_id)->>'id'=v_id::text,
    'an active Admin can read a private Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; detail jsonb; reply_id uuid; v_closed_at timestamptz; denied boolean:=false; BEGIN
  v_id:=(support_contract_test.submit(70)->>'inquiryId')::uuid;
  detail:=public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
    'Synthetic reply','Exact approved response');
  PERFORM support_contract_test.assert((detail->>'revision')::integer=2
    AND (detail#>>'{draft,version}')::integer=1 AND (detail#>>'{draft,inquiryRevision}')::integer=2
    AND detail#>>'{draft,recipient}'='synthetic-70@example.invalid',
    'saving a draft binds current Inquiry revision and immutable recipient');
  BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'approve_reply',1);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'a stale Inquiry revision cannot approve a draft');
  denied:=false;
  BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',2);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'a mismatched draft version cannot be approved');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
  SELECT id INTO reply_id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'=v_id::text;
  PERFORM support_contract_test.assert(reply_id IS NOT NULL
    AND (SELECT count(*)=1 FROM private.support_reply_approvals WHERE inquiry_id=v_id)
    AND (SELECT count(*)=1 FROM private.support_messages WHERE inquiry_id=v_id AND kind='reply'),
    'repeated exact approval creates one outgoing identity and one reply');
  PERFORM support_contract_test.assert((SELECT recipient='synthetic-70@example.invalid'
    AND receipt->>'subject'='Synthetic reply' AND receipt->>'body'='Exact approved response'
    FROM private.email_intents WHERE id=reply_id),'outgoing reply freezes the exact approved recipient and content');
  detail:=public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'add_note',null,null,'Private internal note');
  PERFORM support_contract_test.assert((detail->>'revision')::integer=3,
    'new internal context advances the Inquiry revision');
  PERFORM support_contract_test.assert((SELECT state='blocked' AND error_code='approval_stale' AND first_attempt_at IS NULL
    FROM private.email_intents WHERE id=reply_id),'new context blocks an unsubmitted approval');
  PERFORM support_contract_test.assert(NOT public.retry_email_delivery(reply_id,
    (SELECT updated_at FROM private.email_intents WHERE id=reply_id)),
    'an operational retry cannot bypass stale human approval');
  PERFORM support_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE purpose='support_reply'),
    'an internal note never becomes a customer email');
  detail:=public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,3,'set_status',null,null,null,'closed');
  PERFORM support_contract_test.assert(detail->>'status'='closed' AND (detail->>'revision')::integer=4,
    'closing an Inquiry changes workflow status without claiming delivery');
  SELECT i.closed_at INTO v_closed_at FROM private.support_inquiries i WHERE id=v_id;
  PERFORM support_contract_test.assert(v_closed_at IS NOT NULL,'closing records a durable retention start');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,4,'set_status',null,null,null,'closed');
  PERFORM support_contract_test.assert((SELECT i.closed_at=v_closed_at FROM private.support_inquiries i WHERE id=v_id),
    'repeating closed status does not postpone the retention start');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,5,'set_status',null,null,null,'open');
  PERFORM support_contract_test.assert((SELECT i.closed_at IS NULL AND status='open' FROM private.support_inquiries i WHERE id=v_id),
    'reopening clears the inactive retention start');
  PERFORM support_contract_test.assert((SELECT jsonb_agg(status ORDER BY created_at,id)='["closed","closed","open"]'::jsonb
    FROM private.support_audit_events WHERE inquiry_id=v_id AND action='set_status'),
    'status audit records preserve each actual close and reopen decision');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; reply_id uuid; prepared jsonb; changed jsonb; denied boolean:=false; lease uuid:=support_contract_test.id('lease',80); BEGIN
  v_id:=(support_contract_test.submit(80)->>'inquiryId')::uuid;
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
    'Synthetic reply','Original approved response');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
  SELECT id INTO reply_id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'=v_id::text;
  PERFORM public.claim_email_intents('sandbox',lease,5);
  FOREACH changed IN ARRAY ARRAY['{"subject":"Unapproved subject"}'::jsonb,
    '{"text":"Unapproved response"}'::jsonb,'{"html":"<p>Unapproved content</p>"}'::jsonb,
    '{"attachments":[{"filename":"unapproved.txt","content":"eA=="}]}'::jsonb,
    '{"to":["different-synthetic@example.invalid"]}'::jsonb] LOOP
    denied:=false;
    BEGIN PERFORM public.prepare_email_attempt(reply_id,lease,
      support_contract_test.payload('synthetic-80@example.invalid',reply_id,'Synthetic reply','Original approved response')||changed);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'provider preparation rejects any unapproved content or attachment change');
  END LOOP;
  PERFORM support_contract_test.assert((SELECT first_attempt_at IS NULL AND attempt_count=0
    FROM private.email_intents WHERE id=reply_id),'rejected reply content does not consume or freeze an attempt');
  prepared:=public.prepare_email_attempt(reply_id,lease,
    support_contract_test.payload('synthetic-80@example.invalid',reply_id,'Synthetic reply','Original approved response'));
  PERFORM support_contract_test.assert(prepared IS NOT NULL,'a current exact approval can prepare its first provider attempt');
  PERFORM public.finish_email_attempt(reply_id,lease,'uncertain',null,'provider_timeout');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'save_draft',1,
    'Revised reply','Revised response');
  PERFORM support_contract_test.assert((SELECT state='uncertain' AND error_code='reconciliation_required'
    AND first_attempt_at IS NOT NULL AND request_payload->>'text'='Original approved response'
    FROM private.email_intents WHERE id=reply_id),
    'editing after uncertain provider handoff retains the original request for reconciliation');
  denied:=false;
  BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,3,'approve_reply',2);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'an unresolved earlier send prevents automatic replacement approval');
  PERFORM support_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE purpose='support_reply'),
    'editing uncertain content cannot create a second reply identity');
END $$;
ROLLBACK;

-- Fail after the reply intent/message insert: approval remains atomic and can be retried safely.
BEGIN;
CREATE FUNCTION support_contract_test.reject_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION USING errcode='P0001',message='synthetic approval failure';
END $$;
CREATE TRIGGER synthetic_support_approval_failure BEFORE INSERT ON private.support_reply_approvals
FOR EACH ROW EXECUTE FUNCTION support_contract_test.reject_approval();
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; denied boolean:=false; BEGIN
  v_id:=(support_contract_test.submit(110)->>'inquiryId')::uuid;
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
    'Synthetic reply','Atomic response');
  BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
  EXCEPTION WHEN raise_exception THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'injected approval storage failure is observable');
  PERFORM support_contract_test.assert((SELECT count(*)=0 FROM private.email_intents WHERE purpose='support_reply')
    AND (SELECT count(*)=0 FROM private.support_reply_approvals)
    AND (SELECT count(*)=0 FROM private.support_messages WHERE kind='reply')
    AND (SELECT count(*)=0 FROM private.support_audit_events WHERE action='approve_reply'),
    'reply intent, message, approval and audit all roll back on failure');
  PERFORM support_contract_test.assert((SELECT revision=2 AND current_draft_version=1 FROM private.support_inquiries WHERE id=v_id),
    'failed approval retains the exact editable draft version');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; reply_id uuid; denied boolean:=false; lease uuid:=support_contract_test.id('lease',130); BEGIN
  v_id:=(support_contract_test.submit(130)->>'inquiryId')::uuid;
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
    'Synthetic reply','Original response');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
  SELECT id INTO reply_id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'=v_id::text;
  PERFORM public.claim_email_intents('sandbox',lease,5);
  PERFORM public.prepare_email_attempt(reply_id,lease,
    support_contract_test.payload('synthetic-130@example.invalid',reply_id,'Synthetic reply','Original response'));
  PERFORM public.finish_email_attempt(reply_id,lease,'blocked',null,'recipient_not_allowed');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'save_draft',1,
    'Revised reply','Replacement response');
  PERFORM support_contract_test.assert((SELECT state='uncertain' AND error_code='reconciliation_required'
    AND first_attempt_at IS NOT NULL FROM private.email_intents WHERE id=reply_id),
    'a blocked result cannot conceal a previous possible provider handoff');
  BEGIN PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,3,'approve_reply',2);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'attempted blocked delivery also prevents an automatic replacement');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; reply_id uuid; prepared jsonb; prior_attempt boolean;
  n integer:=140; lease uuid; BEGIN
  FOREACH prior_attempt IN ARRAY ARRAY[false,true] LOOP
    UPDATE public.admin_memberships SET active=true WHERE user_id=support_contract_test.actor('admin');
    v_id:=(support_contract_test.submit(n)->>'inquiryId')::uuid;
    PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
      'Synthetic reply','Approved while active');
    PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
    SELECT id INTO reply_id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'=v_id::text;
    lease:=support_contract_test.id('revocation-lease',n);
    PERFORM public.claim_email_intents('sandbox',lease,5);
    IF prior_attempt THEN
      prepared:=public.prepare_email_attempt(reply_id,lease,
        support_contract_test.payload('synthetic-'||n||'@example.invalid',reply_id,'Synthetic reply','Approved while active'));
      PERFORM support_contract_test.assert(prepared IS NOT NULL,'an active approver permits the original handoff');
      PERFORM public.finish_email_attempt(reply_id,lease,'uncertain',null,'provider_timeout');
      UPDATE private.email_intents SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=reply_id;
      PERFORM public.claim_email_intents('sandbox',lease,5);
    END IF;
    UPDATE public.admin_memberships SET active=false WHERE user_id=support_contract_test.actor('admin');
    PERFORM support_contract_test.assert(public.prepare_email_attempt(reply_id,lease,
      support_contract_test.payload('synthetic-'||n||'@example.invalid',reply_id,'Synthetic reply','Approved while active')) IS NULL,
      'dispatch rechecks that the human approver remains an active Admin');
    PERFORM support_contract_test.assert((SELECT state=CASE WHEN prior_attempt THEN 'uncertain' ELSE 'blocked' END
      AND error_code=CASE WHEN prior_attempt THEN 'reconciliation_required' ELSE 'approval_stale' END
      FROM private.email_intents WHERE id=reply_id),
      'revoked approval blocks first sends and preserves earlier send uncertainty');
    n:=n+1;
  END LOOP;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; other_id uuid; other_cursor uuid; detail jsonb; page jsonb;
  all_messages jsonb:='[]'::jsonb; cursor_id uuid; oldest_id uuid; latest_id uuid; denied boolean:=false; n integer;
BEGIN
  v_id:=(support_contract_test.submit(160)->>'inquiryId')::uuid;
  FOR n IN 1..120 LOOP
    detail:=public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,n,'add_note',null,null,
      'Synthetic history note '||n);
    PERFORM support_contract_test.assert(jsonb_array_length(detail->'messages')=least(n+1,50),
      'mutation responses remain bounded as a conversation grows');
  END LOOP;
  page:=public.get_support_inquiry(support_contract_test.actor('admin'),v_id);
  PERFORM support_contract_test.assert(jsonb_array_length(page->'messages')=50
    AND page->>'nextMessageCursor'=page#>>'{messages,0,id}',
    'conversation opens with fifty recent messages and an older-message cursor');
  all_messages:=page->'messages';
  cursor_id:=(page->>'nextMessageCursor')::uuid;
  -- A new note between page requests must neither shift the keyset nor leak into older pages.
  detail:=public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,121,'add_note',null,null,
    'New context after the first page');
  latest_id:=(detail#>>'{messages,49,id}')::uuid;
  PERFORM support_contract_test.assert(jsonb_array_length(detail->'messages')=50,
    'a post-pagination mutation still returns only the latest bounded window');
  FOR n IN 2..3 LOOP
    page:=public.get_support_inquiry(support_contract_test.actor('admin'),v_id,cursor_id);
    PERFORM support_contract_test.assert(jsonb_array_length(page->'messages')=CASE WHEN n=2 THEN 50 ELSE 21 END,
      'older conversation pages have a stable bound and preserve the complete original history');
    PERFORM support_contract_test.assert((SELECT bool_and(previous_created_at IS NULL
        OR (previous_created_at,previous_id)<((message->>'createdAt')::timestamptz,(message->>'id')::uuid))
      FROM (SELECT message,lag((message->>'createdAt')::timestamptz) OVER (ORDER BY position) previous_created_at,
        lag((message->>'id')::uuid) OVER (ORDER BY position) previous_id
        FROM jsonb_array_elements(page->'messages') WITH ORDINALITY AS items(message,position)) ordered),
      'each message page is returned in chronological order with a stable identity tie-breaker');
    all_messages:=all_messages||(page->'messages');
    cursor_id:=(page->>'nextMessageCursor')::uuid;
    oldest_id:=(page#>>'{messages,0,id}')::uuid;
  END LOOP;
  PERFORM support_contract_test.assert(cursor_id IS NULL,
    'the final older-message page reports exhaustion');
  PERFORM support_contract_test.assert((SELECT count(*)=121 AND count(DISTINCT message->>'id')=121
    AND bool_and((message->>'id')::uuid<>latest_id) FROM jsonb_array_elements(all_messages) message),
    'older pagination has neither duplicate messages nor post-cursor insertions');
  PERFORM support_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.support_messages m
      WHERE m.inquiry_id=v_id AND m.id<>latest_id
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(all_messages) message WHERE message->>'id'=m.id::text)),
    'pagination retains every message visible before the newer insertion');
  page:=public.get_support_inquiry(support_contract_test.actor('admin'),v_id,oldest_id);
  PERFORM support_contract_test.assert(page->'messages'='[]'::jsonb AND page->>'nextMessageCursor' IS NULL,
    'paging before the first message returns an empty exhausted page');
  other_id:=(support_contract_test.submit(161)->>'inquiryId')::uuid;
  SELECT id INTO other_cursor FROM private.support_messages WHERE inquiry_id=other_id;
  BEGIN PERFORM public.get_support_inquiry(support_contract_test.actor('admin'),v_id,other_cursor);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'a cursor from another Inquiry cannot cross the conversation boundary');
  denied:=false;
  BEGIN PERFORM public.get_support_inquiry(support_contract_test.actor('admin'),v_id,support_contract_test.id('missing-message',160));
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'an unknown conversation cursor fails closed');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_id uuid; reply_id uuid; lease uuid; provider_id text; outcome text; detail jsonb; listed jsonb;
  n integer:=170;
BEGIN
  FOREACH outcome IN ARRAY ARRAY['delivered','bounced','suppressed'] LOOP
    v_id:=(support_contract_test.submit(n)->>'inquiryId')::uuid;
    PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,1,'save_draft',0,
      'Synthetic delivery reply','Approved response for delivery status');
    PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),v_id,2,'approve_reply',1);
    SELECT id INTO reply_id FROM private.email_intents WHERE purpose='support_reply' AND receipt->>'inquiryId'=v_id::text;
    lease:=support_contract_test.id('delivery-lease',n);
    provider_id:='synthetic-support-delivery-'||n;
    PERFORM public.claim_email_intents('sandbox',lease,5);
    PERFORM support_contract_test.assert(public.prepare_email_attempt(reply_id,lease,
      support_contract_test.payload('synthetic-'||n||'@example.invalid',reply_id,
        'Synthetic delivery reply','Approved response for delivery status')) IS NOT NULL,
      'delivery-status fixture prepares the actual approved provider envelope');
    PERFORM support_contract_test.assert(public.finish_email_attempt(reply_id,lease,'accepted',provider_id,null),
      'delivery-status fixture records provider acceptance through the shared send contract');
    PERFORM support_contract_test.assert(public.get_support_inquiry(support_contract_test.actor('admin'),v_id)->>'lastDeliveryState'='accepted',
      'provider acceptance remains distinct from a subsequent delivery event');
    PERFORM support_contract_test.assert(public.record_email_delivery_event('support-delivery-event-'||n,'sandbox',
      reply_id,provider_id,'email.'||outcome,clock_timestamp(),'Helix Demo <onboarding@resend.dev>',
      'synthetic-'||n||'@example.invalid')='matched',
      'the admitted callback correlates to the prepared support reply');
    detail:=public.get_support_inquiry(support_contract_test.actor('admin'),v_id);
    SELECT inquiry INTO listed FROM jsonb_array_elements(
      public.list_support_inquiries(support_contract_test.actor('admin'),'all')->'inquiries') inquiry
      WHERE inquiry->>'id'=v_id::text;
    PERFORM support_contract_test.assert(detail->>'lastDeliveryState'=outcome AND listed->>'lastDeliveryState'=outcome,
      'Inquiry detail and inbox summaries prefer the actual delivery outcome over acceptance');
    PERFORM support_contract_test.assert((SELECT message#>>'{delivery,deliveryStatus}'=outcome
        AND message#>>'{delivery,state}'='accepted' FROM jsonb_array_elements(detail->'messages') message
      WHERE message->>'kind'='reply'),
      'conversation messages preserve both accepted send state and the distinct delivery outcome');
    n:=n+1;
  END LOOP;
END $$;
ROLLBACK;

-- Large synthetic fixture bypasses intake throttles solely to prove that every Inbox row remains reachable.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO private.support_inquiries(id,name,email,inquiry_type,subject,created_at,updated_at)
SELECT support_contract_test.id('inbox-page',n),'Synthetic paging customer','paging-'||n||'@example.invalid',
  'general','Synthetic page question',timestamptz '2026-01-01 00:00:00+00'+(n/100)*interval '1 second',
  timestamptz '2026-01-01 00:00:00+00'
FROM generate_series(1,25031) n;
DO $$ DECLARE page jsonb; first_page jsonb; second_page jsonb; changed_page jsonb; cursor_value jsonb;
  before_ids uuid[]; after_ids uuid[]; all_ids uuid[]:='{}'::uuid[];
  changed_id uuid; inserted_id uuid:=support_contract_test.id('inbox-new',25032);
  page_count integer:=0; item_count integer; denied boolean; cursor_time timestamptz; cursor_id uuid;
  invalid_status text; invalid_direction text;
BEGIN
  first_page:=public.list_support_inquiries(support_contract_test.actor('admin'));
  PERFORM support_contract_test.assert(jsonb_array_length(first_page->'inquiries')=25
    AND first_page->>'previousCursor' IS NULL AND first_page->>'nextCursor' IS NOT NULL,
    'the default Inbox begins with a bounded newest page and only an older cursor');
  PERFORM support_contract_test.assert((SELECT count(DISTINCT inquiry->>'createdAt')=1
    FROM jsonb_array_elements(first_page->'inquiries') inquiry),
    'the large fixture exercises equal-timestamp identity ordering across page boundaries');
  cursor_value:=first_page->'nextCursor';
  second_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'older');
  SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO before_ids
    FROM jsonb_array_elements(second_page->'inquiries') WITH ORDINALITY items(inquiry,position);
  changed_id:=before_ids[10];
  INSERT INTO private.support_inquiries(id,name,email,inquiry_type,subject,created_at)
  VALUES(inserted_id,'Synthetic new customer','new-paging@example.invalid','general','Inserted after page one',
    timestamptz '2026-01-02 00:00:00+00');
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),changed_id,1,'add_note',null,null,
    'New internal context must not move an existing Inquiry between pages');
  changed_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'older');
  SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO after_ids
    FROM jsonb_array_elements(changed_page->'inquiries') WITH ORDINALITY items(inquiry,position);
  PERFORM support_contract_test.assert(before_ids=after_ids,
    'new Inquiry creation and updates do not shift an existing older-page cursor');
  cursor_value:=changed_page->'previousCursor';
  changed_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'newer');
  SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO before_ids
    FROM jsonb_array_elements(first_page->'inquiries') WITH ORDINALITY items(inquiry,position);
  SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO after_ids
    FROM jsonb_array_elements(changed_page->'inquiries') WITH ORDINALITY items(inquiry,position);
  PERFORM support_contract_test.assert(before_ids=after_ids,
    'backward pagination returns the same immediately preceding page despite a newer insertion');
  cursor_value:=changed_page->'previousCursor';
  page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'newer');
  PERFORM support_contract_test.assert(jsonb_array_length(page->'inquiries')=1
    AND page#>>'{inquiries,0,id}'=inserted_id::text AND page->>'previousCursor' IS NULL,
    'newer traversal eventually reaches the newly inserted Inquiry and reports its boundary');

  page:=public.list_support_inquiries(support_contract_test.actor('admin'),'all');
  LOOP
    page_count:=page_count+1;
    item_count:=jsonb_array_length(page->'inquiries');
    PERFORM support_contract_test.assert(item_count BETWEEN 1 AND 25 AND page_count<=1100,
      'every Inbox page stays bounded and traversal terminates');
    PERFORM support_contract_test.assert((SELECT bool_and(previous_created_at IS NULL
        OR (previous_created_at,previous_id)>((inquiry->>'createdAt')::timestamptz,(inquiry->>'id')::uuid))
      FROM (SELECT inquiry,lag((inquiry->>'createdAt')::timestamptz) OVER (ORDER BY position) previous_created_at,
        lag((inquiry->>'id')::uuid) OVER (ORDER BY position) previous_id
        FROM jsonb_array_elements(page->'inquiries') WITH ORDINALITY AS items(inquiry,position)) ordered),
      'Inbox pages preserve descending immutable creation time and UUID ordering');
    SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO after_ids
      FROM jsonb_array_elements(page->'inquiries') WITH ORDINALITY items(inquiry,position);
    all_ids:=all_ids||after_ids;
    EXIT WHEN page->>'nextCursor' IS NULL;
    cursor_value:=page->'nextCursor';
    page:=public.list_support_inquiries(support_contract_test.actor('admin'),'all',
      (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'older');
  END LOOP;
  PERFORM support_contract_test.assert(page_count=1002 AND cardinality(all_ids)=25032
    AND (SELECT count(DISTINCT id)=25032 FROM unnest(all_ids) id),
    'all Inquiries remain reachable without overlap beyond the former 25025-row offset ceiling');
  PERFORM support_contract_test.assert(NOT EXISTS(SELECT id FROM private.support_inquiries EXCEPT SELECT unnest(all_ids)),
    'complete keyset traversal omits no Inquiry');

  FOREACH invalid_direction IN ARRAY ARRAY['sideways','',null] LOOP
    denied:=false;
    BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),'open',null,null,invalid_direction);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'Inbox rejects unsupported directions');
  END LOOP;
  FOREACH invalid_status IN ARRAY ARRAY['unknown','',null] LOOP
    denied:=false;
    BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),invalid_status);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'Inbox rejects unsupported status filters');
  END LOOP;
  FOREACH cursor_time IN ARRAY ARRAY[timestamptz 'infinity',timestamptz '-infinity'] LOOP
    denied:=false;
    BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),'all',cursor_time,inserted_id);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    PERFORM support_contract_test.assert(denied,'Inbox rejects nonfinite cursor timestamps');
  END LOOP;
  denied:=false;
  BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),'all',clock_timestamp(),null);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'Inbox rejects a timestamp without its identity cursor');
  denied:=false;
  BEGIN PERFORM public.list_support_inquiries(support_contract_test.actor('admin'),'all',null,inserted_id);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'Inbox rejects an identity without its timestamp cursor');
  page:=public.list_support_inquiries(support_contract_test.actor('admin'),'all',
    timestamptz '2026-01-01 00:03:00+00',support_contract_test.id('nonexistent-inbox-cursor',1));
  PERFORM support_contract_test.assert(jsonb_array_length(page->'inquiries')=25,
    'an intrinsic tuple cursor remains valid without looking up an existing Inquiry row');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL TIME ZONE 'America/Los_Angeles';
INSERT INTO private.support_inquiries(id,name,email,inquiry_type,subject,created_at)
SELECT support_contract_test.id('inbox-microsecond',n),'Synthetic precise customer','precise-'||n||'@example.invalid',
  'general','Synthetic precise page',timestamptz '2026-01-01 00:00:00+00'+n*interval '1 microsecond'
FROM generate_series(1,30) n;
DO $$ DECLARE first_page jsonb; second_page jsonb; reverse_page jsonb; cursor_value jsonb;
  ids uuid[]; denied boolean:=false;
BEGIN
  first_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open');
  cursor_value:=first_page->'nextCursor';
  PERFORM support_contract_test.assert(cursor_value->>'createdAt'='2026-01-01T00:00:00.000006Z',
    'cursor timestamps preserve all six microsecond digits in UTC regardless of session timezone');
  second_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid);
  SELECT array_agg((inquiry->>'id')::uuid ORDER BY position) INTO ids
    FROM jsonb_array_elements(second_page->'inquiries') WITH ORDINALITY items(inquiry,position);
  PERFORM support_contract_test.assert(ids=ARRAY[
    support_contract_test.id('inbox-microsecond',5),support_contract_test.id('inbox-microsecond',4),
    support_contract_test.id('inbox-microsecond',3),support_contract_test.id('inbox-microsecond',2),
    support_contract_test.id('inbox-microsecond',1)] AND second_page->>'nextCursor' IS NULL,
    'microsecond-only timestamp differences produce no omitted or repeated Inquiries');
  cursor_value:=second_page->'previousCursor';
  reverse_page:=public.list_support_inquiries(support_contract_test.actor('admin'),'open',
    (cursor_value->>'createdAt')::timestamptz,(cursor_value->>'id')::uuid,'newer');
  PERFORM support_contract_test.assert(reverse_page->'inquiries'=first_page->'inquiries',
    'microsecond cursor precision also preserves reverse pagination');
  BEGIN UPDATE private.support_inquiries SET created_at=created_at+interval '1 microsecond'
    WHERE id=support_contract_test.id('inbox-microsecond',1);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'Inquiry creation timestamps cannot be rewritten to move page positions');
  denied:=false;
  BEGIN UPDATE private.support_inquiries SET id=support_contract_test.id('rewritten-inbox-identity',1)
    WHERE id=support_contract_test.id('inbox-microsecond',1);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_contract_test.assert(denied,'Inquiry identities cannot be rewritten to move tied page positions');
END $$;
ROLLBACK;
