-- Remove the exact disposable prelaunch Cart inventory captured for #181.
-- Orders retain their immutable snapshots because orders.cart_id is on delete set null.
do $$
declare
  v_expected_carts constant bigint := 602;
  v_expected_cart_items constant bigint := 507;
  v_expected_linked_carts constant bigint := 3;
  v_expected_orders constant bigint := 9;
  v_expected_order_items constant bigint := 16;
  v_expected_payment_attempts constant bigint := 10;
  v_expected_webhook_events constant bigint := 3;
  v_actual bigint;
  v_deleted bigint;
begin
  lock table public.carts, public.cart_items, public.orders
    in share row exclusive mode;

  select count(*) into v_actual from public.carts;
  if v_actual <> v_expected_carts then
    raise exception 'Cart cleanup refused: expected % carts, found %',
      v_expected_carts, v_actual;
  end if;

  select count(*) into v_actual from public.cart_items;
  if v_actual <> v_expected_cart_items then
    raise exception 'Cart cleanup refused: expected % cart items, found %',
      v_expected_cart_items, v_actual;
  end if;

  select count(*) into v_actual
  from public.carts as cart
  where exists (
    select 1 from public.orders as customer_order where customer_order.cart_id = cart.id
  );
  if v_actual <> v_expected_linked_carts then
    raise exception 'Cart cleanup refused: expected % order-linked carts, found %',
      v_expected_linked_carts, v_actual;
  end if;

  select count(*) into v_actual from public.orders;
  if v_actual <> v_expected_orders then
    raise exception 'Cart cleanup refused: expected % immutable orders, found %',
      v_expected_orders, v_actual;
  end if;

  if exists (
    select 1 from public.orders where checkout_environment <> 'sandbox'
  ) then
    raise exception 'Cart cleanup refused: non-sandbox order found';
  end if;

  select count(*) into v_actual from public.order_items;
  if v_actual <> v_expected_order_items then
    raise exception 'Cart cleanup refused: expected % immutable order items, found %',
      v_expected_order_items, v_actual;
  end if;

  select count(*) into v_actual from public.payment_attempts;
  if v_actual <> v_expected_payment_attempts then
    raise exception 'Cart cleanup refused: expected % immutable payment attempts, found %',
      v_expected_payment_attempts, v_actual;
  end if;

  if exists (
    select 1 from public.payment_attempts where checkout_environment <> 'sandbox'
  ) then
    raise exception 'Cart cleanup refused: non-sandbox payment attempt found';
  end if;

  select count(*) into v_actual from public.stripe_webhook_events;
  if v_actual <> v_expected_webhook_events then
    raise exception 'Cart cleanup refused: expected % immutable webhook events, found %',
      v_expected_webhook_events, v_actual;
  end if;

  if exists (select 1 from public.stripe_webhook_events where livemode) then
    raise exception 'Cart cleanup refused: live webhook event found';
  end if;

  delete from public.carts;
  get diagnostics v_deleted = row_count;
  if v_deleted <> v_expected_carts then
    raise exception 'Cart cleanup refused: expected to delete % carts, deleted %',
      v_expected_carts, v_deleted;
  end if;

  if exists (select 1 from public.cart_items) then
    raise exception 'Cart cleanup failed: Cart Lines remain';
  end if;

  if (select count(*) from public.orders) <> v_expected_orders
     or (select count(*) from public.order_items) <> v_expected_order_items
     or (select count(*) from public.payment_attempts) <> v_expected_payment_attempts
     or (select count(*) from public.stripe_webhook_events) <> v_expected_webhook_events then
    raise exception 'Cart cleanup failed: immutable order or payment history changed';
  end if;
end;
$$;
