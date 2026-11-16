-- Customer-triggered Stripe work is bounded across application instances. These
-- private controls never gate signed webhook settlement or the reconciliation worker.
create table private.checkout_create_receipts (
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9_]{1,128}$'),
  environment public.checkout_environment not null default 'sandbox' check (environment = 'sandbox'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 255),
  order_id uuid not null references public.orders(id),
  owner_key text not null,
  admitted_at timestamptz not null,
  session_id text,
  primary key (account_id, environment, idempotency_key),
  unique (account_id, environment, session_id)
);
create index checkout_create_receipts_order_idx on private.checkout_create_receipts(order_id);

create table private.checkout_admission_budgets (
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9_]{1,128}$'),
  environment public.checkout_environment not null default 'sandbox' check (environment = 'sandbox'),
  budget_key text not null,
  accepted_at timestamptz[] not null default '{}' check (cardinality(accepted_at) <= 30),
  primary key (account_id, environment, budget_key)
);

create table private.checkout_refresh_state (
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9_]{1,128}$'),
  environment public.checkout_environment not null default 'sandbox' check (environment = 'sandbox'),
  target_key text not null,
  lease_token uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  snapshot jsonb,
  primary key (account_id, environment, target_key),
  constraint checkout_refresh_lease_pair check ((lease_token is null) = (lease_until is null))
);

alter table private.checkout_create_receipts enable row level security;
alter table private.checkout_create_receipts force row level security;
alter table private.checkout_admission_budgets enable row level security;
alter table private.checkout_admission_budgets force row level security;
alter table private.checkout_refresh_state enable row level security;
alter table private.checkout_refresh_state force row level security;
revoke all on private.checkout_create_receipts, private.checkout_admission_budgets,
  private.checkout_refresh_state from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert, update on private.checkout_create_receipts,
  private.checkout_admission_budgets, private.checkout_refresh_state to service_role;

create function private.validate_checkout_refresh_snapshot(p_snapshot jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' then return false; end if;
  if p_snapshot->>'kind' = 'shipping_rate' then
    return (select pg_catalog.count(*) = 4 from pg_catalog.jsonb_object_keys(p_snapshot))
      and p_snapshot ?& array['kind','id','amountCents','currency']
      and p_snapshot->>'id' ~ '^shr_[A-Za-z0-9_]{1,200}$'
      and p_snapshot->>'currency' = 'usd'
      and pg_catalog.jsonb_typeof(p_snapshot->'amountCents') = 'number'
      and p_snapshot->>'amountCents' ~ '^[0-9]{1,10}$'
      and (p_snapshot->>'amountCents')::numeric <= 2147483647;
  end if;
  if not (p_snapshot->>'kind' = 'session'
    and (select pg_catalog.count(*) = 8 from pg_catalog.jsonb_object_keys(p_snapshot))
    and p_snapshot ?& array['kind','id','status','payment_status','expires_at','url','livemode','payment_method_types']
    and p_snapshot->>'id' ~ '^cs_[A-Za-z0-9_]{1,200}$'
    and p_snapshot->>'status' in ('open','complete','expired')
    and p_snapshot->>'payment_status' in ('paid','unpaid','no_payment_required')
    and p_snapshot->'livemode' = 'false'::jsonb
    and pg_catalog.jsonb_typeof(p_snapshot->'expires_at') = 'number'
    and p_snapshot->>'expires_at' ~ '^[0-9]{1,10}$'
    and (p_snapshot->>'expires_at')::numeric between 1 and 9999999999
    and (p_snapshot->'url' = 'null'::jsonb or
      (pg_catalog.jsonb_typeof(p_snapshot->'url') = 'string'
        and p_snapshot->>'url' ~ '^https://'
        and pg_catalog.char_length(p_snapshot->>'url') <= 4096))
    and pg_catalog.jsonb_typeof(p_snapshot->'payment_method_types') = 'array') then return false; end if;
  return pg_catalog.jsonb_array_length(p_snapshot->'payment_method_types') <= 30
    and not exists (select 1 from pg_catalog.jsonb_array_elements(p_snapshot->'payment_method_types') method
      where pg_catalog.jsonb_typeof(method) <> 'string' or method #>> '{}' !~ '^[a-z][a-z0-9_]{0,63}$');
end;
$$;

-- Resolve only server-authorized targets. Ownership is established by the caller
-- before this service-only RPC; arbitrary browser Session IDs are never forwarded.
create function private.checkout_refresh_target(
  p_account_id text, p_kind text, p_order_id uuid, p_attempt_token uuid, p_target_id text
) returns text language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders%rowtype; v_key text;
begin
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]{1,128}$'
    or p_target_id is null or pg_catalog.char_length(p_target_id) not between 1 and 255
  then raise exception using errcode='22023', message='invalid checkout refresh target'; end if;
  if p_kind = 'shipping_rate' then
    if p_order_id is not null or p_attempt_token is not null or p_target_id !~ '^shr_[A-Za-z0-9_]{1,200}$'
    then raise exception using errcode='22023', message='invalid shipping refresh target'; end if;
    return 'shipping_rate:' || p_target_id;
  end if;
  select * into v_order from public.orders where id=p_order_id and checkout_environment='sandbox';
  if not found then raise exception using errcode='P0001', message='checkout refresh target is unavailable'; end if;
  if p_kind = 'attempt' then
    if p_attempt_token is null or v_order.checkout_attempt_token is distinct from p_attempt_token
      or v_order.checkout_attempt_started_at is null
      or v_order.checkout_attempt_started_at <= pg_catalog.clock_timestamp()-interval '5 minutes'
      or v_order.metadata->>'stripe_idempotency_key' is distinct from p_target_id
      or not exists (select 1 from private.checkout_create_receipts r where r.account_id=p_account_id
        and r.environment='sandbox' and r.order_id=p_order_id and r.idempotency_key=p_target_id)
    then raise exception using errcode='P0001', message='checkout attempt refresh is unavailable'; end if;
    return 'attempt:' || p_target_id;
  elsif p_kind = 'session' then
    if p_attempt_token is not null or p_target_id !~ '^cs_[A-Za-z0-9_]{1,200}$'
      or (v_order.stripe_checkout_session_id is distinct from p_target_id and not exists (
        select 1 from public.payment_attempts p where p.order_id=p_order_id
          and p.checkout_environment='sandbox' and p.stripe_checkout_session_id=p_target_id))
    then raise exception using errcode='P0001', message='checkout session refresh is unavailable'; end if;
    select 'attempt:' || r.idempotency_key into v_key from private.checkout_create_receipts r
      where r.account_id=p_account_id and r.environment='sandbox' and r.order_id=p_order_id and r.session_id=p_target_id;
    -- Attachment commits before the creation response seeds the cache. Resolve
    -- that interval from the trusted local key, so it cannot gain a second lease
    -- under a temporary Session target. Historical Sessions retain their binding.
    if v_key is null and v_order.stripe_checkout_session_id=p_target_id then
      select 'attempt:' || r.idempotency_key into v_key from private.checkout_create_receipts r
        where r.account_id=p_account_id and r.environment='sandbox' and r.order_id=p_order_id
          and r.idempotency_key=v_order.metadata->>'stripe_idempotency_key'
          and (r.session_id is null or r.session_id=p_target_id);
    end if;
    return coalesce(v_key, 'session:' || p_target_id);
  end if;
  raise exception using errcode='22023', message='invalid checkout refresh kind';
end;
$$;

create function public.admit_checkout_creation(
  p_account_id text, p_order_id uuid, p_attempt_token uuid, p_stripe_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.orders%rowtype; v_receipt private.checkout_create_receipts%rowtype;
  v_owner text; v_now timestamptz; v_global timestamptz[]; v_person timestamptz[]; v_retry integer;
begin
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]{1,128}$'
    or p_order_id is null or p_attempt_token is null or p_stripe_idempotency_key is null
    or pg_catalog.char_length(p_stripe_idempotency_key) > 255
    or p_stripe_idempotency_key not like 'stripe-session:' || p_order_id::text || ':%'
  then raise exception using errcode='22023', message='invalid checkout admission'; end if;
  -- All create admissions acquire account lock before Order lock. No provider I/O
  -- occurs inside the transaction; only this short admission decision is serialized.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-admission:sandbox:create:' || p_account_id,0));
  select * into v_order from public.orders where id=p_order_id for update;
  v_now := pg_catalog.clock_timestamp();
  if not found or v_order.checkout_environment <> 'sandbox'
    or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.checkout_attempt_started_at is null or v_order.checkout_attempt_started_at <= v_now-interval '5 minutes'
    or v_order.status not in ('pending_payment','payment_failed')
    or v_order.cart_id is null or v_order.checkout_generation is null or v_order.total_cents <= 0
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or v_order.metadata->>'stripe_creation_outcome' is distinct from 'creating'
  then raise exception using errcode='P0001', message='checkout admission claim is unavailable'; end if;
  v_owner := case when v_order.user_id is null then 'guest:' || v_order.cart_id::text else 'user:' || v_order.user_id::text end;
  select * into v_receipt from private.checkout_create_receipts where account_id=p_account_id
    and environment='sandbox' and idempotency_key=p_stripe_idempotency_key;
  if found then
    if v_receipt.order_id <> p_order_id or v_receipt.owner_key <> v_owner
    then raise exception using errcode='P0001', message='checkout admission receipt does not match'; end if;
    return pg_catalog.jsonb_build_object('allowed',true,'replay',true,'retry_after_seconds',0);
  end if;
  if v_order.stripe_checkout_session_id is not null
  then raise exception using errcode='P0001', message='checkout session already attached'; end if;
  select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_global
    from private.checkout_admission_budgets b cross join lateral pg_catalog.unnest(b.accepted_at) t
    where b.account_id=p_account_id and b.environment='sandbox' and b.budget_key='create:account' and t>v_now-interval '1 minute';
  select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_person
    from private.checkout_admission_budgets b cross join lateral pg_catalog.unnest(b.accepted_at) t
    where b.account_id=p_account_id and b.environment='sandbox' and b.budget_key='create:owner:' || v_owner and t>v_now-interval '1 minute';
  if pg_catalog.cardinality(v_global)>=10 or pg_catalog.cardinality(v_person)>=5 then
    v_retry := greatest(1, ceil(extract(epoch from (greatest(
      case when pg_catalog.cardinality(v_global)>=10 then v_global[1] end,
      case when pg_catalog.cardinality(v_person)>=5 then v_person[1] end
    )+interval '1 minute'-v_now)))::integer);
    return pg_catalog.jsonb_build_object('allowed',false,'replay',false,'retry_after_seconds',v_retry);
  end if;
  insert into private.checkout_create_receipts(account_id,idempotency_key,order_id,owner_key,admitted_at)
    values(p_account_id,p_stripe_idempotency_key,p_order_id,v_owner,v_now);
  insert into private.checkout_admission_budgets(account_id,budget_key,accepted_at) values
    (p_account_id,'create:account',pg_catalog.array_append(v_global,v_now)),
    (p_account_id,'create:owner:' || v_owner,pg_catalog.array_append(v_person,v_now))
    on conflict(account_id,environment,budget_key) do update set accepted_at=excluded.accepted_at;
  return pg_catalog.jsonb_build_object('allowed',true,'replay',false,'retry_after_seconds',0);
end;
$$;

create function public.claim_checkout_refresh(
  p_account_id text,p_kind text,p_order_id uuid,p_attempt_token uuid,p_target_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_target text; v_state private.checkout_refresh_state%rowtype;
  v_now timestamptz; v_recent timestamptz[]; v_token uuid; v_retry integer;
begin
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]{1,128}$'
  then raise exception using errcode='22023', message='invalid checkout refresh account'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-admission:sandbox:refresh:' || p_account_id,0));
  v_target := private.checkout_refresh_target(p_account_id,p_kind,p_order_id,p_attempt_token,p_target_id);
  v_now := pg_catalog.clock_timestamp();
  select * into v_state from private.checkout_refresh_state where account_id=p_account_id and environment='sandbox' and target_key=v_target;
  if v_state.lease_until > v_now or v_state.last_started_at > v_now-interval '5 seconds' then
    v_retry := greatest(1,ceil(extract(epoch from (greatest(v_state.lease_until,v_state.last_started_at+interval '5 seconds')-v_now)))::integer);
    return pg_catalog.jsonb_build_object('allowed',false,'token',null,'cached',v_state.snapshot,'retry_after_seconds',v_retry);
  end if;
  select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_recent
    from private.checkout_admission_budgets b cross join lateral pg_catalog.unnest(b.accepted_at) t
    where b.account_id=p_account_id and b.environment='sandbox' and b.budget_key='refresh:account' and t>v_now-interval '1 minute';
  if pg_catalog.cardinality(v_recent)>=30 then
    v_retry := greatest(1,ceil(extract(epoch from (v_recent[1]+interval '1 minute'-v_now)))::integer);
    return pg_catalog.jsonb_build_object('allowed',false,'token',null,'cached',v_state.snapshot,'retry_after_seconds',v_retry);
  end if;
  v_token := extensions.gen_random_uuid();
  insert into private.checkout_refresh_state(account_id,target_key,lease_token,lease_until,last_started_at)
    values(p_account_id,v_target,v_token,v_now+interval '30 seconds',v_now)
    on conflict(account_id,environment,target_key) do update set lease_token=excluded.lease_token,
      lease_until=excluded.lease_until,last_started_at=excluded.last_started_at;
  insert into private.checkout_admission_budgets(account_id,budget_key,accepted_at)
    values(p_account_id,'refresh:account',pg_catalog.array_append(v_recent,v_now))
    on conflict(account_id,environment,budget_key) do update set accepted_at=excluded.accepted_at;
  return pg_catalog.jsonb_build_object('allowed',true,'token',v_token,'cached',v_state.snapshot,'retry_after_seconds',0);
end;
$$;

create function public.finish_checkout_refresh(
  p_account_id text,p_kind text,p_order_id uuid,p_attempt_token uuid,p_target_id text,
  p_refresh_token uuid,p_snapshot jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_target text; v_count integer;
begin
  if p_refresh_token is null then return false; end if;
  v_target := private.checkout_refresh_target(p_account_id,p_kind,p_order_id,p_attempt_token,p_target_id);
  if p_snapshot is not null and (
    private.validate_checkout_refresh_snapshot(p_snapshot) is not true
    or (p_kind='shipping_rate' and (p_snapshot->>'kind'<>'shipping_rate' or p_snapshot->>'id'<>p_target_id))
    or (p_kind='session' and (p_snapshot->>'kind'<>'session' or p_snapshot->>'id'<>p_target_id))
    or (p_kind='attempt' and (p_snapshot->>'kind'<>'session' or not exists (
      select 1 from public.orders where id=p_order_id and stripe_checkout_session_id=p_snapshot->>'id')))
  ) then raise exception using errcode='22023', message='invalid checkout refresh snapshot'; end if;
  update private.checkout_refresh_state set snapshot=coalesce(p_snapshot,snapshot),lease_token=null,lease_until=null
    where account_id=p_account_id and environment='sandbox' and target_key=v_target
      and lease_token=p_refresh_token and lease_until>pg_catalog.clock_timestamp();
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;

create function public.cache_created_checkout_session(
  p_account_id text,p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_snapshot jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders%rowtype; v_count integer;
begin
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]{1,128}$'
    or private.validate_checkout_refresh_snapshot(p_snapshot) is not true or p_snapshot->>'kind'<>'session'
  then raise exception using errcode='22023', message='invalid created checkout snapshot'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-admission:sandbox:refresh:' || p_account_id,0));
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or p_attempt_token is null
    or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.checkout_attempt_started_at is null
    or v_order.checkout_attempt_started_at<=pg_catalog.clock_timestamp()-interval '5 minutes'
    or v_order.metadata->>'stripe_idempotency_key' is distinct from p_stripe_idempotency_key
    or v_order.stripe_checkout_session_id is distinct from p_snapshot->>'id'
  then return false; end if;
  update private.checkout_create_receipts set session_id=p_snapshot->>'id'
    where account_id=p_account_id and environment='sandbox' and order_id=p_order_id
      and idempotency_key=p_stripe_idempotency_key and (session_id is null or session_id=p_snapshot->>'id');
  get diagnostics v_count = row_count;
  if v_count<>1 then return false; end if;
  insert into private.checkout_refresh_state(account_id,target_key,last_started_at,snapshot)
    values(p_account_id,'attempt:' || p_stripe_idempotency_key,pg_catalog.clock_timestamp(),p_snapshot)
    -- A refresh can start after attachment and before this call. Creation may
    -- seed an absent target, but cannot revoke that lease or replace newer facts.
    on conflict(account_id,environment,target_key) do nothing;
  return true;
end;
$$;

revoke all on function private.validate_checkout_refresh_snapshot(jsonb),
  private.checkout_refresh_target(text,text,uuid,uuid,text),
  public.admit_checkout_creation(text,uuid,uuid,text),
  public.claim_checkout_refresh(text,text,uuid,uuid,text),
  public.finish_checkout_refresh(text,text,uuid,uuid,text,uuid,jsonb),
  public.cache_created_checkout_session(text,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.validate_checkout_refresh_snapshot(jsonb),
  private.checkout_refresh_target(text,text,uuid,uuid,text),
  public.admit_checkout_creation(text,uuid,uuid,text),
  public.claim_checkout_refresh(text,text,uuid,uuid,text),
  public.finish_checkout_refresh(text,text,uuid,uuid,text,uuid,jsonb),
  public.cache_created_checkout_session(text,uuid,uuid,text,jsonb) to service_role;
