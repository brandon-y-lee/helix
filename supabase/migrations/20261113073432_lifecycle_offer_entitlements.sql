-- Source-only, sandbox offers. Admission remains off until separately approved.
create table private.lifecycle_offer_control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into private.lifecycle_offer_control default values;
create table private.lifecycle_offers (
  id uuid primary key default gen_random_uuid(), environment text not null default 'sandbox' check(environment='sandbox'),
  kind text not null check(kind in ('welcome','cart')), email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
  user_id uuid references auth.users(id), source_key text not null check(length(source_key) between 1 and 200),
  percent_off integer not null check((kind='welcome' and percent_off=15) or (kind='cart' and percent_off=10)),
  coupon_id text not null check(coupon_id ~ '^[A-Za-z0-9_-]{1,255}$'),
  issued_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '14 days',
  reserved_order_id uuid references public.orders(id), consumed_order_id uuid references public.orders(id),
  consumed_at timestamptz, unique(kind,source_key),
  check((consumed_at is null)=(consumed_order_id is null)),
  check(consumed_order_id is null or reserved_order_id=consumed_order_id)
);
create unique index lifecycle_welcome_email_once on private.lifecycle_offers(email) where kind='welcome';
create unique index lifecycle_welcome_user_once on private.lifecycle_offers(user_id) where kind='welcome' and user_id is not null;
create index lifecycle_offer_recipient on private.lifecycle_offers(email,expires_at);
create unique index lifecycle_offer_one_per_order on private.lifecycle_offers(reserved_order_id) where reserved_order_id is not null;
alter table private.lifecycle_offer_control enable row level security;
alter table private.lifecycle_offer_control force row level security;
alter table private.lifecycle_offers enable row level security;
alter table private.lifecycle_offers force row level security;
revoke all on private.lifecycle_offer_control,private.lifecycle_offers from public,anon,authenticated,service_role;
grant select,update on private.lifecycle_offer_control to service_role;
grant select,insert,update on private.lifecycle_offers to service_role;

create function private.lifecycle_offer_immutable() returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if new.id<>old.id or new.environment<>old.environment or new.kind<>old.kind or new.email<>old.email
    or new.source_key<>old.source_key or new.percent_off<>old.percent_off or new.coupon_id<>old.coupon_id
    or new.issued_at<>old.issued_at or new.expires_at<>old.expires_at
    or (old.user_id is not null and new.user_id is distinct from old.user_id)
    or (old.consumed_at is not null and (new.consumed_at is distinct from old.consumed_at
      or new.consumed_order_id is distinct from old.consumed_order_id or new.reserved_order_id is distinct from old.reserved_order_id))
  then raise exception using errcode='55000',message='Offer identity is immutable'; end if;
  return new;
end $$;
create trigger lifecycle_offer_immutable before update on private.lifecycle_offers for each row execute function private.lifecycle_offer_immutable();

-- Resolve the current verified recipient account without exposing auth identities.
-- An email change must not produce an offer the account cannot redeem.
create function private.lifecycle_welcome_recipient_eligible(p_email text,p_offer_id uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.orders where lower(btrim(customer_email))=p_email and status in ('paid','refunded'))
    and not exists(select 1 from auth.users u where lower(btrim(u.email))=p_email and u.email_confirmed_at is not null
      and (exists(select 1 from public.orders o where o.user_id=u.id and o.status in ('paid','refunded'))
        or exists(select 1 from private.lifecycle_offers w where w.kind='welcome' and w.user_id=u.id and w.id is distinct from p_offer_id)))
$$;
revoke all on function private.lifecycle_welcome_recipient_eligible(text,uuid) from public,anon,authenticated;
grant execute on function private.lifecycle_welcome_recipient_eligible(text,uuid) to service_role;

-- Only an eligibility-checked campaign service may grant; a browser cannot mint offers.
create function public.grant_lifecycle_offer(p_kind text,p_email text,p_source_key text,p_coupon_id text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_email text:=lower(btrim(p_email)); v_existing private.lifecycle_offers;
begin
  if not exists(select 1 from private.lifecycle_offer_control where enabled) then return null; end if;
  if p_kind not in ('welcome','cart') or v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_email)>254 or p_source_key is null or length(p_source_key) not between 1 and 200
    or p_coupon_id is null or p_coupon_id !~ '^[A-Za-z0-9_-]{1,255}$' then raise exception 'Invalid offer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lifecycle-offer:'||v_email,0));
  select * into v_existing from private.lifecycle_offers where kind=p_kind and source_key=p_source_key;
  if found then
    if p_kind='welcome' and not private.lifecycle_welcome_recipient_eligible(v_email,v_existing.id) then return null; end if;
    if v_existing.email<>v_email or v_existing.coupon_id<>p_coupon_id then raise exception 'Offer identity differs'; end if;
    return v_existing.id;
  end if;
  if p_kind='welcome' then
    select id into v_id from private.lifecycle_offers where kind='welcome' and email=v_email;
    if not private.lifecycle_welcome_recipient_eligible(v_email,v_id) then return null; end if;
    if v_id is not null then return v_id; end if;
  end if;
  insert into private.lifecycle_offers(kind,email,source_key,percent_off,coupon_id)
    values(p_kind,v_email,p_source_key,case when p_kind='welcome' then 15 else 10 end,p_coupon_id) returning id into v_id;
  return v_id;
end $$;

-- Narrow auth lookup avoids granting the application role broad auth.users access.
create function private.lifecycle_offer_verified_email(p_user_id uuid,p_lock boolean default false) returns text
language plpgsql security definer set search_path='' as $$ declare v_email text; begin
  if p_lock then
    select lower(btrim(email)) into v_email from auth.users where id=p_user_id and email_confirmed_at is not null for update;
  else
    select lower(btrim(email)) into v_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  end if;
  return v_email;
end $$;
revoke all on function private.lifecycle_offer_verified_email(uuid,boolean) from public,anon,authenticated;
grant execute on function private.lifecycle_offer_verified_email(uuid,boolean) to service_role;

create function public.read_lifecycle_offers(p_user_id uuid,p_cart_id uuid default null,p_new_admission boolean default true) returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'percentOff',o.percent_off,'expiresAt',o.expires_at,'couponId',o.coupon_id,'recovering',o.reserved_order_id is not null) order by o.percent_off desc,o.issued_at),'[]'::jsonb)
  from private.lifecycle_offers o join (select p_user_id as id,private.lifecycle_offer_verified_email(p_user_id,false) as email) u on u.email=o.email
  where (o.user_id is null or o.user_id=u.id) and o.consumed_at is null and ((o.reserved_order_id is null and o.expires_at>now() and p_new_admission and exists(select 1 from private.lifecycle_offer_control where enabled)) or exists(
      select 1 from public.orders held where held.id=o.reserved_order_id and held.user_id=u.id and held.cart_id=p_cart_id
        and held.status in ('pending_payment','payment_failed') and held.stripe_checkout_session_id is null
        and not private.checkout_provider_call_possible(held.id)))
    and (o.kind<>'welcome' or (not exists(select 1 from public.orders p where (p.user_id=u.id or lower(btrim(p.customer_email))=o.email) and p.status in ('paid','refunded'))
      and not exists(select 1 from private.lifecycle_offers w where w.kind='welcome' and w.user_id=u.id and w.id<>o.id)))
$$;

create function private.reserve_lifecycle_offer(p_order_id uuid,p_offer_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_offer private.lifecycle_offers; v_email text;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.checkout_environment<>'sandbox' or v_order.status not in ('pending_payment','payment_failed') or v_order.user_id is null then raise exception 'Offer unavailable'; end if;
  v_email:=private.lifecycle_offer_verified_email(v_order.user_id,true);
  if v_email is null then raise exception 'Offer requires a verified account'; end if;
  select * into v_offer from private.lifecycle_offers where id=p_offer_id for update;
  if not found or v_offer.email<>v_email or lower(btrim(v_order.customer_email)) is distinct from v_email
    or (v_offer.user_id is not null and v_offer.user_id<>v_order.user_id) or v_offer.consumed_at is not null
    or (v_offer.reserved_order_id is not null and v_offer.reserved_order_id<>p_order_id)
    or v_order.reward_points_redeemed<>0 or v_order.reward_discount_cents<>0 or v_order.referral_code is not null
    or v_order.discount_cents<>floor((v_order.merchandise_subtotal_cents::bigint*v_offer.percent_off+50)/100)::integer
    or v_order.metadata->>'offer_id' is distinct from p_offer_id::text
    or v_order.metadata->>'offer_coupon_id' is distinct from v_offer.coupon_id
  then raise exception 'Offer unavailable'; end if;
  -- A held original reservation survives expiry and configuration pause for recovery.
  if v_offer.reserved_order_id is null then
    if v_offer.expires_at<=clock_timestamp() or not exists(select 1 from private.lifecycle_offer_control where enabled) then raise exception 'Offer expired or paused'; end if;
    if v_offer.kind='welcome' and (exists(select 1 from public.orders where id<>p_order_id and (user_id=v_order.user_id or lower(btrim(customer_email))=v_email) and status in ('paid','refunded'))
      or exists(select 1 from private.lifecycle_offers where kind='welcome' and user_id=v_order.user_id and id<>p_offer_id)) then raise exception 'Welcome offer unavailable'; end if;
  end if;
  update private.lifecycle_offers set user_id=v_order.user_id,reserved_order_id=p_order_id where id=p_offer_id;
end $$;

create function public.reserve_checkout_order_with_offer(
  p_idempotency_key text,p_user_id uuid,p_cart_id uuid,p_checkout_generation uuid,p_customer_email text,p_currency text,
  p_merchandise_subtotal_cents integer,p_discount_cents integer,p_shipping_cents integer,p_tax_cents integer,p_total_cents integer,
  p_referral_code text,p_reward_points_redeemed integer,p_reward_discount_cents integer,p_checkout_environment text,p_metadata jsonb,p_items jsonb,p_offer_id uuid
) returns setof public.orders language plpgsql security invoker set search_path='' as $$ declare v_order public.orders; v_coupon text;
begin
  select coupon_id into v_coupon from private.lifecycle_offers where id=p_offer_id;
  if not found then raise exception 'Offer unavailable'; end if;
  select * into v_order from public.reserve_checkout_order_snapshot_v2(p_idempotency_key,p_user_id,p_cart_id,p_checkout_generation,p_customer_email,p_currency,
    p_merchandise_subtotal_cents,p_discount_cents,p_shipping_cents,p_tax_cents,p_total_cents,p_referral_code,p_reward_points_redeemed,p_reward_discount_cents,
    p_checkout_environment,p_metadata||jsonb_build_object('offer_id',p_offer_id,'offer_coupon_id',v_coupon),p_items);
  perform private.reserve_lifecycle_offer(v_order.id,p_offer_id);
  return next v_order;
end $$;

-- Freeze entitlement provenance alongside the existing immutable monetary contract.
create function private.freeze_lifecycle_offer_contract() returns trigger language plpgsql security invoker set search_path='' as $$ declare v_order public.orders; begin
  select * into v_order from public.orders where id=new.order_id;
  if v_order.metadata->>'offer_id' is not null then
    if new.terms->>'couponId' is distinct from v_order.metadata->>'offer_coupon_id' then raise exception 'Offer coupon differs'; end if;
    new.terms:=new.terms||jsonb_build_object('offerId',v_order.metadata->>'offer_id');
  end if;
  return new;
end $$;
create trigger freeze_lifecycle_offer_contract before insert on private.checkout_payment_contracts for each row execute function private.freeze_lifecycle_offer_contract();
alter function public.prepare_checkout_attempt_once(uuid,uuid,text,jsonb) set schema private;
alter function private.prepare_checkout_attempt_once(uuid,uuid,text,jsonb) rename to prepare_checkout_attempt_without_offer;
create function public.prepare_checkout_attempt_once(p_order_id uuid,p_attempt_token uuid,p_stripe_idempotency_key text,p_terms jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$ declare v_offer text; begin
  select metadata->>'offer_id' into v_offer from public.orders where id=p_order_id for update;
  if v_offer is not null then
    if p_terms->>'offerId' is distinct from v_offer then raise exception 'Offer terms differ'; end if;
    perform private.reserve_lifecycle_offer(p_order_id,v_offer::uuid);
  elsif p_terms->>'offerId' is not null then raise exception 'Unexpected offer'; end if;
  return private.prepare_checkout_attempt_without_offer(p_order_id,p_attempt_token,p_stripe_idempotency_key,p_terms-'offerId');
end $$;

create function private.settle_lifecycle_offer() returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if old.metadata->>'offer_id' is distinct from new.metadata->>'offer_id' or old.metadata->>'offer_coupon_id' is distinct from new.metadata->>'offer_coupon_id' then
    raise exception 'Accepted offer binding is immutable';
  end if;
  if new.status in ('paid','refunded') then
    update private.lifecycle_offers set consumed_at=coalesce(consumed_at,clock_timestamp()),consumed_order_id=new.id
      where reserved_order_id=new.id and consumed_at is null;
  elsif new.status='cancelled' or (new.status='payment_failed' and not private.checkout_provider_call_possible(new.id)) then
    -- Existing checkout functions alone authorize these terminal unpaid transitions.
    update private.lifecycle_offers set reserved_order_id=null where reserved_order_id=new.id and consumed_at is null;
  end if;
  return new;
end $$;
create trigger settle_lifecycle_offer after update on public.orders for each row execute function private.settle_lifecycle_offer();

-- New public functions are private service RPCs, never browser capabilities.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('grant_lifecycle_offer','read_lifecycle_offers','reserve_checkout_order_with_offer','prepare_checkout_attempt_once'))
       or (n.nspname='private' and p.proname in ('lifecycle_offer_immutable','reserve_lifecycle_offer','freeze_lifecycle_offer_contract','settle_lifecycle_offer','prepare_checkout_attempt_without_offer'))
  loop execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f); end loop;
end $$;

-- Marketing must recheck this before first handoff: an old logical grant is not a promise of a usable discount.
create function public.read_lifecycle_offer_for_delivery(p_offer_id uuid,p_email text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',id,'kind',kind,'percentOff',percent_off,'expiresAt',expires_at,'couponId',coupon_id)
  from private.lifecycle_offers where id=p_offer_id and email=lower(btrim(p_email)) and consumed_at is null
    and (user_id is null or private.lifecycle_offer_verified_email(user_id)=email)
    and reserved_order_id is null and expires_at>now() and exists(select 1 from private.lifecycle_offer_control where enabled)
    and (kind<>'welcome' or private.lifecycle_welcome_recipient_eligible(email,id))
$$;
revoke all on function public.read_lifecycle_offer_for_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.read_lifecycle_offer_for_delivery(uuid,text) to service_role;
