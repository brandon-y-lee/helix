-- Report stale checkout snapshots as application conflicts, not retryable serialization failures.

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

  return query
  select *
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
end;
$$;

revoke all on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) to service_role;
