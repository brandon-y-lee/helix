-- Receiving is disabled at installation; already accepted jobs drain independently.
alter table private.support_controls add column receiving_enabled boolean not null default false;
create table private.support_reply_routes (
  inquiry_id uuid primary key references private.support_inquiries(id),
  address text not null unique check(length(address) between 3 and 254),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.support_inbound_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_email_id text not null unique check(length(provider_email_id) between 1 and 200),
  inquiry_id uuid references private.support_inquiries(id),
  recipient text not null,
  sender text not null,
  route_kind text not null check(route_kind in ('alias','base')),
  routing_ambiguous boolean not null default false,
  state text not null default 'pending' check(state in ('pending','leased','quarantined','failed','accepted','dismissed')),
  received_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  deadline_at timestamptz not null default pg_catalog.clock_timestamp()+interval '55 minutes',
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  generation integer not null default 1,
  lease_token uuid,
  lease_expires_at timestamptz,
  payload jsonb,
  reason text,
  participant_matches boolean not null default false,
  accept_allowed boolean not null default false,
  message_id uuid unique references private.support_messages(id),
  check((lease_token is null)=(lease_expires_at is null)),
  check((state='accepted')=(message_id is not null))
);
create index support_inbound_pending_idx on private.support_inbound_jobs(next_attempt_at,created_at,id)
  where state in ('pending','leased');
create index support_inbound_inquiry_idx on private.support_inbound_jobs(inquiry_id,state,created_at);
create table private.support_inbound_events (
  event_id text primary key check(length(event_id) between 1 and 200),
  provider_email_id text not null check(length(provider_email_id) between 1 and 200),
  job_id uuid references private.support_inbound_jobs(id),
  disposition text not null check(disposition in ('queued','duplicate','ignored','rate_limited')),
  received_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index support_inbound_events_provider_idx on private.support_inbound_events(provider_email_id);
create table private.support_inbound_routes (
  job_id uuid not null references private.support_inbound_jobs(id),
  inquiry_id uuid not null references private.support_inquiries(id),
  primary key(job_id,inquiry_id)
);
create index support_inbound_routes_inquiry_idx on private.support_inbound_routes(inquiry_id,job_id);
create table private.support_rfc_messages (
  rfc_message_id text primary key check(length(rfc_message_id) between 3 and 512),
  inquiry_id uuid not null references private.support_inquiries(id),
  provider_email_id text not null,
  email_intent_id uuid unique references private.email_intents(id),
  message_id uuid unique references private.support_messages(id),
  origin text not null check(origin in ('incoming','outgoing')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(origin,provider_email_id)
);
create table private.support_rfc_conflicts (
  email_intent_id uuid primary key references private.email_intents(id),
  reason text not null default 'message_id_conflict' check(reason='message_id_conflict'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.support_rfc_conflicts enable row level security;
alter table private.support_rfc_conflicts force row level security;
revoke all on private.support_rfc_conflicts from public,anon,authenticated,service_role;
grant select,insert on private.support_rfc_conflicts to service_role;
create index support_rfc_inquiry_idx on private.support_rfc_messages(inquiry_id,created_at desc);

alter table private.support_reply_routes enable row level security;
alter table private.support_reply_routes force row level security;
alter table private.support_inbound_jobs enable row level security;
alter table private.support_inbound_jobs force row level security;
alter table private.support_inbound_events enable row level security;
alter table private.support_inbound_events force row level security;
alter table private.support_inbound_routes enable row level security;
alter table private.support_inbound_routes force row level security;
alter table private.support_rfc_messages enable row level security;
alter table private.support_rfc_messages force row level security;
revoke all on private.support_reply_routes,private.support_inbound_jobs,private.support_inbound_events,
  private.support_rfc_messages,private.support_inbound_routes from public,anon,authenticated,service_role;
grant select,insert on private.support_reply_routes,private.support_inbound_events,private.support_rfc_messages,private.support_inbound_routes to service_role;
grant select,insert,update on private.support_inbound_jobs to service_role;
grant update(message_id) on private.support_rfc_messages to service_role;

alter table private.support_audit_events drop constraint support_audit_events_action_check;
alter table private.support_audit_events add constraint support_audit_events_action_check
  check(action in ('intake','save_draft','approve_reply','add_note','set_status','context_changed','inbound_accept','inbound_dismiss','inbound_retry','inbound_rate_limited'));

-- Every context change follows Inquiry -> intent, matching approval and preparation.
create function private.touch_support_context(p_inquiry_id uuid,p_action text default 'inbound') returns integer
language plpgsql security invoker set search_path='' as $$
declare v_revision integer;
begin
  perform 1 from private.support_inquiries where id=p_inquiry_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  perform private.invalidate_support_approval(p_inquiry_id);
  update private.support_inquiries set revision=revision+1,updated_at=pg_catalog.clock_timestamp(),
    status='open',closed_at=null where id=p_inquiry_id returning revision into v_revision;
  insert into private.support_audit_events(inquiry_id,action,inquiry_revision)
    values(p_inquiry_id,'context_changed',v_revision);
  return v_revision;
end $$;

create function public.read_support_receiving_control() returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('enabled',receiving_enabled,'updatedAt',updated_at)
  from private.support_controls where environment='sandbox';
$$;
create function public.configure_support_receiving(p_enabled boolean,p_expected_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if p_enabled is null or p_expected_updated_at is null then return false; end if;
  update private.support_controls set receiving_enabled=p_enabled,updated_at=pg_catalog.clock_timestamp()
    where environment='sandbox' and updated_at=p_expected_updated_at;
  return found;
end $$;

create function public.record_support_inbound(p_event_id text,p_provider_email_id text,p_sender text,
  p_recipients text[],p_received_at timestamptz,p_expected_address text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_inbound_jobs%rowtype; v_event private.support_inbound_events%rowtype;
  v_inquiry_id uuid; v_route_kind text; v_valid boolean; v_recipient text; v_route_count integer; v_route_ids uuid[]; v_route_id uuid;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 200
    or p_provider_email_id is null or length(p_provider_email_id) not between 1 and 200 then
    raise exception using errcode='22023',message='invalid_support_input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-inbound-event:'||p_event_id,0));
  select * into v_event from private.support_inbound_events where event_id=p_event_id;
  if found then return pg_catalog.jsonb_build_object('status','duplicate','id',v_event.job_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-inbound-email:'||p_provider_email_id,0));
  select * into v_job from private.support_inbound_jobs where provider_email_id=p_provider_email_id;
  if found then
    insert into private.support_inbound_events(event_id,provider_email_id,job_id,disposition)
      values(p_event_id,p_provider_email_id,v_job.id,'duplicate');
    return pg_catalog.jsonb_build_object('status','duplicate','id',v_job.id);
  end if;
  select * into v_event from private.support_inbound_events where provider_email_id=p_provider_email_id order by received_at,event_id limit 1;
  if found then
    insert into private.support_inbound_events(event_id,provider_email_id,job_id,disposition)
      values(p_event_id,p_provider_email_id,v_event.job_id,'duplicate');
    return pg_catalog.jsonb_build_object('status','duplicate','id',v_event.job_id);
  end if;
  perform 1 from private.support_controls where environment='sandbox' and receiving_enabled for share;
  if not found then raise exception using errcode='55000',message='support_unavailable'; end if;
  p_sender:=coalesce(lower(btrim(p_sender)),'');
  if length(p_sender)>254 then p_sender:=''; end if;
  v_valid:=p_recipients is not null and coalesce(pg_catalog.array_ndims(p_recipients),1)=1
    and pg_catalog.cardinality(p_recipients) between 0 and 100
    and p_received_at is not null and pg_catalog.isfinite(p_received_at);
  if v_valid then
    select count(*),array_agg(inquiry_id order by inquiry_id) into v_route_count,v_route_ids from private.support_reply_routes
      where address in (select lower(btrim(a)) from unnest(p_recipients) a);
    select inquiry_id,address into v_inquiry_id,v_recipient from private.support_reply_routes
      where address in (select lower(btrim(a)) from unnest(p_recipients) a) order by address limit 1;
    if found then v_route_kind:='alias';
    elsif p_expected_address in (select lower(btrim(a)) from unnest(p_recipients) a)
      and length(p_sender) between 3 and 254
      and p_sender ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then
      v_route_kind:='base'; v_recipient:=p_expected_address;
    end if;
  end if;
  if not v_valid or v_route_kind is null then
    insert into private.support_inbound_events(event_id,provider_email_id,disposition)
      values(p_event_id,p_provider_email_id,'ignored');
    return pg_catalog.jsonb_build_object('status','ignored');
  end if;
  -- One shared admission lock makes concurrent caps exact. Reviews only release capacity.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-inbound-admission',0));
  if (select count(*) from private.support_inbound_jobs where state not in ('accepted','dismissed'))>=100
    or exists(select 1 from private.support_inbound_routes r join private.support_inbound_jobs j on j.id=r.job_id
      where r.inquiry_id=any(v_route_ids) and j.state not in ('accepted','dismissed')
      group by r.inquiry_id having count(*)>=20) then
    insert into private.support_inbound_events(event_id,provider_email_id,disposition)
      values(p_event_id,p_provider_email_id,'rate_limited');
    -- Bounded metadata audit, with no new unresolved context or customer body.
    for v_route_id in select unnest(v_route_ids) order by 1 loop
      perform 1 from private.support_inquiries where id=v_route_id for update;
      insert into private.support_audit_events(inquiry_id,action,inquiry_revision)
        select id,'inbound_rate_limited',revision from private.support_inquiries where id=v_route_id;
    end loop;
    return pg_catalog.jsonb_build_object('status','rate_limited');
  end if;
  for v_route_id in select unnest(v_route_ids) order by 1 loop
    perform private.touch_support_context(v_route_id);
  end loop;
  insert into private.support_inbound_jobs(provider_email_id,inquiry_id,recipient,sender,route_kind,received_at,routing_ambiguous)
    values(p_provider_email_id,v_inquiry_id,v_recipient,p_sender,v_route_kind,p_received_at,
      coalesce(v_route_count>1,false)) returning * into v_job;
  insert into private.support_inbound_routes(job_id,inquiry_id)
    select v_job.id,unnest(v_route_ids);
  insert into private.support_inbound_events(event_id,provider_email_id,job_id,disposition)
    values(p_event_id,p_provider_email_id,v_job.id,'queued');
  return pg_catalog.jsonb_build_object('status','queued','id',v_job.id);
end $$;

create function public.claim_support_inbound(p_lease_token uuid,p_limit integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_jobs jsonb;
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 5 then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  -- Expired/exhausted jobs are still claimed once for a terminal, visible disposition.
  with candidates as (select id from private.support_inbound_jobs
    where next_attempt_at<=pg_catalog.clock_timestamp()
      and (state='pending' or (state='leased' and lease_expires_at<=pg_catalog.clock_timestamp()))
    order by next_attempt_at,created_at,id for update skip locked limit p_limit),
  claimed as (update private.support_inbound_jobs j set state='leased',lease_token=p_lease_token,
    lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes',
    attempt_count=least(attempt_count+1,5),updated_at=pg_catalog.clock_timestamp()
    from candidates c where j.id=c.id and j.next_attempt_at<=pg_catalog.clock_timestamp() returning j.*)
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'providerEmailId',provider_email_id,
    'inquiryId',inquiry_id,'leaseToken',lease_token,'deadlineAt',deadline_at,'attemptCount',attempt_count)),'[]'::jsonb)
    into v_jobs from claimed;
  return v_jobs;
end $$;

-- A provider ID is not an RFC Message-ID. This bridge requires a verified provider binding.
-- This RPC runs after the delivery callback transaction commits. The Inquiry lock
-- precedes the intent, including the implicit parent locks taken by foreign keys.
create function public.record_support_rfc_message(p_intent_id uuid,p_provider_email_id text,p_rfc_message_id text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_inquiry_id uuid;
begin
  if p_rfc_message_id is null or length(p_rfc_message_id)>512
    or p_rfc_message_id !~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$' then return false; end if;
  select (receipt->>'inquiryId')::uuid into v_inquiry_id from private.email_intents
    where id=p_intent_id and purpose in ('support_acknowledgement','support_reply');
  if v_inquiry_id is null then return false; end if;
  perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  select * into v_intent from private.email_intents where id=p_intent_id for update;
  if not found or v_intent.purpose not in ('support_acknowledgement','support_reply')
    or v_intent.provider_email_id is distinct from p_provider_email_id or p_provider_email_id is null
    or v_intent.first_attempt_at is null or v_intent.receipt is null then return false; end if;
  v_inquiry_id:=(v_intent.receipt->>'inquiryId')::uuid;
  insert into private.support_rfc_messages(rfc_message_id,inquiry_id,provider_email_id,email_intent_id,origin)
    values(p_rfc_message_id,v_inquiry_id,p_provider_email_id,p_intent_id,'outgoing') on conflict do nothing;
  if exists(select 1 from private.support_rfc_messages where rfc_message_id=p_rfc_message_id
    and email_intent_id=p_intent_id and provider_email_id=p_provider_email_id) then return true; end if;
  insert into private.support_rfc_conflicts(email_intent_id) values(p_intent_id) on conflict do nothing;
  return false;
end $$;
create function public.get_support_pending_rfc_messages(p_inquiry_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('intentId',e.id,'providerEmailId',e.provider_email_id)),
    '[]'::jsonb) from (select i.id,i.provider_email_id from private.email_intents i
      where i.purpose in ('support_acknowledgement','support_reply') and i.receipt->>'inquiryId'=p_inquiry_id::text
        and i.provider_email_id is not null and not exists(select 1 from private.support_rfc_messages r where r.email_intent_id=i.id)
      order by i.created_at desc limit 5) e;
$$;

-- Sanitized operational counts; never returns sender, recipient, body or provider payload.
create function public.inspect_support_ingress() returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'pendingJobs',(select count(*) from private.support_inbound_jobs where state not in ('accepted','dismissed')),
    'rateLimitedEvents',(select count(*) from private.support_inbound_events where disposition='rate_limited'),
    'rfcConflicts',(select count(*) from private.support_rfc_conflicts),
    'ignoredEvents',(select count(*) from private.support_inbound_events where disposition='ignored'));
$$;

-- Fixed, capability-bound admission identities remain after source object deletion.
create function private.valid_support_photo_manifest(p_manifest jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare v_item jsonb; v_total bigint:=0; v_ids uuid[]:='{}'; v_id uuid; v_size bigint;
begin
  if p_manifest is null or pg_catalog.jsonb_typeof(p_manifest)<>'array'
    or pg_catalog.jsonb_array_length(p_manifest)>5 then return false; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_manifest) loop
    if pg_catalog.jsonb_typeof(v_item)<>'object' or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_item))<>3
      or v_item->>'contentType' is null or v_item->>'contentType' not in ('image/jpeg','image/png','image/webp')
      or pg_catalog.jsonb_typeof(v_item->'uploadId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'contentType') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'byteSize') is distinct from 'number'
      or v_item->>'byteSize' !~ '^[1-9][0-9]*$' then return false; end if;
    v_id:=(v_item->>'uploadId')::uuid; v_size:=(v_item->>'byteSize')::bigint;
    if v_id is null or v_id=any(v_ids) or v_size not between 1 and 10485760 then return false; end if;
    v_ids:=pg_catalog.array_append(v_ids,v_id); v_total:=v_total+v_size;
  end loop;
  return v_total<=20971520;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

create table private.support_upload_batches (
  submission_id uuid primary key references private.support_intake_submissions(submission_id),
  inquiry_id uuid not null references private.support_inquiries(id),
  message_id uuid not null unique references private.support_messages(id),
  capability_hash text not null check(capability_hash ~ '^[0-9a-f]{64}$'),
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check(private.valid_support_photo_manifest(manifest)),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.support_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references private.support_inquiries(id),
  message_id uuid not null references private.support_messages(id),
  submission_id uuid references private.support_upload_batches(submission_id),
  upload_id uuid,
  source text not null check(source in ('upload','resend')),
  raw_path text,
  clean_path text not null unique,
  provider_email_id text,
  attachment_id text,
  expected_bytes bigint not null check(expected_bytes between 0 and 9007199254740991),
  expected_type text not null check(pg_catalog.length(expected_type) between 1 and 128),
  state text not null default 'pending' check(state in ('pending','processing','ready','rejected')),
  upload_completed boolean not null default false,
  upload_expires_at timestamptz,
  token_mint_deadline_at timestamptz,
  token_mint_count integer not null default 0 check(token_mint_count between 0 and 5),
  charged_bytes bigint check(charged_bytes between 1 and 10485760),
  clean_bytes bigint check(clean_bytes between 1 and 4194304),
  width integer check(width between 1 and 2560),
  height integer check(height between 1 and 2560),
  rejection_reason text check(rejection_reason in ('invalid_image','too_large','processing_timeout','storage_unavailable','expired')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  deadline_at timestamptz not null default pg_catalog.clock_timestamp()+interval '24 hours',
  lease_token uuid,
  lease_expires_at timestamptz,
  last_processing_until timestamptz,
  raw_delete_requested_at timestamptz,
  clean_delete_requested_at timestamptz,
  raw_deleted_at timestamptz,
  clean_deleted_at timestamptz,
  cleanup_lease_token uuid,
  cleanup_lease_expires_at timestamptz,
  cleanup_next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(message_id,upload_id),
  unique(provider_email_id,attachment_id),
  check ((source='upload' and submission_id is not null and upload_id is not null and raw_path is not null
    and provider_email_id is null and attachment_id is null)
    or (source='resend' and submission_id is null and upload_id is null and raw_path is null
      and provider_email_id is not null and attachment_id is not null and upload_completed)),
  check((lease_token is null)=(lease_expires_at is null)),
  check((cleanup_lease_token is null)=(cleanup_lease_expires_at is null)),
  check(state<>'ready' or (charged_bytes is not null and clean_bytes is not null and width is not null and height is not null)),
  check(state<>'rejected' or rejection_reason is not null),
  check((source='resend' and state='rejected') or
    (expected_bytes between 1 and 10485760 and expected_type in ('image/jpeg','image/png','image/webp')))
);
create index support_photos_active_upload_idx on private.support_photos(submission_id)
  where source='upload' and raw_deleted_at is null;
create index support_photos_upload_expiry_idx on private.support_photos(upload_expires_at,submission_id)
  where source='upload';
create index support_photos_message_idx on private.support_photos(message_id,created_at,id);
create index support_photos_inquiry_idx on private.support_photos(inquiry_id,state);
create index support_photos_pending_idx on private.support_photos(next_attempt_at,created_at,id) where state in ('pending','processing');
create index support_photos_cleanup_idx on private.support_photos(cleanup_next_attempt_at,created_at,id)
  where raw_path is not null or (state='rejected' and clean_deleted_at is null);
alter table private.support_upload_batches enable row level security;
alter table private.support_upload_batches force row level security;
alter table private.support_photos enable row level security;
alter table private.support_photos force row level security;
revoke all on private.support_upload_batches,private.support_photos from public,anon,authenticated,service_role;
grant select,insert on private.support_upload_batches to service_role;
grant select,insert,update on private.support_photos to service_role;

-- This lock is acquired only for a new nonempty upload batch. Retrying an accepted
-- submission reuses its original batch and cannot rebind either abuse identity.
create function private.limit_support_upload_batches() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz; v_source_count bigint; v_email_count bigint; v_global_count bigint;
begin
  if pg_catalog.jsonb_array_length(new.manifest)=0 then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-photo-admission',0));
  v_now:=pg_catalog.clock_timestamp();
  -- AFTER INSERT creates every fixed slot before this admission transaction commits.
  -- Count as-yet unseeded nonempty batches too, including earlier rows of a multirow INSERT.
  -- A consumed or cancelled slot remains charged until its raw cleanup is acknowledged,
  -- and even an acknowledged slot counts throughout the possible signed-upload lifetime.
  with active_batches as (
    select distinct b.submission_id,b.source_hash,b.email_hash
      from private.support_upload_batches b left join private.support_photos p on p.submission_id=b.submission_id
      where pg_catalog.jsonb_array_length(b.manifest)>0 and (p.id is null or (p.source='upload' and (p.raw_deleted_at is null
        or p.upload_expires_at>v_now-interval '5 minutes'
        or (p.upload_expires_at is null and b.created_at>v_now-interval '15 minutes'))))
  ) select pg_catalog.count(*) filter(where source_hash=new.source_hash),
      pg_catalog.count(*) filter(where email_hash=new.email_hash),pg_catalog.count(*)
    into v_source_count,v_email_count,v_global_count from active_batches;
  if v_source_count>=5 or v_email_count>=5 or v_global_count>=100 then
    raise exception using errcode='54000',message='rate_limited';
  end if;
  return new;
end $$;
create trigger limit_support_upload_batches before insert on private.support_upload_batches
  for each row execute function private.limit_support_upload_batches();

create function private.preserve_support_photo_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception using errcode='55000',message='support_photo_identity_immutable'; end if;
  if (new.id,new.inquiry_id,new.message_id,new.submission_id,new.upload_id,new.source,new.raw_path,new.clean_path,
    new.provider_email_id,new.attachment_id,new.expected_bytes,new.expected_type,new.created_at,new.deadline_at)
    is distinct from (old.id,old.inquiry_id,old.message_id,old.submission_id,old.upload_id,old.source,old.raw_path,old.clean_path,
      old.provider_email_id,old.attachment_id,old.expected_bytes,old.expected_type,old.created_at,old.deadline_at)
    or (old.charged_bytes is not null and new.charged_bytes is distinct from old.charged_bytes)
    or new.token_mint_count<old.token_mint_count or new.attempt_count<old.attempt_count
    or (old.upload_completed and not new.upload_completed)
    or (old.upload_expires_at is not null and (new.upload_expires_at is null or new.upload_expires_at<old.upload_expires_at))
    or (old.state in ('ready','rejected') and new.state<>old.state)
    or (old.raw_delete_requested_at is not null and new.raw_delete_requested_at is distinct from old.raw_delete_requested_at)
    or (old.clean_delete_requested_at is not null and new.clean_delete_requested_at is distinct from old.clean_delete_requested_at)
    or (old.raw_deleted_at is not null and new.raw_deleted_at is distinct from old.raw_deleted_at)
    or (old.clean_deleted_at is not null and new.clean_deleted_at is distinct from old.clean_deleted_at) then
    raise exception using errcode='55000',message='support_photo_identity_immutable';
  end if;
  return new;
end $$;
create trigger preserve_support_photo_identity before update or delete on private.support_photos
  for each row execute function private.preserve_support_photo_identity();

create function private.seed_support_upload_photos() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_item jsonb; v_id uuid;
begin
  perform 1 from private.support_inquiries where id=new.inquiry_id for update;
  if not exists(select 1 from private.support_intake_submissions where submission_id=new.submission_id and inquiry_id=new.inquiry_id)
    or not exists(select 1 from private.support_messages where id=new.message_id and inquiry_id=new.inquiry_id and kind='inbound')
    or exists(select 1 from private.support_photos where message_id=new.message_id) then
    raise exception using errcode='22023',message='invalid_photo_batch';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(new.manifest) loop
    v_id:=extensions.gen_random_uuid();
    insert into private.support_photos(id,inquiry_id,message_id,submission_id,upload_id,source,raw_path,clean_path,expected_bytes,expected_type)
      values(v_id,new.inquiry_id,new.message_id,new.submission_id,(v_item->>'uploadId')::uuid,'upload',
        'raw/'||new.inquiry_id::text||'/'||v_id::text,'clean/'||new.inquiry_id::text||'/'||v_id::text||'.webp',
        (v_item->>'byteSize')::bigint,v_item->>'contentType');
  end loop;
  if pg_catalog.jsonb_array_length(new.manifest)>0 then perform private.touch_support_context(new.inquiry_id,'photo'); end if;
  return new;
end $$;
create trigger seed_support_upload_photos after insert on private.support_upload_batches
  for each row execute function private.seed_support_upload_photos();

create function private.support_photo_projection(p_message_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'status',
    case when clean_delete_requested_at is not null and state='ready' then 'expired' else state end,
    'rejectionReason',rejection_reason) order by created_at,id),'[]'::jsonb)
  from private.support_photos where message_id=p_message_id;
$$;

create function public.reserve_support_photo_upload(p_submission_id uuid,p_capability_hash text,p_upload_id uuid,
  p_content_type text,p_byte_size bigint,p_source_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_batch private.support_upload_batches%rowtype; v_photo private.support_photos%rowtype; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$'
    or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='42501',message='photo_upload_unavailable'; end if;
  select * into v_batch from private.support_upload_batches where submission_id=p_submission_id and capability_hash=p_capability_hash
    and created_at>pg_catalog.clock_timestamp()-interval '24 hours';
  if not found then raise exception using errcode='42501',message='photo_upload_unavailable'; end if;
  perform 1 from private.support_inquiries where id=v_batch.inquiry_id for update;
  select * into v_photo from private.support_photos where submission_id=p_submission_id and upload_id=p_upload_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_photo.expected_type is distinct from p_content_type or v_photo.expected_bytes is distinct from p_byte_size
    or v_photo.state<>'pending' or v_photo.upload_completed or v_photo.raw_delete_requested_at is not null
    or v_now>=v_batch.created_at+interval '10 minutes' or v_photo.token_mint_count>=5 then
    raise exception using errcode='55000',message='photo_upload_unavailable';
  end if;
  update private.support_photos set upload_expires_at=v_now+interval '2 hours 2 minutes',
    token_mint_deadline_at=v_now+interval '30 seconds',token_mint_count=token_mint_count+1,updated_at=v_now
    where id=v_photo.id returning * into v_photo;
  return pg_catalog.jsonb_build_object('photoId',v_photo.id,'rawPath',v_photo.raw_path,
    'uploadExpiresAt',v_photo.upload_expires_at,'tokenMintDeadlineAt',v_photo.token_mint_deadline_at);
end $$;

create function public.complete_support_photo_upload(p_submission_id uuid,p_capability_hash text,p_photo_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_batch private.support_upload_batches%rowtype; v_photo private.support_photos%rowtype; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  select * into v_batch from private.support_upload_batches where submission_id=p_submission_id and capability_hash=p_capability_hash
    and created_at>pg_catalog.clock_timestamp()-interval '24 hours';
  if not found then return false; end if;
  perform 1 from private.support_inquiries where id=v_batch.inquiry_id for update;
  select * into v_photo from private.support_photos where id=p_photo_id and submission_id=p_submission_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if not found then return false; end if;
  if v_now>=v_batch.created_at+interval '24 hours' then return false; end if;
  if v_photo.upload_completed then return true; end if;
  if v_photo.state<>'pending' or v_photo.raw_delete_requested_at is not null or v_photo.upload_expires_at is null
    or v_now>=v_photo.upload_expires_at or v_now>=v_photo.deadline_at then return false; end if;
  update private.support_photos set upload_completed=true,next_attempt_at=v_now,updated_at=v_now where id=v_photo.id;
  perform private.touch_support_context(v_batch.inquiry_id,'photo');
  return true;
end $$;

create function public.read_support_photo_uploads(p_submission_id uuid,p_capability_hash text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from private.support_upload_batches where submission_id=p_submission_id and capability_hash=p_capability_hash
    and created_at>pg_catalog.clock_timestamp()-interval '24 hours') then
    raise exception using errcode='42501',message='photo_upload_unavailable'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'uploadId',upload_id,'status',state,
    'rejectionReason',rejection_reason) order by created_at,id),'[]'::jsonb) into v_result
    from private.support_photos where submission_id=p_submission_id;
  return v_result;
end $$;

create function private.create_support_inbound_photos(p_inquiry_id uuid,p_message_id uuid,p_provider_email_id text,
  p_attachments jsonb,p_deadline timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare v_item jsonb; v_id uuid; v_size bigint; v_total bigint:=0; v_count integer:=0;
  v_ids text[]:='{}'; v_reason text;
begin
  perform 1 from private.support_inquiries where id=p_inquiry_id for update;
  if p_provider_email_id is null or pg_catalog.length(p_provider_email_id) not between 1 and 200
    or p_deadline is null or not pg_catalog.isfinite(p_deadline)
    or p_attachments is null or pg_catalog.jsonb_typeof(p_attachments)<>'array'
    or not exists(select 1 from private.support_messages where id=p_message_id and inquiry_id=p_inquiry_id and kind='inbound') then
    raise exception using errcode='22023',message='invalid_support_photos'; end if;
  -- The parent accepted-message guard seals the provider manifest even when it is empty:
  -- accepted messages cannot be re-leased and accept_support_inbound returns when message_id exists.
  -- This row check additionally makes nonempty replays harmless.
  if exists(select 1 from private.support_photos where message_id=p_message_id) then return; end if;
  -- Safe email text survives unsupported files. Only the first five declared slots are retained;
  -- rejected metadata is never downloadable and never enters the processing queue.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_attachments) with ordinality as a(value,ordinal)
      order by ordinal limit 5 loop
    if pg_catalog.jsonb_typeof(v_item)<>'object' or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
      or pg_catalog.length(v_item->>'id') not between 1 and 200
      or pg_catalog.jsonb_typeof(v_item->'contentType') is distinct from 'string'
      or pg_catalog.length(v_item->>'contentType') not between 1 and 128
      or pg_catalog.jsonb_typeof(v_item->'size') is distinct from 'number'
      or v_item->>'size' !~ '^(0|[1-9][0-9]{0,15})$' then
      raise exception using errcode='22023',message='invalid_support_photos'; end if;
    v_size:=(v_item->>'size')::bigint;
    if v_size>9007199254740991 then raise exception using errcode='22023',message='invalid_support_photos'; end if;
    if (v_item->>'id')=any(v_ids) then continue; end if;
    v_ids:=pg_catalog.array_append(v_ids,v_item->>'id');
    v_reason:=case when v_size=0 or v_item->>'contentType' not in ('image/jpeg','image/png','image/webp') then 'invalid_image'
      when v_size>10485760 or v_total+v_size>20971520 then 'too_large' else null end;
    if v_reason is null then v_total:=v_total+v_size; end if;
    v_id:=extensions.gen_random_uuid();
    insert into private.support_photos(id,inquiry_id,message_id,source,clean_path,provider_email_id,attachment_id,
      expected_bytes,expected_type,upload_completed,deadline_at,state,rejection_reason)
      values(v_id,p_inquiry_id,p_message_id,'resend','clean/'||p_inquiry_id::text||'/'||v_id::text||'.webp',
        p_provider_email_id,v_item->>'id',v_size,v_item->>'contentType',true,
        least(p_deadline,pg_catalog.clock_timestamp()+interval '24 hours'),
        case when v_reason is null then 'pending' else 'rejected' end,v_reason);
    v_count:=v_count+1;
  end loop;
  if v_count>0 then perform private.touch_support_context(p_inquiry_id,'photo'); end if;
end $$;

create function public.claim_support_photos(p_lease_token uuid,p_limit integer default 5,p_allow_received boolean default true) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_photo private.support_photos%rowtype; v_result jsonb:='[]'; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 5 or p_allow_received is null then
    raise exception using errcode='22023',message='invalid_photo_claim'; end if;
  -- Lock Inquiry before photo; every pass touches at most p_limit rows.
  for v_candidate in select p.id,p.inquiry_id from private.support_photos p
      where p.state in ('pending','processing') and (p.lease_expires_at is null or p.lease_expires_at<=v_now)
        and (p.deadline_at<=v_now or p.attempt_count>=5 or (not p.upload_completed and
          coalesce(p.upload_expires_at,p.created_at+interval '10 minutes')+interval '5 minutes'<=v_now))
      order by p.created_at,p.id limit p_limit loop
    perform 1 from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found then continue; end if;
    select * into v_photo from private.support_photos where id=v_candidate.id for update skip locked;
    v_now:=pg_catalog.clock_timestamp();
    if not found or v_photo.state not in ('pending','processing') or v_photo.lease_expires_at>v_now then continue; end if;
    if v_photo.deadline_at>v_now and v_photo.attempt_count<5 and (v_photo.upload_completed or
      coalesce(v_photo.upload_expires_at,v_photo.created_at+interval '10 minutes')+interval '5 minutes'>v_now) then continue; end if;
    update private.support_photos set state='rejected',rejection_reason='expired',lease_token=null,lease_expires_at=null,
      updated_at=v_now where id=v_photo.id;
    perform private.touch_support_context(v_photo.inquiry_id,'photo');
  end loop;
  for v_candidate in select p.id,p.inquiry_id from private.support_photos p
      where p.state in ('pending','processing') and (p_allow_received or p.source='upload')
        and p.upload_completed and p.next_attempt_at<=v_now and p.deadline_at>v_now
        and p.attempt_count<5 and (p.lease_expires_at is null or p.lease_expires_at<=v_now)
      order by p.next_attempt_at,p.created_at,p.id limit p_limit loop
    perform 1 from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found then continue; end if;
    select * into v_photo from private.support_photos where id=v_candidate.id for update skip locked;
    v_now:=pg_catalog.clock_timestamp();
    if not found or v_photo.state not in ('pending','processing') or (not p_allow_received and v_photo.source='resend')
      or not v_photo.upload_completed or v_photo.next_attempt_at>v_now
      or v_photo.deadline_at<=v_now or v_photo.attempt_count>=5 or v_photo.lease_expires_at>v_now then continue; end if;
    update private.support_photos set state='processing',lease_token=p_lease_token,
      lease_expires_at=least(v_now+interval '5 minutes',deadline_at),last_processing_until=least(v_now+interval '5 minutes',deadline_at),
      attempt_count=attempt_count+1,updated_at=v_now where id=v_photo.id returning * into v_photo;
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_photo.id,
      'inquiryId',v_photo.inquiry_id,'messageId',v_photo.message_id,'source',case when v_photo.source='upload' then
        pg_catalog.jsonb_build_object('kind','upload','path',v_photo.raw_path) else
        pg_catalog.jsonb_build_object('kind','resend','emailId',v_photo.provider_email_id,'attachmentId',v_photo.attachment_id) end,
      'cleanPath',v_photo.clean_path,'leaseToken',p_lease_token,'deadlineAt',v_photo.lease_expires_at));
  end loop;
  return v_result;
end $$;

create function public.admit_support_photo_size(p_id uuid,p_lease_token uuid,p_actual_bytes bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare v_inquiry_id uuid; v_photo private.support_photos%rowtype; v_total bigint;
  v_now timestamptz:=pg_catalog.clock_timestamp(); v_rejection_reason text;
begin
  select inquiry_id into v_inquiry_id from private.support_photos where id=p_id;
  if not found then return 'stale'; end if;
  perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  select * into v_photo from private.support_photos where id=p_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if p_lease_token is null or v_photo.state<>'processing' or v_photo.lease_token is null
    or v_photo.lease_expires_at is null or v_photo.lease_token is distinct from p_lease_token
    or v_photo.lease_expires_at<=v_now or v_photo.deadline_at<=v_now then return 'stale'; end if;
  if p_actual_bytes is null or p_actual_bytes not between 1 and 10485760 then
    v_rejection_reason:='too_large';
  elsif v_photo.charged_bytes is not null then
    if v_photo.charged_bytes=p_actual_bytes then return 'accepted'; end if;
    v_rejection_reason:='invalid_image';
  else
    select coalesce(pg_catalog.sum(charged_bytes),0) into v_total from private.support_photos where message_id=v_photo.message_id;
    if v_total+p_actual_bytes>20971520 then v_rejection_reason:='too_large'; end if;
  end if;
  if v_rejection_reason is not null then
    -- The rejection and lease release commit together, retaining any prior byte charge.
    update private.support_photos set state='rejected',rejection_reason=v_rejection_reason,
      lease_token=null,lease_expires_at=null,updated_at=v_now where id=p_id;
    perform private.touch_support_context(v_inquiry_id,'photo');
    return 'rejected';
  end if;
  update private.support_photos set charged_bytes=p_actual_bytes,updated_at=v_now where id=p_id;
  perform private.touch_support_context(v_inquiry_id,'photo');
  return 'accepted';
end $$;

create function public.finish_support_photo(p_id uuid,p_lease_token uuid,p_outcome text,p_bytes bigint,
  p_width integer,p_height integer,p_error_code text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_inquiry_id uuid; v_photo private.support_photos%rowtype; v_now timestamptz:=pg_catalog.clock_timestamp(); v_state text;
begin
  if p_outcome is null or p_outcome not in ('ready','retry','rejected') then return false; end if;
  select inquiry_id into v_inquiry_id from private.support_photos where id=p_id;
  if not found then return false; end if;
  perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  select * into v_photo from private.support_photos where id=p_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if p_lease_token is null or v_photo.state<>'processing' or v_photo.lease_token is null or v_photo.lease_expires_at is null or v_photo.lease_token is distinct from p_lease_token
    or v_photo.lease_expires_at<=v_now or v_photo.deadline_at<=v_now then return false; end if;
  if p_outcome='ready' then
    if v_photo.charged_bytes is null or p_bytes is null or p_bytes not between 1 and 4194304
      or p_width is null or p_width not between 1 and 2560 or p_height is null or p_height not between 1 and 2560 then return false; end if;
    update private.support_photos set state='ready',clean_bytes=p_bytes,width=p_width,height=p_height,rejection_reason=null,
      lease_token=null,lease_expires_at=null,updated_at=v_now where id=p_id;
  else
    if p_error_code is null or p_error_code not in ('invalid_image','too_large','processing_timeout','storage_unavailable','expired') then return false; end if;
    v_state:=case when p_outcome='retry' and v_photo.attempt_count<5 then 'pending' else 'rejected' end;
    update private.support_photos set state=v_state,rejection_reason=case when v_state='rejected' then p_error_code else null end,
      next_attempt_at=v_now+interval '30 seconds'*pg_catalog.power(2,v_photo.attempt_count-1),lease_token=null,lease_expires_at=null,
      updated_at=v_now where id=p_id;
  end if;
  perform private.touch_support_context(v_inquiry_id,'photo');
  return true;
end $$;

create function public.get_support_photo(p_actor_id uuid,p_inquiry_id uuid,p_photo_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  perform private.require_support_admin(p_actor_id);
  select pg_catalog.jsonb_build_object('path',clean_path,'mediaType','image/webp') into v_result
    from private.support_photos where id=p_photo_id and inquiry_id=p_inquiry_id and state='ready'
      and clean_delete_requested_at is null and clean_deleted_at is null;
  return v_result;
end $$;

create function public.claim_support_photo_cleanup(p_lease_token uuid,p_limit integer default 5) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_photo private.support_photos%rowtype; v_result jsonb:='[]';
  v_now timestamptz:=pg_catalog.clock_timestamp(); v_raw boolean; v_clean boolean;
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 5 then
    raise exception using errcode='22023',message='invalid_photo_claim'; end if;
  for v_candidate in select p.id,p.inquiry_id from private.support_photos p
      where p.state in ('ready','rejected') and p.cleanup_next_attempt_at<=v_now
        and (p.cleanup_lease_expires_at is null or p.cleanup_lease_expires_at<=v_now)
        and coalesce(p.last_processing_until,p.created_at)+interval '5 minutes'<=v_now
        and ((p.raw_path is not null
          and coalesce(p.upload_expires_at,p.created_at+interval '10 minutes')+interval '5 minutes'<=v_now)
          or (p.state='rejected' and p.clean_deleted_at is null))
      order by p.cleanup_next_attempt_at,p.created_at,p.id limit p_limit loop
    perform 1 from private.support_inquiries where id=v_candidate.inquiry_id for update skip locked;
    if not found then continue; end if;
    select * into v_photo from private.support_photos where id=v_candidate.id for update skip locked;
    v_now:=pg_catalog.clock_timestamp();
    if not found or v_photo.state not in ('ready','rejected') or v_photo.cleanup_next_attempt_at>v_now
      or v_photo.cleanup_lease_expires_at>v_now or coalesce(v_photo.last_processing_until,v_photo.created_at)+interval '5 minutes'>v_now then continue; end if;
    v_raw:=v_photo.raw_path is not null
      and coalesce(v_photo.upload_expires_at,v_photo.created_at+interval '10 minutes')+interval '5 minutes'<=v_now;
    v_clean:=v_photo.state='rejected' and v_photo.clean_deleted_at is null;
    if not v_raw and not v_clean then continue; end if;
    -- The persisted tombstone always precedes object deletion; identities are never removed.
    -- Raw paths are swept again daily after acknowledgement to catch uploads that finished
    -- after an earlier deletion. The first deletion timestamp remains the quota boundary.
    update private.support_photos set raw_delete_requested_at=case when v_raw then coalesce(raw_delete_requested_at,v_now) else raw_delete_requested_at end,
      clean_delete_requested_at=case when v_clean then coalesce(clean_delete_requested_at,v_now) else clean_delete_requested_at end,
      cleanup_lease_token=p_lease_token,cleanup_lease_expires_at=v_now+interval '5 minutes',updated_at=v_now where id=v_photo.id;
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_photo.id,
      'rawPath',case when v_raw then v_photo.raw_path end,'cleanPath',case when v_clean then v_photo.clean_path end,'leaseToken',p_lease_token));
  end loop;
  return v_result;
end $$;

create function public.finish_support_photo_cleanup(p_id uuid,p_lease_token uuid,p_outcome text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_inquiry_id uuid; v_photo private.support_photos%rowtype; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_outcome is null or p_outcome not in ('done','retry') then return false; end if;
  select inquiry_id into v_inquiry_id from private.support_photos where id=p_id;
  if not found then return false; end if;
  perform 1 from private.support_inquiries where id=v_inquiry_id for update;
  select * into v_photo from private.support_photos where id=p_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if p_lease_token is null or v_photo.cleanup_lease_token is null or v_photo.cleanup_lease_expires_at is null
    or v_photo.cleanup_lease_token is distinct from p_lease_token or v_photo.cleanup_lease_expires_at<=v_now then return false; end if;
  update private.support_photos set raw_deleted_at=case when p_outcome='done' and raw_delete_requested_at is not null then coalesce(raw_deleted_at,v_now) else raw_deleted_at end,
    clean_deleted_at=case when p_outcome='done' and clean_delete_requested_at is not null then coalesce(clean_deleted_at,v_now) else clean_deleted_at end,
    cleanup_lease_token=null,cleanup_lease_expires_at=null,
    cleanup_next_attempt_at=v_now+case when p_outcome='done' and raw_path is not null and raw_delete_requested_at is not null
      then interval '1 day' else interval '5 minutes' end,updated_at=v_now where id=p_id;
  return true;
end $$;

revoke all on function private.valid_support_photo_manifest(jsonb),private.limit_support_upload_batches(),private.preserve_support_photo_identity(),
  private.seed_support_upload_photos(),private.support_photo_projection(uuid),
  private.create_support_inbound_photos(uuid,uuid,text,jsonb,timestamptz),
  public.reserve_support_photo_upload(uuid,text,uuid,text,bigint,text),public.complete_support_photo_upload(uuid,text,uuid),
  public.read_support_photo_uploads(uuid,text),public.claim_support_photos(uuid,integer,boolean),public.admit_support_photo_size(uuid,uuid,bigint),
  public.finish_support_photo(uuid,uuid,text,bigint,integer,integer,text),public.get_support_photo(uuid,uuid,uuid),
  public.claim_support_photo_cleanup(uuid,integer),public.finish_support_photo_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.valid_support_photo_manifest(jsonb),private.limit_support_upload_batches(),private.preserve_support_photo_identity(),
  private.seed_support_upload_photos(),private.support_photo_projection(uuid),
  private.create_support_inbound_photos(uuid,uuid,text,jsonb,timestamptz),
  public.reserve_support_photo_upload(uuid,text,uuid,text,bigint,text),public.complete_support_photo_upload(uuid,text,uuid),
  public.read_support_photo_uploads(uuid,text),public.claim_support_photos(uuid,integer,boolean),public.admit_support_photo_size(uuid,uuid,bigint),
  public.finish_support_photo(uuid,uuid,text,bigint,integer,integer,text),public.get_support_photo(uuid,uuid,uuid),
  public.claim_support_photo_cleanup(uuid,integer),public.finish_support_photo_cleanup(uuid,uuid,text) to service_role;

create function private.support_pending_context(p_inquiry_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
  select (select count(*) from private.support_inbound_jobs where id in (select job_id from private.support_inbound_routes where inquiry_id=p_inquiry_id)
    and state not in ('accepted','dismissed'))::integer
    +(select count(*) from private.support_photos where inquiry_id=p_inquiry_id and state in ('pending','processing'))::integer;
$$;

-- All related Inquiries are locked in UUID order before the job or any intent.
create function private.lock_support_inbound_inquiries(p_job_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  for v_id in select inquiry_id from private.support_inbound_routes where job_id=p_job_id order by inquiry_id loop
    perform 1 from private.support_inquiries where id=v_id for update;
  end loop;
end $$;
create function private.touch_support_inbound_inquiries(p_job_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  for v_id in select inquiry_id from private.support_inbound_routes where job_id=p_job_id order by inquiry_id loop
    perform private.touch_support_context(v_id);
  end loop;
end $$;

-- The caller holds the Inquiry, then the inbound job. No accepted message can be created twice.
create function private.accept_support_inbound(p_job private.support_inbound_jobs) returns void
language plpgsql security invoker set search_path='' as $$
declare v_message_id uuid:=extensions.gen_random_uuid(); v_rfc text;
begin
  if p_job.message_id is not null then return; end if;
  v_rfc:=nullif(p_job.payload->>'rfcMessageId','');
  if v_rfc is not null then
    -- Reserve the global RFC identity before inserting a message. A concurrent loser
    -- becomes reviewable, never a second accepted message lacking its RFC history.
    insert into private.support_rfc_messages(rfc_message_id,inquiry_id,provider_email_id,origin)
      values(v_rfc,p_job.inquiry_id,p_job.provider_email_id,'incoming') on conflict do nothing;
    if not found then
      update private.support_inbound_jobs set state='quarantined',reason='message_id_conflict',
        accept_allowed=false,lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_job.id;
      perform private.touch_support_inbound_inquiries(p_job.id);
      return;
    end if;
  end if;
  insert into private.support_messages(id,inquiry_id,kind,subject,body)
    values(v_message_id,p_job.inquiry_id,'inbound',p_job.payload->>'subject',p_job.payload->>'body');
  if v_rfc is not null then
    update private.support_rfc_messages set message_id=v_message_id where rfc_message_id=v_rfc;
  end if;
  perform private.create_support_inbound_photos(p_job.inquiry_id,v_message_id,p_job.provider_email_id,
    p_job.payload->'attachments',pg_catalog.clock_timestamp()+interval '55 minutes');
  update private.support_inbound_jobs set state='accepted',message_id=v_message_id,
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_job.id;
  perform private.touch_support_inbound_inquiries(p_job.id);
end $$;

create function public.finish_support_inbound(p_id uuid,p_lease_token uuid,p_email jsonb,
  p_error_code text default null,p_retryable boolean default false) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_job private.support_inbound_jobs%rowtype; v_inquiry_id uuid; v_inquiry private.support_inquiries%rowtype;
  v_reason text; v_refs jsonb; v_rfc text; v_participant boolean; v_accept boolean; v_attachment jsonb;
begin
  -- Existing Inquiry lock always precedes the job and any invalidated email intent.
  perform private.lock_support_inbound_inquiries(p_id);
  select * into v_job from private.support_inbound_jobs where id=p_id for update;
  if not found or v_job.state<>'leased' or p_lease_token is null or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at<=pg_catalog.clock_timestamp() then return false; end if;
  if p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  if v_job.deadline_at<=pg_catalog.clock_timestamp() then p_email:=null; p_error_code:='fetch_expired'; p_retryable:=false; end if;
  if p_email is null and p_retryable and v_job.attempt_count<5 and v_job.deadline_at>pg_catalog.clock_timestamp() then
    update private.support_inbound_jobs set state='pending',reason=coalesce(p_error_code,'fetch_failed'),
      next_attempt_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>60*v_job.attempt_count),
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return true;
  end if;
  if p_email is not null then
    if jsonb_typeof(p_email)<>'object' or p_email->>'providerEmailId' is distinct from v_job.provider_email_id
      or p_email-array['providerEmailId','rfcMessageId','from','to','subject','body','inReplyTo','references','quarantineReason','attachments']<>'{}'::jsonb
      or jsonb_typeof(p_email->'subject') is distinct from 'string' or length(p_email->>'subject') not between 1 and 200
      or p_email->>'subject' ~ '[[:cntrl:]]'
      or jsonb_typeof(p_email->'body') is distinct from 'string' or length(p_email->>'body') not between 1 and 10000
      or pg_catalog.translate(p_email->>'body',E'\n\r\t','') ~ '[[:cntrl:]]'
      or jsonb_typeof(p_email->'to') is distinct from 'array' or jsonb_array_length(p_email->'to')>100
      or jsonb_typeof(p_email->'references') is distinct from 'array' or jsonb_array_length(p_email->'references')>20
      or jsonb_typeof(p_email->'attachments') is distinct from 'array' or jsonb_array_length(p_email->'attachments')>5
    then raise exception using errcode='22023',message='invalid_support_input'; end if;
    v_rfc:=nullif(p_email->>'rfcMessageId','');
    v_refs:=p_email->'references';
    if p_email->>'inReplyTo' is not null then v_refs:=v_refs||pg_catalog.jsonb_build_array(p_email->>'inReplyTo'); end if;
    if v_rfc is not null and (length(v_rfc)>512 or v_rfc !~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$') then
      v_rfc:=null;
      p_email:=p_email||pg_catalog.jsonb_build_object('rfcMessageId','',
        'quarantineReason',coalesce(p_email->>'quarantineReason','invalid_history'));
    end if;
    if exists(select 1 from jsonb_array_elements(v_refs) r where jsonb_typeof(r)<>'string'
      or length(r#>>'{}')>512 or r#>>'{}' !~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$') then
      v_refs:='[]'::jsonb;
      p_email:=p_email||pg_catalog.jsonb_build_object('references',v_refs,'inReplyTo',null,
        'quarantineReason',coalesce(p_email->>'quarantineReason','invalid_history'));
    end if;
    for v_attachment in select value from jsonb_array_elements(p_email->'attachments') loop
      if jsonb_typeof(v_attachment)<>'object' or v_attachment-array['id','contentType','size']<>'{}'::jsonb
        or jsonb_typeof(v_attachment->'id') is distinct from 'string' or length(v_attachment->>'id') not between 1 and 200
        or jsonb_typeof(v_attachment->'contentType') is distinct from 'string' or length(v_attachment->>'contentType')>128
        or v_attachment->>'size' is null or v_attachment->>'size' !~ '^[0-9]{1,16}$' then
        raise exception using errcode='22023',message='invalid_support_input'; end if;
    end loop;
    v_reason:=p_email->>'quarantineReason';
    if v_job.routing_ambiguous then v_reason:='ambiguous_recipients'; end if;
    if jsonb_array_length(p_email->'to')<>1 then v_reason:='ambiguous_recipients'; end if;
    if v_reason is not null and v_reason !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception using errcode='22023',message='invalid_support_input'; end if;
    if lower(p_email->>'from') is distinct from v_job.sender or not (p_email->'to' ? v_job.recipient) then
      v_reason:='envelope_mismatch';
    end if;
  end if;
  if v_job.inquiry_id is null then
    -- Root mail is reviewable without linking it to an existing Customer or Order.
    insert into private.support_inquiries(name,email,inquiry_type,subject)
      values('Email sender',v_job.sender,'general',coalesce(p_email->>'subject','Incoming email requires review'))
      returning id into v_job.inquiry_id;
    update private.support_inbound_jobs set inquiry_id=v_job.inquiry_id where id=p_id;
    insert into private.support_inbound_routes(job_id,inquiry_id) values(p_id,v_job.inquiry_id);
    insert into private.support_reply_routes(inquiry_id,address) values(v_job.inquiry_id,
      'reply-'||pg_catalog.encode(extensions.gen_random_bytes(24),'hex')||'@'||split_part(v_job.recipient,'@',2));
  end if;
  select * into v_inquiry from private.support_inquiries where id=v_job.inquiry_id for update;
  if p_email is null then
    update private.support_inbound_jobs set state='failed',reason=coalesce(p_error_code,'fetch_failed'),
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    perform private.touch_support_inbound_inquiries(v_job.id);
    return true;
  end if;
  v_participant:=lower(p_email->>'from')=v_inquiry.email and v_reason is distinct from 'envelope_mismatch';
  if not v_participant then v_reason:='sender_mismatch'; end if;
  if v_rfc is not null and exists(select 1 from private.support_rfc_messages where rfc_message_id=v_rfc
    and provider_email_id<>v_job.provider_email_id) then v_reason:='message_id_conflict'; end if;
  if v_reason is null then
    if v_job.route_kind='base' then v_reason:='uncorrelated';
    elsif exists(select 1 from private.support_rfc_messages r where v_refs ? r.rfc_message_id and r.inquiry_id<>v_job.inquiry_id) then
      v_reason:='ambiguous_history';
    elsif not exists(select 1 from private.support_rfc_messages r where v_refs ? r.rfc_message_id and r.inquiry_id=v_job.inquiry_id) then
      if jsonb_array_length(public.get_support_pending_rfc_messages(v_job.inquiry_id))>0
        and v_job.attempt_count<5 and v_job.deadline_at>pg_catalog.clock_timestamp() then
        update private.support_inbound_jobs set state='pending',reason='history_pending',
          next_attempt_at=pg_catalog.clock_timestamp()+interval '1 minute',lease_token=null,lease_expires_at=null,
          updated_at=pg_catalog.clock_timestamp() where id=p_id;
        return true;
      end if;
      v_reason:='unknown_history';
    end if;
  end if;
  v_accept:=v_participant and not v_job.routing_ambiguous
    and jsonb_array_length(p_email->'to')=1 and (p_email->'to' ? v_job.recipient) and (v_reason is null or v_reason in ('uncorrelated','unknown_history','ambiguous_history',
    'forwarded_message','body_truncated','attachment_limits_exceeded','invalid_history','authentication_unknown'));
  update private.support_inbound_jobs set payload=p_email,reason=v_reason,participant_matches=v_participant,
    accept_allowed=v_accept,state='quarantined',lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
    where id=p_id returning * into v_job;
  if v_reason is null then perform private.accept_support_inbound(v_job);
  else perform private.touch_support_inbound_inquiries(v_job.id); end if;
  return true;
end $$;

create function public.review_support_inbound(p_actor_id uuid,p_inquiry_id uuid,p_expected_revision integer,
  p_inbound_id uuid,p_action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_inquiry private.support_inquiries%rowtype; v_job private.support_inbound_jobs%rowtype;
begin
  perform private.require_support_admin(p_actor_id);
  if not exists(select 1 from private.support_inbound_routes where job_id=p_inbound_id and inquiry_id=p_inquiry_id) then
    raise exception using errcode='P0002',message='not_found'; end if;
  perform private.lock_support_inbound_inquiries(p_inbound_id);
  select * into v_inquiry from private.support_inquiries where id=p_inquiry_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  if p_expected_revision is distinct from v_inquiry.revision then
    raise exception using errcode='40001',message='stale_inquiry'; end if;
  select * into v_job from private.support_inbound_jobs where id=p_inbound_id for update;
  if not found then raise exception using errcode='P0002',message='not_found'; end if;
  if p_action='accept' and v_job.state='quarantined' and v_job.accept_allowed and v_job.payload is not null then
    perform private.accept_support_inbound(v_job);
  elsif p_action='dismiss' and v_job.state in ('quarantined','failed') then
    update private.support_inbound_jobs set state='dismissed',updated_at=pg_catalog.clock_timestamp() where id=p_inbound_id;
    perform private.touch_support_inbound_inquiries(p_inbound_id);
  elsif p_action='retry' and v_job.state='failed' then
    update private.support_inbound_jobs set state='pending',attempt_count=0,generation=generation+1,
      deadline_at=pg_catalog.clock_timestamp()+interval '55 minutes',next_attempt_at=pg_catalog.clock_timestamp(),
      updated_at=pg_catalog.clock_timestamp() where id=p_inbound_id;
    perform private.touch_support_inbound_inquiries(p_inbound_id);
  else raise exception using errcode='22023',message='invalid_support_input'; end if;
  insert into private.support_audit_events(inquiry_id,action,actor_id,inquiry_revision)
    select p_inquiry_id,'inbound_'||p_action,p_actor_id,revision from private.support_inquiries where id=p_inquiry_id;
  return public.get_support_inquiry(p_actor_id,p_inquiry_id);
end $$;

create function public.submit_support_inquiry(
  p_submission_id uuid,p_abuse_key text,p_email_abuse_key text,p_name text,p_email text,
  p_inquiry_type text,p_subject text,p_body text,p_order_id uuid,
  p_upload_capability_hash text,p_photo_manifest jsonb,p_reply_domain text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_id uuid;
  v_message_id uuid;
  v_reply_address text;
  v_ack_receipt jsonb;
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
  if (p_upload_capability_hash is not null and p_upload_capability_hash !~ '^[0-9a-f]{64}$')
    or (p_upload_capability_hash is null and p_photo_manifest is distinct from '[]'::jsonb)
    or p_photo_manifest is null or jsonb_typeof(p_photo_manifest)<>'array' or jsonb_array_length(p_photo_manifest)>5
    or (p_reply_domain is not null and (length(p_reply_domain)>190
      or p_reply_domain !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$')) then
    raise exception using errcode='22023',message='invalid_support_input'; end if;
  -- Logical submission identity survives network changes; source HMACs only bound abuse.
  -- Exact canonical payload equality is required before returning the existing result.
  -- Server-owned HMAC keys contain neither the source IP nor an email address.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-submission:'||p_submission_id::text,0));
  v_hash:=pg_catalog.encode(extensions.digest((case when p_upload_capability_hash is null then pg_catalog.jsonb_build_array(p_name,p_email,p_inquiry_type,p_subject,p_body,p_order_id) else pg_catalog.jsonb_build_array(p_name,p_email,p_inquiry_type,p_subject,p_body,p_order_id,p_upload_capability_hash,p_photo_manifest) end)::text,'sha256'),'hex');
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
    values(v_id,'inbound',p_subject,p_body) returning id into v_message_id;
  if p_reply_domain is not null then
    v_reply_address:='reply-'||pg_catalog.encode(extensions.gen_random_bytes(24),'hex')||'@'||p_reply_domain;
    insert into private.support_reply_routes(inquiry_id,address) values(v_id,v_reply_address);
  end if;
  v_ack_receipt:=pg_catalog.jsonb_build_object('renderVersion','support-ack-v1','inquiryId',v_id,
    'subject',v_ack_subject,'body',v_ack_body,'html',private.support_plain_html(v_ack_body),'attachments','[]'::jsonb);
  if v_reply_address is not null then v_ack_receipt:=v_ack_receipt||pg_catalog.jsonb_build_object(
    'renderVersion','support-ack-v2','replyTo',v_reply_address,'headers','{}'::jsonb); end if;
  insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key)
    values('sandbox','support_acknowledgement',p_email,v_ack_receipt,
      'queued','sandbox/support_acknowledgement/'||v_id::text);
  insert into private.support_intake_submissions(abuse_key,submission_id,payload_hash,inquiry_id)
    values(p_abuse_key,p_submission_id,v_hash,v_id);
  if p_upload_capability_hash is not null then
    insert into private.support_upload_batches(submission_id,inquiry_id,message_id,capability_hash,manifest,source_hash,email_hash)
      values(p_submission_id,v_id,v_message_id,p_upload_capability_hash,p_photo_manifest,p_abuse_key,p_email_abuse_key);
  end if;
  insert into private.support_audit_events(inquiry_id,action,inquiry_revision) values(v_id,'intake',1);
  return pg_catalog.jsonb_build_object('inquiryId',v_id);
end $$;

create function private.support_reply_receipt(p_inquiry private.support_inquiries,p_draft private.support_drafts,p_message_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_receipt jsonb; v_address text; v_parent text;
begin
  v_receipt:=pg_catalog.jsonb_build_object('renderVersion','support-text-v1','inquiryId',p_inquiry.id,'messageId',p_message_id,
    'inquiryRevision',p_inquiry.revision,'draftVersion',p_draft.version,'subject',p_draft.subject,
    'body',p_draft.body,'html',private.support_plain_html(p_draft.body),'attachments','[]'::jsonb);
  select address into v_address from private.support_reply_routes where inquiry_id=p_inquiry.id;
  if v_address is not null then
    select rfc_message_id into v_parent from private.support_rfc_messages
      where inquiry_id=p_inquiry.id and origin='incoming' order by created_at desc,rfc_message_id desc limit 1;
    v_receipt:=v_receipt||pg_catalog.jsonb_build_object('renderVersion','support-text-v2','replyTo',v_address,
      'headers',case when v_parent is null then '{}'::jsonb else pg_catalog.jsonb_build_object(
        'In-Reply-To',v_parent,'References',v_parent) end);
  end if;
  return v_receipt;
end $$;

create or replace function public.mutate_support_inquiry(
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
  if p_action='approve_reply' and private.support_pending_context(p_inquiry_id)>0 then
    raise exception using errcode='55000',message='pending_support_context'; end if;
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
      values(v_intent_id,'sandbox','support_reply',v_draft.recipient,private.support_reply_receipt(v_inquiry,v_draft,v_message_id),
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
create or replace function private.support_inquiry_summary(p_inquiry private.support_inquiries) returns jsonb
language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p_inquiry.id,'revision',p_inquiry.revision,
    'status',p_inquiry.status,'inquiryType',p_inquiry.inquiry_type,'name',p_inquiry.name,'email',p_inquiry.email,
    'subject',p_inquiry.subject,'createdAt',p_inquiry.created_at,'updatedAt',p_inquiry.updated_at,
    'pendingInbound',private.support_pending_context(p_inquiry.id),'lastDeliveryState',(select coalesce(e.delivery_status,e.state) from private.email_intents e
      where e.receipt->>'inquiryId'=p_inquiry.id::text and e.purpose in ('support_acknowledgement','support_reply')
      order by e.created_at desc,e.id desc limit 1));
$$;
create or replace function public.get_support_inquiry(p_actor_id uuid,p_inquiry_id uuid,p_before_message_id uuid default null) returns jsonb
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
    'subject',m.subject,'body',m.body,'createdAt',m.created_at,'photos',private.support_photo_projection(m.id),'delivery',case when e.id is not null then
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
    'quarantinedInbound',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,
      'subject',coalesce(q.payload->>'subject','Incoming email requires review'),
      'body',coalesce(q.payload->>'body','The message could not be retrieved. Retry or dismiss this item.'),
      'receivedAt',q.received_at,'reason',q.reason,'participantMatches',q.participant_matches,
      'acceptAllowed',q.accept_allowed and q.state='quarantined','retryAllowed',q.state='failed') order by q.created_at),
      '[]'::jsonb) from (select * from private.support_inbound_jobs where id in (select job_id from private.support_inbound_routes where inquiry_id=p_inquiry_id)
        and state in ('quarantined','failed') order by created_at limit 25) q),
    'order',(select pg_catalog.jsonb_build_object('orderNumber',order_number) from public.orders where id=v_inquiry.order_id));
end $$;

-- Preserve the complete post-#436 handoff contract; extend only versioned support guards.
create or replace function public.prepare_email_attempt(p_id uuid,p_lease_token uuid,p_request_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype; v_order_id uuid; v_purpose text; v_inquiry_id uuid;
  v_subscriber private.marketing_subscribers%rowtype; v_generation private.marketing_generations%rowtype;
  v_marketing boolean; v_capacity jsonb; v_due timestamptz; v_retry_at timestamptz; v_reason text;
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
  v_marketing:=v_purpose in ('marketing_confirmation','welcome_initial','welcome_education');
  if v_marketing then
    -- All recipient transitions take address, subscriber, then intent locks in this order.
    select s.* into v_subscriber from private.marketing_subscribers s join private.email_intents e
      on e.receipt->>'subscriberId'=s.id::text where e.id=p_id;
    if not found then return null; end if;
    perform private.marketing_address_lock(v_subscriber.normalized_email);
    select * into v_subscriber from private.marketing_subscribers where id=v_subscriber.id for update;
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
  if v_intent.purpose='support_reply' and private.support_pending_context(v_inquiry_id)>0 then
    update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
      error_code=case when first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return null;
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
      and (v_intent.receipt=private.support_reply_receipt(i,d,m.id)
        or v_intent.receipt=pg_catalog.jsonb_build_object(
        'renderVersion','support-text-v1','inquiryId',i.id,'messageId',m.id,
        'inquiryRevision',i.revision,'draftVersion',d.version,'subject',d.subject,
        'body',d.body,'html',private.support_plain_html(d.body),'attachments','[]'::jsonb))
  ) then
    update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
      error_code=case when first_attempt_at is null then 'approval_stale' else 'reconciliation_required' end,
      lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return null;
  end if;
  if v_marketing then
    select * into v_generation from private.marketing_generations
      where subscriber_id=v_subscriber.id and generation=v_subscriber.generation;
    perform 1 from private.email_controls where environment=v_intent.environment
      and purpose=v_intent.purpose and enabled and accepted_after<=v_generation.requested_at for share;
    if not found or not private.marketing_intent_current(v_intent,v_subscriber)
      or v_intent.receipt->'templateContract' is distinct from v_generation.template_contract
      or v_intent.receipt->'schemaVersion' is distinct from '1'::jsonb
      or (v_intent.purpose in ('welcome_initial','welcome_education') and not exists (
        select 1 from private.marketing_preference_tokens t where t.subscriber_id=v_subscriber.id
          and t.generation=v_subscriber.generation and t.token_hash=pg_catalog.encode(
            extensions.digest(v_intent.receipt->>'preferenceToken','sha256'),'hex')))
    then
      update private.email_intents set state=case when first_attempt_at is null then 'blocked' else 'uncertain' end,
        error_code=case when first_attempt_at is null then 'marketing_not_eligible' else 'reconciliation_required' end,
        lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
    if p_request_payload->>'from' is distinct from v_generation.template_contract->>'from'
      or p_request_payload->>'reply_to' is distinct from v_generation.template_contract->>'replyTo'
      or (v_intent.purpose='marketing_confirmation' and (p_request_payload ? 'headers' or p_request_payload ? 'topic_id'))
      or (v_intent.purpose in ('welcome_initial','welcome_education') and (
        p_request_payload->>'topic_id' is distinct from v_generation.template_contract->>'topicId'
        or p_request_payload->'headers' is distinct from pg_catalog.jsonb_build_object(
          'List-Unsubscribe','<'||(v_generation.template_contract->>'siteOrigin')||
            '/api/marketing/unsubscribe?token='||(v_intent.receipt->>'preferenceToken')||'>',
          'List-Unsubscribe-Post','List-Unsubscribe=One-Click')))
    then raise exception using errcode='22023',message='marketing request does not match frozen contract'; end if;
  end if;
  if v_intent.purpose in ('support_acknowledgement','support_reply') and (
    p_request_payload->>'subject' is distinct from v_intent.receipt->>'subject'
    or p_request_payload->>'text' is distinct from v_intent.receipt->>'body'
    or p_request_payload->>'html' is distinct from v_intent.receipt->>'html'
    or v_intent.receipt->'attachments' is distinct from '[]'::jsonb
    or not coalesce(case when v_intent.purpose='support_reply'
      then v_intent.receipt->>'renderVersion' in ('support-text-v1','support-text-v2')
      else v_intent.receipt->>'renderVersion' in ('support-ack-v1','support-ack-v2') end,false)
    or (v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2') and (
      p_request_payload->>'reply_to' is distinct from v_intent.receipt->>'replyTo'
      or p_request_payload->'headers' is distinct from v_intent.receipt->'headers'
      or not exists(select 1 from private.support_reply_routes where inquiry_id=(v_intent.receipt->>'inquiryId')::uuid
        and address=v_intent.receipt->>'replyTo')))
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
    or p_request_payload-(case when v_intent.purpose in ('welcome_initial','welcome_education')
      then array['from','to','reply_to','subject','html','text','tags','headers','topic_id']
      when v_intent.purpose in ('support_acknowledgement','support_reply')
        and v_intent.receipt->>'renderVersion' in ('support-text-v2','support-ack-v2')
      then array['from','to','reply_to','subject','html','text','tags','headers']
      else array['from','to','reply_to','subject','html','text','tags'] end)<>'{}'::jsonb
    or (v_intent.request_payload is not null and v_intent.request_payload is distinct from p_request_payload)
  then raise exception using errcode='22023',message='email request does not match frozen envelope'; end if;
  if v_intent.purpose in ('welcome_initial','welcome_education') then
    v_due:=v_generation.confirmed_at+case when v_intent.purpose='welcome_education' then interval '72 hours' else interval '0' end;
    v_capacity:=private.reserve_marketing_capacity(v_subscriber.id,v_subscriber.generation,v_subscriber.revision,
      v_intent.id,v_intent.purpose,v_due,v_intent.first_attempt_at,exists(select 1 from private.email_intents e
        where e.purpose='welcome_initial' and e.receipt->>'subscriberId'=v_subscriber.id::text
          and e.receipt->>'generation'=v_subscriber.generation::text and e.provider_email_id is not null));
    if (v_capacity->>'eligible')::boolean is distinct from true then
      v_reason:=v_capacity->>'reason';
      v_retry_at:=coalesce((v_capacity->>'retryAt')::timestamptz,pg_catalog.clock_timestamp()+interval '1 minute');
      if v_intent.first_attempt_at is null then v_retry_at:=least(v_retry_at,v_due+interval '24 hours'); end if;
      update private.email_intents set
        state=case when first_attempt_at is not null then 'uncertain'
          when v_reason in ('consent_ineligible','expired') then 'blocked' else 'retry' end,
        error_code=case when first_attempt_at is not null and v_reason='consent_ineligible' then 'reconciliation_required'
          when v_reason='preferences_unverified' then 'marketing_preferences_unavailable'
          when v_reason='expired' then 'marketing_expired' else 'marketing_'||v_reason end,
        next_attempt_at=v_retry_at,lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=p_id;
      return null;
    end if;
  end if;
  update private.email_intents set request_payload=coalesce(request_payload,p_request_payload),
    first_attempt_at=coalesce(first_attempt_at,pg_catalog.clock_timestamp()),attempt_count=attempt_count+1,
    updated_at=pg_catalog.clock_timestamp() where id=p_id returning * into v_intent;
  return private.email_intent_work(v_intent);
end $$;

-- Explicit least-privilege RPC grants, including replaced overloads.
DO $acl$
DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature,p.prorettype FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname IN (
'private.accept_support_inbound','private.create_support_inbound_photos','private.limit_support_upload_batches','private.lock_support_inbound_inquiries','private.preserve_support_photo_identity','private.seed_support_upload_photos','private.support_inquiry_summary','private.support_pending_context','private.support_photo_projection','private.support_reply_receipt','private.touch_support_context','private.touch_support_inbound_inquiries','private.valid_support_photo_manifest','public.admit_support_photo_size','public.claim_support_inbound','public.claim_support_photo_cleanup','public.claim_support_photos','public.complete_support_photo_upload','public.configure_support_receiving','public.finish_support_inbound','public.finish_support_photo','public.finish_support_photo_cleanup','public.get_support_inquiry','public.get_support_pending_rfc_messages','public.get_support_photo','public.inspect_support_ingress','public.mutate_support_inquiry','public.prepare_email_attempt','public.read_support_photo_uploads','public.read_support_receiving_control','public.record_support_inbound','public.record_support_rfc_message','public.reserve_support_photo_upload','public.review_support_inbound','public.submit_support_inquiry'
  ) LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.prorettype<>'trigger'::regtype THEN
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    END IF;
  END LOOP;
END $acl$;
