-- Synthetic only; the runner uses a uniquely named database in a labeled local container.
create schema support_ai_test;
create function support_ai_test.assert(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',description; end if; end $$;
create function support_ai_test.id(n integer) returns uuid language sql immutable as $$
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(id) values(support_ai_test.id(1)),(support_ai_test.id(2)),(support_ai_test.id(3));
insert into public.admin_memberships(user_id,role,active) values
  (support_ai_test.id(1),'admin',true),(support_ai_test.id(2),'admin',true),(support_ai_test.id(3),'catalog_editor',true);
create function support_ai_test.seed(n integer) returns uuid language plpgsql as $$
begin
  insert into private.support_inquiries(id,name,email,inquiry_type,subject)
    values(support_ai_test.id(n),'Private name','private@example.invalid','general','Synthetic question');
  insert into private.support_messages(id,inquiry_id,kind,subject,body)
    values(support_ai_test.id(n+1000),support_ai_test.id(n),'inbound','Synthetic question','Does this demo create a real shipment?');
  return support_ai_test.id(n);
end $$;
grant usage on schema support_ai_test to service_role,anon,authenticated;
grant execute on all functions in schema support_ai_test to service_role,anon,authenticated;

select support_ai_test.seed(10);
begin;
set local role service_role;
do $$ declare requested jsonb; claimed jsonb; saved jsonb; accepted boolean; begin
  requested:=public.request_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10),
    support_ai_test.id(100),1,0,'[{"id":"faq:checkout-availability","text":"Sandbox only. No real shipment."}]');
  perform support_ai_test.assert(requested#>>'{job,state}'='queued','the owner request persists one queued job');
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  perform support_ai_test.assert(claimed#>>'{context,messages,0,body}'='Does this demo create a real shipment?',
    'the worker receives only selected accepted text');
  perform support_ai_test.assert(not (claimed::text like '%private@example.invalid%') and not (claimed::text like '%Private name%'),
    'identity fields do not enter the worker context');
  accepted:=public.finish_support_ai_draft(support_ai_test.id(1),support_ai_test.id(100),support_ai_test.id(200),
    'This is a sandbox demo. No real goods will ship.',array['faq:checkout-availability'],false,
    '{"version":"0.158.0","model":"gpt-6-sol","promptVersion":"1"}',null);
  perform support_ai_test.assert(accepted,'current worker output is accepted');
  saved:=public.get_support_inquiry(support_ai_test.id(1),support_ai_test.id(10));
  perform support_ai_test.assert(saved#>>'{draft,body}'='This is a sandbox demo. No real goods will ship.'
    and saved#>>'{draft,approved}'='false' and (saved->>'revision')::integer=2,'AI saves an unapproved versioned draft');
  perform support_ai_test.assert(not exists(select 1 from private.email_intents where purpose='support_reply'),
    'AI completion cannot create a reply intent');
  perform public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(10),2,'approve_reply',1);
  perform support_ai_test.assert((select count(*)=1 from private.support_reply_approvals where inquiry_id=support_ai_test.id(10)),
    'the unchanged exact human approval creates the reply');
end $$;
rollback;

create function support_ai_test.request(inquiry integer,job integer,revision integer default 1,draft integer default 0) returns jsonb
language sql as $$ select public.request_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(inquiry),
  support_ai_test.id(job),revision,draft,'[{"id":"faq:checkout-availability","text":"Sandbox only. No real shipment."}]') $$;
create function support_ai_test.finish(job integer,lease integer) returns boolean language sql as $$
  select public.finish_support_ai_draft(support_ai_test.id(1),support_ai_test.id(job),support_ai_test.id(lease),
    'This is a sandbox demo. No real goods will ship.',array['faq:checkout-availability'],false,
    '{"version":"0.158.0","model":"gpt-6-sol","promptVersion":"1"}',null) $$;
grant execute on all functions in schema support_ai_test to service_role;

begin;
set local role service_role;
do $$ declare claimed jsonb; denied boolean:=false; begin
  insert into private.support_messages(id,inquiry_id,kind,subject,body) values
    (support_ai_test.id(9999),support_ai_test.id(10),'note','Internal note','Never expose this internal investigation.');
  perform support_ai_test.request(10,100);
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  perform support_ai_test.assert(jsonb_array_length(claimed#>'{context,messages}')=1
    and claimed#>>'{context,messages,0,id}'=support_ai_test.id(1010)::text,
    'a later internal note cannot enter the selected worker snapshot');
  begin perform public.finish_support_ai_draft(support_ai_test.id(1),support_ai_test.id(100),support_ai_test.id(200),
    'Unsupported claim.',array['faq:invented'],false,'{"version":"0.158.0","model":"gpt-6-sol","promptVersion":"1"}');
  exception when invalid_parameter_value then denied:=true; end;
  perform support_ai_test.assert(denied,'output references must belong to the supplied approved facts');
  insert into private.support_inbound_jobs(id,provider_email_id,inquiry_id,recipient,sender,route_kind,received_at)
    values(support_ai_test.id(9998),'synthetic-pending',support_ai_test.id(10),'support@example.invalid','private@example.invalid','alias',clock_timestamp());
  insert into private.support_inbound_routes(job_id,inquiry_id) values(support_ai_test.id(9998),support_ai_test.id(10));
  perform support_ai_test.assert(not support_ai_test.finish(100,200),'pending inbound work blocks completion even before its text is accepted');
  denied:=false;
  begin perform support_ai_test.request(10,101); exception when object_not_in_prerequisite_state then denied:=true; end;
  perform support_ai_test.assert(denied,'pending inbound work also prevents a fresh request');
end $$;
rollback;

begin;
set local role service_role;
do $$ declare denied boolean:=false; begin
  perform support_ai_test.request(10,100);
  update private.support_ai_jobs set expires_at=clock_timestamp()-interval '1 second';
  perform support_ai_test.assert(public.get_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10))#>>'{job,errorCode}'='worker_unavailable',
    'a queued job cannot remain pending indefinitely when the worker is offline');
  insert into private.support_messages(id,inquiry_id,kind,subject,body) values
    (support_ai_test.id(1011),support_ai_test.id(10),'inbound','Long synthetic message',repeat('x',6001));
  begin perform support_ai_test.request(10,101); exception when object_not_in_prerequisite_state then denied:=true; end;
  perform support_ai_test.assert(denied,'oversized context is rejected instead of silently truncating the customer message');
end $$;
rollback;

select support_ai_test.assert((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.support_ai_jobs'::regclass),
  'AI job data enables and forces RLS');
select support_ai_test.assert((select bool_and(not has_table_privilege(role,'private.support_ai_jobs','SELECT,INSERT,UPDATE,DELETE'))
  from unnest(array['anon','authenticated']) role),'browser roles cannot read or mutate private jobs');
select support_ai_test.assert((select bool_and(not p.prosecdef and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%support_ai_draft'),
  'draft RPCs retain service-only invoker authorization');
begin;
set local role anon;
do $$ declare denied boolean:=false; begin
  begin perform public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  exception when insufficient_privilege then denied:=true; end;
  perform support_ai_test.assert(denied,'anonymous callers cannot impersonate the worker');
end $$;
rollback;
begin;
set local role service_role;
do $$ declare denied boolean:=false; begin
  begin perform public.request_support_ai_draft(support_ai_test.id(2),support_ai_test.id(1),support_ai_test.id(10),
    support_ai_test.id(100),1,0,'[]'); exception when insufficient_privilege then denied:=true; end;
  perform support_ai_test.assert(denied,'another active admin is not the qualified owner');
  denied:=false;
  begin perform public.request_support_ai_draft(support_ai_test.id(3),support_ai_test.id(3),support_ai_test.id(10),
    support_ai_test.id(100),1,0,'[]'); exception when insufficient_privilege then denied:=true; end;
  perform support_ai_test.assert(denied,'catalog capabilities cannot request support drafts');
end $$;
rollback;

-- Approving does not advance revision/version: the captured approval identity must also match.
begin;
set local role service_role;
do $$ declare claimed jsonb; saved jsonb; begin
  perform public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(10),1,'save_draft',0,'Manual subject','Exact human reply.');
  perform support_ai_test.request(10,100,2,1);
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  perform public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(10),2,'approve_reply',1);
  perform support_ai_test.assert(not public.check_support_ai_draft(support_ai_test.id(1),support_ai_test.id(100),support_ai_test.id(200)),
    'approval during generation cancels continued model work');
  perform support_ai_test.assert(not support_ai_test.finish(100,200),'an AI result cannot replace a newly approved reply');
  saved:=public.get_support_inquiry(support_ai_test.id(1),support_ai_test.id(10));
  perform support_ai_test.assert(saved#>>'{draft,body}'='Exact human reply.' and saved#>>'{draft,approved}'='true',
    'the exact approved manual draft remains intact');
  perform support_ai_test.assert(public.get_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10))#>>'{job,state}'='stale',
    'the owner sees a stale result rather than a replacement draft');
end $$;
rollback;

begin;
set local role service_role;
do $$ declare claimed jsonb; begin
  perform support_ai_test.request(10,100);
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  perform public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(10),1,'add_note',null,null,'Private investigation note.');
  perform support_ai_test.assert(not support_ai_test.finish(100,200),'new Inquiry context rejects a late result');
  perform support_ai_test.assert((select current_draft_version=0 from private.support_inquiries where id=support_ai_test.id(10)),
    'stale output never enters a saved draft');
end $$;
rollback;

begin;
set local role service_role;
do $$ declare claimed jsonb; begin
  perform support_ai_test.request(10,100);
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  perform support_ai_test.assert(public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(201)) is null,
    'a second worker cannot claim active work');
  perform support_ai_test.assert(not support_ai_test.finish(100,201),'a different lease cannot complete a job');
  perform public.cancel_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10),support_ai_test.id(100));
  perform support_ai_test.assert(not public.check_support_ai_draft(support_ai_test.id(1),support_ai_test.id(100),support_ai_test.id(200)),
    'cancellation is visible to the running worker');
  perform support_ai_test.assert(not support_ai_test.finish(100,200),'cancelled generation cannot save its result');
  perform support_ai_test.assert(public.get_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10))#>>'{job,state}'='cancelled',
    'cancellation remains terminal');
end $$;
rollback;

begin;
set local role service_role;
do $$ declare claimed jsonb; begin
  perform support_ai_test.request(10,100);
  claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(200));
  update private.support_ai_jobs set expires_at=clock_timestamp()-interval '1 second' where id=support_ai_test.id(100);
  perform support_ai_test.assert(not support_ai_test.finish(100,200),'a restarted worker cannot commit an expired result');
  perform support_ai_test.assert(public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(201)) is null,
    'expired work does not automatically repeat inference');
  perform support_ai_test.assert(public.get_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10))#>>'{job,errorCode}'='lease_expired',
    'the owner sees the expired lease');
  perform support_ai_test.assert(support_ai_test.request(10,101)#>>'{job,state}'='queued','an explicit fresh request can recover after restart');
end $$;
rollback;

begin;
set local role service_role;
do $$ declare claimed jsonb; code text; job integer:=100; begin
  foreach code in array array['quota_exceeded','authentication_required'] loop
    perform support_ai_test.request(10,job);
    claimed:=public.claim_support_ai_draft(support_ai_test.id(1),support_ai_test.id(job+100));
    perform public.finish_support_ai_draft(support_ai_test.id(1),support_ai_test.id(job),support_ai_test.id(job+100),p_error_code=>code);
    perform support_ai_test.assert(public.get_support_ai_draft(support_ai_test.id(1),support_ai_test.id(1),support_ai_test.id(10))#>>'{job,errorCode}'=code,
      'quota or reconnect failures remain visible without automatic retry');
    job:=job+1;
  end loop;
  perform public.mutate_support_inquiry(support_ai_test.id(1),support_ai_test.id(10),1,'save_draft',0,'Manual subject','Manual fallback remains available.');
  perform support_ai_test.assert((select current_draft_version=1 from private.support_inquiries where id=support_ai_test.id(10)),
    'manual replies remain available through worker failures');
end $$;
rollback;
