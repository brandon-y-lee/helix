-- Only the three approved marketing purposes extend the shared dispatcher.
alter table private.email_controls drop constraint email_controls_purpose_check;
alter table private.email_controls add constraint email_controls_purpose_check check(purpose in (
  'order_confirmation','order_tracking','support_acknowledgement','support_reply',
  'marketing_confirmation','welcome_initial','welcome_education'));
alter table private.email_intents drop constraint email_intents_purpose_check;
alter table private.email_intents add constraint email_intents_purpose_check check(purpose in (
  'order_confirmation','order_tracking','support_acknowledgement','support_reply',
  'marketing_confirmation','welcome_initial','welcome_education'));
insert into private.email_controls(environment,purpose) values
  ('sandbox','marketing_confirmation'),('sandbox','welcome_initial'),('sandbox','welcome_education');
create unique index email_marketing_welcome_identity_idx on private.email_intents(
  purpose,(receipt->>'subscriberId'),(receipt->>'generation')) where purpose in ('welcome_initial','welcome_education');
create unique index email_marketing_confirmation_identity_idx on private.email_intents(
  (receipt->>'subscriberId'),(receipt->>'generation'),(extensions.digest(receipt->>'confirmationToken','sha256')))
  where purpose='marketing_confirmation';
create index email_marketing_subscriber_idx on private.email_intents((receipt->>'subscriberId'))
  where purpose in ('marketing_confirmation','welcome_initial','welcome_education');

create function public.read_marketing_email_control() returns jsonb language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('purpose',purpose,'enabled',enabled,
    'acceptedAfter',accepted_after,'updatedAt',updated_at) order by purpose)
  from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education');
$$;
create function public.configure_marketing_email(p_enabled boolean,p_expected_updated_at jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_now timestamptz;
begin
  if p_enabled is null or pg_catalog.jsonb_typeof(p_expected_updated_at) is distinct from 'object'
    or p_expected_updated_at-array['marketing_confirmation','welcome_initial','welcome_education']<>'{}'::jsonb
    or not p_expected_updated_at ?& array['marketing_confirmation','welcome_initial','welcome_education'] then return false; end if;
  perform 1 from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education') order by purpose for update;
  select count(*) into v_count from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education')
    and pg_catalog.to_jsonb(updated_at)=p_expected_updated_at->purpose;
  if v_count<>3 then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.email_controls set enabled=p_enabled,
    accepted_after=case when p_enabled and not enabled then greatest(accepted_after,v_now) else accepted_after end,
    updated_at=v_now where environment='sandbox' and purpose in ('marketing_confirmation','welcome_initial','welcome_education');
  return true;
end $$;
revoke all on function public.read_marketing_email_control(),public.configure_marketing_email(boolean,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.read_marketing_email_control(),public.configure_marketing_email(boolean,jsonb) to service_role;

-- Marketing permission remains private and independent from Product Waitlists.
create table private.marketing_subscribers (
  id uuid primary key default extensions.gen_random_uuid(),
  normalized_email text not null unique check(normalized_email=lower(btrim(normalized_email))
    and length(normalized_email) between 3 and 254),
  generation bigint not null default 1 check(generation>0),
  revision bigint not null default 1 check(revision>0),
  status text not null check(status in ('pending','confirmed','withdrawn')),
  global_allowed boolean not null default false,
  topic_allowed boolean not null default false,
  current_confirmation_hash text,
  last_requested_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table private.marketing_generations (
  subscriber_id uuid not null references private.marketing_subscribers(id),
  generation bigint not null check(generation>0),
  template_contract jsonb not null check(jsonb_typeof(template_contract)='object'),
  source text not null check(length(source) between 1 and 64),
  wording_version text not null check(length(wording_version) between 1 and 64),
  requested_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  primary key(subscriber_id,generation)
);
create table private.marketing_confirmation_tokens (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  subscriber_id uuid not null,
  generation bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation)
);
create index marketing_confirmation_subscriber_idx on private.marketing_confirmation_tokens(subscriber_id,generation);
create table private.marketing_preference_tokens (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  subscriber_id uuid not null,
  generation bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation)
);
create index marketing_preference_subscriber_idx on private.marketing_preference_tokens(subscriber_id,generation);
create table private.marketing_consent_evidence (
  id bigint generated always as identity primary key,
  subscriber_id uuid not null,
  generation bigint not null,
  revision bigint not null,
  purpose text not null default 'welcome' check(purpose='welcome'),
  event text not null check(event in ('requested','confirmed','withdrawn_global','withdrawn_topic','provider_denied')),
  source text not null,
  wording_version text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation)
);
create index marketing_evidence_subscriber_idx on private.marketing_consent_evidence(subscriber_id,generation,occurred_at);
create table private.marketing_request_limits (
  key text primary key,
  occurrences timestamptz[] not null,
  updated_at timestamptz not null default clock_timestamp()
);
create index marketing_request_limits_cleanup_idx on private.marketing_request_limits(updated_at);

create function private.preserve_marketing_evidence() returns trigger language plpgsql
security invoker set search_path='' as $$ begin
  raise exception using errcode='55000',message='marketing consent evidence is immutable';
end $$;
create trigger preserve_marketing_evidence before update or delete on private.marketing_consent_evidence
  for each row execute function private.preserve_marketing_evidence();

create function private.marketing_address_lock(p_email text) returns void language sql
security invoker set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing-address:'||p_email,0));
$$;

create function private.marketing_request_allowed(p_email text) returns boolean language plpgsql
security invoker set search_path='' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_key text; v_limit integer; v_times timestamptz[];
begin
  -- One constant global lock makes the 30/hour bound atomic across all addresses and processes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing-request-global',0));
  delete from private.marketing_request_limits where key in (
    select key from private.marketing_request_limits where updated_at<v_now-interval '24 hours'
    order by updated_at limit 100 for update skip locked);
  foreach v_key in array array['global',pg_catalog.encode(extensions.digest(p_email,'sha256'),'hex')] loop
    v_limit:=case when v_key='global' then 30 else 3 end;
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_times
      from private.marketing_request_limits l cross join lateral pg_catalog.unnest(l.occurrences) t
      where l.key=v_key and t>v_now-interval '1 hour';
    if pg_catalog.cardinality(v_times)>=v_limit then return false; end if;
  end loop;
  foreach v_key in array array['global',pg_catalog.encode(extensions.digest(p_email,'sha256'),'hex')] loop
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_times
      from private.marketing_request_limits l cross join lateral pg_catalog.unnest(l.occurrences) t
      where l.key=v_key and t>v_now-interval '1 hour';
    insert into private.marketing_request_limits(key,occurrences,updated_at) values(v_key,pg_catalog.array_append(v_times,v_now),v_now)
      on conflict(key) do update set occurrences=excluded.occurrences,updated_at=excluded.updated_at;
  end loop;
  return true;
end $$;

create function private.valid_marketing_template_contract(p_contract jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(pg_catalog.jsonb_typeof(p_contract)='object' and p_contract->>'version'='welcome_v1'
    and p_contract-array['version','siteOrigin','from','replyTo','postalAddress','topicId','templates']='{}'::jsonb
    and pg_catalog.length(p_contract->>'siteOrigin') between 8 and 2048
    and pg_catalog.length(p_contract->>'from') between 3 and 320
    and pg_catalog.length(p_contract->>'replyTo') between 3 and 254
    and pg_catalog.length(p_contract->>'postalAddress') between 1 and 1000
    and pg_catalog.length(p_contract->>'topicId') between 1 and 200
    and pg_catalog.jsonb_typeof(p_contract->'templates')='object'
    and (p_contract->'templates')-array['marketing_confirmation','welcome_initial','welcome_education']='{}'::jsonb
    and not exists(select 1 from pg_catalog.unnest(array['marketing_confirmation','welcome_initial','welcome_education']) p
      where pg_catalog.jsonb_typeof(p_contract->'templates'->p) is distinct from 'object'
        or pg_catalog.length(p_contract->'templates'->p->>'id') not between 1 and 200
        or p_contract->'templates'->p->>'id' is null
        or p_contract->'templates'->p->>'sha256' is null
        or p_contract->'templates'->p->>'sha256' !~ '^[0-9a-f]{64}$'
        or (p_contract->'templates'->p)-array['id','sha256']<>'{}'::jsonb),false);
$$;
create function private.request_marketing_subscription(
  p_email text,p_source text,p_wording_version text,p_confirmation_token text,p_abuse_key text,
  p_consent boolean default false,p_template_contract jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_email text:=pg_catalog.lower(pg_catalog.btrim(p_email));
  v_subscriber private.marketing_subscribers%rowtype;
  v_hash text; v_now timestamptz; v_cutoff timestamptz;
begin
  if p_consent is distinct from true then
    raise exception using errcode='22023',message='explicit marketing consent is required';
  end if;
  if v_email is null or pg_catalog.length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_source is null or pg_catalog.length(p_source) not between 1 and 64
    or p_wording_version is null or pg_catalog.length(p_wording_version) not between 1 and 64
    or p_confirmation_token is null or p_confirmation_token !~ '^[A-Za-z0-9_-]{43,128}$'
    or p_abuse_key is null or p_abuse_key !~ '^[0-9a-f]{64}$'
    or not private.valid_marketing_template_contract(p_template_contract)
  then raise exception using errcode='22023',message='invalid marketing subscription request'; end if;
  perform 1 from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education') order by purpose for share;
  if (select count(*) from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education') and enabled
    and accepted_after<=pg_catalog.clock_timestamp())<>3 then return '{"status":"unavailable"}'::jsonb; end if;
  select max(accepted_after) into v_cutoff from private.email_controls where environment='sandbox'
    and purpose in ('marketing_confirmation','welcome_initial','welcome_education');
  if not private.marketing_request_allowed(v_email) then return '{"status":"accepted"}'::jsonb; end if;
  perform private.marketing_address_lock(v_email);
  v_now:=pg_catalog.clock_timestamp();
  select * into v_subscriber from private.marketing_subscribers where normalized_email=v_email for update;
  if found and (v_subscriber.status='confirmed' or v_subscriber.last_requested_at>v_now-interval '60 seconds') then
    return '{"status":"accepted"}'::jsonb;
  end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_confirmation_token,'sha256'),'hex');
  if v_subscriber.id is null then
    insert into private.marketing_subscribers(normalized_email,status,current_confirmation_hash,last_requested_at)
      values(v_email,'pending',v_hash,v_now) returning * into v_subscriber;
  elsif v_subscriber.status='withdrawn' or exists(select 1 from private.marketing_generations g
    where g.subscriber_id=v_subscriber.id and g.generation=v_subscriber.generation
      and (g.template_contract is distinct from p_template_contract or g.wording_version is distinct from p_wording_version
        or g.requested_at<v_cutoff)) then
    update private.marketing_subscribers set generation=generation+1,revision=revision+1,status='pending',
      current_confirmation_hash=v_hash,last_requested_at=v_now,updated_at=v_now
      where id=v_subscriber.id returning * into v_subscriber;
  else
    update private.marketing_subscribers set current_confirmation_hash=v_hash,last_requested_at=v_now,updated_at=v_now
      where id=v_subscriber.id returning * into v_subscriber;
  end if;
  insert into private.marketing_generations(subscriber_id,generation,template_contract,source,wording_version,requested_at)
    values(v_subscriber.id,v_subscriber.generation,p_template_contract,p_source,p_wording_version,v_now)
    on conflict(subscriber_id,generation) do nothing;
  insert into private.marketing_confirmation_tokens(token_hash,subscriber_id,generation,created_at,expires_at)
    values(v_hash,v_subscriber.id,v_subscriber.generation,v_now,v_now+interval '24 hours');
  insert into private.marketing_consent_evidence(subscriber_id,generation,revision,event,source,wording_version,occurred_at)
    values(v_subscriber.id,v_subscriber.generation,v_subscriber.revision,'requested',p_source,p_wording_version,v_now);
  perform private.enqueue_marketing_confirmation(v_subscriber,p_confirmation_token);
  if exists(select 1 from private.marketing_provider_sync where subscriber_id=v_subscriber.id) then
    perform private.refresh_marketing_sync(v_subscriber);
  end if;
  return '{"status":"accepted"}'::jsonb;
end $$;
create function public.request_marketing_subscription(
  p_email text,p_source text,p_wording_version text,p_confirmation_token text,p_abuse_key text,
  p_consent boolean default false,p_template_contract jsonb default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.request_marketing_subscription(p_email,p_source,p_wording_version,p_confirmation_token,
    p_abuse_key,p_consent,p_template_contract);
$$;
revoke all on function private.request_marketing_subscription(text,text,text,text,text,boolean,jsonb),
  public.request_marketing_subscription(text,text,text,text,text,boolean,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.request_marketing_subscription(text,text,text,text,text,boolean,jsonb),
  public.request_marketing_subscription(text,text,text,text,text,boolean,jsonb) to service_role;

-- Private RLS and narrow service-only grants; browser roles have no direct data access.
do $$ declare v_name text; begin
  foreach v_name in array array['marketing_subscribers','marketing_generations','marketing_confirmation_tokens',
    'marketing_preference_tokens','marketing_consent_evidence','marketing_request_limits'] loop
    execute format('alter table private.%I enable row level security',v_name);
    execute format('alter table private.%I force row level security',v_name);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role',v_name);
    execute format('grant select,insert,update on private.%I to service_role',v_name);
  end loop;
end $$;
grant delete on private.marketing_request_limits to service_role;
grant usage on sequence private.marketing_consent_evidence_id_seq to service_role;
revoke all on function private.preserve_marketing_evidence(),private.marketing_address_lock(text),
  private.marketing_request_allowed(text),private.valid_marketing_template_contract(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.marketing_address_lock(text),private.marketing_request_allowed(text),
  private.valid_marketing_template_contract(jsonb) to service_role;

-- Only finite diagnostics may be retained. Failure classifications never authorize another submission.
create function private.valid_marketing_import_failure(p_failure jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_failure is null or coalesce(
    pg_catalog.jsonb_typeof(p_failure)='object'
    and pg_catalog.octet_length(p_failure::text)<=512
    and p_failure ?& array['category','httpStatus','providerName','retryAfterSeconds']
    and p_failure-array['category','httpStatus','providerName','retryAfterSeconds']='{}'::jsonb
    and pg_catalog.jsonb_typeof(p_failure->'category')='string'
    and p_failure->>'category' in ('rate_limited','quota_exceeded','configuration_rejected',
      'provider_unavailable','provider_contract_invalid')
    and (p_failure->'httpStatus'='null'::jsonb or case when pg_catalog.jsonb_typeof(p_failure->'httpStatus')='number'
      and p_failure->>'httpStatus' ~ '^[0-9]{3}$' then (p_failure->>'httpStatus')::integer between 100 and 599 else false end)
    and (p_failure->'providerName'='null'::jsonb or (pg_catalog.jsonb_typeof(p_failure->'providerName')='string'
      and p_failure->>'providerName' in ('invalid_idempotency_key','validation_error','missing_api_key','invalid_api_key',
        'restricted_api_key','suspended_api_key','invalid_permission','not_found','method_not_allowed',
        'concurrent_idempotent_requests','invalid_idempotent_request','resource_locked','invalid_attachment',
        'invalid_parameter','missing_required_field','missing_required_parameter','daily_quota_exceeded',
        'monthly_quota_exceeded','rate_limit_exceeded','application_error','internal_server_error','service_unavailable')))
    and (p_failure->'retryAfterSeconds'='null'::jsonb or case when pg_catalog.jsonb_typeof(p_failure->'retryAfterSeconds')='number'
      and p_failure->>'retryAfterSeconds' ~ '^[0-9]{1,5}$'
      then (p_failure->>'retryAfterSeconds')::integer between 0 and 86400 else false end),false);
$$;
revoke all on function private.valid_marketing_import_failure(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.valid_marketing_import_failure(jsonb) to service_role;

-- One durable admission per confirmed generation. Only exact rate-limit rejections permit bounded retries.
create table private.marketing_contact_imports (
  subscriber_id uuid not null,
  generation bigint not null,
  confirmation_revision bigint not null,
  admission_token uuid not null unique default extensions.gen_random_uuid(),
  topic_id text not null,
  provider_import_id uuid unique,
  first_failure jsonb check(private.valid_marketing_import_failure(first_failure)),
  state text not null check(state in ('admitted','submitted','uncertain','retry_wait','exhausted','completed','failed')),
  attempt_count integer not null default 1 check(attempt_count between 1 and 3),
  attempt_started_at timestamptz not null default clock_timestamp(),
  next_submission_at timestamptz,
  admitted_at timestamptz not null default clock_timestamp(),
  next_poll_at timestamptz not null default clock_timestamp(),
  poll_lease_token uuid,
  poll_lease_expires_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(subscriber_id,generation),
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation),
  check((poll_lease_token is null)=(poll_lease_expires_at is null)),
  check(state not in ('submitted','completed','failed') or provider_import_id is not null),
  check((state='retry_wait')=(next_submission_at is not null)),
  check(state not in ('retry_wait','exhausted') or provider_import_id is null)
);
create unique index marketing_one_unresolved_import_idx on private.marketing_contact_imports(subscriber_id)
  where state in ('admitted','submitted','uncertain','retry_wait');
create index marketing_import_operations_idx on private.marketing_contact_imports(updated_at desc,subscriber_id,generation);
create index marketing_import_poll_idx on private.marketing_contact_imports(next_poll_at,subscriber_id)
  where state in ('admitted','submitted','uncertain');
alter table private.marketing_contact_imports enable row level security;
alter table private.marketing_contact_imports force row level security;
revoke all on private.marketing_contact_imports from public,anon,authenticated,service_role;
grant select,insert,update on private.marketing_contact_imports to service_role;

create table private.marketing_provider_sync (
  subscriber_id uuid primary key references private.marketing_subscribers(id),
  generation bigint not null,
  revision bigint not null,
  desired_subscribed boolean not null,
  topic_id text not null,
  contact_id text,
  state text not null default 'pending' check(state in ('pending','leased','synced','retry')),
  lease_token uuid,
  lease_revision bigint,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  observation_generation bigint,
  observation_revision bigint,
  observation_contact_id text,
  observation_topic_id text,
  observation_global_allowed boolean,
  observation_topic_allowed boolean,
  observed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation),
  check((lease_token is null)=(lease_expires_at is null)),
  check((lease_token is null)=(lease_revision is null))
);
create index marketing_sync_due_idx on private.marketing_provider_sync(next_attempt_at,subscriber_id)
  where state<>'synced';
alter table private.marketing_provider_sync enable row level security;
alter table private.marketing_provider_sync force row level security;
revoke all on private.marketing_provider_sync from public,anon,authenticated,service_role;
grant select,insert,update on private.marketing_provider_sync to service_role;

create function private.refresh_marketing_sync(p_subscriber private.marketing_subscribers) returns void
language sql security invoker set search_path='' as $$
  insert into private.marketing_provider_sync(subscriber_id,generation,revision,desired_subscribed,topic_id)
    select p_subscriber.id,p_subscriber.generation,p_subscriber.revision,
      p_subscriber.status='confirmed' and p_subscriber.global_allowed and p_subscriber.topic_allowed,
      g.template_contract->>'topicId' from private.marketing_generations g
      where g.subscriber_id=p_subscriber.id and g.generation=p_subscriber.generation
  on conflict(subscriber_id) do update set generation=excluded.generation,revision=excluded.revision,
    desired_subscribed=excluded.desired_subscribed,topic_id=excluded.topic_id,state='pending',
    next_attempt_at=case when private.marketing_provider_sync.state<>'synced'
      and not private.marketing_provider_sync.desired_subscribed and not excluded.desired_subscribed
      and private.marketing_provider_sync.generation=excluded.generation
      and private.marketing_provider_sync.revision=excluded.revision
      then least(private.marketing_provider_sync.next_attempt_at,pg_catalog.clock_timestamp())
      else pg_catalog.clock_timestamp() end,
    observed_at=null,updated_at=pg_catalog.clock_timestamp();
$$;

create function public.confirm_marketing_subscription(p_confirmation_token text,p_preference_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_token private.marketing_confirmation_tokens%rowtype;
  v_subscriber private.marketing_subscribers%rowtype; v_generation private.marketing_generations%rowtype;
  v_hash text; v_now timestamptz;
begin
  if p_confirmation_token is null or p_confirmation_token !~ '^[A-Za-z0-9_-]{43,128}$'
    or p_preference_token is null or p_preference_token !~ '^[A-Za-z0-9_-]{43,128}$' then
    return '{"status":"invalid"}'::jsonb;
  end if;
  v_hash:=pg_catalog.encode(extensions.digest(p_confirmation_token,'sha256'),'hex');
  select * into v_token from private.marketing_confirmation_tokens where token_hash=v_hash;
  if not found then return '{"status":"invalid"}'::jsonb; end if;
  select * into v_subscriber from private.marketing_subscribers where id=v_token.subscriber_id;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=v_token.subscriber_id for update;
  select * into v_token from private.marketing_confirmation_tokens where token_hash=v_hash for update;
  if v_subscriber.generation<>v_token.generation or v_subscriber.current_confirmation_hash is distinct from v_hash
    or v_subscriber.status='withdrawn' then return '{"status":"invalid"}'::jsonb; end if;
  if v_token.consumed_at is not null and v_subscriber.status='confirmed' then
    return pg_catalog.jsonb_build_object('status','confirmed','subscriberId',v_subscriber.id,'generation',v_subscriber.generation);
  end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_token.expires_at<=v_now or v_subscriber.status<>'pending' then return '{"status":"invalid"}'::jsonb; end if;
  update private.marketing_subscribers set status='confirmed',global_allowed=true,topic_allowed=true,
    revision=revision+1,confirmed_at=v_now,updated_at=v_now where id=v_subscriber.id returning * into v_subscriber;
  update private.marketing_generations set confirmed_at=v_now where subscriber_id=v_subscriber.id
    and generation=v_subscriber.generation returning * into v_generation;
  update private.marketing_confirmation_tokens set consumed_at=v_now where token_hash=v_hash;
  insert into private.marketing_preference_tokens(token_hash,subscriber_id,generation)
    values(pg_catalog.encode(extensions.digest(p_preference_token,'sha256'),'hex'),v_subscriber.id,v_subscriber.generation);
  insert into private.marketing_consent_evidence(subscriber_id,generation,revision,event,source,wording_version,occurred_at)
    values(v_subscriber.id,v_subscriber.generation,v_subscriber.revision,'confirmed',v_generation.source,v_generation.wording_version,v_now);
  perform private.refresh_marketing_sync(v_subscriber);
  perform private.enqueue_marketing_welcome(v_subscriber,p_preference_token);
  return pg_catalog.jsonb_build_object('status','confirmed','subscriberId',v_subscriber.id,'generation',v_subscriber.generation);
end $$;

create function public.withdraw_marketing_subscription(p_token text,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_generation private.marketing_generations%rowtype;
  v_id uuid; v_now timestamptz;
begin
  if p_scope is null or p_scope not in ('global','topic') then
    raise exception using errcode='22023',message='invalid marketing preference'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,128}$' then return '{"status":"accepted"}'::jsonb; end if;
  select subscriber_id into v_id from private.marketing_preference_tokens
    where token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  if not found then return '{"status":"accepted"}'::jsonb; end if;
  select * into v_subscriber from private.marketing_subscribers where id=v_id;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=v_id for update;
  if v_subscriber.status='withdrawn' and (p_scope='topic' or not v_subscriber.global_allowed) then
    return '{"status":"accepted"}'::jsonb;
  end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.marketing_subscribers set status='withdrawn',global_allowed=case when p_scope='global' then false else global_allowed end,
    topic_allowed=false,revision=revision+1,withdrawn_at=v_now,updated_at=v_now where id=v_id returning * into v_subscriber;
  update private.marketing_generations set withdrawn_at=coalesce(withdrawn_at,v_now)
    where subscriber_id=v_id and generation=v_subscriber.generation returning * into v_generation;
  insert into private.marketing_consent_evidence(subscriber_id,generation,revision,event,source,wording_version,occurred_at)
    values(v_id,v_subscriber.generation,v_subscriber.revision,'withdrawn_'||p_scope,
      v_generation.source,v_generation.wording_version,v_now);
  perform private.refresh_marketing_sync(v_subscriber);
  perform private.cancel_ineligible_marketing_intents(v_subscriber);
  return '{"status":"accepted"}'::jsonb;
end $$;
revoke all on function private.refresh_marketing_sync(private.marketing_subscribers),
  public.confirm_marketing_subscription(text,text),public.withdraw_marketing_subscription(text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.refresh_marketing_sync(private.marketing_subscribers),
  public.confirm_marketing_subscription(text,text),public.withdraw_marketing_subscription(text,text) to service_role;

create function public.claim_marketing_sync(p_lease_token uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_subscriber private.marketing_subscribers%rowtype;
  v_sync private.marketing_provider_sync%rowtype; v_work jsonb:='[]'::jsonb;
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 3 then
    raise exception using errcode='22023',message='invalid marketing synchronization claim'; end if;
  for v_candidate in select q.subscriber_id,s.normalized_email from private.marketing_provider_sync q
    join private.marketing_subscribers s on s.id=q.subscriber_id
    where q.state<>'synced' and q.next_attempt_at<=pg_catalog.clock_timestamp()
      and (q.lease_expires_at is null or q.lease_expires_at<=pg_catalog.clock_timestamp())
    order by q.next_attempt_at,q.subscriber_id limit 15
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('marketing-address:'||v_candidate.normalized_email,0))
      then continue; end if;
    select * into v_subscriber from private.marketing_subscribers where id=v_candidate.subscriber_id for update;
    select * into v_sync from private.marketing_provider_sync where subscriber_id=v_candidate.subscriber_id for update;
    if v_sync.state='synced' or v_sync.next_attempt_at>pg_catalog.clock_timestamp()
      or v_sync.lease_expires_at>pg_catalog.clock_timestamp() then continue; end if;
    if v_sync.revision<>v_subscriber.revision then
      perform private.refresh_marketing_sync(v_subscriber);
    end if;
    update private.marketing_provider_sync set state='leased',lease_token=p_lease_token,lease_revision=revision,
      lease_expires_at=pg_catalog.clock_timestamp()+interval '2 minutes',updated_at=pg_catalog.clock_timestamp()
      where subscriber_id=v_subscriber.id returning * into v_sync;
    v_work:=v_work||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'subscriberId',v_subscriber.id,'email',v_subscriber.normalized_email,'generation',v_sync.generation,
      'revision',v_sync.revision,'desiredSubscribed',v_sync.desired_subscribed,
      'syncScope',case when v_sync.desired_subscribed then 'confirmed'
        when v_subscriber.global_allowed then 'welcome' else 'all' end,
      'providerContactId',v_sync.contact_id,'topicId',v_sync.topic_id,'leaseToken',p_lease_token));
    exit when pg_catalog.jsonb_array_length(v_work)>=p_limit;
  end loop;
  return v_work;
end $$;

create function public.validate_marketing_sync(p_subscriber_id uuid,p_revision bigint,p_lease_token uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.marketing_provider_sync q join private.marketing_subscribers s on s.id=q.subscriber_id
    where s.id=p_subscriber_id and s.revision=p_revision and q.revision=p_revision and q.lease_revision=p_revision
      and q.lease_token=p_lease_token and q.state='leased' and q.lease_expires_at>pg_catalog.clock_timestamp());
$$;

create function public.finish_marketing_sync(p_subscriber_id uuid,p_revision bigint,p_lease_token uuid,
  p_contact_id text,p_topic_id text,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
begin
  if p_outcome is null or p_outcome not in ('synced','retry')
    or (p_contact_id is not null and pg_catalog.length(p_contact_id) not between 1 and 200)
    then raise exception using errcode='22023',message='invalid marketing synchronization result'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return false; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  select * into v_sync from private.marketing_provider_sync where subscriber_id=p_subscriber_id for update;
  if not found or p_lease_token is null then return false; end if;
  if v_sync.lease_token is distinct from p_lease_token or v_sync.lease_revision is distinct from p_revision then
    -- A timed-out external opt-in may complete after a replacement deny job has finished.
    -- Repair from CURRENT local permission without cancelling a newer active lease.
    if p_outcome='synced' and p_revision<=v_subscriber.revision then
      update private.marketing_provider_sync set state='pending',next_attempt_at=pg_catalog.clock_timestamp(),
        observed_at=null,updated_at=pg_catalog.clock_timestamp() where subscriber_id=p_subscriber_id;
    end if;
    return false;
  end if;
  if p_outcome='synced' and ((v_sync.desired_subscribed and p_contact_id is null)
    or (v_sync.contact_id is not null and v_sync.contact_id is distinct from p_contact_id)) then return false; end if;
  if v_sync.revision<>p_revision or v_subscriber.revision<>p_revision or v_sync.state<>'leased'
    or v_sync.topic_id is distinct from p_topic_id or v_sync.lease_expires_at<=pg_catalog.clock_timestamp() then
    update private.marketing_provider_sync set state='pending',lease_token=null,lease_revision=null,lease_expires_at=null,
      next_attempt_at=pg_catalog.clock_timestamp(),observed_at=null,updated_at=pg_catalog.clock_timestamp()
      where subscriber_id=p_subscriber_id;
    return false;
  end if;
  update private.marketing_provider_sync set state=p_outcome,
    contact_id=case when p_outcome='synced' then p_contact_id else contact_id end,
    lease_token=null,lease_revision=null,lease_expires_at=null,
    next_attempt_at=pg_catalog.clock_timestamp()+case when p_outcome='retry' then interval '1 minute' else interval '0' end,
    observed_at=null,updated_at=pg_catalog.clock_timestamp() where subscriber_id=p_subscriber_id;
  return true;
end $$;

create function public.read_marketing_send_context(p_subscriber_id uuid,p_generation bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('subscriberId',s.id,'email',s.normalized_email,'generation',s.generation,
    'revision',s.revision,'contactId',q.contact_id,'topicId',g.template_contract->>'topicId',
    'subscribed',s.status='confirmed' and s.global_allowed and s.topic_allowed,
    'syncReady',coalesce(q.state='synced' and q.generation=s.generation and q.revision=s.revision,false)
      and not exists(select 1 from private.marketing_contact_imports m where m.subscriber_id=s.id
        and m.state in ('admitted','submitted','uncertain')))
  from private.marketing_subscribers s join private.marketing_generations g on g.subscriber_id=s.id and g.generation=s.generation
    left join private.marketing_provider_sync q on q.subscriber_id=s.id
  where s.id=p_subscriber_id and s.generation=p_generation;
$$;

create function public.record_marketing_provider_observation(p_subscriber_id uuid,p_generation bigint,p_revision bigint,
  p_contact_id text,p_topic_id text,p_global_allowed boolean,p_topic_allowed boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
  v_generation private.marketing_generations%rowtype; v_now timestamptz;
begin
  if p_global_allowed is null or p_topic_allowed is null then return false; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return false; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  select * into v_sync from private.marketing_provider_sync where subscriber_id=p_subscriber_id for update;
  if not found or v_subscriber.generation is distinct from p_generation or v_subscriber.revision is distinct from p_revision
    or v_sync.generation is distinct from p_generation or v_sync.revision is distinct from p_revision
    or v_sync.contact_id is distinct from p_contact_id or v_sync.topic_id is distinct from p_topic_id
    or v_sync.contact_id is null or v_sync.topic_id is null or v_subscriber.status<>'confirmed' then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  if not p_global_allowed or not p_topic_allowed then
    update private.marketing_subscribers set status='withdrawn',global_allowed=global_allowed and p_global_allowed,
      topic_allowed=topic_allowed and p_topic_allowed,revision=revision+1,withdrawn_at=v_now,updated_at=v_now
      where id=p_subscriber_id returning * into v_subscriber;
    update private.marketing_generations set withdrawn_at=coalesce(withdrawn_at,v_now)
      where subscriber_id=p_subscriber_id and generation=p_generation returning * into v_generation;
    insert into private.marketing_consent_evidence(subscriber_id,generation,revision,event,source,wording_version,occurred_at)
      values(p_subscriber_id,p_generation,v_subscriber.revision,'provider_denied',v_generation.source,v_generation.wording_version,v_now);
    perform private.refresh_marketing_sync(v_subscriber);
    perform private.cancel_ineligible_marketing_intents(v_subscriber);
    return false;
  end if;
  -- A fresh restrictive observation cannot be lost to a concurrent synchronization refresh.
  -- Positive evidence still requires a completed current synchronization.
  if v_sync.state<>'synced' then return false; end if;
  update private.marketing_provider_sync set observation_generation=p_generation,observation_revision=p_revision,
    observation_contact_id=p_contact_id,observation_topic_id=p_topic_id,observation_global_allowed=p_global_allowed,
    observation_topic_allowed=p_topic_allowed,observed_at=v_now,updated_at=v_now where subscriber_id=p_subscriber_id;
  return true;
end $$;
revoke all on function public.claim_marketing_sync(uuid,integer),public.validate_marketing_sync(uuid,bigint,uuid),
  public.finish_marketing_sync(uuid,bigint,uuid,text,text,text),public.read_marketing_send_context(uuid,bigint),
  public.record_marketing_provider_observation(uuid,bigint,bigint,text,text,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_marketing_sync(uuid,integer),public.validate_marketing_sync(uuid,bigint,uuid),
  public.finish_marketing_sync(uuid,bigint,uuid,text,text,text),public.read_marketing_send_context(uuid,bigint),
  public.record_marketing_provider_observation(uuid,bigint,bigint,text,text,boolean,boolean) to service_role;


create function private.preserve_marketing_identity() returns trigger language plpgsql
security invoker set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception using errcode='55000',message='marketing generation identity must be retained'; end if;
  if tg_table_name='marketing_subscribers' then
    if row(new.id,new.normalized_email,new.created_at) is distinct from row(old.id,old.normalized_email,old.created_at)
      or new.generation<old.generation or new.revision<old.revision then
      raise exception using errcode='55000',message='marketing subscriber identity is immutable'; end if;
  elsif row(new.subscriber_id,new.generation,new.template_contract,new.source,new.wording_version,new.requested_at)
    is distinct from row(old.subscriber_id,old.generation,old.template_contract,old.source,old.wording_version,old.requested_at)
    or (old.confirmed_at is not null and new.confirmed_at is distinct from old.confirmed_at)
    or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at) then
    raise exception using errcode='55000',message='marketing generation evidence is immutable';
  end if;
  return new;
end $$;
create trigger preserve_marketing_subscriber_identity before update or delete on private.marketing_subscribers
  for each row execute function private.preserve_marketing_identity();
create trigger preserve_marketing_generation_identity before update or delete on private.marketing_generations
  for each row execute function private.preserve_marketing_identity();
revoke all on function private.preserve_marketing_identity() from public,anon,authenticated,service_role;

-- The shared email preparer reserves promotional capacity in its own transaction.
-- These immutable receipts count uncertain handoffs conservatively across generations.
create table private.marketing_send_reservations (
  intent_id uuid primary key,
  subscriber_id uuid not null references private.marketing_subscribers(id),
  generation bigint not null,
  purpose text not null check(purpose in ('welcome_initial','welcome_education')),
  reserved_at timestamptz not null default clock_timestamp(),
  last_handoff_at timestamptz check(last_handoff_at>=reserved_at),
  foreign key(subscriber_id,generation) references private.marketing_generations(subscriber_id,generation)
);
create index marketing_capacity_window_idx on private.marketing_send_reservations(subscriber_id,(coalesce(last_handoff_at,reserved_at)));
alter table private.marketing_send_reservations enable row level security;
alter table private.marketing_send_reservations force row level security;
revoke all on private.marketing_send_reservations from public,anon,authenticated,service_role;
grant select,insert on private.marketing_send_reservations to service_role;
grant update(last_handoff_at) on private.marketing_send_reservations to service_role;
create function private.preserve_marketing_reservation() returns trigger language plpgsql
security invoker set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception using errcode='55000',message='marketing reservation must be retained'; end if;
  if row(new.intent_id,new.subscriber_id,new.generation,new.purpose,new.reserved_at)
      is distinct from row(old.intent_id,old.subscriber_id,old.generation,old.purpose,old.reserved_at)
    or new.last_handoff_at is null or new.last_handoff_at<coalesce(old.last_handoff_at,old.reserved_at) then
    raise exception using errcode='55000',message='marketing reservation identity and handoff history are immutable'; end if;
  return new;
end $$;
create trigger preserve_marketing_reservation before update or delete on private.marketing_send_reservations
  for each row execute function private.preserve_marketing_reservation();
revoke all on function private.preserve_marketing_reservation() from public,anon,authenticated,service_role;

create function private.reserve_marketing_capacity(p_subscriber_id uuid,p_generation bigint,p_revision bigint,
  p_intent_id uuid,p_purpose text,p_due_at timestamptz,p_first_attempt_at timestamptz,p_initial_accepted boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
  v_reservation private.marketing_send_reservations%rowtype;
  v_now timestamptz; v_daily integer; v_weekly integer; v_retry_at timestamptz;
begin
  if p_intent_id is null or p_purpose is null or p_purpose not in ('welcome_initial','welcome_education') or p_due_at is null then
    raise exception using errcode='22023',message='invalid promotional reservation'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if v_subscriber.generation is distinct from p_generation or v_subscriber.revision is distinct from p_revision
    or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed then
    return '{"eligible":false,"reason":"consent_ineligible"}'::jsonb; end if;
  if p_first_attempt_at is null and p_due_at+interval '24 hours'<=v_now then
    return '{"eligible":false,"reason":"expired"}'::jsonb; end if;
  if p_due_at>v_now then return pg_catalog.jsonb_build_object('eligible',false,'reason','not_due','retryAt',p_due_at); end if;
  if p_purpose='welcome_education' and p_initial_accepted is distinct from true then
    return '{"eligible":false,"reason":"initial_not_accepted"}'::jsonb; end if;
  if exists(select 1 from private.marketing_contact_imports m where m.subscriber_id=p_subscriber_id
    and m.state in ('admitted','submitted','uncertain')) then
    return '{"eligible":false,"reason":"preferences_unverified"}'::jsonb; end if;
  select * into v_sync from private.marketing_provider_sync where subscriber_id=p_subscriber_id;
  if not found or v_sync.state<>'synced' or v_sync.generation is distinct from p_generation
    or v_sync.revision is distinct from p_revision or v_sync.observation_generation is distinct from p_generation
    or v_sync.observation_revision is distinct from p_revision
    or v_sync.contact_id is distinct from v_sync.observation_contact_id
    or v_sync.topic_id is distinct from v_sync.observation_topic_id
    or v_sync.contact_id is null or v_sync.observation_global_allowed is distinct from true
    or v_sync.observation_topic_allowed is distinct from true or v_sync.observed_at is null
    or v_sync.observed_at<=v_now-interval '30 seconds' or v_sync.observed_at>v_now then
    return '{"eligible":false,"reason":"preferences_unverified"}'::jsonb; end if;
  select * into v_reservation from private.marketing_send_reservations where intent_id=p_intent_id;
  if found then
    if row(v_reservation.subscriber_id,v_reservation.generation,v_reservation.purpose)
      is distinct from row(p_subscriber_id,p_generation,p_purpose) then
      raise exception using errcode='22023',message='promotional reservation identity differs'; end if;
    update private.marketing_send_reservations set last_handoff_at=v_now where intent_id=p_intent_id;
    return '{"eligible":true}'::jsonb;
  end if;
  select count(*) filter(where coalesce(last_handoff_at,reserved_at)>v_now-interval '24 hours'),count(*) into v_daily,v_weekly
    from private.marketing_send_reservations where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '7 days';
  if v_daily>=1 or v_weekly>=3 then
    select greatest(
      coalesce((select max(coalesce(last_handoff_at,reserved_at))+interval '24 hours' from private.marketing_send_reservations
        where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '24 hours'),v_now),
      coalesce((select coalesce(last_handoff_at,reserved_at)+interval '7 days' from private.marketing_send_reservations
        where subscriber_id=p_subscriber_id and coalesce(last_handoff_at,reserved_at)>v_now-interval '7 days'
        order by coalesce(last_handoff_at,reserved_at) desc offset 2 limit 1),v_now)) into v_retry_at;
    return pg_catalog.jsonb_build_object('eligible',false,'reason','frequency_limited','retryAt',v_retry_at);
  end if;
  insert into private.marketing_send_reservations(intent_id,subscriber_id,generation,purpose,reserved_at)
    values(p_intent_id,p_subscriber_id,p_generation,p_purpose,v_now);
  return '{"eligible":true}'::jsonb;
end $$;
revoke all on function private.reserve_marketing_capacity(uuid,bigint,bigint,uuid,text,timestamptz,timestamptz,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.reserve_marketing_capacity(uuid,bigint,bigint,uuid,text,timestamptz,timestamptz,boolean) to service_role;



create function private.marketing_import_work(p_import private.marketing_contact_imports,p_allow_submit boolean)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('subscriberId',p_import.subscriber_id,'generation',p_import.generation,
    'confirmationRevision',p_import.confirmation_revision,'admissionToken',p_import.admission_token,
    'importId',p_import.provider_import_id,'state',p_import.state,'topicId',p_import.topic_id,'allowSubmit',p_allow_submit,
    'attemptCount',p_import.attempt_count,'nextSubmissionAt',p_import.next_submission_at);
$$;

create function public.admit_marketing_contact_import(p_subscriber_id uuid,p_revision bigint,p_lease_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_sync private.marketing_provider_sync%rowtype;
  v_import private.marketing_contact_imports%rowtype; v_now timestamptz;
begin
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return null; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  select * into v_sync from private.marketing_provider_sync where subscriber_id=p_subscriber_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed
    or v_subscriber.revision is distinct from p_revision or v_sync.revision is distinct from p_revision
    or v_sync.generation is distinct from v_subscriber.generation
    or v_sync.lease_revision is distinct from p_revision or v_sync.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_sync.state<>'leased' or not v_sync.desired_subscribed or v_sync.contact_id is not null
    or v_sync.lease_expires_at<=v_now then return null; end if;
  -- A new explicit confirmation may start fresh only after old known-rejected retries are retired.
  update private.marketing_contact_imports set state='exhausted',next_submission_at=null,updated_at=v_now
    where subscriber_id=p_subscriber_id and generation<>v_subscriber.generation and state='retry_wait';
  select * into v_import from private.marketing_contact_imports
    where subscriber_id=p_subscriber_id and generation=v_subscriber.generation for update;
  if found then
    if v_import.state='retry_wait' then
      if v_import.attempt_count>=3 or v_now>=v_import.admitted_at+interval '1 hour'
        or v_import.confirmation_revision is distinct from p_revision then
        update private.marketing_contact_imports set state='exhausted',next_submission_at=null,updated_at=v_now
          where subscriber_id=p_subscriber_id and generation=v_import.generation returning * into v_import;
      elsif v_import.next_submission_at<=v_now then
        update private.marketing_contact_imports set state='admitted',attempt_count=attempt_count+1,
          admission_token=extensions.gen_random_uuid(),attempt_started_at=v_now,next_submission_at=null,
          next_poll_at=v_now+interval '2 minutes',poll_lease_token=null,poll_lease_expires_at=null,updated_at=v_now
          where subscriber_id=p_subscriber_id and generation=v_import.generation returning * into v_import;
        return private.marketing_import_work(v_import,true);
      end if;
    end if;
    return private.marketing_import_work(v_import,false);
  end if;
  select * into v_import from private.marketing_contact_imports
    where subscriber_id=p_subscriber_id and state in ('admitted','submitted','uncertain','retry_wait');
  if found then return private.marketing_import_work(v_import,false); end if;
  insert into private.marketing_contact_imports(subscriber_id,generation,confirmation_revision,topic_id,state,next_poll_at)
    values(p_subscriber_id,v_subscriber.generation,p_revision,v_sync.topic_id,'admitted',
      v_now+interval '2 minutes') returning * into v_import;
  return private.marketing_import_work(v_import,true);
end $$;

create function public.record_marketing_contact_import(p_subscriber_id uuid,p_generation bigint,p_admission_token uuid,
  p_import_id uuid,p_outcome text,p_failure jsonb default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_import private.marketing_contact_imports%rowtype;
  v_now timestamptz; v_retry_at timestamptz; v_exact_rejection boolean; v_state text;
begin
  if p_outcome is null or p_outcome not in ('submitted','uncertain','rate_limited')
    or (p_outcome='submitted' and p_import_id is null) or not private.valid_marketing_import_failure(p_failure)
    or (p_outcome='rate_limited' and (p_import_id is not null or not coalesce(
      p_failure->'httpStatus'='429'::jsonb and p_failure->>'providerName'='rate_limit_exceeded',false))) then
    raise exception using errcode='22023',message='invalid marketing import submission result'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return false; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  select * into v_import from private.marketing_contact_imports
    where subscriber_id=p_subscriber_id and generation=p_generation for update;
  if not found or p_admission_token is null or v_import.admission_token is distinct from p_admission_token
    or (v_import.provider_import_id is not null and p_import_id is not null
      and v_import.provider_import_id is distinct from p_import_id) then return false; end if;
  if v_import.state in ('completed','failed') then return v_import.provider_import_id is not distinct from p_import_id; end if;
  v_now:=pg_catalog.clock_timestamp();
  -- This is the sole retry inference. Category alone, quota 429s, timeouts and missing UUIDs do not prove rejection.
  v_exact_rejection:=coalesce(p_outcome='rate_limited' and p_import_id is null and v_import.provider_import_id is null
    and p_failure->'httpStatus'='429'::jsonb and p_failure->>'providerName'='rate_limit_exceeded',false);
  if v_import.state='exhausted' then
    return v_exact_rejection; -- A terminal known rejection never reopens a superseded generation.
  end if;
  if v_import.state='retry_wait' and v_exact_rejection then
    return true; -- A replayed result cannot postpone the backoff or replenish attempts.
  end if;
  if coalesce(v_import.provider_import_id,p_import_id) is not null then
    v_state:='submitted';
  elsif v_exact_rejection and v_import.state='admitted' then
    v_retry_at:=v_now+pg_catalog.make_interval(secs=>greatest(1,coalesce((p_failure->>'retryAfterSeconds')::integer,60)));
    v_state:=case when v_import.attempt_count>=3 or v_retry_at>=v_import.admitted_at+interval '1 hour'
      or v_subscriber.generation<>p_generation or v_subscriber.revision<>v_import.confirmation_revision
      or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed
      then 'exhausted' else 'retry_wait' end;
  else
    -- Once an attempt is uncertain, a later diagnostic cannot turn it into permission to retry.
    v_state:='uncertain';
  end if;
  update private.marketing_contact_imports set provider_import_id=coalesce(provider_import_id,p_import_id),
    first_failure=coalesce(first_failure,p_failure),state=v_state,
    next_submission_at=case when v_state='retry_wait' then v_retry_at else null end,
    poll_lease_token=null,poll_lease_expires_at=null,next_poll_at=v_now,updated_at=v_now
    where subscriber_id=p_subscriber_id and generation=p_generation;
  -- The admission belongs to its old generation, but reconciliation follows the current choice.
  if v_subscriber.generation<>p_generation or v_subscriber.revision<>v_import.confirmation_revision then
    perform private.refresh_marketing_sync(v_subscriber);
  end if;
  return true;
end $$;

create function public.claim_marketing_contact_imports(p_lease_token uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_subscriber private.marketing_subscribers%rowtype;
  v_import private.marketing_contact_imports%rowtype; v_topic_id text; v_work jsonb:='[]'::jsonb;
begin
  if p_lease_token is null or p_limit is null or p_limit not between 1 and 3 then
    raise exception using errcode='22023',message='invalid marketing import poll claim'; end if;
  for v_candidate in select m.subscriber_id,m.generation,s.normalized_email from private.marketing_contact_imports m
    join private.marketing_subscribers s on s.id=m.subscriber_id
    where m.state in ('admitted','submitted','uncertain') and m.next_poll_at<=pg_catalog.clock_timestamp()
      and (m.poll_lease_expires_at is null or m.poll_lease_expires_at<=pg_catalog.clock_timestamp())
    order by m.next_poll_at,m.subscriber_id limit 15
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('marketing-address:'||v_candidate.normalized_email,0))
      then continue; end if;
    select * into v_subscriber from private.marketing_subscribers where id=v_candidate.subscriber_id for update;
    select * into v_import from private.marketing_contact_imports
      where subscriber_id=v_candidate.subscriber_id and generation=v_candidate.generation for update;
    if v_import.state not in ('admitted','submitted','uncertain') or v_import.next_poll_at>pg_catalog.clock_timestamp()
      or v_import.poll_lease_expires_at>pg_catalog.clock_timestamp() then continue; end if;
    update private.marketing_contact_imports set state=case when state='admitted' then 'uncertain' else state end,
      poll_lease_token=p_lease_token,poll_lease_expires_at=pg_catalog.clock_timestamp()+interval '2 minutes',
      updated_at=pg_catalog.clock_timestamp() where subscriber_id=v_candidate.subscriber_id
      and generation=v_candidate.generation returning * into v_import;
    select template_contract->>'topicId' into v_topic_id from private.marketing_generations
      where subscriber_id=v_subscriber.id and generation=v_subscriber.generation;
    v_work:=v_work||pg_catalog.jsonb_build_array(private.marketing_import_work(v_import,false)||pg_catalog.jsonb_build_object(
      'email',v_subscriber.normalized_email,'currentGeneration',v_subscriber.generation,'currentRevision',v_subscriber.revision,
      'currentSubscribed',v_subscriber.status='confirmed' and v_subscriber.global_allowed and v_subscriber.topic_allowed,
      'currentTopicId',v_topic_id,'leaseToken',p_lease_token));
    exit when pg_catalog.jsonb_array_length(v_work)>=p_limit;
  end loop;
  return v_work;
end $$;

create function public.finish_marketing_contact_import(p_subscriber_id uuid,p_generation bigint,p_lease_token uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_subscriber private.marketing_subscribers%rowtype; v_import private.marketing_contact_imports%rowtype;
begin
  if p_outcome is null or p_outcome not in ('pending','completed','failed') then
    raise exception using errcode='22023',message='invalid marketing import poll result'; end if;
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id;
  if not found then return false; end if;
  perform private.marketing_address_lock(v_subscriber.normalized_email);
  select * into v_subscriber from private.marketing_subscribers where id=p_subscriber_id for update;
  select * into v_import from private.marketing_contact_imports
    where subscriber_id=p_subscriber_id and generation=p_generation for update;
  if not found or p_lease_token is null or v_import.poll_lease_token is distinct from p_lease_token
    or v_import.poll_lease_expires_at<=pg_catalog.clock_timestamp()
    or v_import.state not in ('admitted','submitted','uncertain') then return false; end if;
  if p_outcome<>'pending' and v_import.provider_import_id is null then return false; end if;
  update private.marketing_contact_imports set state=case when p_outcome='pending'
      then case when provider_import_id is null then 'uncertain' else 'submitted' end else p_outcome end,
    poll_lease_token=null,poll_lease_expires_at=null,next_poll_at=pg_catalog.clock_timestamp()+interval '1 minute',
    completed_at=case when p_outcome='pending' then null else pg_catalog.clock_timestamp() end,
    updated_at=pg_catalog.clock_timestamp() where subscriber_id=p_subscriber_id and generation=p_generation;
  if p_outcome<>'pending' or v_subscriber.status<>'confirmed' or not v_subscriber.global_allowed or not v_subscriber.topic_allowed then
    perform private.refresh_marketing_sync(v_subscriber);
  end if;
  return true;
end $$;
revoke all on function private.marketing_import_work(private.marketing_contact_imports,boolean),
  public.admit_marketing_contact_import(uuid,bigint,uuid),public.record_marketing_contact_import(uuid,bigint,uuid,uuid,text,jsonb),
  public.claim_marketing_contact_imports(uuid,integer),public.finish_marketing_contact_import(uuid,bigint,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.marketing_import_work(private.marketing_contact_imports,boolean),
  public.admit_marketing_contact_import(uuid,bigint,uuid),public.record_marketing_contact_import(uuid,bigint,uuid,uuid,text,jsonb),
  public.claim_marketing_contact_imports(uuid,integer),public.finish_marketing_contact_import(uuid,bigint,uuid,text) to service_role;

-- Sanitized service-only operations view: no address, token, message body, or template configuration.
create function public.read_marketing_operations(p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_work jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode='22023',message='invalid marketing operations limit'; end if;
  select coalesce(pg_catalog.jsonb_agg(x.work order by x.updated_at desc,x.subscriber_id,x.generation),'[]'::jsonb)
    into v_work from (
      select m.updated_at,m.subscriber_id,m.generation,pg_catalog.jsonb_build_object(
        'subscriberId',m.subscriber_id,'generation',m.generation,'importState',m.state,
        'attemptCount',m.attempt_count,'nextSubmissionAt',m.next_submission_at,
        'providerImportId',m.provider_import_id,'firstFailure',m.first_failure,
        'currentConsentStatus',s.status,'currentGeneration',s.generation) as work
      from private.marketing_contact_imports m join private.marketing_subscribers s on s.id=m.subscriber_id
      order by m.updated_at desc,m.subscriber_id,m.generation limit p_limit
    ) x;
  return v_work;
end $$;
revoke all on function public.read_marketing_operations(integer) from public,anon,authenticated,service_role;
grant execute on function public.read_marketing_operations(integer) to service_role;

create function private.preserve_marketing_import_identity() returns trigger language plpgsql
security invoker set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception using errcode='55000',message='marketing import admission must be retained'; end if;
  if row(new.subscriber_id,new.generation,new.confirmation_revision,new.topic_id,new.admitted_at)
      is distinct from row(old.subscriber_id,old.generation,old.confirmation_revision,old.topic_id,old.admitted_at)
    or (old.provider_import_id is not null and new.provider_import_id is distinct from old.provider_import_id)
    or (old.first_failure is not null and new.first_failure is distinct from old.first_failure)
    or (old.state in ('completed','failed','exhausted') and new.state is distinct from old.state)
    or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
    raise exception using errcode='55000',message='marketing import admission and provider identity are immutable'; end if;
  if row(new.admission_token,new.attempt_count,new.attempt_started_at)
      is distinct from row(old.admission_token,old.attempt_count,old.attempt_started_at)
    and not (old.state='retry_wait' and new.state='admitted' and old.provider_import_id is null
      and new.provider_import_id is null and new.admission_token<>old.admission_token
      and new.attempt_count=old.attempt_count+1 and new.attempt_count<=3
      and new.attempt_started_at>=old.next_submission_at
      and new.attempt_started_at<old.admitted_at+interval '1 hour') then
    raise exception using errcode='55000',message='marketing import attempt requires a bounded rejected retry'; end if;
  return new;
end $$;
create trigger preserve_marketing_import_identity before update or delete on private.marketing_contact_imports
  for each row execute function private.preserve_marketing_import_identity();
revoke all on function private.preserve_marketing_import_identity() from public,anon,authenticated,service_role;


create function private.marketing_intent_current(p_intent private.email_intents,p_subscriber private.marketing_subscribers)
returns boolean language sql security invoker set search_path='' as $$
  select coalesce(p_intent.recipient=p_subscriber.normalized_email
    and p_intent.receipt->>'subscriberId'=p_subscriber.id::text
    and (p_intent.receipt->>'generation')::bigint=p_subscriber.generation
    and (p_intent.receipt->>'revision')::bigint=p_subscriber.revision
    and case when p_intent.purpose='marketing_confirmation' then p_subscriber.status='pending'
      and p_subscriber.current_confirmation_hash=pg_catalog.encode(extensions.digest(p_intent.receipt->>'confirmationToken','sha256'),'hex')
      and exists(select 1 from private.marketing_confirmation_tokens t where t.token_hash=p_subscriber.current_confirmation_hash
        and t.subscriber_id=p_subscriber.id and t.generation=p_subscriber.generation and t.consumed_at is null
        and t.expires_at>pg_catalog.clock_timestamp())
    else p_subscriber.status='confirmed' and p_subscriber.global_allowed and p_subscriber.topic_allowed end,false);
$$;
create function private.cancel_ineligible_marketing_intents(p_subscriber private.marketing_subscribers) returns void
language sql security invoker set search_path='' as $$
  update private.email_intents e set
    state=case when e.first_attempt_at is null then 'blocked' when e.lease_token is not null then e.state else 'uncertain' end,
    error_code=case when e.first_attempt_at is null then 'marketing_not_eligible' else 'reconciliation_required' end,
    lease_token=case when e.first_attempt_at is null then null else e.lease_token end,
    lease_expires_at=case when e.first_attempt_at is null then null else e.lease_expires_at end,
    updated_at=pg_catalog.clock_timestamp()
  where e.purpose in ('marketing_confirmation','welcome_initial','welcome_education')
    and e.receipt->>'subscriberId'=p_subscriber.id::text and e.provider_email_id is null
    and e.state in ('queued','leased','retry','uncertain')
    and not private.marketing_intent_current(e,p_subscriber);
$$;
create function private.enqueue_marketing_confirmation(p_subscriber private.marketing_subscribers,p_token text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_generation private.marketing_generations%rowtype;
begin
  perform private.cancel_ineligible_marketing_intents(p_subscriber);
  select * into strict v_generation from private.marketing_generations where subscriber_id=p_subscriber.id and generation=p_subscriber.generation;
  insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key)
    values('sandbox','marketing_confirmation',p_subscriber.normalized_email,pg_catalog.jsonb_build_object(
      'schemaVersion',1,'subscriberId',p_subscriber.id,'generation',p_subscriber.generation,'revision',p_subscriber.revision,
      'confirmationToken',p_token,'templateContract',v_generation.template_contract),'queued',
      'helix:sandbox:marketing_confirmation:'||p_subscriber.id::text||':'||p_subscriber.generation::text||':'||
        pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')) on conflict do nothing;
end $$;
create function private.enqueue_marketing_welcome(p_subscriber private.marketing_subscribers,p_token text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_generation private.marketing_generations%rowtype; v_purpose text; v_due timestamptz;
begin
  perform private.cancel_ineligible_marketing_intents(p_subscriber);
  select * into strict v_generation from private.marketing_generations where subscriber_id=p_subscriber.id and generation=p_subscriber.generation;
  foreach v_purpose in array array['welcome_initial','welcome_education'] loop
    v_due:=v_generation.confirmed_at+case when v_purpose='welcome_education' then interval '72 hours' else interval '0' end;
    insert into private.email_intents(environment,purpose,recipient,receipt,state,idempotency_key,next_attempt_at,created_at)
      values('sandbox',v_purpose,p_subscriber.normalized_email,pg_catalog.jsonb_build_object(
        'schemaVersion',1,'subscriberId',p_subscriber.id,'generation',p_subscriber.generation,'revision',p_subscriber.revision,
        'preferenceToken',p_token,'templateContract',v_generation.template_contract),'queued',
        'helix:sandbox:'||v_purpose||':'||p_subscriber.id::text||':'||p_subscriber.generation::text,v_due,v_generation.confirmed_at)
      on conflict do nothing;
  end loop;
end $$;
revoke all on function private.marketing_intent_current(private.email_intents,private.marketing_subscribers),
  private.cancel_ineligible_marketing_intents(private.marketing_subscribers),
  private.enqueue_marketing_confirmation(private.marketing_subscribers,text),private.enqueue_marketing_welcome(private.marketing_subscribers,text)
  from public,anon,authenticated,service_role;
grant execute on function private.marketing_intent_current(private.email_intents,private.marketing_subscribers),
  private.cancel_ineligible_marketing_intents(private.marketing_subscribers),
  private.enqueue_marketing_confirmation(private.marketing_subscribers,text),private.enqueue_marketing_welcome(private.marketing_subscribers,text) to service_role;

-- Extend the current support/tracking dispatcher guards with marketing admission.
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
    or p_request_payload-(case when v_intent.purpose in ('welcome_initial','welcome_education')
      then array['from','to','reply_to','subject','html','text','tags','headers','topic_id']
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
      and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education')
        and coalesce(error_code,'')='reconciliation_required')
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
    and not (purpose in ('marketing_confirmation','welcome_initial','welcome_education')
      and coalesce(error_code,'') in ('reconciliation_required','marketing_not_eligible','marketing_expired'))
    and lease_token is null and attempt_count<5
    and (first_attempt_at is null or first_attempt_at>pg_catalog.clock_timestamp()-interval '23 hours');
  return found;
end $$;

create or replace function public.finish_email_attempt(
  p_id uuid,p_lease_token uuid,p_outcome text,p_provider_email_id text,p_error_code text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_intent private.email_intents%rowtype;
begin
  if p_outcome is null or p_outcome not in ('accepted','retry','uncertain','blocked','failed')
    or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{0,63}$')
    or (p_provider_email_id is not null and pg_catalog.length(p_provider_email_id) not between 1 and 200)
    or (p_outcome<>'accepted' and p_provider_email_id is not null)
  then raise exception using errcode='22023',message='invalid email attempt result'; end if;
  select * into v_intent from private.email_intents where id=p_id for update;
  if not found or p_lease_token is null or v_intent.lease_token is distinct from p_lease_token
    or v_intent.state not in ('leased','accepted')
    or v_intent.lease_expires_at<=pg_catalog.clock_timestamp() then return false; end if;
  if p_outcome='accepted' and (p_provider_email_id is null or v_intent.first_attempt_at is null) then return false; end if;
  if p_provider_email_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email-provider:'||p_provider_email_id,0));
  end if;
  if p_provider_email_id is not null and (v_intent.provider_email_id is not null and v_intent.provider_email_id<>p_provider_email_id
    or exists(select 1 from private.email_intents where provider_email_id=p_provider_email_id and id<>p_id)) then
    update private.email_intents set error_code='provider_identity_conflict',updated_at=pg_catalog.clock_timestamp() where id=p_id;
    return false;
  end if;
  update private.email_intents set
    state=case when provider_email_id is not null or p_outcome='accepted' then 'accepted'
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education') and first_attempt_at is not null then 'uncertain'
      when p_outcome in ('retry','uncertain') and first_attempt_at is not null
        and (first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5) then 'uncertain'
      else p_outcome end,
    provider_email_id=coalesce(provider_email_id,p_provider_email_id),
    error_code=case when provider_email_id is not null or p_outcome='accepted' then null
      when purpose in ('marketing_confirmation','welcome_initial','welcome_education') and first_attempt_at is not null
        and (p_outcome in ('blocked','failed') or error_code='reconciliation_required'
          or first_attempt_at<=pg_catalog.clock_timestamp()-interval '23 hours' or attempt_count>=5)
        then 'reconciliation_required' else p_error_code end,
    next_attempt_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,60*(2^greatest(attempt_count-1,0)))::integer),
    lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp()
  where id=p_id;
  return true;
end $$;
