-- Extend the shared delivery contract only for the two approved support purposes.
alter table private.email_controls drop constraint email_controls_purpose_check;
alter table private.email_controls add constraint email_controls_purpose_check
  check(purpose in ('order_confirmation','order_tracking','support_acknowledgement','support_reply'));
insert into private.email_controls(environment,purpose)
  values ('sandbox','support_acknowledgement'),('sandbox','support_reply');
alter table private.email_intents drop constraint email_intents_purpose_check;
alter table private.email_intents add constraint email_intents_purpose_check
  check(purpose in ('order_confirmation','order_tracking','support_acknowledgement','support_reply'));
alter table private.email_intents alter column order_id drop not null;
alter table private.email_intents add constraint email_intents_order_purpose_check
  check((purpose in ('order_confirmation','order_tracking'))=(order_id is not null));
create index email_intents_support_inquiry_idx on private.email_intents((receipt->>'inquiryId'),created_at desc,id desc)
  where purpose in ('support_acknowledgement','support_reply');

-- Private Support Intake. Installation never opens intake or activates delivery.
create table private.support_controls (
  environment text primary key check (environment='sandbox'),
  intake_enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
insert into private.support_controls(environment) values ('sandbox');

create table private.support_inquiries (
  id uuid primary key default extensions.gen_random_uuid(),
  revision integer not null default 1 check (revision>0),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  check ((status='closed')=(closed_at is not null)),
  name text not null check (pg_catalog.length(name) between 1 and 100),
  email text not null check (pg_catalog.length(email) between 3 and 254),
  inquiry_type text not null check (inquiry_type in ('product','routine','account','cart','accessibility','privacy','partnership','wholesale','general')),
  subject text not null check (pg_catalog.length(subject) between 1 and 200),
  order_id uuid references public.orders(id),
  current_draft_version integer not null default 0 check (current_draft_version>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (pg_catalog.isfinite(created_at)),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index support_inquiries_queue_idx on private.support_inquiries(status,created_at desc,id desc);
create index support_inquiries_created_idx on private.support_inquiries(created_at desc,id desc);
-- Cursor coordinates never change when an Inquiry is edited, closed, or reopened.
create function private.preserve_support_inquiry_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (new.id,new.created_at) is distinct from (old.id,old.created_at) then
    raise exception using errcode='55000',message='support_inquiry_identity_immutable';
  end if;
  return new;
end $$;
create trigger preserve_support_inquiry_identity before update on private.support_inquiries
  for each row execute function private.preserve_support_inquiry_identity();
revoke all on function private.preserve_support_inquiry_identity() from public,anon,authenticated,service_role;
create table private.support_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references private.support_inquiries(id),
  kind text not null check (kind in ('inbound','reply','note')),
  subject text not null check (pg_catalog.length(subject) between 1 and 200),
  body text not null check (pg_catalog.length(body) between 1 and 10000),
  actor_id uuid,
  email_intent_id uuid unique references private.email_intents(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((kind='reply')=(email_intent_id is not null))
);
create index support_messages_conversation_idx on private.support_messages(inquiry_id,created_at,id);
create table private.support_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references private.support_inquiries(id),
  version integer not null check (version>0),
  inquiry_revision integer not null check (inquiry_revision>0),
  recipient text not null,
  subject text not null check (pg_catalog.length(subject) between 1 and 200),
  body text not null check (pg_catalog.length(body) between 1 and 10000),
  actor_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(inquiry_id,version)
);
create table private.support_reply_approvals (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references private.support_inquiries(id),
  draft_id uuid not null unique references private.support_drafts(id),
  inquiry_revision integer not null,
  actor_id uuid not null,
  message_id uuid not null unique references private.support_messages(id),
  email_intent_id uuid not null unique references private.email_intents(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index support_reply_approvals_inquiry_idx on private.support_reply_approvals(inquiry_id,created_at);
create table private.support_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references private.support_inquiries(id),
  action text not null check (action in ('intake','save_draft','approve_reply','add_note','set_status')),
  actor_id uuid,
  inquiry_revision integer not null,
  draft_version integer,
  status text check (status in ('open','closed')),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index support_audit_inquiry_idx on private.support_audit_events(inquiry_id,created_at);
create table private.support_intake_submissions (
  abuse_key text not null check (abuse_key ~ '^[0-9a-f]{64}$'),
  submission_id uuid not null,
  payload_hash text not null,
  inquiry_id uuid not null unique references private.support_inquiries(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(submission_id)
);
create table private.support_abuse_windows (
  kind text not null check (kind in ('source','email')),
  abuse_key text not null check (abuse_key ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  count integer not null check (count>0),
  primary key(kind,abuse_key,bucket_start)
);
create index support_abuse_expiry_idx on private.support_abuse_windows(bucket_start);

alter table private.support_controls enable row level security;
alter table private.support_controls force row level security;
alter table private.support_inquiries enable row level security;
alter table private.support_inquiries force row level security;
alter table private.support_messages enable row level security;
alter table private.support_messages force row level security;
alter table private.support_drafts enable row level security;
alter table private.support_drafts force row level security;
alter table private.support_reply_approvals enable row level security;
alter table private.support_reply_approvals force row level security;
alter table private.support_audit_events enable row level security;
alter table private.support_audit_events force row level security;
alter table private.support_intake_submissions enable row level security;
alter table private.support_intake_submissions force row level security;
alter table private.support_abuse_windows enable row level security;
alter table private.support_abuse_windows force row level security;
revoke all on private.support_controls,private.support_inquiries,private.support_messages,
  private.support_drafts,private.support_reply_approvals,private.support_audit_events,
  private.support_intake_submissions,private.support_abuse_windows from public,anon,authenticated,service_role;
grant select,update on private.support_controls to service_role;
grant select,insert,update on private.support_inquiries to service_role;
grant select,insert on private.support_messages,private.support_drafts,private.support_reply_approvals,
  private.support_audit_events,private.support_intake_submissions to service_role;
grant select,insert,update,delete on private.support_abuse_windows to service_role;

create function private.support_plain_html(p_body text) returns text
language sql immutable strict security invoker set search_path='' as $$
  select '<div style="white-space: pre-wrap">'||pg_catalog.replace(pg_catalog.replace(
    pg_catalog.replace(p_body,'&','&amp;'),'<','&lt;'),'>','&gt;')||'</div>';
$$;
create function private.require_support_admin(p_actor_id uuid) returns void
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_actor_id is null or not exists (select 1 from public.admin_memberships
    where user_id=p_actor_id and active and role='admin') then
    raise exception using errcode='42501',message='forbidden';
  end if;
end $$;
create function public.support_intake_available() returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((select intake_enabled from private.support_controls where environment='sandbox'),false);
$$;
create function public.read_support_intake_control() returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('enabled',intake_enabled,'updatedAt',updated_at)
    from private.support_controls where environment='sandbox';
$$;
create function public.configure_support_intake(p_enabled boolean,p_expected_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if p_enabled is null or p_expected_updated_at is null then return false; end if;
  update private.support_controls set intake_enabled=p_enabled,updated_at=pg_catalog.clock_timestamp()
    where environment='sandbox' and updated_at=p_expected_updated_at;
  return found;
end $$;

create function public.submit_support_inquiry(
  p_submission_id uuid,p_abuse_key text,p_email_abuse_key text,p_name text,p_email text,
  p_inquiry_type text,p_subject text,p_body text,p_order_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_id uuid;
  v_hash text;
  v_existing private.support_intake_submissions%rowtype;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_hour timestamptz;
  v_key record;
  v_hour_count integer;
  v_day_count integer;
  v_ack_subject text:='Helix received your inquiry';
  v_ack_body text:='We received your support inquiry. A member of Helix will review it. This acknowledgement does not confirm that a reply has been sent.';
begin
  p_name:=pg_catalog.btrim(p_name); p_email:=pg_catalog.lower(pg_catalog.btrim(p_email));
  p_subject:=pg_catalog.btrim(p_subject); p_body:=pg_catalog.btrim(p_body);
  if p_submission_id is null or p_abuse_key is null or p_abuse_key !~ '^[0-9a-f]{64}$'
    or p_email_abuse_key is null or p_email_abuse_key !~ '^[0-9a-f]{64}$'
    or p_name is null or pg_catalog.length(p_name) not between 1 and 100 or p_name ~ '[[:cntrl:]]'
    or p_email is null or pg_catalog.length(p_email) not between 3 and 254
    or p_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or p_email ~ '[[:cntrl:]]'
    or p_inquiry_type is null or p_inquiry_type not in ('product','routine','account','cart','accessibility','privacy','partnership','wholesale','general')
    or p_subject is null or pg_catalog.length(p_subject) not between 1 and 200 or p_subject ~ '[[:cntrl:]]'
    or p_body is null or pg_catalog.length(p_body) not between 1 and 10000
    or pg_catalog.translate(p_body,E'\n\r\t','') ~ '[[:cntrl:]]'
  then raise exception using errcode='22023',message='invalid_support_input'; end if;
  -- Logical submission identity survives network changes; source HMACs only bound abuse.
  -- Exact canonical payload equality is required before returning the existing result.
  -- Server-owned HMAC keys contain neither the source IP nor an email address.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-submission:'||p_submission_id::text,0));
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_array(p_name,p_email,
    p_inquiry_type,p_subject,p_body,p_order_id)::text,'sha256'),'hex');
  select * into v_existing from private.support_intake_submissions
    where submission_id=p_submission_id;
  if found then
    if v_existing.payload_hash<>v_hash then
      raise exception using errcode='22023',message='submission_conflict';
    end if;
    return pg_catalog.jsonb_build_object('inquiryId',v_existing.inquiry_id);
  end if;
  perform 1 from private.support_controls where environment='sandbox' and intake_enabled for share;
  if not found then
    raise exception using errcode='55000',message='support_unavailable';
  end if;
  -- Stable lock order makes concurrent requests across shared sources/addresses safe.
  for v_key in select kind,abuse_key,hour_limit,day_limit from (values
      ('email'::text,p_email_abuse_key,3,10),('source'::text,p_abuse_key,5,20))
    as k(kind,abuse_key,hour_limit,day_limit) order by kind,abuse_key loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-abuse:'||v_key.kind||':'||v_key.abuse_key,0));
    select coalesce(pg_catalog.sum(count) filter(where bucket_start>=pg_catalog.date_trunc('minute',v_now-interval '1 hour')),0),
      coalesce(pg_catalog.sum(count),0) into v_hour_count,v_day_count
      from private.support_abuse_windows where kind=v_key.kind and abuse_key=v_key.abuse_key
        and bucket_start>=pg_catalog.date_trunc('minute',v_now-interval '24 hours');
    if v_hour_count>=v_key.hour_limit or v_day_count>=v_key.day_limit then
      raise exception using errcode='54000',message='rate_limited';
    end if;
  end loop;
  v_hour:=pg_catalog.date_trunc('minute',v_now);
  insert into private.support_abuse_windows(kind,abuse_key,bucket_start,count)
    values ('source',p_abuse_key,v_hour,1),('email',p_email_abuse_key,v_hour,1)
    on conflict(kind,abuse_key,bucket_start) do update set count=private.support_abuse_windows.count+1;
  delete from private.support_abuse_windows where (kind,abuse_key,bucket_start) in
    (select kind,abuse_key,bucket_start from private.support_abuse_windows
      where bucket_start<pg_catalog.date_trunc('minute',v_now-interval '24 hours') order by bucket_start limit 200);
  insert into private.support_inquiries(name,email,inquiry_type,subject,order_id)
    values(p_name,p_email,p_inquiry_type,p_subject,p_order_id) returning id into v_id;
  insert into private.support_messages(inquiry_id,kind,subject,body)
    values(v_id,'inbound',p_subject,p_body);
  insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key)
    values('sandbox','support_acknowledgement',p_email,pg_catalog.jsonb_build_object(
      'renderVersion','support-ack-v1','inquiryId',v_id,'subject',v_ack_subject,'body',v_ack_body,
      'html',private.support_plain_html(v_ack_body),'attachments','[]'::jsonb),
      'queued','sandbox/support_acknowledgement/'||v_id::text);
  insert into private.support_intake_submissions(abuse_key,submission_id,payload_hash,inquiry_id)
    values(p_abuse_key,p_submission_id,v_hash,v_id);
  insert into private.support_audit_events(inquiry_id,action,inquiry_revision) values(v_id,'intake',1);
  return pg_catalog.jsonb_build_object('inquiryId',v_id);
end $$;

create function private.support_inquiry_summary(p_inquiry private.support_inquiries) returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p_inquiry.id,'revision',p_inquiry.revision,
    'status',p_inquiry.status,'inquiryType',p_inquiry.inquiry_type,'name',p_inquiry.name,'email',p_inquiry.email,
    'subject',p_inquiry.subject,'createdAt',p_inquiry.created_at,'updatedAt',p_inquiry.updated_at,
    'lastDeliveryState',(select coalesce(e.delivery_status,e.state) from private.email_intents e
      where e.receipt->>'inquiryId'=p_inquiry.id::text and e.purpose in ('support_acknowledgement','support_reply')
      order by e.created_at desc,e.id desc limit 1));
$$;
create function public.list_support_inquiries(
  p_actor_id uuid,p_status text default 'open',p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,p_direction text default 'older'
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  v_rows jsonb;
  v_first_created_at timestamptz;
  v_first_id uuid;
  v_last_created_at timestamptz;
  v_last_id uuid;
  v_next jsonb;
  v_previous jsonb;
begin
  perform private.require_support_admin(p_actor_id);
  if p_status is null or p_status not in ('open','closed','all')
    or p_direction is null or p_direction not in ('older','newer')
    or (p_cursor_created_at is null)<>(p_cursor_id is null)
    or (p_cursor_created_at is not null and not pg_catalog.isfinite(p_cursor_created_at)) then
    raise exception using errcode='22023',message='invalid_support_input';
  end if;
  -- A cursor is a position, not a row capability; lifecycle cleanup cannot invalidate it.
  if p_cursor_created_at is not null and p_direction='newer' then
    select coalesce(pg_catalog.jsonb_agg(private.support_inquiry_summary(q)
      order by q.created_at desc,q.id desc),'[]'::jsonb) into v_rows
      from (select * from private.support_inquiries where (p_status='all' or status=p_status)
        and (created_at,id)>(p_cursor_created_at,p_cursor_id)
        order by created_at,id limit 25) q;
  else
    select coalesce(pg_catalog.jsonb_agg(private.support_inquiry_summary(q)
      order by q.created_at desc,q.id desc),'[]'::jsonb) into v_rows
      from (select * from private.support_inquiries where (p_status='all' or status=p_status)
        and (p_cursor_created_at is null or (created_at,id)<(p_cursor_created_at,p_cursor_id))
        order by created_at desc,id desc limit 25) q;
  end if;
  v_first_created_at:=coalesce((v_rows->0->>'createdAt')::timestamptz,p_cursor_created_at);
  v_first_id:=coalesce((v_rows->0->>'id')::uuid,p_cursor_id);
  v_last_created_at:=coalesce((v_rows->(pg_catalog.jsonb_array_length(v_rows)-1)->>'createdAt')::timestamptz,p_cursor_created_at);
  v_last_id:=coalesce((v_rows->(pg_catalog.jsonb_array_length(v_rows)-1)->>'id')::uuid,p_cursor_id);
  if exists(select 1 from private.support_inquiries where (p_status='all' or status=p_status)
    and (created_at,id)<(v_last_created_at,v_last_id)) then
    v_next:=pg_catalog.jsonb_build_object('createdAt',pg_catalog.to_char(v_last_created_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',v_last_id);
  end if;
  if exists(select 1 from private.support_inquiries where (p_status='all' or status=p_status)
    and (created_at,id)>(v_first_created_at,v_first_id)) then
    v_previous:=pg_catalog.jsonb_build_object('createdAt',pg_catalog.to_char(v_first_created_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',v_first_id);
  end if;
  return pg_catalog.jsonb_build_object('inquiries',v_rows,'nextCursor',v_next,'previousCursor',v_previous);
end $$;
create function public.get_support_inquiry(p_actor_id uuid,p_inquiry_id uuid,p_before_message_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype; v_draft jsonb; v_messages jsonb;
  v_before private.support_messages%rowtype; v_oldest private.support_messages%rowtype; v_next uuid;
begin
  perform private.require_support_admin(p_actor_id);
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id;
  if not found then return null; end if;
  if p_before_message_id is not null then
    select * into v_before from private.support_messages where id=p_before_message_id and inquiry_id=p_inquiry_id;
    if not found then raise exception using errcode='22023',message='invalid_support_input'; end if;
  end if;
  select pg_catalog.jsonb_build_object('id',d.id,'version',d.version,'inquiryRevision',d.inquiry_revision,
    'recipient',d.recipient,'subject',d.subject,'body',d.body,'approved',exists(
      select 1 from private.support_reply_approvals a where a.draft_id=d.id and a.inquiry_revision=v_inquiry.revision))
    into v_draft from private.support_drafts d where d.inquiry_id=p_inquiry_id and d.version=v_inquiry.current_draft_version;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'kind',m.kind,
    'subject',m.subject,'body',m.body,'createdAt',m.created_at,'delivery',case when e.id is not null then
      pg_catalog.jsonb_build_object('state',e.state,'deliveryStatus',e.delivery_status,'errorCode',e.error_code) else null end)
    order by m.created_at,m.id),'[]'::jsonb) into v_messages
    from (select * from private.support_messages where inquiry_id=p_inquiry_id
      and (p_before_message_id is null or (created_at,id)<(v_before.created_at,v_before.id))
      order by created_at desc,id desc limit 50) m
    left join private.email_intents e on e.id=m.email_intent_id;
  select * into v_oldest from private.support_messages where id=(v_messages->0->>'id')::uuid;
  if found and exists(select 1 from private.support_messages where inquiry_id=p_inquiry_id
    and (created_at,id)<(v_oldest.created_at,v_oldest.id)) then v_next:=v_oldest.id; end if;
  return private.support_inquiry_summary(v_inquiry)||pg_catalog.jsonb_build_object('messages',v_messages,'nextMessageCursor',v_next,'draft',v_draft,
    'order',(select pg_catalog.jsonb_build_object('orderNumber',order_number) from public.orders where id=v_inquiry.order_id));
end $$;

-- Called with the Inquiry locked; all send preparation must use Inquiry -> intent lock order.
create function private.invalidate_support_approval(p_inquiry_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  update private.email_intents e set
    state=case when e.first_attempt_at is null then 'blocked' else 'uncertain' end,
    error_code=case when e.first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
  from private.support_reply_approvals a where a.inquiry_id=p_inquiry_id and e.id=a.email_intent_id
    and e.provider_email_id is null and e.delivery_status is null
    and e.state in ('queued','leased','retry','uncertain','blocked');
end $$;

create function public.mutate_support_inquiry(
  p_actor_id uuid,p_inquiry_id uuid,p_expected_revision integer,p_action text,
  p_expected_draft_version integer default null,p_subject text default null,p_body text default null,p_status text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_inquiry private.support_inquiries%rowtype;
  v_draft private.support_drafts%rowtype;
  v_message_id uuid;
  v_intent_id uuid;
  v_revision integer;
begin
  perform private.require_support_admin(p_actor_id);
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  if p_expected_revision is null or p_expected_revision<>v_inquiry.revision then
    raise exception using errcode='40001',message='stale_inquiry';
  end if;
  if p_action is null or p_action not in ('save_draft','approve_reply','add_note','set_status') then
    raise exception using errcode='22023',message='invalid_support_input';
  end if;
  if p_action in ('save_draft','add_note') then
    p_body:=pg_catalog.btrim(p_body);
    if p_body is null or pg_catalog.length(p_body) not between 1 and 10000
      or pg_catalog.translate(p_body,E'\n\r\t','') ~ '[[:cntrl:]]' then
      raise exception using errcode='22023',message='invalid_support_input';
    end if;
  end if;
  if p_action in ('save_draft','approve_reply') and (p_expected_draft_version is null
    or p_expected_draft_version<>v_inquiry.current_draft_version) then
    raise exception using errcode='40001',message='stale_draft';
  end if;
  if p_action='approve_reply' then
    select * into v_draft from private.support_drafts where inquiry_id=p_inquiry_id and version=v_inquiry.current_draft_version;
    if not found or v_draft.inquiry_revision<>v_inquiry.revision then
      raise exception using errcode='40001',message='stale_draft';
    end if;
    if exists(select 1 from private.support_reply_approvals where draft_id=v_draft.id) then
      return public.get_support_inquiry(p_actor_id,p_inquiry_id);
    end if;
    if exists(select 1 from private.support_reply_approvals a join private.email_intents e on e.id=a.email_intent_id
      where a.inquiry_id=p_inquiry_id and e.first_attempt_at is not null and e.provider_email_id is null
      and e.state in ('leased','retry','uncertain','blocked')) then
      raise exception using errcode='55000',message='reply_reconciliation_required';
    end if;
    v_message_id:=extensions.gen_random_uuid(); v_intent_id:=extensions.gen_random_uuid();
    insert into private.email_intents(id,environment,purpose,recipient,receipt,state,idempotency_key)
      values(v_intent_id,'sandbox','support_reply',v_draft.recipient,pg_catalog.jsonb_build_object(
        'renderVersion','support-text-v1','inquiryId',p_inquiry_id,'messageId',v_message_id,
        'inquiryRevision',v_inquiry.revision,'draftVersion',v_draft.version,'subject',v_draft.subject,
        'body',v_draft.body,'html',private.support_plain_html(v_draft.body),'attachments','[]'::jsonb),
        'queued','sandbox/support_reply/'||v_message_id::text);
    insert into private.support_messages(id,inquiry_id,kind,subject,body,actor_id,email_intent_id)
      values(v_message_id,p_inquiry_id,'reply',v_draft.subject,v_draft.body,p_actor_id,v_intent_id);
    insert into private.support_reply_approvals(inquiry_id,draft_id,inquiry_revision,actor_id,message_id,email_intent_id)
      values(p_inquiry_id,v_draft.id,v_inquiry.revision,p_actor_id,v_message_id,v_intent_id);
    insert into private.support_audit_events(inquiry_id,action,actor_id,inquiry_revision,draft_version)
      values(p_inquiry_id,p_action,p_actor_id,v_inquiry.revision,v_draft.version);
    return public.get_support_inquiry(p_actor_id,p_inquiry_id);
  end if;
  if p_action='save_draft' then
    p_subject:=pg_catalog.btrim(p_subject);
    if p_subject is null or pg_catalog.length(p_subject) not between 1 and 200 or p_subject ~ '[[:cntrl:]]' then
      raise exception using errcode='22023',message='invalid_support_input';
    end if;
  elsif p_action='set_status' and (p_status is null or p_status not in ('open','closed')) then
    raise exception using errcode='22023',message='invalid_support_input';
  end if;
  perform private.invalidate_support_approval(p_inquiry_id);
  update private.support_inquiries set revision=revision+1,updated_at=pg_catalog.clock_timestamp(),
    status=case when p_action='set_status' then p_status else status end,
    closed_at=case when p_action='set_status' and p_status='open' then null
      when p_action='set_status' and p_status='closed' and status='open' then pg_catalog.clock_timestamp()
      else closed_at end,
    current_draft_version=current_draft_version+case when p_action='save_draft' then 1 else 0 end
    where id=p_inquiry_id returning revision into v_revision;
  if p_action='save_draft' then
    insert into private.support_drafts(inquiry_id,version,inquiry_revision,recipient,subject,body,actor_id)
      values(p_inquiry_id,v_inquiry.current_draft_version+1,v_revision,v_inquiry.email,p_subject,p_body,p_actor_id);
  elsif p_action='add_note' then
    insert into private.support_messages(inquiry_id,kind,subject,body,actor_id)
      values(p_inquiry_id,'note','Internal note',p_body,p_actor_id);
  end if;
  insert into private.support_audit_events(inquiry_id,action,actor_id,inquiry_revision,draft_version,status)
    values(p_inquiry_id,p_action,p_actor_id,v_revision,
      case when p_action='save_draft' then v_inquiry.current_draft_version+1 else null end,
      case when p_action='set_status' then p_status else null end);
  return public.get_support_inquiry(p_actor_id,p_inquiry_id);
end $$;

revoke all on function private.support_plain_html(text),private.require_support_admin(uuid),
  private.support_inquiry_summary(private.support_inquiries),private.invalidate_support_approval(uuid),
  public.support_intake_available(),public.read_support_intake_control(),public.configure_support_intake(boolean,timestamptz),
  public.submit_support_inquiry(uuid,text,text,text,text,text,text,text,uuid),public.list_support_inquiries(uuid,text,timestamptz,uuid,text),
  public.get_support_inquiry(uuid,uuid,uuid),public.mutate_support_inquiry(uuid,uuid,integer,text,integer,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.support_plain_html(text),private.require_support_admin(uuid),
  private.support_inquiry_summary(private.support_inquiries),private.invalidate_support_approval(uuid),
  public.support_intake_available(),public.read_support_intake_control(),public.configure_support_intake(boolean,timestamptz),
  public.submit_support_inquiry(uuid,text,text,text,text,text,text,text,uuid),public.list_support_inquiries(uuid,text,timestamptz,uuid,text),
  public.get_support_inquiry(uuid,uuid,uuid),public.mutate_support_inquiry(uuid,uuid,integer,text,integer,text,text,text) to service_role;
-- Support send guard extension.
create or replace function public.prepare_email_attempt(p_id uuid,p_lease_token uuid,p_request_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_order_id uuid; v_purpose text; v_inquiry_id uuid;
begin
  -- Identity fields are immutable. Lock Order before intent for all tracking handoffs.
  select order_id,purpose into v_order_id,v_purpose from private.email_intents where id=p_id;
  if v_purpose='order_tracking' then
    perform 1 from public.orders where id=v_order_id for update;
  end if;
  if v_purpose='support_reply' then
    select a.inquiry_id into v_inquiry_id from private.support_reply_approvals a where a.email_intent_id=p_id;
    perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  end if;
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or v_intent.state<>'leased' or v_intent.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_intent.lease_expires_at<=pg_catalog.clock_timestamp()
    or v_intent.attempt_count>=5 or v_intent.content_deleted_at is not null
    or v_intent.provider_email_id is not null
    or (v_intent.first_attempt_at is not null and v_intent.first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours')
  then return null; end if;
  if v_intent.purpose='order_tracking' then
    if private.simulation_is_frozen(v_intent.order_id) then
      update private.email_intents set state='blocked',error_code='order_refunded',lease_token=null,
        lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
    perform 1 from private.email_controls
      where environment='sandbox' and purpose='order_tracking' and enabled for share;
    if not found or not private.simulation_order_eligible(v_intent.order_id) then
      update private.email_intents set state='blocked',error_code='simulation_unavailable',lease_token=null,
        lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  if v_intent.purpose in ('support_acknowledgement','support_reply') then
    perform 1 from private.email_controls where environment=v_intent.environment
      and purpose=v_intent.purpose and enabled for share;
    if not found then
      update private.email_intents set state='blocked',error_code='support_delivery_disabled',
        lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  if v_intent.purpose='support_reply' and not exists (
    select 1 from private.support_reply_approvals a
    join private.support_inquiries i on i.id=a.inquiry_id
    join private.support_drafts d on d.id=a.draft_id
    join private.support_messages m on m.id=a.message_id
    where a.email_intent_id=v_intent.id and a.inquiry_revision=i.revision
      and exists(select 1 from public.admin_memberships where user_id=a.actor_id and active and role='admin')
      and d.inquiry_revision=i.revision and d.version=i.current_draft_version
      and d.recipient=v_intent.recipient and d.subject=m.subject and d.body=m.body
      and m.kind='reply' and m.email_intent_id=v_intent.id and m.inquiry_id=i.id
      and v_intent.receipt=pg_catalog.jsonb_build_object(
        'renderVersion','support-text-v1','inquiryId',i.id,'messageId',m.id,
        'inquiryRevision',i.revision,'draftVersion',d.version,'subject',d.subject,
        'body',d.body,'html',private.support_plain_html(d.body),'attachments','[]'::jsonb)
  ) then
    update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
      error_code=case when first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return null;
  end if;
  if v_intent.purpose in ('support_acknowledgement','support_reply') and (
    p_request_payload->>'subject' is distinct from v_intent.receipt->>'subject'
    or p_request_payload->>'text' is distinct from v_intent.receipt->>'body'
    or p_request_payload->>'html' is distinct from v_intent.receipt->>'html'
    or v_intent.receipt->'attachments' is distinct from '[]'::jsonb
    or v_intent.receipt->>'renderVersion' is distinct from case when v_intent.purpose='support_reply'
      then 'support-text-v1' else 'support-ack-v1' end
  ) then raise exception using errcode='22023',message='support request does not match approval'; end if;
  if p_request_payload is null or pg_catalog.jsonb_typeof(p_request_payload)<>'object'
    or p_request_payload->'to' is distinct from pg_catalog.jsonb_build_array(v_intent.recipient)
    or pg_catalog.jsonb_typeof(p_request_payload->'from') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'from') not between 3 and 320
    or pg_catalog.jsonb_typeof(p_request_payload->'subject') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'subject') not between 1 and 300
    or pg_catalog.jsonb_typeof(p_request_payload->'reply_to') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'reply_to') not between 3 and 254
    or pg_catalog.jsonb_typeof(p_request_payload->'html') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'html') not between 1 and 1000000
    or pg_catalog.jsonb_typeof(p_request_payload->'text') is distinct from 'string'
    or pg_catalog.length(p_request_payload->>'text') not between 1 and 1000000
    or p_request_payload->'tags' is distinct from pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name','helix_environment','value',v_intent.environment),
      pg_catalog.jsonb_build_object('name','helix_message_id','value',v_intent.id::text))
    or p_request_payload-array['from','to','reply_to','subject','html','text','tags']<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  update private.email_intents set request_payload=coalesce(request_payload,p_request_payload),
    first_attempt_at=coalesce(first_attempt_at,pg_catalog.clock_timestamp()),attempt_count=attempt_count+1,
    updated_at=pg_catalog.clock_timestamp() where id=p_id returning * into v_intent;
  return private.email_intent_work(v_intent);
end $$;

create or replace function public.claim_email_intents(p_environment text,p_lease_token uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_work jsonb;
begin
  if p_environment is distinct from 'sandbox' or p_lease_token is null or p_limit is null or p_limit not between 1 and 5 then
    raise exception using errcode='22023',message='invalid email claim';
  end if;
  -- An expired worker may already have sent. Once provider idempotency is near expiry,
  -- preserve uncertainty for human reconciliation instead of issuing another send.
  with expired as (
    select id from private.email_intents where environment=p_environment and state in ('leased','retry','uncertain')
      and (lease_expires_at is null or lease_expires_at<=pg_catalog.clock_timestamp())
      and first_attempt_at is not null and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5)
      and (state<>'uncertain' or error_code is distinct from 'reconciliation_required')
    order by created_at,id for update skip locked limit p_limit
  ) update private.email_intents i set state='uncertain',lease_token=null,lease_expires_at=null,
    error_code='reconciliation_required',updated_at=pg_catalog.clock_timestamp()
    from expired where i.id=expired.id;
  with accepted as (
    select id from private.email_intents where environment=p_environment and state='accepted'
      and lease_expires_at<=pg_catalog.clock_timestamp()
    order by lease_expires_at,id for update skip locked limit p_limit
  ) update private.email_intents i set lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
    from accepted where i.id=accepted.id;
  with candidates as (
    select id from private.email_intents where environment=p_environment
      and content_deleted_at is null and provider_email_id is null and attempt_count<5
      and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours')
      and (state in ('queued','retry','uncertain') or (state='leased' and lease_expires_at<=pg_catalog.clock_timestamp()))
      and next_attempt_at<=pg_catalog.clock_timestamp()
      and delivery_status is null
      and not (purpose='support_reply' and coalesce(error_code,'') in
        ('approval_stale','approval_revoked','reconciliation_required'))
    order by next_attempt_at,created_at,id for update skip locked limit p_limit
  ), claimed as (
    update private.email_intents i set state='leased',lease_token=p_lease_token,
      lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes',updated_at=pg_catalog.clock_timestamp()
    from candidates c where i.id=c.id returning i.*
  ) select coalesce(pg_catalog.jsonb_agg(private.email_intent_work(claimed)),'[]'::jsonb) into v_work from claimed;
  return v_work;
end $$;

create or replace function public.retry_email_delivery(p_id uuid,p_expected_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update private.email_intents set state='queued',next_attempt_at=pg_catalog.clock_timestamp(),
    error_code=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id and updated_at=p_expected_updated_at and state in ('blocked','failed','retry','uncertain')
    and provider_email_id is null and delivery_status is null and content_deleted_at is null
    and not (purpose='support_reply' and coalesce(error_code,'') in
      ('approval_stale','approval_revoked','reconciliation_required'))
    and lease_token is null and attempt_count<5
    and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours');
  return found;
end $$;
