-- Coordinate checkout-attempt leases with exact Stripe session terminal events.

create or replace function public.prepare_checkout_attempt(
  p_order_id uuid,
  p_attempt_token uuid,
  p_expected_session_id text,
  p_detach_session boolean,
  p_stripe_idempotency_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null or p_attempt_token is null or p_detach_session is null then
    raise exception using errcode = '22023', message = 'order, attempt token, and detach mode are required';
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found
    or v_order.checkout_attempt_token is distinct from p_attempt_token
    or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled')
    or v_order.stripe_checkout_session_id is distinct from p_expected_session_id
  then
    return false;
  end if;

  update public.orders
  set status = 'pending_payment',
      cancelled_at = null,
      stripe_checkout_session_id = case
        when p_detach_session then null
        else stripe_checkout_session_id
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'stripe_creation_outcome', 'creating',
        'stripe_idempotency_key', p_stripe_idempotency_key
      )
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.attach_checkout_session(
  p_order_id uuid,
  p_attempt_token uuid,
  p_session_id text,
  p_customer_id text,
  p_stripe_idempotency_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attached integer;
begin
  if p_order_id is null or p_attempt_token is null
    or p_session_id is null or pg_catalog.char_length(p_session_id) = 0
  then
    raise exception using errcode = '22023', message = 'order, attempt token, and session are required';
  end if;

  update public.orders
  set status = 'pending_payment',
      cancelled_at = null,
      stripe_checkout_session_id = p_session_id,
      stripe_customer_id = p_customer_id,
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'stripe_creation_outcome', 'attached',
        'stripe_idempotency_key', p_stripe_idempotency_key
      )
  where id = p_order_id
    and checkout_attempt_token = p_attempt_token
    and status in ('pending_payment', 'payment_failed', 'cancelled')
    and stripe_checkout_session_id is null;
  get diagnostics v_attached = row_count;

  return v_attached = 1;
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
    perform public.ensure_loyalty_account(v_user_id);
    perform 1
    from public.loyalty_accounts as account
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
    perform public.release_loyalty_redemptions_for_order(
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
    perform public.ensure_loyalty_account(v_user_id);
    perform 1
    from public.loyalty_accounts as account
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
    perform public.release_loyalty_redemptions_for_order(
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
    perform public.ensure_loyalty_account(v_user_id);
    perform 1
    from public.loyalty_accounts as account
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
    perform public.release_loyalty_redemptions_for_order(
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

-- Fail closed for callers that do not identify the Stripe session being failed.
create or replace function public.fail_checkout_order_from_stripe(
  p_order_id uuid,
  p_reason text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select false;
$$;

revoke all on function public.prepare_checkout_attempt(uuid, uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.attach_checkout_session(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_checkout_attempt(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.fail_checkout_order_from_stripe(uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_checkout_order_from_stripe(uuid, text, text) from public, anon, authenticated;

grant execute on function public.prepare_checkout_attempt(uuid, uuid, text, boolean, text) to service_role;
grant execute on function public.attach_checkout_session(uuid, uuid, text, text, text) to service_role;
grant execute on function public.fail_checkout_attempt(uuid, uuid, text, boolean) to service_role;
grant execute on function public.fail_checkout_order_from_stripe(uuid, text, text) to service_role;
grant execute on function public.expire_checkout_order_from_stripe(uuid, text, text) to service_role;
