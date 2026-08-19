begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

select has_column(
  'public',
  'carts',
  'checkout_generation',
  'carts carry a server-owned checkout generation'
);
select has_column(
  'public',
  'orders',
  'checkout_generation',
  'orders retain the cart generation they purchased'
);
select has_column(
  'public',
  'orders',
  'checkout_attempt_token',
  'orders carry an exclusive checkout-attempt token'
);
select has_column(
  'public',
  'orders',
  'checkout_attempt_started_at',
  'checkout-attempt leases have a bounded start time'
);

select has_function(
  'public',
  'resolve_active_cart',
  array['uuid', 'text', 'boolean'],
  'active-cart resolution is a database operation'
);
select has_function(
  'public',
  'cart_add_item_delta',
  array['uuid', 'uuid', 'text', 'integer'],
  'add delta is a database operation'
);
select has_function(
  'public',
  'cart_set_item_quantity',
  array['uuid', 'uuid', 'integer'],
  'absolute quantity set is a separate database operation'
);
select has_function(
  'public',
  'cart_remove_item',
  array['uuid', 'uuid'],
  'remove is a cart-scoped database operation'
);
select has_function(
  'public',
  'cleanup_expired_guest_carts',
  array['integer', 'boolean'],
  'guest-cart cleanup is bounded and explicit'
);
select has_function(
  'public',
  'reserve_checkout_order_snapshot',
  array['text', 'uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'text', 'jsonb', 'jsonb'],
  'order and item snapshots share one transaction'
);
select has_function(
  'public',
  'reserve_checkout_order_snapshot_v2',
  array['text', 'uuid', 'uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'text', 'jsonb', 'jsonb'],
  'checkout reservation validates the live cart generation'
);
select has_function(
  'public',
  'cart_clear_items',
  array['uuid'],
  'explicit cart clearing shares the mutation lock'
);
select has_function(
  'public',
  'clear_paid_order_cart',
  array['uuid'],
  'paid cart clearing is transactional and idempotent'
);
select has_function(
  'public',
  'release_rewards_reservations_for_order',
  array['uuid', 'uuid', 'text'],
  'Points Reservation release is transactional'
);
select has_function(
  'public',
  'claim_checkout_attempt',
  array['uuid'],
  'checkout attempts are claimed atomically'
);
select has_function(
  'public',
  'release_checkout_attempt',
  array['uuid', 'uuid'],
  'checkout attempt leases are owner-released'
);
select has_function(
  'public',
  'fail_checkout_attempt',
  array['uuid', 'uuid', 'text', 'boolean'],
  'checkout attempt failure is a compare-and-set transaction'
);
select has_function(
  'public',
  'fail_checkout_order_from_stripe',
  array['uuid', 'text'],
  'trusted Stripe failures are transactional'
);
select has_function(
  'public',
  'prepare_checkout_attempt',
  array['uuid', 'uuid', 'text', 'boolean', 'text'],
  'checkout preparation is guarded by its attempt lease and expected session'
);
select has_function(
  'public',
  'attach_checkout_session',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'Stripe sessions attach through the checkout attempt lease'
);
select has_function(
  'public',
  'fail_checkout_order_from_stripe',
  array['uuid', 'text', 'text'],
  'Stripe failure transitions identify the exact session'
);
select has_function(
  'public',
  'expire_checkout_order_from_stripe',
  array['uuid', 'text', 'text'],
  'Stripe expiration transitions identify the exact session'
);
select has_function(
  'public',
  'cancel_checkout_order_without_session',
  array['uuid', 'text'],
  'no-session checkout cancellation is transactional'
);
select has_function(
  'public',
  'finalize_paid_checkout_order',
  array['uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'text', 'text', 'integer', 'text', 'jsonb', 'jsonb', 'text', 'text'],
  'paid checkout finalization identifies the exact session'
);
select has_function(
  'public',
  'retire_checkout_generation',
  array['uuid'],
  'cancelled checkout generations can be retired safely'
);

select function_privs_are(
  'public',
  'resolve_active_cart',
  array['uuid', 'text', 'boolean'],
  'anon',
  array[]::text[],
  'anon cannot resolve carts directly'
);
select function_privs_are(
  'public',
  'resolve_active_cart',
  array['uuid', 'text', 'boolean'],
  'authenticated',
  array[]::text[],
  'authenticated browser sessions cannot resolve carts directly'
);
select function_privs_are(
  'public',
  'resolve_active_cart',
  array['uuid', 'text', 'boolean'],
  'service_role',
  array['EXECUTE'],
  'the trusted server role can resolve carts'
);

select function_privs_are(
  'public',
  'cart_add_item_delta',
  array['uuid', 'uuid', 'text', 'integer'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot invoke cart mutation RPCs'
);
select function_privs_are(
  'public',
  'reserve_checkout_order_snapshot',
  array['text', 'uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'text', 'jsonb', 'jsonb'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot reserve orders'
);
select function_privs_are(
  'public',
  'reserve_checkout_order_snapshot_v2',
  array['text', 'uuid', 'uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'text', 'jsonb', 'jsonb'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot validate and reserve checkout snapshots'
);
select function_privs_are(
  'public',
  'claim_checkout_attempt',
  array['uuid'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot claim checkout attempt leases'
);
select function_privs_are(
  'public',
  'fail_checkout_attempt',
  array['uuid', 'uuid', 'text', 'boolean'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot compensate checkout attempts'
);
select function_privs_are(
  'public',
  'prepare_checkout_attempt',
  array['uuid', 'uuid', 'text', 'boolean', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot prepare checkout attempts'
);
select function_privs_are(
  'public',
  'attach_checkout_session',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot attach Stripe sessions'
);
select function_privs_are(
  'public',
  'fail_checkout_order_from_stripe',
  array['uuid', 'text', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot fail Stripe checkout sessions'
);
select function_privs_are(
  'public',
  'expire_checkout_order_from_stripe',
  array['uuid', 'text', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot expire Stripe checkout sessions'
);
select function_privs_are(
  'public',
  'cancel_checkout_order_without_session',
  array['uuid', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot cancel unattached checkout orders'
);
select function_privs_are(
  'public',
  'finalize_paid_checkout_order',
  array['uuid', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'text', 'text', 'integer', 'text', 'jsonb', 'jsonb', 'text', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot finalize paid checkout orders'
);

select ok(
  (
    select array_to_string(proconfig, ',') like 'search_path=%'
      and array_to_string(proconfig, ',') not like '%public%'
    from pg_proc
    where oid = 'public.resolve_active_cart(uuid,text,boolean)'::regprocedure
  ),
  'active-cart resolution has an empty fixed search_path'
);
select ok(
  (
    select array_to_string(proconfig, ',') like 'search_path=%'
      and array_to_string(proconfig, ',') not like '%public%'
    from pg_proc
    where oid = 'public.merge_guest_cart(uuid,text)'::regprocedure
  ),
  'guest merge has an empty fixed search_path'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'cart-integrity@example.test',
  '',
  now(),
  now(),
  now()
);

select is(
  (
    select count(*)::integer
    from (
      select * from public.resolve_active_cart(
        '10000000-0000-4000-8000-000000000001',
        null,
        true
      )
      union all
      select * from public.resolve_active_cart(
        '10000000-0000-4000-8000-000000000001',
        null,
        true
      )
    ) resolved
  ),
  2,
  'repeated authenticated resolution succeeds'
);
select is(
  (
    select count(*)::integer
    from public.carts
    where user_id = '10000000-0000-4000-8000-000000000001'
      and status = 'active'
  ),
  1,
  'repeated authenticated resolution converges on one active cart'
);

select is(
  (
    select count(distinct cart_id)::integer
    from (
      select * from public.resolve_active_cart(null, repeat('a', 64), true)
      union all
      select * from public.resolve_active_cart(null, repeat('a', 64), true)
    ) resolved
  ),
  1,
  'repeated guest resolution converges on one active cart'
);

insert into public.carts (guest_token_hash, expires_at)
values (repeat('b', 64), now() - interval '1 second');

select is(
  (select expired from public.resolve_active_cart(null, repeat('b', 64), false)),
  true,
  'expired guest tokens are reported instead of revived'
);
select is(
  (
    select count(*)::integer
    from public.carts
    where guest_token_hash = repeat('b', 64)
      and status = 'active'
  ),
  0,
  'expired guest carts no longer remain active'
);

select lives_ok(
  $$select * from public.cart_remove_item(
    (select id from public.carts where guest_token_hash = repeat('a', 64)),
    '00000000-0000-4000-8000-000000000002'
  )$$,
  'removing a missing line is idempotent'
);

select throws_ok(
  $$select * from public.cart_set_item_quantity(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    0
  )$$,
  '22023',
  'quantity must be between 1 and 99',
  'absolute quantity validation is preserved'
);

select is(
  (select matched_count from public.cleanup_expired_guest_carts(1, false)),
  1,
  'cleanup dry-run reports a bounded match count'
);
select is(
  (select deleted_count from public.cleanup_expired_guest_carts(1, true)),
  1,
  'cleanup apply deletes only the bounded batch'
);
select is(
  (select deleted_count from public.cleanup_expired_guest_carts(1, true)),
  0,
  'cleanup apply is idempotent'
);

select * from public.resolve_active_cart(null, repeat('c', 64), true);

select throws_ok(
  $$select * from public.reserve_checkout_order_snapshot(
    'checkout:sandbox:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    null,
    (select id from public.carts where guest_token_hash = repeat('c', 64)),
    'guest@example.test',
    'USD',
    1000,
    0,
    0,
    0,
    1000,
    null,
    0,
    0,
    'sandbox',
    '{}'::jsonb,
    '[{"product_id":"00000000-0000-4000-8000-000000000011","product_slug":"test","product_name":"Test","variant_key":"standard","variant_label":"Standard","quantity":0,"unit_price_cents":1000,"line_subtotal_cents":0,"product_snapshot":{}}]'::jsonb
  )$$,
  '22023',
  'order item snapshot is invalid',
  'invalid order items reject the whole snapshot'
);
select is(
  (
    select count(*)::integer
    from public.orders
    where idempotency_key = 'checkout:sandbox:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
  ),
  0,
  'an invalid item leaves no orphan order'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'cart-integrity-other@example.test',
  '',
  now(),
  now(),
  now()
);
select * from public.resolve_active_cart(
  '10000000-0000-4000-8000-000000000002',
  null,
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.carts
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  0,
  'authenticated RLS hides another user cart'
);
reset role;

set local role anon;
select throws_ok(
  $$select count(*) from public.carts$$,
  '42501',
  'permission denied for table carts',
  'anon cannot read guest bearer-token carts directly'
);
reset role;

select * from finish();
rollback;
