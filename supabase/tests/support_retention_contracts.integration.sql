-- Synthetic fixtures in a uniquely named disposable local PostgreSQL database.
create schema support_retention_test;
create function support_retention_test.assert(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',description; end if; end $$;
create function support_retention_test.id(kind text,n integer) returns uuid language sql immutable as $$
select md5('synthetic-retention:'||kind||':'||n)::uuid $$;
create function support_retention_test.actor() returns uuid language sql immutable as $$
select support_retention_test.id('admin',1) $$;
insert into auth.users(id) values(support_retention_test.actor()),(support_retention_test.id('editor',1));
insert into public.admin_memberships(user_id,role,active) values
  (support_retention_test.actor(),'admin',true),(support_retention_test.id('editor',1),'catalog_editor',true);
create function support_retention_test.seed(n integer,age interval default interval '13 months',closed boolean default true)
returns uuid language plpgsql as $$ declare inquiry uuid:=support_retention_test.id('inquiry',n); begin
  insert into private.support_inquiries(id,name,email,inquiry_type,subject,status,closed_at,created_at)
    values(inquiry,'Private retention name','private-retention@example.invalid','general','Private retention subject',
      case when closed then 'closed' else 'open' end,case when closed then clock_timestamp()-age end,
      clock_timestamp()-age-interval '1 day');
  insert into private.support_messages(id,inquiry_id,kind,subject,body,created_at)
    values(support_retention_test.id('message',n),inquiry,'inbound','Private retention subject',
      'Private retention message',clock_timestamp()-age);
  return inquiry;
end $$;
grant usage on schema support_retention_test to service_role,anon,authenticated;
grant execute on all functions in schema support_retention_test to service_role,anon,authenticated;

select support_retention_test.assert(to_regprocedure('public.run_support_retention(integer)') is not null,
  'the service retention boundary exists');
select support_retention_test.assert((select count(*)=3 and bool_and(not p.prosecdef
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('authenticated',p.oid,'EXECUTE')
  and has_function_privilege('service_role',p.oid,'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('run_support_retention','configure_support_retention','mark_synthetic_email_intents')),
  'retention and cohort controls use service-only invoker authorization');
begin;
set local role anon;
do $$ declare denied boolean:=false; begin
  begin perform public.run_support_retention(20); exception when insufficient_privilege then denied:=true; end;
  perform support_retention_test.assert(denied,'browser roles cannot invoke customer-content cleanup');
end $$;
rollback;

-- The text clock follows closure, not the age of the Inquiry or its oldest message.
begin;
select support_retention_test.seed(10);
select support_retention_test.seed(11,interval '11 months');
select support_retention_test.seed(12,interval '13 months',false);
set local role service_role;
do $$ declare result jsonb; denied boolean:=false; revision integer; begin
  result:=public.run_support_retention(20);
  perform support_retention_test.assert((result->>'inquiriesRedacted')::integer=1,'only text past twelve months of closure expires');
  perform support_retention_test.assert((select redacted_at is not null and name<>'Private retention name'
    and email<>'private-retention@example.invalid' and subject<>'Private retention subject'
    from private.support_inquiries where id=support_retention_test.id('inquiry',10)),'expired identity and subject are removed');
  perform support_retention_test.assert((select body<>'Private retention message' from private.support_messages
    where id=support_retention_test.id('message',10)),'expired message text is removed');
  perform support_retention_test.assert((select bool_and(redacted_at is null) from private.support_inquiries
    where id in (support_retention_test.id('inquiry',11),support_retention_test.id('inquiry',12))),
    'recently closed and old open Inquiries remain readable');
  perform support_retention_test.assert(public.get_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',10))
    ->>'redactedAt' is not null,'the admin read describes retained history truthfully');
  select i.revision into revision from private.support_inquiries i where id=support_retention_test.id('inquiry',10);
  begin perform public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',10),revision,
    'set_status',null,null,null,'open'); exception when object_not_in_prerequisite_state then denied:=true; end;
  perform support_retention_test.assert(denied,'a fully redacted historical Inquiry cannot be reopened');
  perform support_retention_test.assert((public.run_support_retention(20)->>'inquiriesRedacted')::integer=0,
    'cleanup replay does not reprocess a tombstone');
end $$;
rollback;

begin;
select support_retention_test.seed(13);
set local role service_role;
select public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',13),1,'set_status',null,null,null,'open');
select public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',13),2,'set_status',null,null,null,'closed');
select public.run_support_retention(20);
select support_retention_test.assert((select redacted_at is null and closed_at>clock_timestamp()-interval '1 minute'
  from private.support_inquiries where id=support_retention_test.id('inquiry',13)),
  'reopening and closing resets the text clock to the latest closure');
rollback;

-- An expired unsent draft retains its version slot and cannot be approved or resurrected.
begin;
select support_retention_test.seed(20,interval '1 day',false);
insert into private.support_drafts(id,inquiry_id,version,inquiry_revision,recipient,subject,body,actor_id,created_at)
  values(support_retention_test.id('draft',20),support_retention_test.id('inquiry',20),1,1,
    'private-retention@example.invalid','Private draft subject','Private draft text',support_retention_test.actor(),clock_timestamp()-interval '31 days');
update private.support_inquiries set current_draft_version=1 where id=support_retention_test.id('inquiry',20);
set local role service_role;
do $$ declare result jsonb; denied boolean:=false; revision integer; begin
  result:=public.run_support_retention(20);
  perform support_retention_test.assert((result->>'draftsRedacted')::integer=1,'unsent draft text expires thirty days after creation');
  perform support_retention_test.assert((select redacted_at is not null and version=1 and body<>'Private draft text'
    and recipient<>'private-retention@example.invalid' from private.support_drafts where id=support_retention_test.id('draft',20)),
    'draft cleanup removes text and identity while retaining its immutable version slot');
  select i.revision into revision from private.support_inquiries i where id=support_retention_test.id('inquiry',20);
  begin perform public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',20),revision,'approve_reply',1);
    exception when serialization_failure or object_not_in_prerequisite_state then denied:=true; end;
  perform support_retention_test.assert(denied,'an expired unsent draft cannot become an approved email');
  perform public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',20),revision,'save_draft',1,
    'New subject','New current reply.');
  perform support_retention_test.assert((select current_draft_version=2 from private.support_inquiries where id=support_retention_test.id('inquiry',20)),
    'the next manual draft advances past the retained version');
end $$;
rollback;

-- Holds are per Inquiry, require an Admin, expire, and can be explicitly released.
begin;
select support_retention_test.seed(30);
select support_retention_test.seed(31);
set local role service_role;
do $$ declare denied boolean:=false; revision integer; held_until timestamptz; begin
  begin perform public.configure_support_retention(support_retention_test.id('editor',1),support_retention_test.id('inquiry',30),1,
    clock_timestamp()+interval '1 day','legal',false); exception when insufficient_privilege then denied:=true; end;
  perform support_retention_test.assert(denied,'catalog access cannot place support retention holds');
  perform support_retention_test.assert(public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',30),1,
    clock_timestamp()+interval '1 day','legal',false),'an authorized timed hold is saved');
  select retention_hold_until into held_until from private.support_inquiries where id=support_retention_test.id('inquiry',30);
  perform support_retention_test.assert(not public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',30),1,
    null,null,false),'a stale revision cannot release a newer retention hold');
  perform support_retention_test.assert(not public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',30),1,
    clock_timestamp()+interval '2 days','safety',false),'a stale revision cannot replace a newer retention hold');
  perform support_retention_test.assert((select i.revision=2 and i.retention_hold_until=held_until and i.retention_hold_reason='legal'
    from private.support_inquiries i where id=support_retention_test.id('inquiry',30)),
    'a saved hold advances the revision and stale changes preserve its exact scope');
  perform public.run_support_retention(20);
  perform support_retention_test.assert((select redacted_at is null from private.support_inquiries where id=support_retention_test.id('inquiry',30))
    and (select redacted_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',31)),
    'a hold protects only its selected Inquiry');
  select i.revision into revision from private.support_inquiries i where id=support_retention_test.id('inquiry',30);
  perform support_retention_test.assert(public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',30),revision,null,null,false),
    'the current revision can explicitly release the hold');
  perform public.run_support_retention(20);
  perform support_retention_test.assert((select redacted_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',30)),
    'releasing a hold allows overdue content to expire');
end $$;
rollback;
begin;
select support_retention_test.seed(32);
update private.support_inquiries set retention_hold_until=clock_timestamp()-interval '1 minute',
  retention_hold_reason='legal',retention_hold_actor_id=support_retention_test.actor()
  where id=support_retention_test.id('inquiry',32);
set local role service_role;
select public.run_support_retention(20);
select support_retention_test.assert((select redacted_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',32)),
  'a timed hold does not protect content after its deadline');
rollback;

-- Explicit synthetic marking changes the cleanup schedule; sandbox alone never does.
begin;
select support_retention_test.seed(40,interval '31 days',false);
select support_retention_test.seed(41,interval '31 days',false);
select support_retention_test.seed(42,interval '20 days',false);
set local role service_role;
select public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',40),1,null,null,true);
select public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',42),1,null,null,true);
select public.run_support_retention(20);
select support_retention_test.assert((select redacted_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',40))
  and (select bool_and(redacted_at is null) from private.support_inquiries where id in
    (support_retention_test.id('inquiry',41),support_retention_test.id('inquiry',42))),
  'explicit synthetic data expires by creation age while unmarked sandbox and younger synthetic content remain');
rollback;

create function support_retention_test.photo(n integer,age interval) returns uuid language plpgsql as $$
begin
  perform support_retention_test.seed(n,interval '1 day',false);
  insert into private.support_inbound_jobs(id,provider_email_id,inquiry_id,recipient,sender,route_kind,state,received_at,message_id)
    values(support_retention_test.id('inbound',n),'retention-photo-provider-'||n,support_retention_test.id('inquiry',n),
      'support@example.invalid','private-retention@example.invalid','alias','accepted',clock_timestamp()-age,
      support_retention_test.id('message',n));
  insert into private.support_photos(id,inquiry_id,message_id,source,clean_path,provider_email_id,attachment_id,
    expected_bytes,expected_type,state,upload_completed,charged_bytes,clean_bytes,width,height,created_at)
    values(support_retention_test.id('photo',n),support_retention_test.id('inquiry',n),support_retention_test.id('message',n),
      'resend','clean/retention/'||n||'.webp','retention-photo-provider-'||n,'retention-attachment-'||n,
      1024,'image/png','ready',true,1024,512,32,32,clock_timestamp()-interval '10 minutes');
  return support_retention_test.id('photo',n);
end $$;
-- Processing a photo late cannot restart its receipt-based lifetime.
begin;
select support_retention_test.photo(50,interval '91 days');
select support_retention_test.photo(51,interval '89 days');
set local role service_role;
do $$ declare result jsonb; work jsonb; begin
  result:=public.run_support_retention(20);
  perform support_retention_test.assert((result->>'photosExpired')::integer=1,'photo retention uses original email receipt rather than processing time');
  perform support_retention_test.assert(public.get_support_photo(support_retention_test.actor(),support_retention_test.id('inquiry',50),
    support_retention_test.id('photo',50)) is null,'an expired photo loses access before object deletion succeeds');
  perform support_retention_test.assert(public.get_support_photo(support_retention_test.actor(),support_retention_test.id('inquiry',51),
    support_retention_test.id('photo',51)) is not null,'a photo below its receipt cutoff remains available');
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',1),5);
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,id}'=support_retention_test.id('photo',50)::text,
    'expired ready photos enter the existing cleanup worker');
  perform support_retention_test.assert(public.finish_support_photo_cleanup(support_retention_test.id('photo',50),support_retention_test.id('cleanup',1),'retry'),
    'storage failure records a retry without clearing the access tombstone');
  perform support_retention_test.assert(public.get_support_photo(support_retention_test.actor(),support_retention_test.id('inquiry',50),
    support_retention_test.id('photo',50)) is null,'failed deletion never restores private photo access');
end $$;
-- Advance only the retry schedule in this disposable fixture; no waiting or provider calls.
reset role;
update private.support_photos set cleanup_next_attempt_at=clock_timestamp()-interval '1 second' where id=support_retention_test.id('photo',50);
set local role service_role;
select public.claim_support_photo_cleanup(support_retention_test.id('cleanup',2),5);
select support_retention_test.assert(public.finish_support_photo_cleanup(support_retention_test.id('photo',50),support_retention_test.id('cleanup',2),'done'),
  'retried object deletion can acknowledge the existing photo identity');
select support_retention_test.assert((select clean_deleted_at is not null from private.support_photos where id=support_retention_test.id('photo',50)),
  'successful retry records completion while retaining the consumed slot');
select public.run_support_retention(20);
select support_retention_test.assert((select count(*)=1 from private.support_photos where id=support_retention_test.id('photo',50)),
  'cleanup replay never removes or reallocates a consumed photo identity');
rollback;

-- One expired Inquiry carries every retained text derivative, including an AI draft.
begin;
select support_retention_test.seed(60);
insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key,request_payload,first_attempt_at,attempt_count,provider_email_id)
  values(support_retention_test.id('email',60),'sandbox','support_acknowledgement','private-retention@example.invalid',
    jsonb_build_object('inquiryId',support_retention_test.id('inquiry',60),'subject','Private receipt subject','body','Private receipt body'),
    'accepted','retention-email-60','{"text":"Private prepared body","to":["private-retention@example.invalid"]}',clock_timestamp()-interval '13 months',1,'retention-outgoing-60');
insert into private.support_intake_submissions(abuse_key,submission_id,payload_hash,inquiry_id,created_at)
  values(repeat('a',64),support_retention_test.id('submission',60),repeat('b',64),support_retention_test.id('inquiry',60),clock_timestamp()-interval '13 months');
insert into private.support_upload_batches(submission_id,inquiry_id,message_id,capability_hash,source_hash,email_hash,manifest,created_at)
  values(support_retention_test.id('submission',60),support_retention_test.id('inquiry',60),support_retention_test.id('message',60),
    repeat('c',64),repeat('d',64),repeat('e',64),jsonb_build_array(jsonb_build_object('uploadId',support_retention_test.id('upload',60),
      'contentType','image/png','byteSize',1024)),clock_timestamp()-interval '13 months');
update private.support_photos set last_processing_until=clock_timestamp()-interval '10 minutes',
  upload_expires_at=clock_timestamp()-interval '1 day' where inquiry_id=support_retention_test.id('inquiry',60);
update private.support_inquiries set status='closed',closed_at=clock_timestamp()-interval '13 months' where id=support_retention_test.id('inquiry',60);
insert into private.support_drafts(id,inquiry_id,version,inquiry_revision,recipient,subject,body,actor_id,created_at)
  select support_retention_test.id('draft',60),id,1,revision,email,'Private saved subject','Private saved body',support_retention_test.actor(),clock_timestamp()-interval '13 months'
    from private.support_inquiries where id=support_retention_test.id('inquiry',60);
update private.support_inquiries set current_draft_version=1 where id=support_retention_test.id('inquiry',60);
insert into private.support_ai_jobs(id,inquiry_id,actor_id,inquiry_revision,draft_version,message_id,facts,state,draft_id,reference_ids,finished_at,runtime,needs_human)
  values(support_retention_test.id('ai',60),support_retention_test.id('inquiry',60),support_retention_test.actor(),2,0,
    support_retention_test.id('message',60),'[{"id":"retention-fact","text":"Private retained source quote"}]','completed',
    support_retention_test.id('draft',60),array['retention-fact'],clock_timestamp()-interval '13 months',
    '{"version":"0.158.0","model":"gpt-6-sol","promptVersion":"1"}',true);
insert into private.support_inbound_jobs(id,provider_email_id,inquiry_id,recipient,sender,route_kind,state,received_at,message_id,payload)
  values(support_retention_test.id('inbound',60),'retention-incoming-60',support_retention_test.id('inquiry',60),
    'reply+private-retention@example.invalid','private-retention@example.invalid','alias','accepted',clock_timestamp()-interval '13 months',
    support_retention_test.id('message',60),'{"body":"Private retained inbound body","from":"private-retention@example.invalid"}');
insert into private.support_inbound_events(event_id,provider_email_id,job_id,disposition)
  values('retention-event-60','retention-incoming-60',support_retention_test.id('inbound',60),'queued');
insert into private.support_reply_routes(inquiry_id,address) values(support_retention_test.id('inquiry',60),'reply+private-retention@example.invalid');
insert into private.support_rfc_messages(rfc_message_id,inquiry_id,provider_email_id,message_id,origin)
  values('<private-retention-rfc@example.invalid>',support_retention_test.id('inquiry',60),'retention-incoming-60',support_retention_test.id('message',60),'incoming');
insert into private.support_audit_events(inquiry_id,action,actor_id,inquiry_revision,created_at)
  values(support_retention_test.id('inquiry',60),'intake',support_retention_test.actor(),1,clock_timestamp()-interval '13 months');
set local role service_role;
select public.run_support_retention(20);
select support_retention_test.assert((select recipient is null and receipt is null and request_payload is null and content_deleted_at is not null
  and provider_email_id='retention-outgoing-60' and idempotency_key='retention-email-60' from private.email_intents where id=support_retention_test.id('email',60)),
  'email content is removed while provider and dispatch replay identities remain');
select support_retention_test.assert((select payload is null and sender<>'private-retention@example.invalid'
  and recipient<>'reply+private-retention@example.invalid' from private.support_inbound_jobs where id=support_retention_test.id('inbound',60)),
  'accepted inbound source payload and addressing are removed');
select support_retention_test.assert(not exists(select 1 from private.support_rfc_messages where rfc_message_id='<private-retention-rfc@example.invalid>')
  and not exists(select 1 from private.support_reply_routes where address='reply+private-retention@example.invalid'),
  'RFC addressing and reply aliases cannot retain expired identities');
select support_retention_test.assert((select facts::text not like '%Private retained source quote%' and cardinality(reference_ids)=0
  and actor_id is null and runtime is null and needs_human is null
  from private.support_ai_jobs where id=support_retention_test.id('ai',60)),'AI source quotes, references, runtime and Operator activity expire with their Inquiry');
select support_retention_test.assert((select source_hash=repeat('d',64) and email_hash=repeat('e',64)
  from private.support_upload_batches where submission_id=support_retention_test.id('submission',60)),
  'retention preserves quota digests until raw deletion is acknowledged');
do $$ declare work jsonb; begin
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',60),5);
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,rawPath}' is not null,
    'raw deletion remains scheduled while the expired batch retains its quota charge');
  perform support_retention_test.assert(public.finish_support_photo_cleanup((work#>>'{0,id}')::uuid,
    support_retention_test.id('cleanup',60),'done'),'the worker can acknowledge deletion before quota digests are erased');
end $$;
select public.run_support_retention(20);
select support_retention_test.assert((select manifest='[]'::jsonb and capability_hash<>repeat('c',64) and source_hash<>repeat('d',64)
  and email_hash<>repeat('e',64) from private.support_upload_batches where submission_id=support_retention_test.id('submission',60)),
  'upload manifests and access or abuse digests are erased without removing the batch identity');
select support_retention_test.assert((select count(*)=1 from private.support_intake_submissions where submission_id=support_retention_test.id('submission',60))
  and (select count(*)=1 from private.support_photos where inquiry_id=support_retention_test.id('inquiry',60))
  and (select count(*)=1 from private.support_inbound_events where event_id='retention-event-60'),
  'submission, consumed upload slot and provider-event identities survive cleanup');
select support_retention_test.assert(public.record_support_inbound('retention-event-60','retention-incoming-60','private-retention@example.invalid',
  array['reply+private-retention@example.invalid'],clock_timestamp(),'support@example.invalid')->>'status'='duplicate',
  'old provider replay is acknowledged without resurrecting content');
select support_retention_test.assert(not exists(select 1 from private.support_audit_events where inquiry_id=support_retention_test.id('inquiry',60)
  and created_at<clock_timestamp()-interval '12 months'),'minimal audit follows its independent twelve-month clock');
rollback;

-- Any attempted email without authoritative provider reconciliation keeps the linked text.
begin;
select support_retention_test.seed(70);
insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key,request_payload,first_attempt_at,attempt_count)
  values(support_retention_test.id('email',70),'sandbox','support_acknowledgement','private-retention@example.invalid',
    jsonb_build_object('inquiryId',support_retention_test.id('inquiry',70),'body','Private uncertain body'),'failed','retention-email-70',
    '{"text":"Private uncertain attempt"}',clock_timestamp()-interval '13 months',1);
set local role service_role;
select public.run_support_retention(20);
select support_retention_test.assert((select redacted_at is null from private.support_inquiries where id=support_retention_test.id('inquiry',70))
  and (select request_payload is not null from private.email_intents where id=support_retention_test.id('email',70)),
  'unreconciled attempts protect correlation content even after a failed transport state');
update private.email_intents set provider_email_id='retention-reconciled-70' where id=support_retention_test.id('email',70);
select public.run_support_retention(20);
select support_retention_test.assert((select redacted_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',70)),
  'resolved provider identity releases the narrow reconciliation hold');
rollback;

-- Synthetic email cohorts must be explicit and do not delete financial Order facts.
begin;
insert into public.orders(id,order_number,merchandise_subtotal_cents,total_cents,idempotency_key,customer_email,shipping_address)
  values(support_retention_test.id('order',80),'RETENTION-80',1000,1000,'retention-order-80','commerce@example.invalid','{"city":"Synthetic city"}'),
    (support_retention_test.id('order',81),'RETENTION-81',2000,2000,'retention-order-81','commerce@example.invalid','{}');
insert into private.email_intents(id,environment,purpose,order_id,recipient,receipt,state,idempotency_key,created_at)
  values(support_retention_test.id('email',80),'sandbox','order_confirmation',support_retention_test.id('order',80),'commerce@example.invalid',
    '{"body":"Synthetic confirmation"}','blocked','retention-email-80',clock_timestamp()-interval '31 days'),
    (support_retention_test.id('email',81),'sandbox','order_confirmation',support_retention_test.id('order',81),'commerce@example.invalid',
    '{"body":"Unmarked demo confirmation"}','blocked','retention-email-81',clock_timestamp()-interval '31 days');
create temporary table retained_order as select to_jsonb(o) as value from public.orders o where id=support_retention_test.id('order',80);
grant select on retained_order to service_role;
set local role service_role;
select support_retention_test.assert(public.mark_synthetic_email_intents(support_retention_test.actor(),array[support_retention_test.id('email',80)])=1,
  'an Admin can explicitly mark only the selected synthetic email identity');
select public.run_support_retention(20);
select support_retention_test.assert((select content_deleted_at is not null from private.email_intents where id=support_retention_test.id('email',80))
  and (select content_deleted_at is null from private.email_intents where id=support_retention_test.id('email',81)),
  'sandbox does not implicitly enroll unrelated Order emails in synthetic cleanup');
select support_retention_test.assert((select to_jsonb(o)=(select value from retained_order) from public.orders o
  where id=support_retention_test.id('order',80)),'email cleanup preserves the entire financial Order snapshot');
rollback;

-- A worker budget bounds changed Inquiries while repeated passes make progress.
begin;
select support_retention_test.seed(n) from generate_series(90,94) n;
set local role service_role;
select support_retention_test.assert((public.run_support_retention(2)->>'inquiriesRedacted')::integer=2,
  'a retention pass respects its bounded Inquiry budget');
select support_retention_test.assert((public.run_support_retention(2)->>'inquiriesRedacted')::integer=2,
  'a following bounded pass advances rather than starving behind completed tombstones');
select support_retention_test.assert((public.run_support_retention(2)->>'inquiriesRedacted')::integer=1,
  'bounded repeated cleanup eventually finishes the eligible cohort');
rollback;

-- An old held case must not consume every worker budget and starve unrelated expiry.
begin;
select support_retention_test.seed(110,interval '14 months');
select support_retention_test.seed(111,interval '13 months');
set local role service_role;
select public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',110),1,
  clock_timestamp()+interval '1 day','legal',false);
select support_retention_test.assert((public.run_support_retention(1)->>'inquiriesRedacted')::integer=1,
  'an older held Inquiry does not starve eligible cleanup behind the per-pass limit');
rollback;

-- Large transcripts redact over bounded passes, but stop being readable immediately.
begin;
select support_retention_test.seed(120);
insert into private.support_messages(id,inquiry_id,kind,subject,body)
  select support_retention_test.id('large-message',n),support_retention_test.id('inquiry',120),'inbound',
    'Private paginated subject','Private paginated transcript' from generate_series(1,101) n;
set local role service_role;
select public.run_support_retention(1);
select support_retention_test.assert((select redacted_at is not null and retention_completed_at is null from private.support_inquiries
  where id=support_retention_test.id('inquiry',120)),'large transcript cleanup records incomplete bounded work');
select support_retention_test.assert((select count(*)=2 from private.support_messages where inquiry_id=support_retention_test.id('inquiry',120)
  and redacted_at is null),'a bounded pass does not silently remove the entire arbitrarily large transcript');
select support_retention_test.assert(public.get_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',120))->'messages'='[]'::jsonb,
  'partial physical cleanup cannot expose still-pending expired text');
select public.run_support_retention(1);
select support_retention_test.assert((select retention_completed_at is not null from private.support_inquiries where id=support_retention_test.id('inquiry',120))
  and not exists(select 1 from private.support_messages where inquiry_id=support_retention_test.id('inquiry',120) and redacted_at is null),
  'the next pass finishes bounded derivative redaction under the same tombstone');
rollback;

-- Uploaded photos use admission age, and late raw objects remain eligible for resweeping.
begin;
select support_retention_test.seed(130,interval '1 day',false);
insert into private.support_intake_submissions(abuse_key,submission_id,payload_hash,inquiry_id)
  values(repeat('1',64),support_retention_test.id('submission',130),repeat('2',64),support_retention_test.id('inquiry',130));
insert into private.support_upload_batches(submission_id,inquiry_id,message_id,capability_hash,source_hash,email_hash,manifest,created_at)
  values(support_retention_test.id('submission',130),support_retention_test.id('inquiry',130),support_retention_test.id('message',130),
    repeat('3',64),repeat('4',64),repeat('5',64),jsonb_build_array(jsonb_build_object('uploadId',support_retention_test.id('upload',130),
      'contentType','image/png','byteSize',1024)),clock_timestamp()-interval '91 days');
update private.support_photos set state='ready',upload_completed=true,charged_bytes=1024,clean_bytes=512,width=32,height=32,
  last_processing_until=clock_timestamp()-interval '10 minutes',upload_expires_at=clock_timestamp()-interval '1 day'
  where inquiry_id=support_retention_test.id('inquiry',130);
set local role service_role;
do $$ declare work jsonb; photo uuid; begin
  perform support_retention_test.assert((public.run_support_retention(20)->>'photosExpired')::integer=1,
    'a late-created upload slot retains its original batch admission expiry');
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',130),5);
  photo:=(work#>>'{0,id}')::uuid;
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,rawPath}' is not null and work#>>'{0,cleanPath}' is not null,
    'the expired upload schedules both source and normalized objects for deletion');
  perform support_retention_test.assert(public.finish_support_photo_cleanup(photo,support_retention_test.id('cleanup',130),'done'),
    'the first cleanup acknowledges both paths');
end $$;
reset role;
create temporary table first_raw_cleanup as select raw_deleted_at from private.support_photos where inquiry_id=support_retention_test.id('inquiry',130);
grant select on first_raw_cleanup to service_role;
update private.support_photos set cleanup_next_attempt_at=clock_timestamp()-interval '1 second' where inquiry_id=support_retention_test.id('inquiry',130);
set local role service_role;
do $$ declare work jsonb; photo uuid; begin
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',131),5);
  photo:=(work#>>'{0,id}')::uuid;
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,rawPath}' is not null,
    'the same raw path is swept again to catch a late upload or restored object');
  perform public.finish_support_photo_cleanup(photo,support_retention_test.id('cleanup',131),'done');
  perform support_retention_test.assert((select raw_deleted_at=(select raw_deleted_at from first_raw_cleanup)
    from private.support_photos where id=photo),'resweeping preserves the first quota-release and consumed-slot identity');
end $$;
rollback;

-- The Inquiry tombstone revokes every photo read even when the photo budget is smaller.
begin;
select support_retention_test.seed(140);
insert into private.support_inbound_jobs(id,provider_email_id,inquiry_id,recipient,sender,route_kind,state,received_at,message_id)
  values(support_retention_test.id('inbound',140),'retention-photo-provider-140',support_retention_test.id('inquiry',140),
    'support@example.invalid','private-retention@example.invalid','alias','accepted',clock_timestamp()-interval '13 months',
    support_retention_test.id('message',140));
insert into private.support_photos(id,inquiry_id,message_id,source,clean_path,provider_email_id,attachment_id,
  expected_bytes,expected_type,state,upload_completed,charged_bytes,clean_bytes,width,height)
  select support_retention_test.id('large-photo',n),support_retention_test.id('inquiry',140),support_retention_test.id('message',140),
    'resend','clean/retention-large/'||n||'.webp','retention-photo-provider-140','retention-large-'||n,
    1024,'image/png','ready',true,1024,512,32,32 from generate_series(1,21) n;
set local role service_role;
select public.run_support_retention(20);
select support_retention_test.assert((select count(*)=1 from private.support_photos where inquiry_id=support_retention_test.id('inquiry',140)
  and clean_delete_requested_at is null),'the photo budget leaves physical cleanup pending on a large expired Inquiry');
select support_retention_test.assert(public.get_support_photo(support_retention_test.actor(),support_retention_test.id('inquiry',140),
  (select id from private.support_photos where inquiry_id=support_retention_test.id('inquiry',140) and clean_delete_requested_at is null)) is null,
  'fully redacted Inquiry photos cannot be read while waiting for their individual tombstones');
rollback;

begin;
select support_retention_test.seed(150,interval '32 days',false);
select support_retention_test.seed(151,interval '31 days',false);
insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key,created_at)
  select support_retention_test.id('email',n),'sandbox','support_acknowledgement','private-retention@example.invalid',
    jsonb_build_object('inquiryId',support_retention_test.id('inquiry',n),'body','Synthetic acknowledgement'),
    'blocked','retention-email-'||n,clock_timestamp()-case when n=150 then interval '32 days' else interval '31 days' end
    from generate_series(150,151) n;
set local role service_role;
select public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',150),1,
  clock_timestamp()+interval '1 day','legal',false);
select public.mark_synthetic_email_intents(support_retention_test.actor(),array[support_retention_test.id('email',150),support_retention_test.id('email',151)]);
select support_retention_test.assert((public.run_support_retention(1)->>'emailsRedacted')::integer=1,
  'an older held email copy does not starve eligible synthetic cleanup behind the per-pass limit');
select support_retention_test.assert((select content_deleted_at is null from private.email_intents where id=support_retention_test.id('email',150))
  and (select content_deleted_at is not null from private.email_intents where id=support_retention_test.id('email',151))
  and (select bool_and(redacted_at is null) from private.support_inquiries),
  'marking email copies neither bypasses a hold nor enrolls the entire conversation in synthetic retention');
rollback;

-- The acknowledgement must retire immediately even when reply copies exceed one batch.
begin;
select support_retention_test.seed(170);
insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key,created_at)
  select support_retention_test.id('large-reply',n),'sandbox','support_reply','private-retention@example.invalid',
    jsonb_build_object('inquiryId',support_retention_test.id('inquiry',170),'body','Private paginated reply'),
    'queued','retention-large-reply-'||n,clock_timestamp()-interval '13 months' from generate_series(1,101) n;
insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key,created_at)
  values(support_retention_test.id('email',170),'sandbox','support_acknowledgement','private-retention@example.invalid',
    jsonb_build_object('inquiryId',support_retention_test.id('inquiry',170),'body','Private initial acknowledgement'),
    'queued','retention-email-170',clock_timestamp()-interval '13 months');
set local role service_role;
select support_retention_test.assert((public.run_support_retention(1)->>'emailsRedacted')::integer=100,
  'retired Inquiry email copies retain the bounded redaction batch');
select support_retention_test.assert((select content_deleted_at is not null and request_payload is null
  from private.email_intents where id=support_retention_test.id('email',170)),
  'the canonical acknowledgement is retired in the first batch before it can prepare without an Inquiry revision guard');
select support_retention_test.assert((select count(*)=2 from private.email_intents where purpose='support_reply'
  and receipt->>'inquiryId'=support_retention_test.id('inquiry',170)::text and content_deleted_at is null),
  'remaining revision-bound reply copies stay queued for a later bounded redaction pass');
rollback;


-- A hold change advances context, so an earlier exact reply approval is no longer current.
begin;
select support_retention_test.seed(180,interval '1 day',false);
set local role service_role;
select public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',180),1,
  'save_draft',0,'Private approved subject','Private approved reply');
select public.mutate_support_inquiry(support_retention_test.actor(),support_retention_test.id('inquiry',180),2,'approve_reply',1);
select support_retention_test.assert((select state='queued' from private.email_intents where purpose='support_reply'
  and receipt->>'inquiryId'=support_retention_test.id('inquiry',180)::text),'the exact human approval initially queues its reply');
select public.configure_support_retention(support_retention_test.actor(),support_retention_test.id('inquiry',180),2,
  clock_timestamp()+interval '1 day','legal',false);
select support_retention_test.assert((select revision=3 from private.support_inquiries where id=support_retention_test.id('inquiry',180))
  and (select state='blocked' and error_code='approval_stale' from private.email_intents where purpose='support_reply'
    and receipt->>'inquiryId'=support_retention_test.id('inquiry',180)::text),
  'a retention hold change invalidates the earlier approval and blocks its queued reply');
rollback;

-- Retention cannot widen the deletion scope of a cleanup lease already handed to a worker.
begin;
select support_retention_test.seed(190);
insert into private.support_intake_submissions(abuse_key,submission_id,payload_hash,inquiry_id)
  values(repeat('6',64),support_retention_test.id('submission',190),repeat('7',64),support_retention_test.id('inquiry',190));
insert into private.support_upload_batches(submission_id,inquiry_id,message_id,capability_hash,source_hash,email_hash,manifest,created_at)
  values(support_retention_test.id('submission',190),support_retention_test.id('inquiry',190),support_retention_test.id('message',190),
    repeat('8',64),repeat('9',64),repeat('a',64),jsonb_build_array(jsonb_build_object('uploadId',support_retention_test.id('upload',190),
      'contentType','image/png','byteSize',1024)),clock_timestamp()-interval '13 months');
update private.support_photos set state='ready',upload_completed=true,charged_bytes=1024,clean_bytes=512,width=32,height=32,
  last_processing_until=clock_timestamp()-interval '10 minutes',upload_expires_at=clock_timestamp()-interval '1 day'
  where inquiry_id=support_retention_test.id('inquiry',190);
update private.support_inquiries set status='closed',closed_at=clock_timestamp()-interval '13 months'
  where id=support_retention_test.id('inquiry',190);
set local role service_role;
do $$ declare work jsonb; photo uuid; begin
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',190),5);
  photo:=(work#>>'{0,id}')::uuid;
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,rawPath}' is not null
    and work#>>'{0,cleanPath}' is null,'the first worker leases only raw deletion before retention runs');
  perform public.run_support_retention(20);
  perform support_retention_test.assert(public.get_support_photo(support_retention_test.actor(),support_retention_test.id('inquiry',190),photo) is null,
    'retiring the Inquiry revokes photo access immediately while the raw-only cleanup lease is active');
  perform support_retention_test.assert(public.finish_support_photo_cleanup(photo,support_retention_test.id('cleanup',190),'done'),
    'the original worker acknowledges its raw-only deletion');
  perform support_retention_test.assert((select raw_deleted_at is not null and clean_deleted_at is null
    from private.support_photos where id=photo),'a raw-only cleanup acknowledgement cannot claim normalized photo deletion');
  perform public.run_support_retention(20);
  work:=public.claim_support_photo_cleanup(support_retention_test.id('cleanup',191),5);
  perform support_retention_test.assert(jsonb_array_length(work)=1 and work#>>'{0,id}'=photo::text
    and work#>>'{0,cleanPath}' is not null,'retention schedules normalized deletion immediately after the prior lease finishes');
  perform support_retention_test.assert(public.finish_support_photo_cleanup(photo,support_retention_test.id('cleanup',191),'done'),
    'the worker leased the normalized path can acknowledge its deletion');
  perform support_retention_test.assert((select clean_deleted_at is not null from private.support_photos where id=photo),
    'normalized deletion is complete only after its own worker acknowledgement');
end $$;
rollback;
