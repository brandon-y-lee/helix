-- Synthetic data only. The runner creates and drops a database in the labeled local test container.
CREATE SCHEMA support_inbound_test;
CREATE FUNCTION support_inbound_test.assert(ok boolean, description text) RETURNS void
LANGUAGE sql AS $$ SELECT support_contract_test.assert(ok, description) $$;
CREATE FUNCTION support_inbound_test.id(kind text, n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT md5('synthetic-support-inbound:' || kind || ':' || n)::uuid $$;
GRANT USAGE ON SCHEMA support_inbound_test TO service_role,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support_inbound_test TO service_role,anon,authenticated;

-- APPLY SUPPORT INBOUND MIGRATION

CREATE FUNCTION support_inbound_test.seed(n integer, include_history boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$ DECLARE inquiry uuid; intent private.email_intents%rowtype; BEGIN
  inquiry := (support_contract_test.submit(3000+n)->>'inquiryId')::uuid;
  INSERT INTO private.support_reply_routes(inquiry_id,address)
    VALUES(inquiry,'reply+'||md5('synthetic-route:'||n)||'@support.example.invalid')
    ON CONFLICT(inquiry_id) DO NOTHING;
  SELECT * INTO intent FROM private.email_intents WHERE purpose='support_acknowledgement'
    AND receipt->>'inquiryId'=inquiry::text;
  UPDATE private.email_intents SET state='accepted',first_attempt_at=clock_timestamp(),attempt_count=1,
    provider_email_id='outbound_fixture_'||n,
    request_payload=support_contract_test.payload(recipient,id,receipt->>'subject',receipt->>'body')
    WHERE id=intent.id;
  IF include_history THEN
    PERFORM support_inbound_test.assert(public.record_support_rfc_message(intent.id,'outbound_fixture_'||n,
      '<outgoing-'||n||'@example.invalid>'),'verified provider acceptance can establish RFC reply history');
  END IF;
  RETURN inquiry;
END $$;
CREATE FUNCTION support_inbound_test.enqueue(n integer, inquiry uuid, overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.record_support_inbound(
    coalesce(overrides->>'eventId','inbound_event_'||n),coalesce(overrides->>'providerEmailId','inbound_fixture_'||n),
    coalesce(overrides->>'sender',(SELECT email FROM private.support_inquiries WHERE id=inquiry),'new-sender@example.invalid'),
    CASE WHEN overrides ? 'recipients' THEN
      coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(overrides->'recipients')),'{}'::text[])
    ELSE ARRAY[coalesce(overrides->>'recipient',(SELECT address FROM private.support_reply_routes WHERE inquiry_id=inquiry),
        'support@example.invalid')] END,
    clock_timestamp(),coalesce(overrides->>'expectedAddress','support@example.invalid'))
$$;
CREATE FUNCTION support_inbound_test.email(n integer, overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('providerEmailId',j.provider_email_id,'rfcMessageId','<incoming-'||n||'@example.invalid>',
    'from',j.sender,'to',jsonb_build_array(j.recipient),'subject','Synthetic email reply',
    'body','Untrusted synthetic customer email text.','inReplyTo',
      (SELECT rfc_message_id FROM private.support_rfc_messages WHERE inquiry_id=j.inquiry_id
        AND origin='outgoing' ORDER BY created_at DESC LIMIT 1),
    'references','[]'::jsonb,'quarantineReason',null,'attachments','[]'::jsonb)||overrides
    FROM private.support_inbound_jobs j WHERE j.provider_email_id='inbound_fixture_'||n
$$;
CREATE FUNCTION support_inbound_test.submit(n integer, capability text, manifest jsonb, domain text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.submit_support_inquiry(support_contract_test.id('submission',n),support_contract_test.key('source',n),
    support_contract_test.key('email',n),'Synthetic customer','synthetic-'||n||'@example.invalid','general',
    'Synthetic question','Private synthetic inquiry body',null,capability,manifest,domain)
$$;
CREATE FUNCTION support_inbound_test.try_approve(inquiry uuid, revision integer, draft integer) RETURNS jsonb
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),inquiry,revision,'approve_reply',draft);
  RETURN '{"status":"approved"}'::jsonb;
EXCEPTION WHEN serialization_failure OR object_not_in_prerequisite_state THEN
  RETURN jsonb_build_object('status',SQLERRM);
END $$;
CREATE FUNCTION support_inbound_test.reply_payload(intent uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT support_contract_test.payload(recipient,id,receipt->>'subject',receipt->>'body')
    ||CASE WHEN receipt->>'renderVersion'='support-text-v2'
      THEN jsonb_build_object('reply_to',receipt->>'replyTo','headers',receipt->'headers') ELSE '{}'::jsonb END
  FROM private.email_intents WHERE id=intent
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support_inbound_test TO service_role;

SELECT support_inbound_test.assert(NOT (public.read_support_receiving_control()->>'enabled')::boolean,
  'incoming email admission begins disabled');
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM support_inbound_test.enqueue(1,null);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'disabled receiving cannot admit an inbound job');
  PERFORM support_inbound_test.assert((SELECT count(*)=0 FROM private.support_inbound_jobs),
    'disabled receiving persists no half-admitted inbound job');
END $$;
ROLLBACK;
UPDATE private.support_controls SET receiving_enabled=true;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE original jsonb; retried jsonb; fresh jsonb; photo jsonb; manifest jsonb; denied boolean:=false; BEGIN
  original:=support_contract_test.submit(3500);
  retried:=support_inbound_test.submit(3500,null,'[]','new-support.example.invalid');
  PERFORM support_inbound_test.assert(original=retried,
    'legacy text-only submissions retry through the new overload without another Inquiry or acknowledgement');
  fresh:=support_inbound_test.submit(3501,null,'[]','support.example.invalid');
  retried:=support_inbound_test.submit(3501,null,'[]','new-support.example.invalid');
  PERFORM support_inbound_test.assert(fresh=retried AND NOT EXISTS(SELECT 1 FROM private.support_upload_batches
    WHERE submission_id=support_contract_test.id('submission',3501)),
    'new text-only submissions need no capability batch and survive configured domain changes');
  PERFORM support_inbound_test.assert((SELECT address LIKE '%@support.example.invalid'
    FROM private.support_reply_routes WHERE inquiry_id=(fresh->>'inquiryId')::uuid),
    'domain changes preserve the original conversation reply route on retry');
  manifest:=jsonb_build_array(jsonb_build_object('uploadId',support_inbound_test.id('compat-photo',1),
    'contentType','image/png','byteSize',1024));
  photo:=support_inbound_test.submit(3502,support_contract_test.key('photo-compat',3502),manifest,'support.example.invalid');
  retried:=support_inbound_test.submit(3502,support_contract_test.key('photo-compat',3502),manifest,'new-support.example.invalid');
  PERFORM support_inbound_test.assert(photo=retried AND (SELECT count(*)=1 FROM private.support_photos
    WHERE inquiry_id=(photo->>'inquiryId')::uuid),'photo retries preserve capability-bound slots across domain switches');
  BEGIN PERFORM support_inbound_test.submit(3502,support_contract_test.key('different-capability',3502),manifest,
    'support.example.invalid'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'a photo submission cannot replay with another upload capability');
  denied:=false;
  BEGIN PERFORM support_inbound_test.submit(3502,support_contract_test.key('photo-compat',3502),
    jsonb_set(manifest,'{0,byteSize}','2048'),'support.example.invalid');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'a photo submission cannot rewrite its admitted manifest on retry');
  PERFORM support_inbound_test.assert((SELECT count(*)=3 FROM private.email_intents WHERE purpose='support_acknowledgement'),
    'all migration and domain retries preserve one acknowledgement per original submission');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; original jsonb; repeated jsonb; expected_revision integer; BEGIN
  inquiry:=support_inbound_test.seed(10);
  SELECT i.revision INTO expected_revision FROM private.support_inquiries i WHERE id=inquiry;
  original:=support_inbound_test.enqueue(10,inquiry);
  repeated:=support_inbound_test.enqueue(10,inquiry);
  PERFORM support_inbound_test.assert(original->>'status'='queued' AND repeated->>'status'='duplicate'
    AND original->>'id'=repeated->>'id','duplicate events reuse one durable inbound job');
  repeated:=support_inbound_test.enqueue(10,inquiry,'{"eventId":"inbound_second_event_10"}'::jsonb);
  PERFORM support_inbound_test.assert(repeated->>'status'='duplicate' AND original->>'id'=repeated->>'id',
    'different webhook IDs for the same provider email retain one job');
  PERFORM support_inbound_test.assert((SELECT count(*)=1 FROM private.support_inbound_jobs),
    'event and provider email identities deduplicate independently');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 FROM private.support_inbound_events),
    'both verified provider event identities remain durably acknowledged');
  PERFORM support_inbound_test.assert((SELECT i.revision=expected_revision+1 FROM private.support_inquiries i WHERE id=inquiry),
    'replayed callbacks do not repeatedly invalidate conversation context');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=1,
    'the queued inbound job holds reply approval before content retrieval');
  PERFORM support_inbound_test.assert(support_inbound_test.enqueue(11,inquiry,
    '{"recipient":"unrecognized@example.invalid"}'::jsonb)->>'status'='ignored',
    'unknown reply addresses persist only an ignored receipt');
END $$;
ROLLBACK;

BEGIN;
CREATE FUNCTION support_inbound_test.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'synthetic inbound event insert failure';
END $$;
SET LOCAL ROLE service_role;
SELECT support_inbound_test.seed(12);
RESET ROLE;
CREATE TRIGGER synthetic_inbound_receipt_failure BEFORE INSERT ON private.support_inbound_events
FOR EACH ROW EXECUTE FUNCTION support_inbound_test.reject_event();
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; expected_revision integer; denied boolean:=false; BEGIN
  SELECT i.id,i.revision INTO inquiry,expected_revision FROM private.support_inquiries i;
  BEGIN PERFORM support_inbound_test.enqueue(12,inquiry);
  EXCEPTION WHEN raise_exception THEN denied:=SQLERRM='synthetic inbound event insert failure'; END;
  PERFORM support_inbound_test.assert(denied,'the forced durable receipt failure was reached');
  PERFORM support_inbound_test.assert((SELECT count(*)=0 FROM private.support_inbound_jobs),
    'receipt persistence failure rolls back its inbound job');
  PERFORM support_inbound_test.assert((SELECT i.revision=expected_revision FROM private.support_inquiries i WHERE id=inquiry),
    'receipt persistence failure rolls back the context revision and hold');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; job uuid; lease uuid:=support_inbound_test.id('lease',20); work jsonb; BEGIN
  inquiry:=support_inbound_test.seed(20);
  job:=(support_inbound_test.enqueue(20,inquiry)->>'id')::uuid;
  -- Disabling new admission must not strand previously accepted provider work.
  UPDATE private.support_controls SET receiving_enabled=false;
  work:=public.claim_support_inbound(lease,1);
  PERFORM support_inbound_test.assert(jsonb_array_length(work)=1 AND work#>>'{0,id}'=job::text,
    'accepted inbound work continues processing after receiving admission is disabled');
  PERFORM support_inbound_test.assert(NOT public.finish_support_inbound(job,support_inbound_test.id('wrong-lease',20),
    support_inbound_test.email(20)),'another worker cannot complete a leased inbound job');
  PERFORM support_inbound_test.assert(public.finish_support_inbound(job,lease,support_inbound_test.email(20)),
    'matching reply alias, participant and RFC history admit the customer email');
  PERFORM support_inbound_test.assert((SELECT state='accepted' AND message_id IS NOT NULL
    FROM private.support_inbound_jobs WHERE id=job),'accepted email has a durable conversation message');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 FROM private.support_messages WHERE inquiry_id=inquiry),
    'one accepted email appends one message to the original web Inquiry');
  PERFORM support_inbound_test.assert((SELECT inquiry_id=inquiry FROM private.support_rfc_messages
    WHERE rfc_message_id='<incoming-20@example.invalid>'),'accepted incoming RFC identity is attached to the same Inquiry');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=0,
    'accepted content releases its processing hold');
  PERFORM support_inbound_test.assert(NOT public.finish_support_inbound(job,lease,support_inbound_test.email(20)),
    'replayed worker completion cannot add another customer message');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; job uuid; expected_revision integer; lease uuid:=support_inbound_test.id('lease',21); BEGIN
  inquiry:=support_inbound_test.seed(21);
  job:=(support_inbound_test.enqueue(21,inquiry)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(21,
    '{"inReplyTo":null,"references":[]}'::jsonb));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND reason='unknown_history' AND accept_allowed
    FROM private.support_inbound_jobs WHERE id=job),'alias alone cannot silently establish an existing email thread');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=1,
    'quarantined email holds approval until a human resolves it');
  SELECT i.revision INTO expected_revision FROM private.support_inquiries i WHERE id=inquiry;
  PERFORM public.mutate_support_inquiry(support_contract_test.actor('admin'),inquiry,expected_revision,'save_draft',0,
    'Review pending','A freshly saved draft still waits for pending customer context.');
  SELECT i.revision INTO expected_revision FROM private.support_inquiries i WHERE id=inquiry;
  PERFORM support_inbound_test.assert(support_inbound_test.try_approve(inquiry,expected_revision,1)->>'status'='pending_support_context',
    'even a freshly saved draft cannot be approved while quarantined inbound context remains');
  PERFORM public.review_support_inbound(support_contract_test.actor('admin'),inquiry,expected_revision,job,'accept');
  PERFORM support_inbound_test.assert((SELECT state='accepted' FROM private.support_inbound_jobs WHERE id=job),
    'an authorized Operator can explicitly accept same-participant unknown history');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; other_inquiry uuid; job uuid; expected_revision integer; denied boolean:=false;
  lease uuid:=support_inbound_test.id('lease',22); BEGIN
  inquiry:=support_inbound_test.seed(22); other_inquiry:=support_inbound_test.seed(23);
  job:=(support_inbound_test.enqueue(22,inquiry,'{"sender":"different-person@example.invalid"}'::jsonb)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(22));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND reason='sender_mismatch' AND NOT accept_allowed
    FROM private.support_inbound_jobs WHERE id=job),'a stolen or forwarded reply alias cannot impersonate the participant');
  SELECT i.revision INTO expected_revision FROM private.support_inquiries i WHERE id=inquiry;
  BEGIN PERFORM public.review_support_inbound(support_contract_test.actor('admin'),inquiry,expected_revision,job,'accept');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'even an Operator cannot accept another sender into the participant thread');
  denied:=false;
  BEGIN PERFORM public.review_support_inbound(support_contract_test.actor('catalog_publisher'),inquiry,expected_revision,job,'dismiss');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'catalog permissions cannot dismiss private inbound security review');
  PERFORM public.review_support_inbound(support_contract_test.actor('admin'),inquiry,expected_revision,job,'dismiss');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=0,
    'authorized dismissal releases the hold without adding customer content');
  PERFORM support_inbound_test.assert((SELECT count(*)=1 FROM private.support_messages WHERE inquiry_id=inquiry),
    'dismissed sender mismatch adds no customer message');
  job:=(support_inbound_test.enqueue(23,other_inquiry)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(23,
    '{"references":["<outgoing-22@example.invalid>"]}'::jsonb));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND reason='ambiguous_history'
    FROM private.support_inbound_jobs WHERE id=job),'cross-Inquiry RFC references never silently merge private conversations');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE job uuid; inquiry uuid; expected_revision integer; lease uuid:=support_inbound_test.id('lease',24); BEGIN
  job:=(support_inbound_test.enqueue(24,null)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(24));
  SELECT inquiry_id INTO inquiry FROM private.support_inbound_jobs WHERE id=job;
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND reason='uncorrelated' AND accept_allowed
    FROM private.support_inbound_jobs WHERE id=job),'base-address mail creates a reviewable uncorrelated shell');
  PERFORM support_inbound_test.assert((SELECT order_id IS NULL FROM private.support_inquiries WHERE id=inquiry),
    'sender address does not confer an Account or Order association');
  PERFORM support_inbound_test.assert((SELECT count(*)=0 FROM private.email_intents
    WHERE receipt->>'inquiryId'=inquiry::text),'base-address mail does not automatically send an acknowledgement loop');
  SELECT i.revision INTO expected_revision FROM private.support_inquiries i WHERE id=inquiry;
  PERFORM public.review_support_inbound(support_contract_test.actor('admin'),inquiry,expected_revision,job,'accept');
  PERFORM support_inbound_test.assert((SELECT count(*)=1 FROM private.support_messages WHERE inquiry_id=inquiry),
    'explicit review accepts the first email into its new private Inquiry');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; job uuid; lease uuid:=support_inbound_test.id('lease',25); BEGIN
  inquiry:=support_inbound_test.seed(25);
  job:=(support_inbound_test.enqueue(25,inquiry)->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,null,'provider_unavailable',true);
  PERFORM support_inbound_test.assert((SELECT state='pending' AND attempt_count=1 AND reason='provider_unavailable'
    FROM private.support_inbound_jobs WHERE id=job),'transient provider failure remains retryable without losing intake');
  PERFORM support_inbound_test.assert(jsonb_array_length(public.claim_support_inbound(lease,1))=0,
    'backoff prevents immediate repeat provider retrieval');
  UPDATE private.support_inbound_jobs SET next_attempt_at=clock_timestamp()-interval '1 second',
    deadline_at=clock_timestamp()-interval '1 second' WHERE id=job;
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,null,'fetch_expired',true);
  PERFORM support_inbound_test.assert((SELECT state='failed' AND reason='fetch_expired' FROM private.support_inbound_jobs WHERE id=job),
    'expired provider retrieval becomes visible failed work');
  PERFORM support_inbound_test.assert(private.support_pending_context(inquiry)=1,
    'failed retrieval retains the approval hold until explicitly reviewed');
END $$;
ROLLBACK;

SELECT support_inbound_test.assert((SELECT count(*)=6 AND bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private'
    AND c.relname IN ('support_reply_routes','support_inbound_jobs','support_inbound_events','support_inbound_routes','support_rfc_messages','support_rfc_conflicts')),
  'all incoming email identity, job, and receipt records have forced RLS');
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; other_inquiry uuid; address text; other_address text; result jsonb; job uuid;
  lease uuid:=support_inbound_test.id('multi-recipient',26); BEGIN
  inquiry:=support_inbound_test.seed(26);
  SELECT r.address INTO address FROM private.support_reply_routes r WHERE inquiry_id=inquiry;
  result:=support_inbound_test.enqueue(26,inquiry,jsonb_build_object('recipients',
    jsonb_build_array('reply-fake@support.example.invalid',address),'expectedAddress','new-support@example.invalid'));
  PERFORM support_inbound_test.assert(result->>'status'='queued' AND (SELECT inquiry_id=inquiry AND recipient=address
    FROM private.support_inbound_jobs WHERE id=(result->>'id')::uuid),
    'an unknown alias before the real recipient cannot shadow a stored route after a domain switch');
  other_inquiry:=support_inbound_test.seed(27);
  SELECT r.address INTO other_address FROM private.support_reply_routes r WHERE inquiry_id=other_inquiry;
  result:=support_inbound_test.enqueue(27,inquiry,jsonb_build_object('recipients',jsonb_build_array(address,other_address)));
  job:=(result->>'id')::uuid;
  PERFORM public.claim_support_inbound(lease,5);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(27,
    jsonb_build_object('to',jsonb_build_array(address,other_address))));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' FROM private.support_inbound_jobs WHERE id=job),
    'an email addressing two private conversation aliases never silently joins either thread');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; intent uuid; maximum_rfc text:='<'||repeat('a',494)||'@example.invalid>'; BEGIN
  inquiry:=support_inbound_test.seed(28,false);
  SELECT id INTO intent FROM private.email_intents WHERE receipt->>'inquiryId'=inquiry::text;
  PERFORM support_inbound_test.assert(NOT public.record_support_rfc_message(intent,'wrong_provider',maximum_rfc),
    'a provider message ID cannot establish RFC history without its accepted intent binding');
  PERFORM support_inbound_test.assert(length(maximum_rfc)=512 AND public.record_support_rfc_message(intent,
    'outbound_fixture_28',maximum_rfc),'documented 512-character RFC Message-IDs remain usable for replies');
  PERFORM support_inbound_test.assert(public.record_support_rfc_message(intent,'outbound_fixture_28',maximum_rfc),
    'retrying accepted RFC capture preserves its exact original binding');
  PERFORM support_inbound_test.assert(NOT public.record_support_rfc_message(intent,'outbound_fixture_28',
    '<'||repeat('a',495)||'@example.invalid>'),'out-of-bounds RFC header identities are rejected');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; result jsonb; job uuid; lease uuid:=support_inbound_test.id('invalid-sender-lease',29); BEGIN
  inquiry:=support_inbound_test.seed(29);
  result:=support_inbound_test.enqueue(29,inquiry,'{"recipients":[]}'::jsonb);
  PERFORM support_inbound_test.assert(result->>'status'='ignored' AND (SELECT disposition='ignored'
    FROM private.support_inbound_events WHERE event_id='inbound_event_29'),
    'an empty recipient list receives a durable ignored receipt without creating work');
  result:=support_inbound_test.enqueue(30,inquiry,'{"sender":""}'::jsonb);
  job:=(result->>'id')::uuid;
  PERFORM support_inbound_test.assert(result->>'status'='queued' AND private.support_pending_context(inquiry)=1,
    'an invalid sender on a known alias still holds the affected conversation for review');
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(30));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND NOT accept_allowed
    FROM private.support_inbound_jobs WHERE id=job),'invalid-sender content cannot autojoin the private participant thread');
  result:=support_inbound_test.enqueue(31,null,'{"sender":""}'::jsonb);
  PERFORM support_inbound_test.assert(result->>'status'='ignored' AND (SELECT count(*)=1 FROM private.support_inquiries),
    'invalid sender mail at the base address cannot create an unattributed Inquiry');
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE name text; denied boolean; BEGIN
  FOREACH name IN ARRAY ARRAY['support_reply_routes','support_inbound_jobs','support_inbound_events','support_inbound_routes','support_rfc_messages','support_rfc_conflicts'] LOOP
    denied:=false;
    BEGIN EXECUTE format('SELECT 1 FROM private.%I',name); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM support_inbound_test.assert(denied,'authenticated browsers cannot read private incoming email records');
  END LOOP;
  denied:=false;
  BEGIN PERFORM public.claim_support_inbound(support_inbound_test.id('browser-lease',1),1);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'authenticated browsers cannot claim incoming email processing');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.record_support_inbound('forged_event','forged_email','forged@example.invalid',
    ARRAY['support@example.invalid'],now(),'support@example.invalid');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'anonymous browsers cannot bypass verified webhook admission');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE inquiry uuid; n integer; result jsonb; BEGIN
  inquiry:=support_inbound_test.seed(80);
  FOR n IN 8000..8019 LOOP
    PERFORM support_inbound_test.assert(support_inbound_test.enqueue(n,inquiry)->>'status'='queued',
      'bounded unresolved inbound work remains admissible below the Inquiry limit');
  END LOOP;
  result:=support_inbound_test.enqueue(8020,inquiry);
  PERFORM support_inbound_test.assert(result->>'status'='rate_limited'
    AND (SELECT count(*)=20 FROM private.support_inbound_jobs WHERE inquiry_id=inquiry),
    'an Inquiry cannot accumulate more than twenty unresolved inbound jobs');
  PERFORM support_inbound_test.assert((SELECT job_id IS NULL FROM private.support_inbound_events
    WHERE event_id='inbound_event_8020'),'rate-limited ingress retains a minimal receipt without adding processing work');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; result jsonb; BEGIN
  FOR n IN 9000..9099 LOOP PERFORM support_inbound_test.enqueue(n,null); END LOOP;
  result:=support_inbound_test.enqueue(9100,null);
  PERFORM support_inbound_test.assert(result->>'status'='rate_limited'
    AND (SELECT count(*)=100 FROM private.support_inbound_jobs),
    'all incoming senders share a bounded global unresolved-work budget');
  PERFORM support_inbound_test.assert((SELECT count(*)=101 FROM private.support_inbound_events),
    'global backpressure acknowledges the verified event without admitting more work');
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE first_inquiry uuid; second_inquiry uuid; first_address text; second_address text; job uuid;
  lease uuid:=support_inbound_test.id('ambiguous-alias-lease',32); BEGIN
  first_inquiry:=support_inbound_test.seed(32); second_inquiry:=support_inbound_test.seed(33);
  SELECT address INTO first_address FROM private.support_reply_routes WHERE inquiry_id=first_inquiry;
  SELECT address INTO second_address FROM private.support_reply_routes WHERE inquiry_id=second_inquiry;
  job:=(support_inbound_test.enqueue(32,first_inquiry,jsonb_build_object('recipients',
    jsonb_build_array(first_address,second_address)))->>'id')::uuid;
  PERFORM support_inbound_test.assert(private.support_pending_context(first_inquiry)=1
    AND private.support_pending_context(second_inquiry)=1,
    'one multi-alias message holds both affected private Inquiries');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 AND bool_and(revision=2) FROM private.support_inquiries
    WHERE id IN (first_inquiry,second_inquiry)),'multi-alias admission invalidates both approved context revisions');
  PERFORM public.claim_support_inbound(lease,1);
  PERFORM public.finish_support_inbound(job,lease,support_inbound_test.email(32,jsonb_build_object(
    'to',jsonb_build_array(first_address,second_address),'quarantineReason','authentication_unknown')));
  PERFORM support_inbound_test.assert((SELECT state='quarantined' AND NOT accept_allowed
    FROM private.support_inbound_jobs WHERE id=job),
    'unknown authentication cannot relax multi-Inquiry routing ambiguity into acceptability');
  PERFORM public.review_support_inbound(support_contract_test.actor('admin'),second_inquiry,
    (SELECT revision FROM private.support_inquiries WHERE id=second_inquiry),job,'dismiss');
  PERFORM support_inbound_test.assert(private.support_pending_context(first_inquiry)=0
    AND private.support_pending_context(second_inquiry)=0,
    'dismissal from either affected Inquiry releases both conversation holds');
  PERFORM support_inbound_test.assert((SELECT count(*)=2 AND bool_and(revision=4) FROM private.support_inquiries
    WHERE id IN (first_inquiry,second_inquiry)),'multi-alias review advances both context revisions consistently');
END $$;
ROLLBACK;

SELECT support_inbound_test.assert((SELECT count(*)>10 AND bool_and(NOT p.prosecdef
  AND p.proconfig=ARRAY['search_path=""']
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('record_support_inbound','claim_support_inbound','finish_support_inbound','review_support_inbound',
      'record_support_rfc_message','get_support_pending_rfc_messages','inspect_support_ingress',
      'reserve_support_photo_upload','complete_support_photo_upload','read_support_photo_uploads','claim_support_photos',
      'admit_support_photo_size','finish_support_photo','get_support_photo','claim_support_photo_cleanup','finish_support_photo_cleanup')),
  'inbound and photo RPCs use service-only invoker authorization with a fixed safe search path');
BEGIN;
SET LOCAL ROLE service_role;
SELECT support_inbound_test.assert(jsonb_typeof(public.inspect_support_ingress())='object',
  'service-only ingress health is inspectable without raw email or object content');
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.inspect_support_ingress(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM support_inbound_test.assert(denied,'browser roles cannot inspect private ingress operations');
END $$;
ROLLBACK;
