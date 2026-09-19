-- Durable, minimal sandbox event receipts. The old audit remains untouched.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.payment_event_inbox (
  id uuid primary key default gen_random_uuid(),
  provider_account text not null check (provider_account = 'acct_1Tm9WRFEzyaKzdmq'),
  checkout_environment text not null default 'sandbox' check (checkout_environment = 'sandbox'),
  event_id text not null check (length(event_id) between 5 and 204),
  event_type text not null check (length(event_type) between 1 and 80),
  api_version text,
  provider_created_at timestamptz,
  object_kind text check (object_kind in ('checkout.session','charge','refund')),
  object_id text check (length(object_id) between 4 and 208),
  charge_id text check (charge_id ~ '^(ch|py)_[A-Za-z0-9_]{1,200}$'),
  payment_intent_id text check (payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'),
  received_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','processing','processed','ignored','dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 12),
  lifetime_attempts integer not null default 0 check (lifetime_attempts >= attempts),
  version integer not null default 1 check (version > 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  original_processed_at timestamptz,
  error_code text,
  provenance text not null default 'webhook' check (provenance in ('webhook','legacy')),
  unique(provider_account,checkout_environment,event_id),
  check ((status = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  check (status = 'processing' or (lease_token is null and lease_expires_at is null))
);
create index payment_event_inbox_due on private.payment_event_inbox(next_attempt_at,received_at,id)
  where status in ('pending','processing');
create index payment_event_inbox_operations on private.payment_event_inbox(status,received_at,id);

create table private.payment_worker_health (
  provider_account text primary key check (provider_account='acct_1Tm9WRFEzyaKzdmq'),
  checkout_environment text not null check (checkout_environment='sandbox'),
  run_token uuid,
  run_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  processed_count integer not null default 0 check (processed_count between 0 and 20),
  failure_count integer not null default 0 check (failure_count between 0 and 20),
  claimed_count integer not null default 0 check (claimed_count between 0 and 20),
  check ((run_token is null) = (run_expires_at is null))
);
insert into private.payment_worker_health(provider_account,checkout_environment)
values('acct_1Tm9WRFEzyaKzdmq','sandbox');

create table private.payment_event_incidents (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references private.payment_event_inbox(id),
  code text not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique(item_id,code)
);
create index payment_event_incidents_unresolved on private.payment_event_incidents(created_at,id) where resolved_at is null;

create table private.payment_refund_observations (
  refund_id text primary key check (refund_id ~ '^(re|pyr)_[A-Za-z0-9_]{1,200}$'),
  charge_id text not null check (charge_id ~ '^(ch|py)_[A-Za-z0-9_]{1,200}$'),
  payment_intent_id text not null check (payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'),
  order_id uuid,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency='usd'),
  status text not null check (status in ('pending','requires_action','succeeded','failed','canceled','unknown')),
  observed_at timestamptz not null default clock_timestamp(),
  succeeded_previously boolean not null default false,
  item_id uuid not null references private.payment_event_inbox(id)
);
create index payment_refund_observations_charge on private.payment_refund_observations(charge_id,refund_id);

create table private.payment_replay_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  phase text not null check (phase in ('dry_run','apply')),
  actor_id uuid not null,
  item_id uuid not null references private.payment_event_inbox(id),
  expected_version integer not null check(expected_version > 0),
  reason text not null check(length(btrim(reason)) between 10 and 500),
  prior_attempts integer not null check(prior_attempts between 0 and 12),
  prior_status text not null check(prior_status in ('pending','processing','processed','ignored','dead_letter')),
  prior_processed_at timestamptz,
  result_version integer not null check(result_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id,phase)
);

create function private.payment_incident_code_valid(p_code text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_code in ('identity_conflict','invalid_legacy_envelope','attempts_exhausted','overdue',
    'provider_pending','binding_pending','provider_unavailable','storage_unavailable',
    'verification_mismatch','provider_identity_mismatch','provider_schema_mismatch',
    'refund_pending','refund_failed','refund_partial','refund_requires_action',
    'refund_reconciliation_failed','refund_status_reversed','worker_deadline','unknown_failure')
$$;
alter table private.payment_event_inbox add constraint payment_event_error_code_safe
  check(error_code is null or private.payment_incident_code_valid(error_code));
alter table private.payment_event_incidents add constraint payment_event_incident_code_safe
  check(private.payment_incident_code_valid(code));

create function private.payment_envelope_valid(p_envelope jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare v_kind text; v_type text;
begin
  if jsonb_typeof(p_envelope) is distinct from 'object'
    or (p_envelope - array['accountId','environment','eventId','eventType','apiVersion','createdAt','objectKind','objectId','chargeId','paymentIntentId']) <> '{}'::jsonb
    or p_envelope->>'accountId' is distinct from 'acct_1Tm9WRFEzyaKzdmq'
    or p_envelope->>'environment' is distinct from 'sandbox'
    or p_envelope->>'apiVersion' is distinct from '2026-06-24.dahlia'
    or coalesce(p_envelope->>'eventId','') !~ '^evt_[A-Za-z0-9_]{1,200}$'
    or jsonb_typeof(p_envelope->'createdAt') is distinct from 'string'
    or coalesce(p_envelope->>'createdAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.000Z$'
    or (p_envelope->>'createdAt')::timestamptz is null
    or (p_envelope->>'chargeId' is not null and p_envelope->>'chargeId' !~ '^(ch|py)_[A-Za-z0-9_]{1,200}$')
    or (p_envelope->>'paymentIntentId' is not null and p_envelope->>'paymentIntentId' !~ '^pi_[A-Za-z0-9_]{1,200}$') then return false; end if;
  v_type := p_envelope->>'eventType'; v_kind := p_envelope->>'objectKind';
  return coalesce((v_type in ('checkout.session.completed','checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed','checkout.session.expired') and v_kind='checkout.session'
    and p_envelope->>'objectId' ~ '^cs_test_[A-Za-z0-9_]{1,200}$' and p_envelope->>'chargeId' is null)
    or (v_type='charge.refunded' and v_kind='charge' and p_envelope->>'objectId' ~ '^(ch|py)_[A-Za-z0-9_]{1,200}$' and p_envelope->>'chargeId'=p_envelope->>'objectId')
    or (v_type in ('refund.created','refund.updated','refund.failed') and v_kind='refund'
      and p_envelope->>'objectId' ~ '^(re|pyr)_[A-Za-z0-9_]{1,200}$'),false);
exception when others then return false;
end $$;

create function private.payment_inbox_envelope(p_item private.payment_event_inbox) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('accountId',p_item.provider_account,'environment',p_item.checkout_environment,
    'eventId',p_item.event_id,'eventType',p_item.event_type,'apiVersion',p_item.api_version,
    'createdAt',to_char(coalesce(p_item.provider_created_at,date_trunc('second',p_item.received_at)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'objectKind',p_item.object_kind,'objectId',p_item.object_id,'chargeId',p_item.charge_id,
    'paymentIntentId',p_item.payment_intent_id)
$$;

create function private.payment_inbox_identity_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if row(new.id,new.provider_account,new.checkout_environment,new.event_id,new.event_type,new.api_version,
      new.provider_created_at,new.object_kind,new.object_id,new.charge_id,new.payment_intent_id,new.received_at,
      new.original_processed_at,new.provenance)
    is distinct from row(old.id,old.provider_account,old.checkout_environment,old.event_id,old.event_type,old.api_version,
      old.provider_created_at,old.object_kind,old.object_id,old.charge_id,old.payment_intent_id,old.received_at,
      old.original_processed_at,old.provenance)
  then raise exception using errcode='55000',message='Payment receipt identity is immutable'; end if;
  return new;
end $$;
create trigger payment_inbox_identity_immutable before update on private.payment_event_inbox
for each row execute function private.payment_inbox_identity_immutable();
create function private.payment_replay_audit_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  raise exception using errcode='55000',message='Payment replay audit is immutable';
end $$;
create trigger payment_replay_audit_immutable before update or delete on private.payment_replay_audit
for each row execute function private.payment_replay_audit_immutable();

create function public.receive_payment_event(p_envelope jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_item private.payment_event_inbox; v_id uuid;
begin
  if not private.payment_envelope_valid(p_envelope) then
    raise exception using errcode='22023',message='Invalid payment event envelope'; end if;
  insert into private.payment_event_inbox(provider_account,checkout_environment,event_id,event_type,api_version,
    provider_created_at,object_kind,object_id,charge_id,payment_intent_id)
  values(p_envelope->>'accountId','sandbox',p_envelope->>'eventId',p_envelope->>'eventType',p_envelope->>'apiVersion',
    (p_envelope->>'createdAt')::timestamptz,p_envelope->>'objectKind',p_envelope->>'objectId',
    p_envelope->>'chargeId',p_envelope->>'paymentIntentId')
  on conflict(provider_account,checkout_environment,event_id) do nothing returning id into v_id;
  if v_id is not null then return jsonb_build_object('status','received','itemId',v_id); end if;
  select * into strict v_item from private.payment_event_inbox
    where provider_account=p_envelope->>'accountId' and checkout_environment='sandbox' and event_id=p_envelope->>'eventId' for update;
  if v_item.event_type is distinct from p_envelope->>'eventType'
    or (v_item.object_id is not null and v_item.object_id is distinct from p_envelope->>'objectId')
    or (v_item.provenance='webhook' and (
      v_item.api_version is distinct from p_envelope->>'apiVersion'
      or v_item.provider_created_at is distinct from (p_envelope->>'createdAt')::timestamptz
      or v_item.object_kind is distinct from p_envelope->>'objectKind'
      or v_item.charge_id is distinct from p_envelope->>'chargeId'
      or v_item.payment_intent_id is distinct from p_envelope->>'paymentIntentId')) then
    insert into private.payment_event_incidents(item_id,code) values(v_item.id,'identity_conflict')
      on conflict(item_id,code) do update set resolved_at=null;
    update private.payment_event_inbox set error_code='identity_conflict',version=version+1,
      status=case when status in ('pending','processing') then 'dead_letter' else status end,
      lease_token=null,lease_expires_at=null where id=v_item.id;
    return jsonb_build_object('status','conflict','itemId',v_item.id);
  end if;
  return jsonb_build_object('status','duplicate','itemId',v_item.id);
end $$;

create function public.claim_payment_worker_run() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_health private.payment_worker_health; v_now timestamptz; v_token uuid; v_item_id uuid;
begin
  select * into strict v_health from private.payment_worker_health
    where provider_account='acct_1Tm9WRFEzyaKzdmq' for update;
  v_now := clock_timestamp();
  if v_health.run_token is not null and v_health.run_expires_at > v_now then return null; end if;
  v_token := gen_random_uuid();
  update private.payment_worker_health set run_token=v_token,run_expires_at=v_now+interval '90 seconds',
    started_at=v_now,claimed_count=0 where provider_account=v_health.provider_account;
  for v_item_id in select i.id from private.payment_event_inbox i
    where i.status in ('pending','processing') and i.received_at < v_now-interval '15 minutes'
      and not exists(select 1 from private.payment_event_incidents n
        where n.item_id=i.id and n.code='overdue' and n.resolved_at is null)
    order by i.received_at,i.id limit 20 for update of i skip locked
  loop
    if clock_timestamp() >= v_now+interval '90 seconds' then
      raise exception using errcode='40001',message='Payment worker lease expired during maintenance'; end if;
    insert into private.payment_event_incidents(item_id,code) values(v_item_id,'overdue')
      on conflict(item_id,code) do update set resolved_at=null;
  end loop;
  if clock_timestamp() >= v_now+interval '90 seconds' then
    raise exception using errcode='40001',message='Payment worker lease expired during maintenance'; end if;
  return jsonb_build_object('token',v_token,'expiresAt',v_now+interval '90 seconds');
end $$;

create function public.claim_payment_events(p_run_token uuid,p_limit integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_health private.payment_worker_health; v_now timestamptz; v_item private.payment_event_inbox;
  v_result jsonb := '[]'::jsonb; v_count integer := 0;
begin
  if p_run_token is null or p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode='22023',message='Invalid payment claim'; end if;
  select * into strict v_health from private.payment_worker_health
    where provider_account='acct_1Tm9WRFEzyaKzdmq' for update;
  v_now := clock_timestamp();
  if v_health.run_token is distinct from p_run_token or v_health.run_expires_at <= v_now then return v_result; end if;
  -- A crashed twelfth attempt is exhausted without issuing another provider call.
  for v_item in select * from private.payment_event_inbox
    where attempts >= 12 and (status='pending' or (status='processing' and lease_expires_at <= v_now))
    order by received_at,id limit 20 for update skip locked
  loop
    if clock_timestamp() >= v_health.run_expires_at then
      raise exception using errcode='40001',message='Payment worker lease expired during maintenance'; end if;
    update private.payment_event_inbox set status='dead_letter',error_code='attempts_exhausted',
      lease_token=null,lease_expires_at=null,version=version+1 where id=v_item.id;
    insert into private.payment_event_incidents(item_id,code) values(v_item.id,'attempts_exhausted')
      on conflict(item_id,code) do update set resolved_at=null;
  end loop;
  if clock_timestamp() >= v_health.run_expires_at then
    raise exception using errcode='40001',message='Payment worker lease expired during maintenance'; end if;
  if v_health.claimed_count >= 20 then return v_result; end if;
  for v_item in select * from private.payment_event_inbox
    where attempts < 12 and next_attempt_at <= v_now
      and (status='pending' or (status='processing' and lease_expires_at <= v_now))
    order by next_attempt_at,received_at,id limit least(p_limit,20-v_health.claimed_count) for update skip locked
  loop
    v_now := clock_timestamp();
    if v_health.run_expires_at <= v_now then exit; end if;
    update private.payment_event_inbox set status='processing',attempts=attempts+1,lifetime_attempts=lifetime_attempts+1,
      version=version+1,lease_token=gen_random_uuid(),lease_expires_at=v_now+interval '90 seconds'
      where id=v_item.id returning * into v_item;
    v_count := v_count+1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_item.id,
      'envelope',private.payment_inbox_envelope(v_item),'attempts',v_item.attempts,
      'lifetimeAttempts',v_item.lifetime_attempts,'version',v_item.version,
      'leaseToken',v_item.lease_token,'leaseExpiresAt',v_item.lease_expires_at));
  end loop;
  update private.payment_worker_health set claimed_count=claimed_count+v_count
    where provider_account=v_health.provider_account;
  if clock_timestamp() >= v_health.run_expires_at then
    raise exception using errcode='40001',message='Payment worker lease expired during claim'; end if;
  return v_result;
end $$;

create function private.lock_payment_event_lease(p_run_token uuid,p_item_id uuid,p_lease_token uuid,p_expected_version integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_health private.payment_worker_health; v_item private.payment_event_inbox; v_now timestamptz;
begin
  select * into strict v_health from private.payment_worker_health
    where provider_account='acct_1Tm9WRFEzyaKzdmq' for update;
  select * into v_item from private.payment_event_inbox where id=p_item_id for update;
  v_now := clock_timestamp();
  return coalesce(v_health.run_token=p_run_token and v_health.run_expires_at > v_now
    and v_item.status='processing' and v_item.lease_token=p_lease_token
    and v_item.lease_expires_at > v_now and v_item.version=p_expected_version,false);
end $$;

create function public.finish_payment_event(p_run_token uuid,p_item_id uuid,p_lease_token uuid,
  p_expected_version integer,p_disposition text,p_code text default null,p_retry_after_seconds integer default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_item private.payment_event_inbox; v_now timestamptz; v_state text; v_code text; v_delay integer;
begin
  if p_disposition is null or p_disposition not in ('processed','ignored','pending','dead_letter')
    or (p_code is not null and not private.payment_incident_code_valid(p_code))
    or (p_disposition in ('pending','dead_letter') and p_code is null)
    or (p_disposition='pending' and (p_retry_after_seconds is null or p_retry_after_seconds < 60 or p_retry_after_seconds > 604800))
    or (p_disposition <> 'pending' and p_retry_after_seconds is not null) then
    raise exception using errcode='22023',message='Invalid payment outcome'; end if;
  if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then return false; end if;
  select * into strict v_item from private.payment_event_inbox where id=p_item_id;
  v_now := clock_timestamp(); v_state := p_disposition; v_code := p_code;
  if v_state='pending' and v_item.attempts >= 12 then v_state := 'dead_letter'; v_code := 'attempts_exhausted'; end if;
  if v_state='pending' then
    v_delay := greatest(p_retry_after_seconds,least(3600,60*(2^least(v_item.attempts-1,6))::integer));
  end if;
  update private.payment_event_inbox set status=v_state,error_code=v_code,version=version+1,
    next_attempt_at=case when v_state='pending' then v_now+make_interval(secs=>v_delay) else next_attempt_at end,
    lease_token=null,lease_expires_at=null,
    processed_at=case when v_state in ('processed','ignored') then v_now else null end where id=p_item_id;
  if v_code is not null then
    insert into private.payment_event_incidents(item_id,code) values(p_item_id,v_code)
      on conflict(item_id,code) do update set resolved_at=null;
  end if;
  if v_state in ('processed','ignored') then
    update private.payment_event_incidents set resolved_at=v_now where item_id=p_item_id and resolved_at is null
      and code in ('overdue','provider_pending','binding_pending','provider_unavailable','storage_unavailable','worker_deadline','unknown_failure');
  end if;
  if v_item.lease_expires_at <= clock_timestamp() or not exists(
    select 1 from private.payment_worker_health where run_token=p_run_token and run_expires_at > clock_timestamp()) then
    raise exception using errcode='40001',message='Payment lease expired during completion'; end if;
  return true;
end $$;

create function public.record_payment_event_incident(p_run_token uuid,p_item_id uuid,p_lease_token uuid,
  p_expected_version integer,p_code text) returns boolean
language plpgsql security invoker set search_path='' as $$ begin
  if p_code is null or not private.payment_incident_code_valid(p_code) then
    raise exception using errcode='22023',message='Invalid payment incident'; end if;
  if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then return false; end if;
  insert into private.payment_event_incidents(item_id,code) values(p_item_id,p_code)
    on conflict(item_id,code) do update set resolved_at=null;
  if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then
    raise exception using errcode='40001',message='Payment lease expired during incident persistence'; end if;
  return true;
end $$;

create function public.record_payment_refund_observations(p_run_token uuid,p_item_id uuid,p_lease_token uuid,
  p_expected_version integer,p_facts jsonb,p_exception jsonb default null,p_resolved_exception jsonb default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_fact jsonb; v_old private.payment_refund_observations; v_seen text[] := '{}'; v_code text;
  v_now timestamptz; v_charge text; v_pi text; v_binding jsonb; v_order record;
  v_leased_item private.payment_event_inbox;
  v_succeeded_amount bigint := 0;
begin
  if jsonb_typeof(p_facts) is distinct from 'array' or jsonb_array_length(p_facts) > 500
    or (p_exception is not null and p_resolved_exception is not null) then
    raise exception using errcode='22023',message='Invalid refund observations'; end if;
  if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then return false; end if;
  select * into strict v_leased_item from private.payment_event_inbox where id=p_item_id;
  if v_leased_item.object_kind not in ('charge','refund') then
    raise exception using errcode='22023',message='Refund observations do not match the leased event'; end if;
  v_charge := case when v_leased_item.object_kind='charge' then v_leased_item.object_id else v_leased_item.charge_id end;
  v_pi := v_leased_item.payment_intent_id;
  v_binding := coalesce(p_exception,p_resolved_exception);
  if v_binding is not null then
    if jsonb_typeof(v_binding) is distinct from 'object'
      or (v_binding - case when p_exception is not null then
        array['orderId','sessionId','paymentIntentId','paymentStatus','amountCents']
        else array['orderId','sessionId','paymentIntentId'] end) <> '{}'::jsonb
      or coalesce(v_binding->>'orderId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_binding->>'sessionId','') !~ '^cs_test_[A-Za-z0-9_]{1,200}$'
      or coalesce(v_binding->>'paymentIntentId','') !~ '^pi_[A-Za-z0-9_]{1,200}$'
      or (v_pi is not null and v_pi is distinct from v_binding->>'paymentIntentId')
      or (p_exception is not null and (
        coalesce(p_exception->>'paymentStatus','') not in ('unknown','refunded')
        or jsonb_typeof(p_exception->'amountCents') is distinct from 'number'
        or coalesce(p_exception->>'amountCents','') !~ '^[0-9]{1,10}$'
        or (p_exception->>'amountCents')::bigint > 2147483647)) then
      raise exception using errcode='22023',message='Invalid refund exception binding'; end if;
    select id,status,total_cents,currency,checkout_environment,stripe_checkout_session_id,stripe_payment_intent_id
      into v_order from public.orders where id=(v_binding->>'orderId')::uuid for update;
    if not found or v_order.checkout_environment <> 'sandbox' or v_order.currency <> 'USD'
      or v_order.status not in ('paid','refunded')
      or v_order.stripe_checkout_session_id is distinct from v_binding->>'sessionId'
      or v_order.stripe_payment_intent_id is distinct from v_binding->>'paymentIntentId'
      or (p_resolved_exception is not null and v_order.status <> 'refunded')
      or (p_exception->>'paymentStatus'='unknown' and v_order.status <> 'refunded') then
      raise exception using errcode='22023',message='Refund exception binding does not match'; end if;
    if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then return false; end if;
  end if;
  for v_fact in select value from jsonb_array_elements(p_facts)
  loop
    if jsonb_typeof(v_fact) is distinct from 'object'
      or (v_fact-array['refundId','chargeId','paymentIntentId','orderId','amountCents','currency','status']) <> '{}'::jsonb
      or coalesce(v_fact->>'refundId','') !~ '^(re|pyr)_[A-Za-z0-9_]{1,200}$'
      or coalesce(v_fact->>'chargeId','') !~ '^(ch|py)_[A-Za-z0-9_]{1,200}$'
      or coalesce(v_fact->>'paymentIntentId','') !~ '^pi_[A-Za-z0-9_]{1,200}$'
      or v_fact->>'currency' is distinct from 'usd'
      or coalesce(v_fact->>'status','') not in ('pending','requires_action','succeeded','failed','canceled','unknown')
      or jsonb_typeof(v_fact->'amountCents') is distinct from 'number'
      or coalesce(v_fact->>'amountCents','') !~ '^[0-9]{1,10}$'
      or (v_fact->>'amountCents')::bigint > 2147483647
      or (v_fact->>'orderId' is not null and v_fact->>'orderId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or v_fact->>'refundId'=any(v_seen)
      or (v_charge is not null and v_charge is distinct from v_fact->>'chargeId')
      or (v_pi is not null and v_pi is distinct from v_fact->>'paymentIntentId')
      or (v_binding is not null and (v_fact->>'orderId' is distinct from v_binding->>'orderId'
        or v_fact->>'paymentIntentId' is distinct from v_binding->>'paymentIntentId')) then
      raise exception using errcode='22023',message='Invalid refund observations'; end if;
    v_charge := v_fact->>'chargeId'; v_pi := v_fact->>'paymentIntentId';
    v_seen := array_append(v_seen,v_fact->>'refundId');
    if v_fact->>'status'='succeeded' then v_succeeded_amount := v_succeeded_amount+(v_fact->>'amountCents')::integer; end if;
    select * into v_old from private.payment_refund_observations where refund_id=v_fact->>'refundId' for update;
    if found and (v_old.charge_id is distinct from v_charge or v_old.payment_intent_id is distinct from v_pi
      or v_old.amount_cents is distinct from (v_fact->>'amountCents')::integer
      or (v_old.order_id is not null and v_old.order_id is distinct from (v_fact->>'orderId')::uuid)) then
      raise exception using errcode='22023',message='Refund identity does not match'; end if;
    v_now := clock_timestamp();
    -- Lease expiry is checked again after a possible row-lock wait, before every write.
    if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then
      raise exception using errcode='40001',message='Payment lease expired during refund observations'; end if;
    insert into private.payment_refund_observations(refund_id,charge_id,payment_intent_id,order_id,amount_cents,
      currency,status,observed_at,succeeded_previously,item_id)
    values(v_fact->>'refundId',v_charge,v_pi,(v_fact->>'orderId')::uuid,(v_fact->>'amountCents')::integer,
      'usd',v_fact->>'status',v_now,v_fact->>'status'='succeeded',p_item_id)
    on conflict(refund_id) do update set order_id=coalesce(private.payment_refund_observations.order_id,excluded.order_id),
      status=excluded.status,observed_at=excluded.observed_at,item_id=excluded.item_id,
      succeeded_previously=private.payment_refund_observations.succeeded_previously or excluded.succeeded_previously;
    v_code := case
      when v_old.succeeded_previously and v_fact->>'status'<>'succeeded' then 'refund_status_reversed'
      when v_fact->>'status'='pending' then 'refund_pending'
      when v_fact->>'status'='requires_action' then 'refund_requires_action'
      when v_fact->>'status' in ('failed','canceled') then 'refund_failed'
      when v_fact->>'status'='unknown' then 'provider_schema_mismatch' else null end;
    if v_code is not null then
      insert into private.payment_event_incidents(item_id,code) values(p_item_id,v_code)
        on conflict(item_id,code) do update set resolved_at=null;
    end if;
  end loop;
  if v_leased_item.object_kind='refund' and not (v_leased_item.object_id=any(v_seen)) then
    raise exception using errcode='22023',message='Refund observations do not contain the leased refund'; end if;
  if v_binding is not null then
    if (p_exception is not null and ((p_exception->>'amountCents')::bigint <> v_succeeded_amount
        or (p_exception->>'paymentStatus'='refunded' and v_succeeded_amount <> v_order.total_cents)))
      or (p_resolved_exception is not null and v_succeeded_amount <> v_order.total_cents) then
      raise exception using errcode='22023',message='Refund exception amount does not match'; end if;
    if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then
      raise exception using errcode='40001',message='Payment lease expired during refund observations'; end if;
    if p_exception is not null then
      if public.record_checkout_payment_exception(v_order.id,null,v_binding->>'sessionId',
        'full_refund_reconciliation_failed',v_binding->>'paymentIntentId',p_exception->>'paymentStatus',
        (p_exception->>'amountCents')::integer) is distinct from true then
        raise exception using errcode='40001',message='Refund exception persistence failed'; end if;
    else
      if public.resolve_checkout_payment_exceptions(v_order.id,v_binding->>'sessionId',
        'full_refund_reconciliation_failed') is distinct from true then
        raise exception using errcode='40001',message='Refund exception resolution failed'; end if;
      -- Financial reconciliation resolved these observations. Keep their audit rows.
      update private.payment_event_incidents n set resolved_at=clock_timestamp()
        from private.payment_event_inbox i where n.item_id=i.id and n.resolved_at is null
        and n.code in ('refund_pending','refund_failed','refund_partial','refund_requires_action',
          'refund_reconciliation_failed','refund_status_reversed')
        and (i.object_id=v_charge or i.object_id=any(v_seen));
    end if;
  end if;
  -- A customer reconciliation can hold an exception row while the lease expires.
  -- Raising after the final write rolls back the entire facts/exception transaction.
  if not private.lock_payment_event_lease(p_run_token,p_item_id,p_lease_token,p_expected_version) then
    raise exception using errcode='40001',message='Payment lease expired during refund observations'; end if;
  return true;
end $$;

create function public.finish_payment_worker_run(p_run_token uuid,p_processed_count integer,p_failure_count integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_health private.payment_worker_health; v_now timestamptz;
begin
  if p_run_token is null then return false; end if;
  if p_processed_count is null or p_failure_count is null or p_processed_count < 0 or p_failure_count < 0
    or p_processed_count+p_failure_count > 20 then
    raise exception using errcode='22023',message='Invalid payment worker summary'; end if;
  select * into strict v_health from private.payment_worker_health
    where provider_account='acct_1Tm9WRFEzyaKzdmq' for update;
  v_now := clock_timestamp();
  if v_health.run_token is distinct from p_run_token or v_health.run_expires_at <= v_now
    or p_processed_count+p_failure_count > v_health.claimed_count then return false; end if;
  update private.payment_worker_health set completed_at=v_now,processed_count=p_processed_count,
    failure_count=p_failure_count,run_token=null,run_expires_at=null where provider_account=v_health.provider_account;
  return true;
end $$;

-- Service-only operations projection. Counts cover the entire inbox; detail lists
-- are bounded independently and share one PostgreSQL statement snapshot.
create function public.read_payment_operations(p_actor_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_observed_at timestamptz;
  v_result jsonb;
begin
  if p_actor_id is not null then
    perform 1 from public.admin_memberships
      where user_id=p_actor_id and role='admin' and active;
    if not found then
      raise exception using errcode='42501', message='Payment operations access denied.';
    end if;
  end if;

  v_observed_at := clock_timestamp();
  select jsonb_build_object(
    'accountId','acct_1Tm9WRFEzyaKzdmq',
    'environment','sandbox',
    'observedAt',v_observed_at,
    'heartbeat',coalesce((
      select jsonb_build_object(
        'startedAt',h.started_at,'completedAt',h.completed_at,
        'processedCount',h.processed_count,'failureCount',h.failure_count
      ) from private.payment_worker_health h
      where h.provider_account='acct_1Tm9WRFEzyaKzdmq' and h.checkout_environment='sandbox'
    ),jsonb_build_object('startedAt',null,'completedAt',null,'processedCount',0,'failureCount',0)),
    'counts',(
      select jsonb_build_object(
        'pending',count(*) filter(where i.status='pending'),
        'processing',count(*) filter(where i.status='processing'),
        'processed',count(*) filter(where i.status='processed'),
        'ignored',count(*) filter(where i.status='ignored'),
        'dead_letter',count(*) filter(where i.status='dead_letter')
      ) from private.payment_event_inbox i
      where i.provider_account='acct_1Tm9WRFEzyaKzdmq' and i.checkout_environment='sandbox'
    ),
    'oldestPendingAt',(
      select min(i.received_at) from private.payment_event_inbox i
      where i.provider_account='acct_1Tm9WRFEzyaKzdmq' and i.checkout_environment='sandbox'
        and i.status in ('pending','processing')
    ),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'eventId',i.event_id,'eventType',i.event_type,
        'objectId',i.object_id,'state',i.status,
        'attempts',i.attempts,'lifetimeAttempts',i.lifetime_attempts,
        'version',i.version,'receivedAt',i.received_at,'nextAttemptAt',i.next_attempt_at,
        'processedAt',i.processed_at,'incidentCode',i.error_code,
        'replayEligible',private.payment_envelope_valid(private.payment_inbox_envelope(i::private.payment_event_inbox))
          and not (i.status='processing' and i.lease_expires_at > v_observed_at),
        'provenance',i.provenance
      ) order by case when i.status in ('pending','processing','dead_letter') then 0 else 1 end,
        i.received_at,i.id)
      from (
        select q.* from private.payment_event_inbox q
        where q.provider_account='acct_1Tm9WRFEzyaKzdmq' and q.checkout_environment='sandbox'
        order by case when q.status in ('pending','processing','dead_letter') then 0 else 1 end,
          q.received_at,q.id
        limit 100
      ) i
    ),'[]'::jsonb),
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',n.id,'itemId',n.item_id,'code',n.code,
        'createdAt',n.created_at,'resolvedAt',n.resolved_at
      ) order by (n.resolved_at is not null),n.created_at,n.id)
      from (
        select c.* from private.payment_event_incidents c
        join private.payment_event_inbox i on i.id=c.item_id
        where i.provider_account='acct_1Tm9WRFEzyaKzdmq' and i.checkout_environment='sandbox'
        order by (c.resolved_at is not null),c.created_at,c.id limit 100
      ) n
    ),'[]'::jsonb),
    'refunds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'refundId',r.refund_id,'chargeId',r.charge_id,'paymentIntentId',r.payment_intent_id,
        'orderId',r.order_id,'amountCents',r.amount_cents,'currency',r.currency,
        'status',r.status,'observedAt',r.observed_at,'succeededPreviously',r.succeeded_previously
      ) order by r.observed_at desc,r.refund_id)
      from (
        select f.* from private.payment_refund_observations f
        join private.payment_event_inbox i on i.id=f.item_id
        where i.provider_account='acct_1Tm9WRFEzyaKzdmq' and i.checkout_environment='sandbox'
        order by f.observed_at desc,f.refund_id limit 100
      ) r
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- The request UUID serializes retry-safe audit decisions. Queue changes take the
-- same health -> item lock order as the worker and evaluate time after waiting.
create function public.replay_payment_event(
  p_actor_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid,
  p_dry_run boolean default true
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_item private.payment_event_inbox%rowtype;
  v_dry_run private.payment_replay_audit%rowtype;
  v_apply private.payment_replay_audit%rowtype;
  v_has_dry_run boolean;
  v_has_apply boolean;
  v_now timestamptz;
  v_prior_status text;
  v_prior_processed_at timestamptz;
begin
  if p_actor_id is null then
    return jsonb_build_object('status','denied','itemId',p_item_id,'version',null);
  end if;

  -- FOR SHARE conflicts with membership revocation, including non-key updates.
  perform 1 from public.admin_memberships
    where user_id=p_actor_id and role='admin' and active for share;
  if not found then
    return jsonb_build_object('status','denied','itemId',p_item_id,'version',null);
  end if;
  if p_item_id is null or p_request_id is null or p_expected_version is null
    or p_expected_version < 1 or p_dry_run is null or p_reason is null
    or char_length(p_reason) > 500 or char_length(btrim(p_reason)) not between 10 and 500 then
    return jsonb_build_object('status','ineligible','itemId',p_item_id,'version',null);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_dry_run from private.payment_replay_audit
    where request_id=p_request_id and phase='dry_run';
  v_has_dry_run := found;
  select * into v_apply from private.payment_replay_audit
    where request_id=p_request_id and phase='apply';
  v_has_apply := found;

  if (v_has_dry_run and (
      v_dry_run.actor_id is distinct from p_actor_id
      or v_dry_run.item_id is distinct from p_item_id
      or v_dry_run.expected_version is distinct from p_expected_version
      or v_dry_run.reason is distinct from p_reason
    )) or (v_has_apply and (
      v_apply.actor_id is distinct from p_actor_id
      or v_apply.item_id is distinct from p_item_id
      or v_apply.expected_version is distinct from p_expected_version
      or v_apply.reason is distinct from p_reason
    )) then
    return jsonb_build_object('status','conflict','itemId',p_item_id,'version',null);
  end if;
  if not p_dry_run and v_has_apply then
    return jsonb_build_object('status','duplicate','itemId',p_item_id,'version',v_apply.result_version);
  end if;

  perform 1 from private.payment_worker_health
    where provider_account='acct_1Tm9WRFEzyaKzdmq' and checkout_environment='sandbox' for update;
  if not found then
    return jsonb_build_object('status','ineligible','itemId',p_item_id,'version',null);
  end if;
  select * into v_item from private.payment_event_inbox
    where id=p_item_id and provider_account='acct_1Tm9WRFEzyaKzdmq'
      and checkout_environment='sandbox' for update;
  if not found then
    return jsonb_build_object('status','ineligible','itemId',p_item_id,'version',null);
  end if;
  v_now := clock_timestamp();

  if v_item.version <> p_expected_version then
    return jsonb_build_object('status','conflict','itemId',p_item_id,'version',v_item.version);
  end if;
  if not private.payment_envelope_valid(private.payment_inbox_envelope(v_item))
    or (v_item.status='processing' and v_item.lease_expires_at > v_now) then
    return jsonb_build_object('status','ineligible','itemId',p_item_id,'version',v_item.version);
  end if;

  if p_dry_run then
    if not v_has_dry_run then
      insert into private.payment_replay_audit(
        request_id,phase,actor_id,item_id,expected_version,reason,prior_attempts,prior_status,prior_processed_at,result_version,created_at
      ) values (
        p_request_id,'dry_run',p_actor_id,p_item_id,p_expected_version,p_reason,
        v_item.attempts,v_item.status,v_item.processed_at,v_item.version,v_now
      );
    end if;
    return jsonb_build_object('status','eligible','itemId',p_item_id,'version',v_item.version);
  end if;
  if not v_has_dry_run then
    return jsonb_build_object('status','dry_run_required','itemId',p_item_id,'version',v_item.version);
  end if;

  v_prior_status := v_item.status; v_prior_processed_at := v_item.processed_at;
  -- Audit and requeue are one transaction: neither survives failure of the other.
  -- Original processed time, lifetime attempts, financial facts and incidents remain.
  update private.payment_event_inbox
    set status='pending',attempts=0,next_attempt_at=v_now,lease_token=null,lease_expires_at=null,
      processed_at=null,version=version+1
    where id=v_item.id
    returning * into v_item;
  insert into private.payment_replay_audit(
    request_id,phase,actor_id,item_id,expected_version,reason,prior_attempts,prior_status,prior_processed_at,result_version,created_at
  ) values (
    p_request_id,'apply',p_actor_id,p_item_id,p_expected_version,p_reason,
    v_dry_run.prior_attempts,v_prior_status,v_prior_processed_at,v_item.version,v_now
  );
  return jsonb_build_object('status','applied','itemId',p_item_id,'version',v_item.version);
end $$;

revoke all on function public.read_payment_operations(uuid) from public, anon, authenticated;
revoke all on function public.replay_payment_event(uuid,uuid,integer,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.read_payment_operations(uuid) to service_role;
grant execute on function public.replay_payment_event(uuid,uuid,integer,text,uuid,boolean) to service_role;

-- Old payloads did not preserve provider creation time. Keep it unknown, using
-- the original receipt time only when constructing a legacy recovery envelope.
-- Neither timestamp is an authority for payment or refund ordering.
insert into private.payment_event_inbox(provider_account,checkout_environment,event_id,event_type,api_version,
  provider_created_at,object_kind,object_id,charge_id,received_at,status,next_attempt_at,processed_at,original_processed_at,
  error_code,provenance)
select 'acct_1Tm9WRFEzyaKzdmq','sandbox',
  case when e.stripe_event_id ~ '^evt_[A-Za-z0-9_]{1,200}$' then e.stripe_event_id else 'evt_legacy_'||md5(e.stripe_event_id) end,
  case when e.type in ('checkout.session.completed','checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','refund.created','refund.updated','refund.failed')
    then e.type else 'legacy.invalid' end,
  case when e.payload->>'api_version' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}(\.[a-z]{1,30})?$' then e.payload->>'api_version' else null end,
  null,
  case when e.type like 'checkout.session.%' then 'checkout.session' when e.type='charge.refunded' then 'charge'
    when e.type like 'refund.%' then 'refund' else null end,
  case when e.payload->>'object_id' ~ '^(cs_test_|ch_|py_|re_|pyr_)[A-Za-z0-9_]{1,200}$' then e.payload->>'object_id' else null end,
  case when e.type='charge.refunded' and e.payload->>'object_id' ~ '^(ch|py)_[A-Za-z0-9_]{1,200}$'
    then e.payload->>'object_id' else null end,
  e.created_at,case when e.processed_at is not null then 'processed' else 'pending' end,
  clock_timestamp(),e.processed_at,e.processed_at,null,'legacy'
from public.stripe_webhook_events e;
update private.payment_event_inbox i set status=case when status='processed' then status else 'dead_letter' end,
  error_code='invalid_legacy_envelope'
where provenance='legacy' and not private.payment_envelope_valid(private.payment_inbox_envelope(i));
insert into private.payment_event_incidents(item_id,code)
select id,'invalid_legacy_envelope' from private.payment_event_inbox where error_code='invalid_legacy_envelope';

alter table private.payment_event_inbox enable row level security;
alter table private.payment_event_inbox force row level security;
alter table private.payment_worker_health enable row level security;
alter table private.payment_worker_health force row level security;
alter table private.payment_event_incidents enable row level security;
alter table private.payment_event_incidents force row level security;
alter table private.payment_refund_observations enable row level security;
alter table private.payment_refund_observations force row level security;
alter table private.payment_replay_audit enable row level security;
alter table private.payment_replay_audit force row level security;
revoke all on table private.payment_event_inbox,private.payment_worker_health,private.payment_event_incidents,
  private.payment_refund_observations,private.payment_replay_audit from public,anon,authenticated,service_role;
grant select,insert,update on table private.payment_event_inbox,private.payment_worker_health,
  private.payment_event_incidents,private.payment_refund_observations to service_role;
grant select,insert on table private.payment_replay_audit to service_role;
revoke all on function private.payment_incident_code_valid(text),private.payment_envelope_valid(jsonb),
  private.payment_inbox_envelope(private.payment_event_inbox),private.payment_inbox_identity_immutable(),
  private.payment_replay_audit_immutable(),private.lock_payment_event_lease(uuid,uuid,uuid,integer),
  public.receive_payment_event(jsonb),public.claim_payment_worker_run(),public.claim_payment_events(uuid,integer),
  public.finish_payment_event(uuid,uuid,uuid,integer,text,text,integer),
  public.record_payment_refund_observations(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb),
  public.record_payment_event_incident(uuid,uuid,uuid,integer,text),
  public.finish_payment_worker_run(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.payment_incident_code_valid(text),private.payment_envelope_valid(jsonb),
  private.payment_inbox_envelope(private.payment_event_inbox),private.lock_payment_event_lease(uuid,uuid,uuid,integer),
  public.receive_payment_event(jsonb),public.claim_payment_worker_run(),public.claim_payment_events(uuid,integer),
  public.finish_payment_event(uuid,uuid,uuid,integer,text,text,integer),
  public.record_payment_refund_observations(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb),
  public.record_payment_event_incident(uuid,uuid,uuid,integer,text),
  public.finish_payment_worker_run(uuid,integer,integer) to service_role;

-- Authenticated Order-history callers obtain only a verification flag, never
-- the private exception facts. The server supplies the verified account owner.
create function public.read_account_order_payment_exceptions(p_user_id uuid,p_order_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if p_user_id is null or p_order_ids is null or cardinality(p_order_ids) > 10
    or coalesce(array_ndims(p_order_ids),1) <> 1 or array_position(p_order_ids,null) is not null
    or (select count(distinct id) from unnest(p_order_ids) id) <> cardinality(p_order_ids) then
    raise exception using errcode='22023',message='Invalid Order verification request'; end if;
  return (select coalesce(jsonb_agg(o.id order by o.id),'[]'::jsonb) from public.orders o
    where o.id=any(p_order_ids) and o.user_id=p_user_id and o.checkout_environment='sandbox'
      and exists(select 1 from private.checkout_payment_exceptions e
        where e.order_id=o.id and e.session_id=o.stripe_checkout_session_id and e.resolved_at is null));
end $$;
revoke all on function public.read_account_order_payment_exceptions(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_account_order_payment_exceptions(uuid,uuid[]) to service_role;
