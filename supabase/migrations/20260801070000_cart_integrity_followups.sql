-- Close checkout retry, cart snapshot, and reward compensation race windows.

alter table public.carts
  add column if not exists checkout_generation uuid
    not null default extensions.gen_random_uuid();

create or replace function public.cart_clear_items(p_cart_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_cart_id is null then
    raise exception using errcode = '22023', message = 'cart id is required';
  end if;

  perform 1
  from public.carts as c
  where c.id = p_cart_id
    and c.status = 'active'
    and (c.user_id is not null or c.expires_at > pg_catalog.now())
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'active cart not found';
  end if;

  delete from public.cart_items as ci
  where ci.cart_id = p_cart_id;
  get diagnostics v_deleted = row_count;

  update public.carts
  set updated_at = pg_catalog.now()
  where id = p_cart_id;

  return v_deleted;
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
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'checkout items must be an array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('checkout:' || p_idempotency_key, 0)
  );

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
    raise exception using errcode = '40001', message = 'checkout cart changed';
  end if;

  if exists (
    select 1
    from (
      select
        ci.product_id,
        ci.variant_key,
        ci.quantity,
        p.catalog_status,
        p.status as product_status,
        pv.price_cents,
        pv.available,
        pv.inventory_status
      from public.cart_items as ci
      left join public.products as p on p.id = ci.product_id
      left join public.product_variants as pv
        on pv.product_id = ci.product_id
       and pv.variant_key = ci.variant_key
      where ci.cart_id = p_cart_id
    ) as current_line
    full join pg_catalog.jsonb_to_recordset(p_items) as incoming_line(
      product_id uuid,
      variant_key text,
      quantity integer,
      unit_price_cents integer
    )
      on incoming_line.product_id = current_line.product_id
     and incoming_line.variant_key = current_line.variant_key
    where current_line.product_id is null
      or incoming_line.product_id is null
      or current_line.quantity is distinct from incoming_line.quantity
      or current_line.price_cents is distinct from incoming_line.unit_price_cents
      or current_line.catalog_status is distinct from 'active'
      or current_line.product_status is distinct from 'available'
      or current_line.available is distinct from true
      or current_line.inventory_status in ('out_of_stock', 'unavailable')
  ) then
    raise exception using errcode = '40001', message = 'checkout cart changed';
  end if;

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

create or replace function public.clear_paid_order_cart(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
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
  if v_order.metadata ? 'cart_cleared_at' then
    return 0;
  end if;

  if v_order.cart_id is not null then
    perform 1
    from public.carts as c
    where c.id = v_order.cart_id
    for update;

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
  end if;

  update public.orders
  set metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'cart_cleared_at', pg_catalog.now()
      ),
      updated_at = pg_catalog.now()
  where id = v_order.id;

  return v_changed;
end;
$$;

create or replace function public.release_loyalty_redemptions_for_order(
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
  v_redemption public.loyalty_redemptions%rowtype;
  v_ledger_id uuid;
  v_released integer := 0;
begin
  if p_user_id is null or p_order_id is null then
    raise exception using errcode = '22023', message = 'user and order are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'release reason is required';
  end if;

  perform public.ensure_loyalty_account(p_user_id);
  perform 1
  from public.loyalty_accounts as account
  where account.user_id = p_user_id
  for update;

  for v_redemption in
    select redemption.*
    from public.loyalty_redemptions as redemption
    where redemption.user_id = p_user_id
      and redemption.order_id = p_order_id
      and redemption.status = 'applied'
    order by redemption.created_at, redemption.id
    for update
  loop
    insert into public.loyalty_ledger_entries (
      user_id,
      order_id,
      entry_type,
      status,
      points,
      description,
      source_key
    )
    values (
      p_user_id,
      p_order_id,
      'redemption_released',
      'posted',
      v_redemption.points,
      'Released reserved checkout points after ' || pg_catalog.btrim(p_reason) || '.',
      'reward-release:' || v_redemption.id::text
    )
    on conflict (source_key) do nothing
    returning id into v_ledger_id;

    update public.loyalty_redemptions
    set status = 'reversed', updated_at = pg_catalog.now()
    where id = v_redemption.id;

    if v_ledger_id is not null then
      update public.loyalty_accounts
      set points_balance = points_balance + v_redemption.points
      where user_id = p_user_id;
      v_released := v_released + 1;
    end if;
  end loop;

  return v_released;
end;
$$;

revoke all on function public.cart_clear_items(uuid) from public, anon, authenticated;
revoke all on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.clear_paid_order_cart(uuid) from public, anon, authenticated;
revoke all on function public.release_loyalty_redemptions_for_order(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.cart_clear_items(uuid) to service_role;
grant execute on function public.reserve_checkout_order_snapshot_v2(text, uuid, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) to service_role;
grant execute on function public.clear_paid_order_cart(uuid) to service_role;
grant execute on function public.release_loyalty_redemptions_for_order(uuid, uuid, text) to service_role;
