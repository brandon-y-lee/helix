-- Make cart generations and checkout-attempt ownership authoritative in Postgres.

alter table public.orders
  add column if not exists checkout_generation uuid,
  add column if not exists checkout_attempt_token uuid,
  add column if not exists checkout_attempt_started_at timestamptz;

update public.orders
set checkout_generation = (metadata ->> 'checkout_generation')::uuid
where checkout_generation is null
  and metadata ->> 'checkout_generation' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

create unique index if not exists orders_cart_checkout_generation_key
  on public.orders (cart_id, checkout_generation)
  where cart_id is not null and checkout_generation is not null;

create or replace function public.rotate_cart_checkout_generation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart_id uuid;
begin
  v_cart_id := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_cart_id;

  if tg_op = 'UPDATE' and old.cart_id is distinct from new.cart_id then
    update public.carts
    set checkout_generation = extensions.gen_random_uuid(),
        updated_at = pg_catalog.now()
    where id = old.cart_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists cart_items_rotate_checkout_generation on public.cart_items;
create trigger cart_items_rotate_checkout_generation
  after insert or update or delete on public.cart_items
  for each row execute function public.rotate_cart_checkout_generation();

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

  if not found or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
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

create or replace function public.release_checkout_attempt(
  p_order_id uuid,
  p_attempt_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_released integer;
begin
  update public.orders
  set checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id
    and checkout_attempt_token = p_attempt_token;
  get diagnostics v_released = row_count;
  return v_released = 1;
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
begin
  if p_order_id is null or p_attempt_token is null then
    raise exception using errcode = '22023', message = 'order and attempt token are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'failure reason is required';
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
      checkout_attempt_started_at = null
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
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'order id is required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'failure reason is required';
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
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

create or replace function public.retire_checkout_generation(p_order_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_rotated integer;
begin
  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found or v_order.status <> 'cancelled' or v_order.checkout_generation is null then
    return false;
  end if;

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_order.cart_id
    and checkout_generation = v_order.checkout_generation;
  get diagnostics v_rotated = row_count;
  return v_rotated = 1;
end;
$$;

create or replace function public.reserve_checkout_order_snapshot_v2(
  p_idempotency_key text,
  p_user_id uuid,
  p_cart_id uuid,
  p_checkout_generation uuid,
  p_customer_email text,
  p_currency text,
  p_merchandise_subtotal_cents integer,
  p_discount_cents integer,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_total_cents integer,
  p_referral_code text,
  p_reward_points_redeemed integer,
  p_reward_discount_cents integer,
  p_checkout_environment text,
  p_metadata jsonb,
  p_items jsonb
)
returns setof public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_order public.orders%rowtype;
begin
  if p_checkout_generation is null then
    raise exception using errcode = '22023', message = 'checkout generation is required';
  end if;
  if p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) = 0
  then
    raise exception using errcode = '22023', message = 'checkout items must be a non-empty array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'checkout-cart:' || p_cart_id::text || ':' || p_checkout_generation::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('checkout:' || p_idempotency_key, 0)
  );

  select o.*
  into v_order
  from public.orders as o
  where o.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_order.user_id is distinct from p_user_id
      or v_order.cart_id is distinct from p_cart_id
      or v_order.checkout_generation is distinct from p_checkout_generation
      or v_order.currency <> p_currency
      or v_order.customer_email is distinct from p_customer_email
      or v_order.merchandise_subtotal_cents <> p_merchandise_subtotal_cents
      or v_order.discount_cents <> p_discount_cents
      or v_order.shipping_cents <> p_shipping_cents
      or v_order.tax_cents <> p_tax_cents
      or v_order.total_cents <> p_total_cents
      or v_order.referral_code is distinct from p_referral_code
      or v_order.reward_points_redeemed <> p_reward_points_redeemed
      or v_order.reward_discount_cents <> p_reward_discount_cents
      or v_order.checkout_environment::text <> p_checkout_environment
    then
      raise exception using errcode = '23505', message = 'checkout idempotency key snapshot mismatch';
    end if;

    return next v_order;
    return;
  end if;

  if exists (
    select 1
    from public.orders as o
    where o.cart_id = p_cart_id
      and o.checkout_generation = p_checkout_generation
  ) then
    raise exception using errcode = 'P0001', message = 'checkout already reserved for cart generation';
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.id = p_cart_id
    and c.status = 'active'
  for share;
  if not found
    or v_cart.user_id is distinct from p_user_id
    or v_cart.checkout_generation is distinct from p_checkout_generation
    or (v_cart.user_id is null and v_cart.expires_at <= pg_catalog.now())
  then
    raise exception using errcode = 'P0001', message = 'checkout cart changed';
  end if;

  if (
    select pg_catalog.count(*)
    from public.cart_items as ci
    where ci.cart_id = p_cart_id
  ) <> pg_catalog.jsonb_array_length(p_items)
  or exists (
    select 1
    from public.cart_items as ci
    left join public.products as p on p.id = ci.product_id
    left join public.product_variants as pv
      on pv.product_id = ci.product_id
     and pv.variant_key = ci.variant_key
    where ci.cart_id = p_cart_id
      and (
        p.id is null
        or pv.product_id is null
        or p.catalog_status is distinct from 'active'
        or p.status is distinct from 'available'
        or pv.available is distinct from true
        or pv.inventory_status in ('out_of_stock', 'unavailable')
        or not exists (
          select 1
          from pg_catalog.jsonb_to_recordset(p_items) as incoming_line(
            product_id uuid,
            variant_key text,
            quantity integer,
            unit_price_cents integer
          )
          where incoming_line.product_id = ci.product_id
            and incoming_line.variant_key = ci.variant_key
            and incoming_line.quantity = ci.quantity
            and incoming_line.unit_price_cents = pv.price_cents
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'checkout cart changed';
  end if;

  select *
  into v_order
  from public.reserve_checkout_order_snapshot(
    p_idempotency_key,
    p_user_id,
    p_cart_id,
    p_customer_email,
    p_currency,
    p_merchandise_subtotal_cents,
    p_discount_cents,
    p_shipping_cents,
    p_tax_cents,
    p_total_cents,
    p_referral_code,
    p_reward_points_redeemed,
    p_reward_discount_cents,
    p_checkout_environment,
    p_metadata,
    p_items
  );

  update public.orders
  set checkout_generation = p_checkout_generation
  where id = v_order.id
  returning * into v_order;

  return next v_order;
end;
$$;

create or replace function public.clear_paid_order_cart(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_cart public.carts%rowtype;
  v_item record;
  v_line public.cart_items%rowtype;
  v_changed integer := 0;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'order id is required';
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;
  if not found or v_order.status <> 'paid' then
    raise exception using errcode = 'P0002', message = 'paid order not found';
  end if;
  if v_order.metadata ? 'cart_cleared_at' or v_order.metadata ? 'cart_clear_skipped_at' then
    return 0;
  end if;

  if v_order.cart_id is null then
    update public.orders
    set metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'cart_clear_skipped_at', pg_catalog.now(),
          'cart_clear_skip_reason', 'missing_cart'
        )
    where id = v_order.id;
    return 0;
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.id = v_order.cart_id
  for update;

  if not found
    or v_order.checkout_generation is null
    or v_cart.checkout_generation is distinct from v_order.checkout_generation
  then
    update public.orders
    set metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'cart_clear_skipped_at', pg_catalog.now(),
          'cart_clear_skip_reason', 'generation_mismatch'
        )
    where id = v_order.id;
    return 0;
  end if;

  for v_item in
    select oi.product_id, oi.variant_key, oi.quantity
    from public.order_items as oi
    where oi.order_id = v_order.id
      and oi.product_id is not null
  loop
    select ci.*
    into v_line
    from public.cart_items as ci
    where ci.cart_id = v_order.cart_id
      and ci.product_id = v_item.product_id
      and ci.variant_key = v_item.variant_key
    for update;

    if found and v_line.quantity <= v_item.quantity then
      delete from public.cart_items where id = v_line.id;
      v_changed := v_changed + 1;
    elsif found then
      update public.cart_items
      set quantity = quantity - v_item.quantity,
          updated_at = pg_catalog.now()
      where id = v_line.id;
      v_changed := v_changed + 1;
    end if;
  end loop;

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_order.cart_id;

  update public.orders
  set metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'cart_cleared_at', pg_catalog.now()
      )
  where id = v_order.id;

  return v_changed;
end;
$$;

revoke all on function public.claim_checkout_attempt(uuid) from public, anon, authenticated;
revoke all on function public.release_checkout_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_checkout_attempt(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.fail_checkout_order_from_stripe(uuid, text) from public, anon, authenticated;
revoke all on function public.retire_checkout_generation(uuid) from public, anon, authenticated;
revoke all on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.clear_paid_order_cart(uuid) from public, anon, authenticated;

grant execute on function public.claim_checkout_attempt(uuid) to service_role;
grant execute on function public.release_checkout_attempt(uuid, uuid) to service_role;
grant execute on function public.fail_checkout_attempt(uuid, uuid, text, boolean) to service_role;
grant execute on function public.fail_checkout_order_from_stripe(uuid, text) to service_role;
grant execute on function public.retire_checkout_generation(uuid) to service_role;
grant execute on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) to service_role;
grant execute on function public.clear_paid_order_cart(uuid) to service_role;
