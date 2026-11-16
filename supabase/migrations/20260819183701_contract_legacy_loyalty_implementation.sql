-- Contract the temporary Rewards compatibility boundary in place. The table,
-- enum, and function OIDs remain stable so existing immutable Points, Order,
-- Payment Attempt, Referral, and webhook history is preserved.

set lock_timeout = '10s';

do $$
begin
  if to_regclass('public.loyalty_accounts') is null
    or to_regclass('public.loyalty_ledger_entries') is null
    or to_regclass('public.loyalty_redemptions') is null
  then
    raise exception 'Ticket #187 expected the legacy physical rewards tables';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.rewards_accounts'::regclass and relkind = 'v'
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.rewards_ledger_entries'::regclass and relkind = 'v'
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.rewards_reservations'::regclass and relkind = 'v'
  ) then
    raise exception 'Ticket #187 expected the temporary rewards views';
  end if;
end;
$$;

lock table
  public.loyalty_accounts,
  public.loyalty_ledger_entries,
  public.loyalty_redemptions
in access exclusive mode;

drop view public.rewards_accounts;
drop view public.rewards_ledger_entries;
drop view public.rewards_reservations;

alter type public.loyalty_ledger_entry_type rename to rewards_ledger_entry_type;
alter type public.loyalty_ledger_status rename to rewards_ledger_status;
alter type public.loyalty_redemption_status rename to rewards_reservation_status;

alter table public.loyalty_accounts rename to rewards_accounts;
alter table public.loyalty_ledger_entries rename to rewards_ledger_entries;
alter table public.loyalty_redemptions rename to rewards_reservations;

alter table public.rewards_accounts
  rename constraint loyalty_accounts_pkey to rewards_accounts_pkey;
alter table public.rewards_accounts
  rename constraint loyalty_accounts_points_nonnegative to rewards_accounts_points_nonnegative;
alter table public.rewards_accounts
  rename constraint loyalty_accounts_user_id_fkey to rewards_accounts_user_id_fkey;

alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_entries_pkey to rewards_ledger_entries_pkey;
alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_entries_source_key_key to rewards_ledger_entries_source_key_key;
alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_entries_order_id_fkey to rewards_ledger_entries_order_id_fkey;
alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_entries_user_id_fkey to rewards_ledger_entries_user_id_fkey;
alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_points_not_zero to rewards_ledger_points_not_zero;
alter table public.rewards_ledger_entries
  rename constraint loyalty_ledger_posted_source_present to rewards_ledger_posted_source_present;
alter index public.loyalty_ledger_user_created_idx rename to rewards_ledger_user_created_idx;
alter index public.loyalty_ledger_order_idx rename to rewards_ledger_order_idx;

alter table public.rewards_reservations
  rename constraint loyalty_redemptions_pkey to rewards_reservations_pkey;
alter table public.rewards_reservations
  rename constraint loyalty_redemptions_source_key_key to rewards_reservations_source_key_key;
alter table public.rewards_reservations
  rename constraint loyalty_redemptions_order_id_fkey to rewards_reservations_order_id_fkey;
alter table public.rewards_reservations
  rename constraint loyalty_redemptions_user_id_fkey to rewards_reservations_user_id_fkey;
alter table public.rewards_reservations
  rename constraint loyalty_redemptions_amounts_positive to rewards_reservations_amounts_positive;
alter index public.loyalty_redemptions_user_created_idx rename to rewards_reservations_user_created_idx;
alter index public.loyalty_redemptions_order_idx rename to rewards_reservations_order_idx;

alter trigger loyalty_accounts_set_updated_at on public.rewards_accounts
  rename to rewards_accounts_set_updated_at;
alter trigger loyalty_redemptions_set_updated_at on public.rewards_reservations
  rename to rewards_reservations_set_updated_at;

alter policy loyalty_accounts_select_own on public.rewards_accounts
  rename to rewards_accounts_select_own;
alter policy rewards_accounts_select_own on public.rewards_accounts
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy loyalty_ledger_entries_select_own on public.rewards_ledger_entries
  rename to rewards_ledger_entries_select_own;
alter policy rewards_ledger_entries_select_own on public.rewards_ledger_entries
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy loyalty_redemptions_select_own on public.rewards_reservations
  rename to rewards_reservations_select_own;
alter policy rewards_reservations_select_own on public.rewards_reservations
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.rewards_accounts from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_ledger_entries from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_reservations from public, anon, authenticated, service_role;

grant select on table public.rewards_accounts to authenticated;
grant select on table public.rewards_ledger_entries to authenticated;
grant select on table public.rewards_reservations to authenticated;
grant select, insert, update on table public.rewards_accounts to service_role;
grant select, insert, update on table public.rewards_ledger_entries to service_role;
grant select, insert, update on table public.rewards_reservations to service_role;

drop function public.handle_new_user_loyalty() cascade;

create or replace function public.ensure_rewards_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_user_id is null then
    raise exception 'ensure_rewards_account requires a user id';
  end if;

  insert into public.rewards_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select pg_catalog.upper(
    pg_catalog.substr(
      pg_catalog.md5(p_user_id::text || ':helix-referral'),
      1,
      10
    )
  )
  into v_code;

  insert into public.referral_codes (user_id, code)
  values (p_user_id, v_code)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.handle_new_user_rewards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_rewards_account(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_rewards
  after insert on auth.users
  for each row execute function public.handle_new_user_rewards();

create or replace function public.award_rewards_points(
  p_user_id uuid,
  p_points integer,
  p_entry_type public.rewards_ledger_entry_type,
  p_source_key text,
  p_description text,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if p_user_id is null then
    raise exception 'award_rewards_points requires a user id';
  end if;
  if p_points <= 0 then
    raise exception 'award_rewards_points requires positive points';
  end if;
  if p_source_key is null or pg_catalog.char_length(p_source_key) <= 8 then
    raise exception 'award_rewards_points requires a stable source key';
  end if;

  perform public.ensure_rewards_account(p_user_id);

  insert into public.rewards_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key,
    metadata
  ) values (
    p_user_id,
    p_order_id,
    p_entry_type,
    'posted',
    p_points,
    p_description,
    p_source_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is not null then
    update public.rewards_accounts
    set points_balance = points_balance + p_points,
        lifetime_points = lifetime_points + p_points
    where user_id = p_user_id;
  end if;

  select entry.id
  into v_entry_id
  from public.rewards_ledger_entries as entry
  where entry.source_key = p_source_key;

  return v_entry_id;
end;
$$;

create or replace function public.reserve_rewards_points(
  p_user_id uuid,
  p_points integer,
  p_amount_cents integer,
  p_source_key text,
  p_description text,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_balance integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user id is required';
  end if;
  if p_points is null or p_points <= 0
    or p_amount_cents is null or p_amount_cents <= 0
  then
    raise exception using errcode = '22023', message = 'positive points and amount are required';
  end if;
  if p_source_key is null or pg_catalog.char_length(p_source_key) <= 8 then
    raise exception using errcode = '22023', message = 'stable source key is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rewards-reservation:' || p_source_key, 0)
  );

  select entry.id
  into v_entry_id
  from public.rewards_ledger_entries as entry
  where entry.source_key = p_source_key;
  if found then
    return v_entry_id;
  end if;

  perform public.ensure_rewards_account(p_user_id);

  select account.points_balance
  into v_balance
  from public.rewards_accounts as account
  where account.user_id = p_user_id
  for update;

  if v_balance < p_points then
    raise exception using
      errcode = 'P0001',
      message = 'Insufficient Available Points Balance';
  end if;

  insert into public.rewards_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key
  ) values (
    p_user_id,
    p_order_id,
    'redemption_reserved',
    'posted',
    -p_points,
    p_description,
    p_source_key
  )
  returning id into v_entry_id;

  update public.rewards_accounts
  set points_balance = points_balance - p_points
  where user_id = p_user_id;

  insert into public.rewards_reservations (
    user_id,
    order_id,
    status,
    points,
    amount_cents,
    source_key
  ) values (
    p_user_id,
    p_order_id,
    'applied',
    p_points,
    p_amount_cents,
    p_source_key
  );

  return v_entry_id;
end;
$$;

create or replace function public.release_rewards_reservations_for_order(
  p_user_id uuid,
  p_order_id uuid,
  p_reason text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reservation public.rewards_reservations%rowtype;
  v_ledger_id uuid;
  v_released integer := 0;
begin
  if p_user_id is null or p_order_id is null then
    raise exception using errcode = '22023', message = 'user and order are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'release reason is required';
  end if;

  perform public.ensure_rewards_account(p_user_id);
  perform 1
  from public.rewards_accounts as account
  where account.user_id = p_user_id
  for update;

  for v_reservation in
    select reservation.*
    from public.rewards_reservations as reservation
    where reservation.user_id = p_user_id
      and reservation.order_id = p_order_id
      and reservation.status = 'applied'
    order by reservation.created_at, reservation.id
    for update
  loop
    insert into public.rewards_ledger_entries (
      user_id,
      order_id,
      entry_type,
      status,
      points,
      description,
      source_key
    ) values (
      p_user_id,
      p_order_id,
      'redemption_released',
      'posted',
      v_reservation.points,
      'Released reserved checkout points after ' || pg_catalog.btrim(p_reason) || '.',
      'reward-release:' || v_reservation.id::text
    )
    on conflict (source_key) do nothing
    returning id into v_ledger_id;

    update public.rewards_reservations
    set status = 'reversed', updated_at = pg_catalog.now()
    where id = v_reservation.id;

    if v_ledger_id is not null then
      update public.rewards_accounts
      set points_balance = points_balance + v_reservation.points
      where user_id = p_user_id;
      v_released := v_released + 1;
    end if;
  end loop;

  return v_released;
end;
$$;

create or replace function public.record_rewards_points_adjustment(
  p_user_id uuid,
  p_points integer,
  p_entry_type public.rewards_ledger_entry_type,
  p_source_key text,
  p_description text,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.rewards_ledger_entries%rowtype;
  v_entry_id uuid;
  v_balance integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user id is required';
  end if;
  if p_points is null or p_points = 0 then
    raise exception using errcode = '22023', message = 'non-zero points are required';
  end if;
  if p_entry_type not in (
    'purchase_refund'::public.rewards_ledger_entry_type,
    'redemption_reversal'::public.rewards_ledger_entry_type,
    'manual_adjustment'::public.rewards_ledger_entry_type
  ) then
    raise exception using errcode = '22023', message = 'unsupported adjustment entry type';
  end if;
  if p_entry_type = 'purchase_refund' and p_points > 0 then
    raise exception using errcode = '22023', message = 'purchase refund adjustments must remove Points';
  end if;
  if p_entry_type = 'redemption_reversal' and p_points < 0 then
    raise exception using errcode = '22023', message = 'redemption reversals must restore Points';
  end if;
  if p_source_key is null or pg_catalog.char_length(p_source_key) <= 8 then
    raise exception using errcode = '22023', message = 'stable source key is required';
  end if;
  if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) = 0 then
    raise exception using errcode = '22023', message = 'description is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rewards-adjustment:' || p_source_key, 0)
  );

  select entry.*
  into v_existing
  from public.rewards_ledger_entries as entry
  where entry.source_key = p_source_key;

  if found then
    if v_existing.user_id is distinct from p_user_id
      or v_existing.order_id is distinct from p_order_id
      or v_existing.entry_type is distinct from p_entry_type
      or v_existing.points is distinct from p_points
      or v_existing.description is distinct from p_description
      or v_existing.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
    then
      raise exception using errcode = '23505', message = 'adjustment idempotency source mismatch';
    end if;
    return v_existing.id;
  end if;

  perform public.ensure_rewards_account(p_user_id);

  select account.points_balance
  into v_balance
  from public.rewards_accounts as account
  where account.user_id = p_user_id
  for update;

  if v_balance + p_points < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Insufficient Available Points Balance';
  end if;

  insert into public.rewards_ledger_entries (
    user_id,
    order_id,
    entry_type,
    status,
    points,
    description,
    source_key,
    metadata
  ) values (
    p_user_id,
    p_order_id,
    p_entry_type,
    'posted',
    p_points,
    p_description,
    p_source_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    raise exception using errcode = '40001', message = 'adjustment retry required';
  end if;

  update public.rewards_accounts
  set points_balance = points_balance + p_points
  where user_id = p_user_id;

  return v_entry_id;
end;
$$;

create or replace function public.fail_checkout_attempt(
  p_order_id uuid,
  p_attempt_token uuid,
  p_reason text,
  p_release_rewards boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
begin
  if p_order_id is null or p_attempt_token is null then
    raise exception using errcode = '22023', message = 'order and attempt token are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'failure reason is required';
  end if;
  if p_release_rewards is null then
    raise exception using errcode = '22023', message = 'reward release mode is required';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id;

  if p_release_rewards and v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found or v_order.checkout_attempt_token is distinct from p_attempt_token then
    return false;
  end if;
  if v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
    update public.orders
    set checkout_attempt_token = null,
        checkout_attempt_started_at = null
    where id = p_order_id
      and checkout_attempt_token = p_attempt_token;
    return false;
  end if;

  update public.orders
  set status = 'payment_failed',
      cancelled_at = pg_catalog.now(),
      checkout_attempt_token = null,
      checkout_attempt_started_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'stripe_creation_outcome', case
          when p_release_rewards then 'failed'
          else 'unknown'
        end
      )
  where id = p_order_id;

  update public.payment_attempts
  set status = 'failed',
      last_error = pg_catalog.btrim(p_reason),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status <> 'paid';

  if p_release_rewards and v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    perform public.release_rewards_reservations_for_order(
      v_order.user_id,
      v_order.id,
      pg_catalog.btrim(p_reason)
    );
  end if;

  update public.referral_attributions
  set status = 'void', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'pending';

  return true;
end;
$$;

create or replace function public.fail_checkout_order_from_stripe(
  p_order_id uuid,
  p_session_id text,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
begin
  if p_order_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'order and session are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'failure reason is required';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id;

  if v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id
  for update;

  if not found or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
    return false;
  end if;

  update public.orders
  set status = 'payment_failed',
      cancelled_at = pg_catalog.now(),
      checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id;

  update public.payment_attempts
  set status = 'failed',
      last_error = pg_catalog.btrim(p_reason),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and stripe_checkout_session_id = p_session_id
    and status <> 'paid';

  if v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    perform public.release_rewards_reservations_for_order(
      v_order.user_id,
      v_order.id,
      pg_catalog.btrim(p_reason)
    );
  end if;

  update public.referral_attributions
  set status = 'void', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'pending';

  return true;
end;
$$;

create or replace function public.expire_checkout_order_from_stripe(
  p_order_id uuid,
  p_session_id text,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
begin
  if p_order_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'order and session are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'expiration reason is required';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id;

  if v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id
  for update;

  if not found or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
    return false;
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id;

  update public.payment_attempts
  set status = 'cancelled',
      raw_status = 'expired',
      last_error = pg_catalog.btrim(p_reason),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and stripe_checkout_session_id = p_session_id
    and status <> 'paid';

  if v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    perform public.release_rewards_reservations_for_order(
      v_order.user_id,
      v_order.id,
      pg_catalog.btrim(p_reason)
    );
  end if;

  update public.referral_attributions
  set status = 'void', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'pending';

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_order.cart_id
    and checkout_generation = v_order.checkout_generation;

  return true;
end;
$$;

create or replace function public.cancel_checkout_order_without_session(
  p_order_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'order id is required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'cancellation reason is required';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id is null;

  if v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id is null
  for update;

  if not found or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
    return false;
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, pg_catalog.now()),
      checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id;

  update public.payment_attempts
  set status = 'cancelled',
      last_error = pg_catalog.btrim(p_reason),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status <> 'paid';

  if v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    perform public.release_rewards_reservations_for_order(
      v_order.user_id,
      v_order.id,
      pg_catalog.btrim(p_reason)
    );
  end if;

  update public.referral_attributions
  set status = 'void', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'pending';

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_order.cart_id
    and checkout_generation = v_order.checkout_generation;

  return true;
end;
$$;

create or replace function public.finalize_paid_checkout_order(
  p_order_id uuid,
  p_session_id text,
  p_customer_email text,
  p_discount_cents integer,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_total_cents integer,
  p_payment_intent_id text,
  p_customer_id text,
  p_reward_points_earned integer,
  p_shipping_name text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_payment_method_type text,
  p_payment_raw_status text
)
returns setof public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
  v_applied_reward_points integer;
begin
  if p_order_id is null
    or p_session_id is null
    or pg_catalog.char_length(p_session_id) = 0
  then
    raise exception using errcode = '22023', message = 'order and session are required';
  end if;
  if p_discount_cents is null
    or p_shipping_cents is null
    or p_tax_cents is null
    or p_total_cents is null
    or p_reward_points_earned is null
    or p_discount_cents < 0
    or p_shipping_cents < 0
    or p_tax_cents < 0
    or p_total_cents < 0
    or p_reward_points_earned < 0
  then
    raise exception using errcode = '22023', message = 'paid order amounts must be nonnegative';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id;

  if v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id
  for update;

  if not found then
    return;
  end if;
  if v_order.status = 'paid' then
    return next v_order;
    return;
  end if;
  if v_order.status not in ('pending_payment', 'payment_failed') then
    return;
  end if;

  if v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    select coalesce(pg_catalog.sum(reservation.points), 0)::integer
    into v_applied_reward_points
    from public.rewards_reservations as reservation
    where reservation.user_id = v_order.user_id
      and reservation.order_id = v_order.id
      and reservation.status = 'applied';

    if v_applied_reward_points <> v_order.reward_points_redeemed then
      return;
    end if;
  end if;

  update public.orders
  set status = 'paid',
      customer_email = p_customer_email,
      discount_cents = p_discount_cents,
      shipping_cents = p_shipping_cents,
      tax_cents = p_tax_cents,
      total_cents = p_total_cents,
      stripe_payment_intent_id = p_payment_intent_id,
      stripe_customer_id = p_customer_id,
      reward_points_earned = p_reward_points_earned,
      shipping_name = p_shipping_name,
      shipping_address = coalesce(p_shipping_address, '{}'::jsonb),
      billing_address = coalesce(p_billing_address, '{}'::jsonb),
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'payment_method_type', p_payment_method_type
      ),
      paid_at = pg_catalog.now(),
      cancelled_at = null,
      checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id
  returning * into v_order;

  update public.payment_attempts
  set status = 'paid',
      amount_cents = p_total_cents,
      stripe_payment_intent_id = p_payment_intent_id,
      raw_status = p_payment_raw_status,
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'payment_method_type', p_payment_method_type
      ),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and stripe_checkout_session_id = p_session_id;

  update public.referral_attributions
  set status = 'pending', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'void';

  return next v_order;
end;
$$;

drop function public.award_loyalty_points(
  uuid, integer, public.rewards_ledger_entry_type, text, text, uuid, jsonb
);
drop function public.ensure_loyalty_account(uuid);
drop function public.redeem_loyalty_points(uuid, integer, integer, text, text, uuid);
drop function public.release_loyalty_redemptions_for_order(uuid, uuid, text);

revoke all on function public.handle_new_user_rewards() from public, anon, authenticated, service_role;

revoke all on function public.ensure_rewards_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public.award_rewards_points(uuid, integer, public.rewards_ledger_entry_type, text, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.reserve_rewards_points(uuid, integer, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_rewards_reservations_for_order(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_rewards_points_adjustment(uuid, integer, public.rewards_ledger_entry_type, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.ensure_rewards_account(uuid) to service_role;
grant execute on function public.award_rewards_points(uuid, integer, public.rewards_ledger_entry_type, text, text, uuid, jsonb) to service_role;
grant execute on function public.reserve_rewards_points(uuid, integer, integer, text, text, uuid) to service_role;
grant execute on function public.release_rewards_reservations_for_order(uuid, uuid, text) to service_role;
grant execute on function public.record_rewards_points_adjustment(uuid, integer, public.rewards_ledger_entry_type, text, text, uuid, jsonb) to service_role;

revoke all on function public.fail_checkout_attempt(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.fail_checkout_order_from_stripe(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.expire_checkout_order_from_stripe(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_checkout_order_without_session(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_paid_checkout_order(uuid, text, text, integer, integer, integer, integer, text, text, integer, text, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;

grant execute on function public.fail_checkout_attempt(uuid, uuid, text, boolean) to service_role;
grant execute on function public.fail_checkout_order_from_stripe(uuid, text, text) to service_role;
grant execute on function public.expire_checkout_order_from_stripe(uuid, text, text) to service_role;
grant execute on function public.cancel_checkout_order_without_session(uuid, text) to service_role;
grant execute on function public.finalize_paid_checkout_order(uuid, text, text, integer, integer, integer, integer, text, text, integer, text, jsonb, jsonb, text, text) to service_role;

comment on table public.rewards_accounts is
  'Current Available Points Balance and Lifetime Points for an Account Holder.';
comment on table public.rewards_ledger_entries is
  'Immutable auditable Points Ledger history.';
comment on table public.rewards_reservations is
  'Points Reservations associated with Checkout and Order state.';
