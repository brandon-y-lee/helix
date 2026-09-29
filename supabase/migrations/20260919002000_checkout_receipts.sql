-- Receipt authorization survives Cart generations without becoming Cart-wide read access.
alter table public.orders add column receipt_ownership_version bigint not null default 1
  check (receipt_ownership_version > 0);
create function private.advance_checkout_receipt_ownership() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- Deleting an old Cart is housekeeping; replacing it or changing account ownership is not.
  new.receipt_ownership_version := old.receipt_ownership_version + case when
    new.user_id is distinct from old.user_id or
    (new.cart_id is not null and new.cart_id is distinct from old.cart_id)
    then 1 else 0 end;
  return new;
end;
$$;
create trigger orders_receipt_ownership before update on public.orders for each row
execute function private.advance_checkout_receipt_ownership();

create table private.checkout_receipt_cohorts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null check (account_id='acct_1Tm9WRFEzyaKzdmq'),
  environment public.checkout_environment not null default 'sandbox' check (environment='sandbox'),
  guest_owner_hash text not null check (guest_owner_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at=created_at+interval '24 hours'),
  unique (id,account_id)
);
create index checkout_receipt_cohorts_owner_idx on private.checkout_receipt_cohorts(account_id,guest_owner_hash,expires_at);
create table private.checkout_receipt_capabilities (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  account_id text not null check (account_id='acct_1Tm9WRFEzyaKzdmq'),
  cohort_id uuid not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (cohort_id,account_id) references private.checkout_receipt_cohorts(id,account_id),
  check (expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
create index checkout_receipt_capabilities_cohort_idx on private.checkout_receipt_capabilities(cohort_id);
create table private.checkout_receipt_order_windows (
  order_id uuid primary key references public.orders(id),
  account_id text not null check (account_id='acct_1Tm9WRFEzyaKzdmq'),
  environment public.checkout_environment not null default 'sandbox' check (environment='sandbox'),
  guest_owner_hash text not null check (guest_owner_hash ~ '^[a-f0-9]{64}$'),
  ownership_version bigint not null check (ownership_version>0),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at=created_at+interval '24 hours')
);
create index checkout_receipt_order_windows_owner_idx
  on private.checkout_receipt_order_windows(account_id,guest_owner_hash,expires_at);
create table private.checkout_receipt_grants (
  order_id uuid not null references private.checkout_receipt_order_windows(order_id),
  token_hash text not null references private.checkout_receipt_capabilities(token_hash),
  ownership_version bigint not null check (ownership_version>0),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key (order_id,token_hash),
  check (expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
create index checkout_receipt_grants_token_idx on private.checkout_receipt_grants(token_hash);
create table private.checkout_receipt_budgets (
  account_id text not null check (account_id='acct_1Tm9WRFEzyaKzdmq'),
  budget_key text not null,
  accepted_at timestamptz[] not null default '{}' check (cardinality(accepted_at)<=10),
  primary key(account_id,budget_key)
);

-- Privileged operators can revoke, but cannot extend windows or resurrect revoked capabilities.
create function private.protect_checkout_receipt_fact() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (pg_catalog.to_jsonb(new)-'revoked_at') is distinct from (pg_catalog.to_jsonb(old)-'revoked_at')
    or (pg_catalog.to_jsonb(old)->>'revoked_at' is not null
      and pg_catalog.to_jsonb(new)->>'revoked_at' is distinct from pg_catalog.to_jsonb(old)->>'revoked_at')
  then raise exception using errcode='23514', message='checkout receipt facts are immutable'; end if;
  return new;
end;
$$;
create trigger checkout_receipt_cohorts_immutable before update on private.checkout_receipt_cohorts
  for each row execute function private.protect_checkout_receipt_fact();
create trigger checkout_receipt_capabilities_immutable before update on private.checkout_receipt_capabilities
  for each row execute function private.protect_checkout_receipt_fact();
create trigger checkout_receipt_order_windows_immutable before update on private.checkout_receipt_order_windows
  for each row execute function private.protect_checkout_receipt_fact();
create trigger checkout_receipt_grants_immutable before update on private.checkout_receipt_grants
  for each row execute function private.protect_checkout_receipt_fact();

alter table private.checkout_receipt_cohorts enable row level security;
alter table private.checkout_receipt_cohorts force row level security;
alter table private.checkout_receipt_capabilities enable row level security;
alter table private.checkout_receipt_capabilities force row level security;
alter table private.checkout_receipt_order_windows enable row level security;
alter table private.checkout_receipt_order_windows force row level security;
alter table private.checkout_receipt_grants enable row level security;
alter table private.checkout_receipt_grants force row level security;
alter table private.checkout_receipt_budgets enable row level security;
alter table private.checkout_receipt_budgets force row level security;
revoke all on private.checkout_receipt_cohorts,private.checkout_receipt_capabilities,
  private.checkout_receipt_order_windows,private.checkout_receipt_grants,private.checkout_receipt_budgets
  from public,anon,authenticated,service_role;
grant select,insert,update on private.checkout_receipt_cohorts,private.checkout_receipt_capabilities,
  private.checkout_receipt_order_windows,private.checkout_receipt_grants,private.checkout_receipt_budgets to service_role;

create function public.bind_guest_checkout_receipt(
  p_account_id text,p_order_id uuid,p_guest_token_hash text,p_existing_token_hash text,p_candidate_token_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.orders%rowtype; v_window private.checkout_receipt_order_windows%rowtype;
  v_cap private.checkout_receipt_capabilities%rowtype; v_cohort private.checkout_receipt_cohorts%rowtype;
  v_owner text; v_now timestamptz; v_global timestamptz[]; v_person timestamptz[];
  v_reused boolean := false; v_retry integer; v_expiry timestamptz;
  v_denied jsonb := '{"allowed":false,"reused":false,"expires_at":null,"retry_after_seconds":0}'::jsonb;
begin
  if p_account_id is distinct from 'acct_1Tm9WRFEzyaKzdmq' or p_order_id is null
    or p_guest_token_hash is null or p_guest_token_hash !~ '^[a-f0-9]{64}$'
    or p_candidate_token_hash is null or p_candidate_token_hash !~ '^[a-f0-9]{64}$'
    or (p_existing_token_hash is not null and p_existing_token_hash !~ '^[a-f0-9]{64}$')
  then return v_denied; end if;
  -- The account lock makes both shared budgets atomic. The owner lock documents and
  -- preserves the symmetric candidate/Order binding boundary across all generations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-receipts:account:' || p_account_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout-receipts:owner:' || p_account_id || ':' || p_guest_token_hash,0));
  select * into v_order from public.orders where id=p_order_id for update;
  v_now := pg_catalog.clock_timestamp();
  if not found or v_order.user_id is not null or v_order.checkout_environment<>'sandbox' then return v_denied; end if;
  select * into v_window from private.checkout_receipt_order_windows where order_id=p_order_id;
  if found then
    if v_window.account_id<>p_account_id or v_window.ownership_version<>v_order.receipt_ownership_version
      or v_window.revoked_at is not null or v_window.expires_at<=v_now
    then return v_denied; end if;
    v_owner := v_window.guest_owner_hash;
  else
    if v_order.receipt_ownership_version<>1 then return v_denied; end if;
    -- Free receipt-token reuse must not create unbounded new Order windows.
    -- A new Order already consumed durable checkout admission, or is an exact
    -- migration-snapshotted legacy Session. Existing windows need no new spend.
    if not exists(select 1 from private.checkout_create_receipts r where r.account_id=p_account_id
      and r.environment='sandbox' and r.order_id=p_order_id)
      and not public.is_legacy_checkout_session(p_order_id,v_order.stripe_checkout_session_id)
    then return v_denied; end if;
    select guest_token_hash into v_owner from public.carts where id=v_order.cart_id and user_id is null;
  end if;
  if v_owner is distinct from p_guest_token_hash then return v_denied; end if;
  select * into v_cap from private.checkout_receipt_capabilities where token_hash=p_existing_token_hash
    and account_id=p_account_id and revoked_at is null and expires_at>v_now;
  v_reused := found;
  if v_reused and exists(select 1 from private.checkout_receipt_grants
    where order_id=p_order_id and token_hash=v_cap.token_hash) then
    if not exists(select 1 from private.checkout_receipt_grants where order_id=p_order_id
      and token_hash=v_cap.token_hash and ownership_version=v_order.receipt_ownership_version
      and revoked_at is null and expires_at>v_now) then return v_denied; end if;
    -- A committed binding already established symmetry. A free replay does no writes.
    return pg_catalog.jsonb_build_object('allowed',true,'reused',true,
      'expires_at',v_cap.expires_at,'retry_after_seconds',0);
  end if;
  if not v_reused then
    if exists(select 1 from private.checkout_receipt_capabilities where token_hash=p_candidate_token_hash)
      then return v_denied; end if;
    select * into v_cohort from private.checkout_receipt_cohorts where account_id=p_account_id
      and guest_owner_hash=v_owner and expires_at>v_now order by created_at desc limit 1;
    if found and (select count(*) from private.checkout_receipt_capabilities
      where cohort_id=v_cohort.id and revoked_at is null and expires_at>v_now)>=8
    then return v_denied || '{"retry_after_seconds":60}'::jsonb; end if;
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_global
      from private.checkout_receipt_budgets b cross join lateral pg_catalog.unnest(b.accepted_at) t
      where b.account_id=p_account_id and b.budget_key='account' and t>v_now-interval '1 minute';
    select coalesce(pg_catalog.array_agg(t order by t),'{}'::timestamptz[]) into v_person
      from private.checkout_receipt_budgets b cross join lateral pg_catalog.unnest(b.accepted_at) t
      where b.account_id=p_account_id and b.budget_key='owner:' || v_owner and t>v_now-interval '1 minute';
    if pg_catalog.cardinality(v_global)>=10 or pg_catalog.cardinality(v_person)>=5 then
      v_retry := least(60,greatest(1,ceil(extract(epoch from (greatest(
        case when pg_catalog.cardinality(v_global)>=10 then v_global[1] end,
        case when pg_catalog.cardinality(v_person)>=5 then v_person[1] end
      )+interval '1 minute'-v_now)))::integer));
      return v_denied || pg_catalog.jsonb_build_object('retry_after_seconds',v_retry);
    end if;
    if v_cohort.id is null then
      insert into private.checkout_receipt_cohorts(account_id,guest_owner_hash,created_at,expires_at)
        values(p_account_id,v_owner,v_now,v_now+interval '24 hours') returning * into v_cohort;
    end if;
    insert into private.checkout_receipt_capabilities(token_hash,account_id,cohort_id,created_at,expires_at)
      values(p_candidate_token_hash,p_account_id,v_cohort.id,v_now,v_cohort.expires_at) returning * into v_cap;
    insert into private.checkout_receipt_budgets(account_id,budget_key,accepted_at) values
      (p_account_id,'account',pg_catalog.array_append(v_global,v_now)),
      (p_account_id,'owner:' || v_owner,pg_catalog.array_append(v_person,v_now))
      on conflict(account_id,budget_key) do update set accepted_at=excluded.accepted_at;
  end if;
  if v_window.order_id is null then
    insert into private.checkout_receipt_order_windows(order_id,account_id,guest_owner_hash,ownership_version,created_at,expires_at)
      values(p_order_id,p_account_id,v_owner,v_order.receipt_ownership_version,v_now,v_now+interval '24 hours')
      returning * into v_window;
  end if;
  -- The presented capability may belong to another owner cohort. It receives ONLY
  -- this independently proven Order, never changes cohort, and never copies its other grants.
  insert into private.checkout_receipt_grants(order_id,token_hash,ownership_version,created_at,expires_at)
    values(p_order_id,v_cap.token_hash,v_window.ownership_version,v_now,least(v_cap.expires_at,v_window.expires_at))
    on conflict(order_id,token_hash) do nothing;
  -- Order-first: bind this Order to its bounded active same-owner candidates.
  insert into private.checkout_receipt_grants(order_id,token_hash,ownership_version,created_at,expires_at)
    select p_order_id,c.token_hash,v_window.ownership_version,v_now,least(v_window.expires_at,c.expires_at)
    from private.checkout_receipt_cohorts h
    join private.checkout_receipt_capabilities c on c.cohort_id=h.id and c.revoked_at is null and c.expires_at>v_now
    where h.account_id=p_account_id and h.guest_owner_hash=v_owner and h.expires_at>v_now
    on conflict(order_id,token_hash) do nothing;
  if not v_reused then
    -- Candidate-first: only a newly admitted candidate needs the owner's other
    -- still-eligible Orders. Never replay an Order-by-candidate Cartesian product.
    insert into private.checkout_receipt_grants(order_id,token_hash,ownership_version,created_at,expires_at)
      select w.order_id,v_cap.token_hash,w.ownership_version,v_now,least(w.expires_at,v_cap.expires_at)
      from private.checkout_receipt_order_windows w
      join public.orders o on o.id=w.order_id and o.user_id is null
        and o.checkout_environment='sandbox' and o.receipt_ownership_version=w.ownership_version
      where w.account_id=p_account_id and w.guest_owner_hash=v_owner and w.revoked_at is null and w.expires_at>v_now
      on conflict(order_id,token_hash) do nothing;
  end if;
  select g.expires_at into v_expiry from private.checkout_receipt_grants g
    where g.order_id=p_order_id and g.token_hash=v_cap.token_hash and g.revoked_at is null
      and g.ownership_version=v_order.receipt_ownership_version and g.expires_at>v_now;
  if not found then return v_denied; end if;
  -- Cookie deadline is the capability's shared cohort deadline, not the possibly
  -- shorter individual Order window. Every authorization still checks both.
  return pg_catalog.jsonb_build_object('allowed',true,'reused',v_reused,
    'expires_at',v_cap.expires_at,'retry_after_seconds',0);
end;
$$;

create function public.authorize_checkout_receipt(
  p_account_id text,p_order_id uuid,p_session_id text,p_user_id uuid,p_receipt_token_hash text,p_guest_token_hash text
) returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare v_order public.orders%rowtype; v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if p_account_id is distinct from 'acct_1Tm9WRFEzyaKzdmq' or p_order_id is null or p_session_id is null
    then return false; end if;
  select * into v_order from public.orders where id=p_order_id and checkout_environment='sandbox'
    and stripe_checkout_session_id=p_session_id;
  if not found then return false; end if;
  if v_order.user_id is not null then return v_order.user_id is not distinct from p_user_id; end if;
  if p_receipt_token_hash ~ '^[a-f0-9]{64}$' and exists(
    select 1 from private.checkout_receipt_grants g
    join private.checkout_receipt_capabilities c on c.token_hash=g.token_hash
    join private.checkout_receipt_order_windows w on w.order_id=g.order_id
    where g.order_id=p_order_id and g.token_hash=p_receipt_token_hash
      and c.account_id=p_account_id and w.account_id=p_account_id
      and g.ownership_version=v_order.receipt_ownership_version and w.ownership_version=v_order.receipt_ownership_version
      and g.revoked_at is null and c.revoked_at is null and w.revoked_at is null
      and g.expires_at>v_now and c.expires_at>v_now and w.expires_at>v_now
  ) then return true; end if;
  -- Only exact locally snapshotted pre-cutover Sessions can use legacy Cart proof.
  -- A provider-supplied metadata flag or a newer Session on an old Order cannot opt in.
  -- Once upgraded, the immutable receipt window exclusively controls guest access;
  -- the older Cart credential must not bypass expiry or revocation.
  return coalesce(v_order.receipt_ownership_version=1 and p_guest_token_hash ~ '^[a-f0-9]{64}$'
    and not exists(select 1 from private.checkout_receipt_order_windows w where w.order_id=p_order_id)
    and public.is_legacy_checkout_session(p_order_id,p_session_id)
    and exists(select 1 from public.carts c where c.id=v_order.cart_id and c.user_id is null
      and c.guest_token_hash=p_guest_token_hash),false);
end;
$$;
revoke all on function private.advance_checkout_receipt_ownership(),private.protect_checkout_receipt_fact(),
  public.bind_guest_checkout_receipt(text,uuid,text,text,text),
  public.authorize_checkout_receipt(text,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function private.advance_checkout_receipt_ownership(),private.protect_checkout_receipt_fact(),
  public.bind_guest_checkout_receipt(text,uuid,text,text,text),
  public.authorize_checkout_receipt(text,uuid,text,uuid,text,text) to service_role;
