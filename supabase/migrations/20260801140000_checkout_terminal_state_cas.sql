-- Make paid finalization and no-session cancellation exact, transactional state transitions.

create or replace function public.claim_checkout_attempt(p_order_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_token uuid;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'order id is required';
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found or v_order.status not in ('pending_payment', 'payment_failed') then
    raise exception using errcode = 'P0001', message = 'checkout order is not available';
  end if;
  if v_order.checkout_attempt_token is not null
    and v_order.checkout_attempt_started_at > pg_catalog.now() - interval '5 minutes'
  then
    raise exception using errcode = 'P0001', message = 'checkout attempt is already in progress';
  end if;

  v_token := extensions.gen_random_uuid();
  update public.orders
  set checkout_attempt_token = v_token,
      checkout_attempt_started_at = pg_catalog.now()
  where id = p_order_id;

  return v_token;
end;
$$;

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
    or v_order.status not in ('pending_payment', 'payment_failed')
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
    and status in ('pending_payment', 'payment_failed')
    and stripe_checkout_session_id is null;
  get diagnostics v_attached = row_count;

  return v_attached = 1;
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
    select coalesce(pg_catalog.sum(redemption.points), 0)::integer
    into v_applied_reward_points
    from public.loyalty_redemptions as redemption
    where redemption.user_id = v_order.user_id
      and redemption.order_id = v_order.id
      and redemption.status = 'applied';

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

revoke all on function public.cancel_checkout_order_without_session(uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_paid_checkout_order(uuid, text, text, integer, integer, integer, integer, text, text, integer, text, jsonb, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.cancel_checkout_order_without_session(uuid, text) to service_role;
grant execute on function public.finalize_paid_checkout_order(uuid, text, text, integer, integer, integer, integer, text, text, integer, text, jsonb, jsonb, text, text) to service_role;
