-- Drafting has no email authority. Installation does not enable the application control.
create table private.support_ai_jobs (
  id uuid primary key,
  inquiry_id uuid not null references private.support_inquiries(id),
  actor_id uuid not null,
  inquiry_revision integer not null check(inquiry_revision>0),
  draft_version integer not null check(draft_version>=0),
  approval_id uuid references private.support_reply_approvals(id),
  message_id uuid not null references private.support_messages(id),
  facts jsonb not null,
  state text not null default 'queued' check(state in ('queued','running','completed','failed','cancelled','stale')),
  lease_token uuid,
  expires_at timestamptz not null default (clock_timestamp()+interval '5 minutes'),
  draft_id uuid references private.support_drafts(id),
  reference_ids text[] not null default '{}',
  needs_human boolean,
  runtime jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check((state='running')=(lease_token is not null)),
  check((state='completed')=(draft_id is not null))
);
create unique index support_ai_one_active on private.support_ai_jobs((true)) where state in ('queued','running');
create index support_ai_inquiry_history on private.support_ai_jobs(inquiry_id,created_at desc,id desc);
alter table private.support_ai_jobs enable row level security;
alter table private.support_ai_jobs force row level security;
revoke all on private.support_ai_jobs from public,anon,authenticated,service_role;
grant select,insert,update on private.support_ai_jobs to service_role;

create function private.require_support_ai_owner(p_actor_id uuid,p_owner_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_owner_id is null or p_actor_id is distinct from p_owner_id then
    raise exception using errcode='42501',message='forbidden'; end if;
  perform private.require_support_admin(p_actor_id);
end $$;

create function private.support_ai_current(p_job private.support_ai_jobs,p_owner_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select p_job.actor_id=p_owner_id and exists(select 1 from public.admin_memberships
    where user_id=p_owner_id and active and role='admin') and exists(
    select 1 from private.support_inquiries i where i.id=p_job.inquiry_id and i.status='open'
      and i.revision=p_job.inquiry_revision and i.current_draft_version=p_job.draft_version
      and private.support_pending_context(i.id)=0 and p_job.approval_id is not distinct from (
        select a.id from private.support_reply_approvals a join private.support_drafts d on d.id=a.draft_id
        where d.inquiry_id=i.id and d.version=i.current_draft_version));
$$;

create function private.expire_support_ai_jobs() returns void
language sql security invoker set search_path='' as $$
  update private.support_ai_jobs set error_code=case when state='running' then 'lease_expired' else 'worker_unavailable' end,
    state='failed',lease_token=null,finished_at=clock_timestamp()
    where state in ('queued','running') and expires_at<=clock_timestamp();
$$;

create function private.support_ai_projection(p_job private.support_ai_jobs) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_job.id is null then return jsonb_build_object('job',null); end if;
  return jsonb_build_object('job',jsonb_build_object('id',p_job.id,'state',p_job.state,
    'inquiryRevision',p_job.inquiry_revision,'draftVersion',p_job.draft_version,'createdAt',p_job.created_at,
    'draftId',p_job.draft_id,'errorCode',p_job.error_code,'needsHuman',p_job.needs_human,
    'references',(select coalesce(jsonb_agg(f),'[]'::jsonb) from jsonb_array_elements(p_job.facts) f
      where f->>'id'=any(p_job.reference_ids))))
    ||case when p_job.state='completed' then jsonb_build_object('inquiry',public.get_support_inquiry(p_job.actor_id,p_job.inquiry_id))
      else '{}'::jsonb end;
end $$;

create function public.get_support_ai_draft(p_actor_id uuid,p_owner_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_ai_jobs%rowtype;
begin
  perform private.require_support_ai_owner(p_actor_id,p_owner_id);
  if not exists(select 1 from private.support_inquiries where id=p_inquiry_id) then
    raise exception using errcode='P0002',message='not_found'; end if;
  perform private.expire_support_ai_jobs();
  select * into v_job from private.support_ai_jobs where inquiry_id=p_inquiry_id and actor_id=p_actor_id
    order by created_at desc,id desc limit 1;
  return private.support_ai_projection(v_job);
end $$;

create function public.request_support_ai_draft(p_actor_id uuid,p_owner_id uuid,p_inquiry_id uuid,p_request_id uuid,
  p_expected_revision integer,p_expected_draft_version integer,p_facts jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype; v_job private.support_ai_jobs%rowtype;
  v_message private.support_messages%rowtype; v_approval uuid;
begin
  perform private.require_support_ai_owner(p_actor_id,p_owner_id);
  -- One owner, one active generation. No unbounded queue and no automatic inference retry.
  perform pg_advisory_xact_lock(hashtextextended('helix:support-ai',0));
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  perform private.expire_support_ai_jobs();
  select * into v_job from private.support_ai_jobs where id=p_request_id;
  if found then
    if (v_job.inquiry_id,v_job.actor_id,v_job.inquiry_revision,v_job.draft_version) is distinct from
      (p_inquiry_id,p_actor_id,p_expected_revision,p_expected_draft_version) then
      raise exception using errcode='22023',message='invalid_support_input'; end if;
    return private.support_ai_projection(v_job);
  end if;
  if p_expected_revision is distinct from v_inquiry.revision then
    raise exception using errcode='40001',message='stale_inquiry'; end if;
  if p_expected_draft_version is distinct from v_inquiry.current_draft_version then
    raise exception using errcode='40001',message='stale_draft'; end if;
  if v_inquiry.status<>'open' or private.support_pending_context(p_inquiry_id)>0 then
    raise exception using errcode='55000',message='ai_context_unavailable'; end if;
  select a.id into v_approval from private.support_reply_approvals a join private.support_drafts d on d.id=a.draft_id
    where d.inquiry_id=p_inquiry_id and d.version=v_inquiry.current_draft_version;
  select * into v_job from private.support_ai_jobs where state in ('queued','running');
  if found then
    if (v_job.inquiry_id,v_job.actor_id,v_job.inquiry_revision,v_job.draft_version) is not distinct from
      (p_inquiry_id,p_actor_id,p_expected_revision,p_expected_draft_version) and v_job.approval_id is not distinct from v_approval then
      return private.support_ai_projection(v_job); end if;
    raise exception using errcode='55000',message='ai_busy';
  end if;
  select * into v_message from private.support_messages where inquiry_id=p_inquiry_id and kind='inbound'
    order by created_at desc,id desc limit 1;
  if not found or length(v_message.body)>6000 then
    raise exception using errcode='55000',message='ai_context_unavailable'; end if;
  if p_request_id is null or jsonb_typeof(p_facts) is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  if jsonb_array_length(p_facts) not between 1 and 8 or exists(select 1 from jsonb_array_elements(p_facts) f
    where jsonb_typeof(f) is distinct from 'object' or f-array['id','text']<>'{}'::jsonb
      or jsonb_typeof(f->'id') is distinct from 'string' or jsonb_typeof(f->'text') is distinct from 'string'
      or length(f->>'text') not between 1 and 1000 or (f->>'id') !~ '^faq:[a-z-]{1,64}$')
    or (select count(distinct f->>'id') from jsonb_array_elements(p_facts) f)<>jsonb_array_length(p_facts) then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  insert into private.support_ai_jobs(id,inquiry_id,actor_id,inquiry_revision,draft_version,approval_id,message_id,facts)
    values(p_request_id,p_inquiry_id,p_actor_id,p_expected_revision,p_expected_draft_version,v_approval,v_message.id,p_facts)
    returning * into v_job;
  return private.support_ai_projection(v_job);
end $$;

create function public.cancel_support_ai_draft(p_actor_id uuid,p_owner_id uuid,p_inquiry_id uuid,p_job_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_ai_jobs%rowtype;
begin
  perform private.require_support_ai_owner(p_actor_id,p_owner_id);
  perform 1 from private.support_inquiries where id=p_inquiry_id for update;
  select * into v_job from private.support_ai_jobs where id=p_job_id and inquiry_id=p_inquiry_id and actor_id=p_actor_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  if v_job.state in ('queued','running') then
    update private.support_ai_jobs set state='cancelled',lease_token=null,error_code='cancelled',finished_at=clock_timestamp()
      where id=p_job_id returning * into v_job;
  end if;
  return private.support_ai_projection(v_job);
end $$;

create function public.claim_support_ai_draft(p_owner_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_ai_jobs%rowtype; v_body text;
begin
  if p_owner_id is null or p_lease_token is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('helix:support-ai',0));
  perform private.expire_support_ai_jobs();
  select * into v_job from private.support_ai_jobs where state='queued';
  if not found then return null; end if;
  perform 1 from private.support_inquiries where id=v_job.inquiry_id for update;
  select * into v_job from private.support_ai_jobs where id=v_job.id for update;
  if v_job.state<>'queued' then return null; end if;
  if v_job.expires_at<=clock_timestamp() then
    update private.support_ai_jobs set state='failed',error_code='worker_unavailable',finished_at=clock_timestamp() where id=v_job.id;
    return null;
  end if;
  if not private.support_ai_current(v_job,p_owner_id) then
    update private.support_ai_jobs set state='stale',error_code='stale_context',finished_at=clock_timestamp() where id=v_job.id;
    return null;
  end if;
  select body into v_body from private.support_messages where id=v_job.message_id and inquiry_id=v_job.inquiry_id and kind='inbound';
  if v_body is null or length(v_body)>6000 then return null; end if;
  update private.support_ai_jobs set state='running',lease_token=p_lease_token,expires_at=clock_timestamp()+interval '120 seconds'
    where id=v_job.id returning * into v_job;
  return jsonb_build_object('id',v_job.id,'leaseToken',v_job.lease_token,'expiresAt',v_job.expires_at,
    'context',jsonb_build_object('messages',jsonb_build_array(jsonb_build_object('id',v_job.message_id,'body',v_body)),'facts',v_job.facts));
end $$;

create function public.check_support_ai_draft(p_owner_id uuid,p_job_id uuid,p_lease_token uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.support_ai_jobs j where j.id=p_job_id and j.state='running'
    and j.lease_token=p_lease_token and j.expires_at>clock_timestamp() and private.support_ai_current(j,p_owner_id));
$$;

create function public.finish_support_ai_draft(p_owner_id uuid,p_job_id uuid,p_lease_token uuid,
  p_body text default null,p_references text[] default null,p_needs_human boolean default null,
  p_runtime jsonb default null,p_error_code text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_ai_jobs%rowtype; v_inquiry uuid; v_saved jsonb;
begin
  select inquiry_id into v_inquiry from private.support_ai_jobs where id=p_job_id;
  if not found then return false; end if;
  -- Same Inquiry-first lock order as manual edits, inbound context and exact approval.
  perform 1 from private.support_inquiries where id=v_inquiry for update;
  select * into v_job from private.support_ai_jobs where id=p_job_id for update;
  if v_job.state<>'running' or v_job.lease_token is distinct from p_lease_token then return false; end if;
  if v_job.expires_at<=clock_timestamp() then
    update private.support_ai_jobs set state='failed',error_code='lease_expired',lease_token=null,finished_at=clock_timestamp() where id=p_job_id;
    return false;
  end if;
  if not private.support_ai_current(v_job,p_owner_id) then
    update private.support_ai_jobs set state='stale',error_code='stale_context',lease_token=null,finished_at=clock_timestamp() where id=p_job_id;
    return false;
  end if;
  if p_error_code is not null then
    if p_error_code not in ('quota_exceeded','authentication_required','runtime_mismatch','invalid_result','worker_timeout','worker_unavailable','cancelled') then
      raise exception using errcode='22023',message='invalid_support_input'; end if;
    update private.support_ai_jobs set state=case when p_error_code='cancelled' then 'cancelled' else 'failed' end,
      error_code=p_error_code,lease_token=null,finished_at=clock_timestamp() where id=p_job_id;
    return true;
  end if;
  p_body:=btrim(p_body);
  if p_body is null or length(p_body) not between 1 and 4000 or translate(p_body,E'\n\r\t','') ~ '[[:cntrl:]]'
    or p_needs_human is null or p_runtime is distinct from '{"version":"0.158.0","model":"gpt-6-sol","promptVersion":"1"}'::jsonb
    or p_references is null or cardinality(p_references)>8 or array_position(p_references,null) is not null
    or (select count(distinct ref) from unnest(p_references) ref)<>cardinality(p_references)
    or exists(select 1 from unnest(p_references) ref where not exists(select 1 from jsonb_array_elements(v_job.facts) f where f->>'id'=ref)) then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  v_saved:=public.mutate_support_inquiry(v_job.actor_id,v_job.inquiry_id,v_job.inquiry_revision,'save_draft',v_job.draft_version,
    (select left('Re: '||subject,200) from private.support_inquiries where id=v_job.inquiry_id),p_body);
  update private.support_ai_jobs set state='completed',draft_id=(v_saved#>>'{draft,id}')::uuid,
    reference_ids=p_references,needs_human=p_needs_human,runtime=p_runtime,lease_token=null,finished_at=clock_timestamp() where id=p_job_id;
  return true;
end $$;

revoke all on function private.require_support_ai_owner(uuid,uuid),private.support_ai_current(private.support_ai_jobs,uuid),
  private.expire_support_ai_jobs(),private.support_ai_projection(private.support_ai_jobs),
  public.get_support_ai_draft(uuid,uuid,uuid),public.request_support_ai_draft(uuid,uuid,uuid,uuid,integer,integer,jsonb),
  public.cancel_support_ai_draft(uuid,uuid,uuid,uuid),public.claim_support_ai_draft(uuid,uuid),
  public.check_support_ai_draft(uuid,uuid,uuid),public.finish_support_ai_draft(uuid,uuid,uuid,text,text[],boolean,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function private.require_support_ai_owner(uuid,uuid),private.support_ai_current(private.support_ai_jobs,uuid),
  private.expire_support_ai_jobs(),private.support_ai_projection(private.support_ai_jobs),
  public.get_support_ai_draft(uuid,uuid,uuid),public.request_support_ai_draft(uuid,uuid,uuid,uuid,integer,integer,jsonb),
  public.cancel_support_ai_draft(uuid,uuid,uuid,uuid),public.claim_support_ai_draft(uuid,uuid),
  public.check_support_ai_draft(uuid,uuid,uuid),public.finish_support_ai_draft(uuid,uuid,uuid,text,text[],boolean,jsonb,text) to service_role;
