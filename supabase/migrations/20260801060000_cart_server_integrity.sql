-- Atomic cart mutations, guest expiry enforcement, and transactional checkout snapshots.

create index if not exists carts_expired_guest_cleanup_idx
  on public.carts (expires_at, id)
  where user_id is null
    and expires_at is not null
    and status in ('active', 'abandoned');

create or replace function public.resolve_active_cart(
  p_user_id uuid,
  p_guest_token_hash text,
  p_create boolean
)
returns table (
  cart_id uuid,
  user_id uuid,
  guest_token_hash text,
  status public.cart_status,
  expires_at timestamptz,
  expired boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cart public.carts%rowtype;
  v_lock_key text;
begin
  if (p_user_id is null) = (p_guest_token_hash is null) then
    raise exception using
      errcode = '22023',
      message = 'exactly one cart owner identity is required';
  end if;

  if p_guest_token_hash is not null
    and p_guest_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'guest token hash must be a lowercase SHA-256 digest';
  end if;

  v_lock_key := case
    when p_user_id is not null then 'cart:user:' || p_user_id::text
    else 'cart:guest:' || p_guest_token_hash
  end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lock_key, 0)
  );

  if p_user_id is not null then
    select c.*
    into v_cart
    from public.carts as c
    where c.user_id = p_user_id
      and c.status = 'active'
    limit 1;

    if not found and p_create then
      insert into public.carts (user_id, status)
      values (p_user_id, 'active')
      on conflict (user_id)
        where status = 'active' and user_id is not null
      do update set updated_at = pg_catalog.now()
      returning * into v_cart;
    end if;

    if v_cart.id is not null then
      return query select
        v_cart.id,
        v_cart.user_id,
        v_cart.guest_token_hash,
        v_cart.status,
        v_cart.expires_at,
        false;
    end if;
    return;
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.guest_token_hash = p_guest_token_hash
    and c.user_id is null
    and c.status = 'active'
  limit 1
  for update;

  if found and v_cart.expires_at <= pg_catalog.now() then
    update public.carts
    set status = 'abandoned', updated_at = pg_catalog.now()
    where id = v_cart.id;

    return query select
      null::uuid,
      null::uuid,
      p_guest_token_hash,
      'abandoned'::public.cart_status,
      v_cart.expires_at,
      true;
    return;
  end if;

  if found then
    return query select
      v_cart.id,
      v_cart.user_id,
      v_cart.guest_token_hash,
      v_cart.status,
      v_cart.expires_at,
      false;
    return;
  end if;

  if exists (
    select 1
    from public.carts as c
    where c.guest_token_hash = p_guest_token_hash
      and c.user_id is null
  ) then
    return query select
      null::uuid,
      null::uuid,
      p_guest_token_hash,
      'abandoned'::public.cart_status,
      null::timestamptz,
      true;
    return;
  end if;

  if p_create then
    insert into public.carts (
      guest_token_hash,
      status,
      expires_at
    )
    values (
      p_guest_token_hash,
      'active',
      pg_catalog.now() + interval '60 days'
    )
    on conflict (guest_token_hash)
      where status = 'active' and guest_token_hash is not null
    do update set updated_at = pg_catalog.now()
    returning * into v_cart;

    return query select
      v_cart.id,
      v_cart.user_id,
      v_cart.guest_token_hash,
      v_cart.status,
      v_cart.expires_at,
      false;
  end if;
end;
$$;

create or replace function public.cart_add_item_delta(
  p_cart_id uuid,
  p_product_id uuid,
  p_variant_key text,
  p_quantity_delta integer
)
returns table (line_id uuid, quantity integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_cart_id is null or p_product_id is null then
    raise exception using errcode = '22023', message = 'cart and product are required';
  end if;
  if p_variant_key is null or pg_catalog.char_length(p_variant_key) = 0 then
    raise exception using errcode = '22023', message = 'variant key is required';
  end if;
  if p_quantity_delta is null or p_quantity_delta < 1 or p_quantity_delta > 99 then
    raise exception using errcode = '22023', message = 'quantity delta must be between 1 and 99';
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

  return query
  insert into public.cart_items (
    cart_id,
    product_id,
    variant_key,
    quantity
  )
  values (
    p_cart_id,
    p_product_id,
    p_variant_key,
    p_quantity_delta
  )
  on conflict (cart_id, product_id, variant_key)
  do update set
    quantity = least(
      99,
      public.cart_items.quantity + excluded.quantity
    ),
    updated_at = pg_catalog.now()
  returning public.cart_items.id, public.cart_items.quantity;
end;
$$;

create or replace function public.cart_set_item_quantity(
  p_cart_id uuid,
  p_line_id uuid,
  p_quantity integer
)
returns table (line_id uuid, quantity integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_cart_id is null or p_line_id is null then
    raise exception using errcode = '22023', message = 'cart and line are required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception using errcode = '22023', message = 'quantity must be between 1 and 99';
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

  return query
  update public.cart_items as ci
  set quantity = p_quantity, updated_at = pg_catalog.now()
  where ci.id = p_line_id
    and ci.cart_id = p_cart_id
  returning ci.id, ci.quantity;
end;
$$;

create or replace function public.cart_remove_item(
  p_cart_id uuid,
  p_line_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_cart_id is null or p_line_id is null then
    raise exception using errcode = '22023', message = 'cart and line are required';
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
  where ci.id = p_line_id
    and ci.cart_id = p_cart_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.cleanup_expired_guest_carts(
  p_limit integer,
  p_apply boolean
)
returns table (matched_count integer, deleted_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_matched integer;
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'cleanup limit must be between 1 and 500';
  end if;
  if p_apply is null then
    raise exception using errcode = '22023', message = 'cleanup mode is required';
  end if;

  select coalesce(pg_catalog.array_agg(candidate.id), '{}'::uuid[])
  into v_ids
  from (
    select c.id
    from public.carts as c
    where c.user_id is null
      and c.expires_at <= pg_catalog.now()
      and c.status in ('active', 'abandoned')
    order by c.expires_at, c.id
    limit p_limit
    for update skip locked
  ) as candidate;

  v_matched := pg_catalog.cardinality(v_ids);
  if p_apply and v_matched > 0 then
    delete from public.carts as c
    where c.id = any(v_ids);
    get diagnostics v_deleted = row_count;
  end if;

  return query select v_matched, v_deleted;
end;
$$;

drop function if exists public.merge_guest_cart(text);

create or replace function public.merge_guest_cart(
  p_user_id uuid,
  p_guest_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_cart_id uuid;
  v_guest_cart public.carts%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user id is required';
  end if;
  if p_guest_token_hash is null or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'guest token hash must be a lowercase SHA-256 digest';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cart:user:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cart:guest:' || p_guest_token_hash, 0)
  );

  insert into public.carts (user_id, status)
  values (p_user_id, 'active')
  on conflict (user_id)
    where status = 'active' and user_id is not null
  do update set updated_at = pg_catalog.now()
  returning id into v_user_cart_id;

  select c.*
  into v_guest_cart
  from public.carts as c
  where c.guest_token_hash = p_guest_token_hash
    and c.user_id is null
    and c.status = 'active'
  limit 1
  for update;

  if not found then
    return v_user_cart_id;
  end if;

  if v_guest_cart.expires_at <= pg_catalog.now() then
    update public.carts
    set status = 'abandoned', updated_at = pg_catalog.now()
    where id = v_guest_cart.id;
    return v_user_cart_id;
  end if;

  insert into public.cart_items (
    cart_id,
    product_id,
    variant_key,
    quantity
  )
  select
    v_user_cart_id,
    ci.product_id,
    ci.variant_key,
    ci.quantity
  from public.cart_items as ci
  where ci.cart_id = v_guest_cart.id
  on conflict (cart_id, product_id, variant_key)
  do update set
    quantity = least(
      99,
      public.cart_items.quantity + excluded.quantity
    ),
    updated_at = pg_catalog.now();

  update public.carts
  set status = 'merged', expires_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_guest_cart.id;

  return v_user_cart_id;
end;
$$;

create or replace function public.reserve_checkout_order_snapshot(
  p_idempotency_key text,
  p_user_id uuid,
  p_cart_id uuid,
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
  v_item_count integer;
  v_item_total bigint;
  v_existing_items jsonb;
  v_incoming_items jsonb;
begin
  if p_idempotency_key is null
    or p_idempotency_key !~ '^checkout:sandbox:[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid checkout idempotency key';
  end if;
  if p_cart_id is null then
    raise exception using errcode = '22023', message = 'cart id is required';
  end if;
  if p_currency <> 'USD' or p_checkout_environment <> 'sandbox' then
    raise exception using errcode = '22023', message = 'checkout must use sandbox USD';
  end if;
  if p_merchandise_subtotal_cents is null
    or p_discount_cents is null
    or p_shipping_cents is null
    or p_tax_cents is null
    or p_total_cents is null
    or p_reward_points_redeemed is null
    or p_reward_discount_cents is null
    or p_merchandise_subtotal_cents < 0
    or p_discount_cents < 0
    or p_shipping_cents < 0
    or p_tax_cents < 0
    or p_total_cents < 0
    or p_reward_points_redeemed < 0
    or p_reward_discount_cents < 0
    or p_reward_discount_cents > p_discount_cents
  then
    raise exception using errcode = '22023', message = 'checkout amounts must be valid nonnegative cents';
  end if;
  if p_total_cents <> greatest(
    0,
    p_merchandise_subtotal_cents - p_discount_cents
  ) + p_shipping_cents + p_tax_cents then
    raise exception using errcode = '22023', message = 'checkout total does not match components';
  end if;
  if p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) < 1
    or pg_catalog.jsonb_array_length(p_items) > 100
  then
    raise exception using errcode = '22023', message = 'checkout items must be a nonempty bounded array';
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.id = p_cart_id
    and c.status = 'active'
  for share;
  if not found
    or v_cart.user_id is distinct from p_user_id
    or (v_cart.user_id is null and v_cart.expires_at <= pg_catalog.now())
  then
    raise exception using errcode = 'P0002', message = 'active checkout cart not found';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(item.line_subtotal_cents), 0),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id', item.product_id,
        'product_slug', item.product_slug,
        'product_name', item.product_name,
        'variant_key', item.variant_key,
        'variant_label', item.variant_label,
        'unit_price_cents', item.unit_price_cents,
        'quantity', item.quantity,
        'line_subtotal_cents', item.line_subtotal_cents,
        'product_snapshot', item.product_snapshot
      ) order by item.product_id::text, item.variant_key
    )
  into v_item_count, v_item_total, v_incoming_items
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_slug text,
    product_name text,
    variant_key text,
    variant_label text,
    unit_price_cents integer,
    quantity integer,
    line_subtotal_cents integer,
    product_snapshot jsonb
  );

  if v_item_count <> pg_catalog.jsonb_array_length(p_items) then
    raise exception using errcode = '22023', message = 'every checkout item must be an object';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_slug text,
      product_name text,
      variant_key text,
      variant_label text,
      unit_price_cents integer,
      quantity integer,
      line_subtotal_cents integer,
      product_snapshot jsonb
    )
    where item.product_id is null
      or item.product_slug is null
      or pg_catalog.char_length(item.product_slug) = 0
      or item.product_name is null
      or pg_catalog.char_length(item.product_name) = 0
      or item.variant_key is null
      or pg_catalog.char_length(item.variant_key) = 0
      or item.variant_label is null
      or pg_catalog.char_length(item.variant_label) = 0
      or item.unit_price_cents is null
      or item.unit_price_cents < 0
      or item.quantity is null
      or item.quantity < 1
      or item.quantity > 99
      or item.line_subtotal_cents is null
      or item.line_subtotal_cents <> item.unit_price_cents * item.quantity
      or item.product_snapshot is null
      or pg_catalog.jsonb_typeof(item.product_snapshot) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'order item snapshot is invalid';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid,
      variant_key text
    )
    group by item.product_id, item.variant_key
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate order item snapshot';
  end if;
  if v_item_total <> p_merchandise_subtotal_cents then
    raise exception using errcode = '22023', message = 'order item totals do not match merchandise subtotal';
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
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id', oi.product_id,
        'product_slug', oi.product_slug,
        'product_name', oi.product_name,
        'variant_key', oi.variant_key,
        'variant_label', oi.variant_label,
        'unit_price_cents', oi.unit_price_cents,
        'quantity', oi.quantity,
        'line_subtotal_cents', oi.line_subtotal_cents,
        'product_snapshot', oi.product_snapshot
      ) order by oi.product_id::text, oi.variant_key
    )
    into v_existing_items
    from public.order_items as oi
    where oi.order_id = v_order.id;

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
      or v_order.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
      or v_existing_items is distinct from v_incoming_items
    then
      raise exception using errcode = '23505', message = 'checkout idempotency key snapshot mismatch';
    end if;

    if v_order.status in ('cancelled', 'payment_failed') then
      update public.orders
      set status = 'pending_payment', cancelled_at = null, updated_at = pg_catalog.now()
      where id = v_order.id
      returning * into v_order;
    end if;

    return next v_order;
    return;
  end if;

  insert into public.orders (
    order_number,
    user_id,
    cart_id,
    status,
    checkout_environment,
    currency,
    customer_email,
    merchandise_subtotal_cents,
    discount_cents,
    shipping_cents,
    tax_cents,
    total_cents,
    referral_code,
    reward_points_redeemed,
    reward_discount_cents,
    metadata,
    idempotency_key
  )
  values (
    'MP-' || pg_catalog.upper(pg_catalog.substr(p_idempotency_key, 18, 12)),
    p_user_id,
    p_cart_id,
    'pending_payment',
    p_checkout_environment::public.checkout_environment,
    p_currency,
    p_customer_email,
    p_merchandise_subtotal_cents,
    p_discount_cents,
    p_shipping_cents,
    p_tax_cents,
    p_total_cents,
    p_referral_code,
    p_reward_points_redeemed,
    p_reward_discount_cents,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_slug,
    product_name,
    variant_key,
    variant_label,
    unit_price_cents,
    quantity,
    line_subtotal_cents,
    product_snapshot
  )
  select
    v_order.id,
    item.product_id,
    item.product_slug,
    item.product_name,
    item.variant_key,
    item.variant_label,
    item.unit_price_cents,
    item.quantity,
    item.line_subtotal_cents,
    item.product_snapshot
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_slug text,
    product_name text,
    variant_key text,
    variant_label text,
    unit_price_cents integer,
    quantity integer,
    line_subtotal_cents integer,
    product_snapshot jsonb
  );

  return next v_order;
end;
$$;

create or replace function public.redeem_loyalty_points(
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
    pg_catalog.hashtextextended('loyalty-redemption:' || p_source_key, 0)
  );

  select entry.id
  into v_entry_id
  from public.loyalty_ledger_entries as entry
  where entry.source_key = p_source_key;
  if found then
    return v_entry_id;
  end if;

  perform public.ensure_loyalty_account(p_user_id);

  select account.points_balance
  into v_balance
  from public.loyalty_accounts as account
  where account.user_id = p_user_id
  for update;

  if v_balance < p_points then
    raise exception 'Insufficient loyalty balance';
  end if;

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
    'redemption_reserved',
    'posted',
    -p_points,
    p_description,
    p_source_key
  )
  returning id into v_entry_id;

  update public.loyalty_accounts
  set points_balance = points_balance - p_points
  where user_id = p_user_id;

  insert into public.loyalty_redemptions (
    user_id,
    order_id,
    status,
    points,
    amount_cents,
    source_key
  )
  values (
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

revoke all on function public.resolve_active_cart(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.cart_add_item_delta(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.cart_set_item_quantity(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.cart_remove_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_expired_guest_carts(integer, boolean) from public, anon, authenticated;
revoke all on function public.merge_guest_cart(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_checkout_order_snapshot(text, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.redeem_loyalty_points(uuid, integer, integer, text, text, uuid) from public, anon, authenticated;

grant execute on function public.resolve_active_cart(uuid, text, boolean) to service_role;
grant execute on function public.cart_add_item_delta(uuid, uuid, text, integer) to service_role;
grant execute on function public.cart_set_item_quantity(uuid, uuid, integer) to service_role;
grant execute on function public.cart_remove_item(uuid, uuid) to service_role;
grant execute on function public.cleanup_expired_guest_carts(integer, boolean) to service_role;
grant execute on function public.merge_guest_cart(uuid, text) to service_role;
grant execute on function public.reserve_checkout_order_snapshot(text, uuid, uuid, text, text, integer, integer, integer, integer, integer, text, integer, integer, text, jsonb, jsonb) to service_role;
grant execute on function public.redeem_loyalty_points(uuid, integer, integer, text, text, uuid) to service_role;

revoke all on table public.carts from anon, authenticated;
revoke all on table public.cart_items from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.payment_attempts from anon, authenticated;
revoke all on table public.stripe_customers from anon, authenticated;

grant select on table public.carts to authenticated;
grant select on table public.cart_items to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.payment_attempts to authenticated;
grant select on table public.stripe_customers to authenticated;

drop policy if exists "carts_select_own_user" on public.carts;
create policy "carts_select_own_user"
  on public.carts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "carts_insert_own_user" on public.carts;
drop policy if exists "carts_update_own_user" on public.carts;

drop policy if exists "cart_items_select_own_user_cart" on public.cart_items;
create policy "cart_items_select_own_user_cart"
  on public.cart_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.carts as c
      where c.id = cart_items.cart_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "cart_items_insert_own_user_cart" on public.cart_items;
drop policy if exists "cart_items_update_own_user_cart" on public.cart_items;
drop policy if exists "cart_items_delete_own_user_cart" on public.cart_items;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "order_items_select_own_order" on public.order_items;
create policy "order_items_select_own_order"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders as o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "payment_attempts_select_own_order" on public.payment_attempts;
create policy "payment_attempts_select_own_order"
  on public.payment_attempts for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders as o
      where o.id = payment_attempts.order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "stripe_customers_select_own" on public.stripe_customers;
create policy "stripe_customers_select_own"
  on public.stripe_customers for select
  to authenticated
  using ((select auth.uid()) = user_id);
