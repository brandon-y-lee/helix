-- Run after ticket #187 against the approved non-production project. All
-- fixture writes are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

select has_table('public', 'rewards_accounts', 'rewards accounts are physical records');
select has_table('public', 'rewards_ledger_entries', 'the Points Ledger is a physical table');
select has_table('public', 'rewards_reservations', 'Points Reservations are physical records');
select hasnt_table('public', 'loyalty_accounts', 'the legacy account table is absent');
select hasnt_table('public', 'loyalty_ledger_entries', 'the legacy Points Ledger table is absent');
select hasnt_table('public', 'loyalty_redemptions', 'the legacy reservation table is absent');

select has_type('public', 'rewards_ledger_entry_type', 'Points Ledger entry types use rewards terminology');
select has_type('public', 'rewards_ledger_status', 'Points Ledger statuses use rewards terminology');
select has_type('public', 'rewards_reservation_status', 'Points Reservation statuses use rewards terminology');
select hasnt_type('public', 'loyalty_ledger_entry_type', 'the legacy entry enum is absent');
select hasnt_type('public', 'loyalty_ledger_status', 'the legacy ledger status enum is absent');
select hasnt_type('public', 'loyalty_redemption_status', 'the legacy reservation status enum is absent');

select ok((select relrowsecurity from pg_class where oid = 'public.rewards_accounts'::regclass), 'rewards accounts enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.rewards_ledger_entries'::regclass), 'the Points Ledger enforces RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.rewards_reservations'::regclass), 'Points Reservations enforce RLS');

select table_privs_are('public', 'rewards_accounts', 'authenticated', array['SELECT'], 'Account Holders can only read their rewards account');
select table_privs_are('public', 'rewards_ledger_entries', 'authenticated', array['SELECT'], 'Account Holders can only read their Points Ledger');
select table_privs_are('public', 'rewards_reservations', 'authenticated', array['SELECT'], 'Account Holders can only read Points Reservations');
select table_privs_are('public', 'rewards_accounts', 'anon', array[]::text[], 'Visitors cannot access rewards accounts');
select table_privs_are('public', 'rewards_ledger_entries', 'anon', array[]::text[], 'Visitors cannot access the Points Ledger');
select table_privs_are('public', 'rewards_reservations', 'anon', array[]::text[], 'Visitors cannot access Points Reservations');
select table_privs_are('public', 'rewards_accounts', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server mutates accounts through narrow grants');
select table_privs_are('public', 'rewards_ledger_entries', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server appends and reads Points history');
select table_privs_are('public', 'rewards_reservations', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server manages Points Reservations');

select has_function('public', 'ensure_rewards_account', array['uuid'], 'rewards account setup has a rewards-named RPC');
select has_function('public', 'award_rewards_points', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'Points Awards have a rewards-named RPC');
select has_function('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'Points Reservations have a rewards-named RPC');
select has_function('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'Points Releases have a rewards-named RPC');
select has_function('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'operational Points adjustments have a rewards-named RPC');

select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'authenticated', array[]::text[], 'browser sessions cannot initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'authenticated', array[]::text[], 'browser sessions cannot award Points');
select function_privs_are('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'authenticated', array[]::text[], 'browser sessions cannot reserve Points');
select function_privs_are('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'authenticated', array[]::text[], 'browser sessions cannot release Points');
select function_privs_are('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'authenticated', array[]::text[], 'browser sessions cannot adjust Points');
select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'service_role', array['EXECUTE'], 'the trusted server can initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'the trusted server can award Points');
select function_privs_are('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'service_role', array['EXECUTE'], 'the trusted server can reserve Points');
select function_privs_are('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'service_role', array['EXECUTE'], 'the trusted server can release Points');
select function_privs_are('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'the trusted server can record operational adjustments');

select hasnt_function('public', 'ensure_loyalty_account', array['uuid'], 'the legacy account RPC is removed');
select hasnt_function('public', 'award_loyalty_points', array['uuid', 'integer', 'rewards_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'the legacy award RPC is removed');
select hasnt_function('public', 'redeem_loyalty_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'the legacy reservation RPC is removed');
select hasnt_function('public', 'release_loyalty_redemptions_for_order', array['uuid', 'uuid', 'text'], 'the legacy release RPC is removed');

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.ensure_rewards_account(uuid)'::regprocedure,
      'public.award_rewards_points(uuid,integer,rewards_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure,
      'public.reserve_rewards_points(uuid,integer,integer,text,text,uuid)'::regprocedure,
      'public.release_rewards_reservations_for_order(uuid,uuid,text)'::regprocedure,
      'public.record_rewards_points_adjustment(uuid,integer,rewards_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure
    )
      and proconfig is distinct from array['search_path=""']
  )
  and (
    select prosecdef
    from pg_proc
    where oid = 'public.ensure_rewards_account(uuid)'::regprocedure
  )
  and not exists (
    select 1
    from pg_proc
    where oid in (
      'public.award_rewards_points(uuid,integer,rewards_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure,
      'public.reserve_rewards_points(uuid,integer,integer,text,text,uuid)'::regprocedure,
      'public.release_rewards_reservations_for_order(uuid,uuid,text)'::regprocedure,
      'public.record_rewards_points_adjustment(uuid,integer,rewards_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure
    ) and prosecdef
  ),
  'active rewards functions use fixed search paths and only account setup is definer'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created_rewards'
  ) and not exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created_loyalty'
  ),
  'new Account Holders initialize through the rewards trigger'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rewards-contract-one@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rewards-contract-two@example.test', '', now(), now(), now());

create temporary table ticket_187_referral_identity as
select user_id, id as referral_id
from public.referral_codes
where user_id = '18400000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.ensure_rewards_account('18400000-0000-4000-8000-000000000001')$$,
  'rewards account setup is retry-safe'
);

select is(
  (select count(*)::integer from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  1,
  'rewards account setup preserves account identity'
);

select is(
  (select code.id::text from public.referral_codes as code where code.user_id = '18400000-0000-4000-8000-000000000001'),
  (select referral_id::text from ticket_187_referral_identity),
  'rewards account setup preserves Referral Code identity'
);

select is(
  public.award_rewards_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-187-award-one', 'Ticket 187 Points Award.', null, '{}'::jsonb
  ),
  public.award_rewards_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-187-award-one', 'Ticket 187 Points Award.', null, '{}'::jsonb
  ),
  'a Points Award retry returns the same ledger identity'
);

select is((select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 600, 'a retried Points Award changes the Available Points Balance once');
select is((select lifetime_points from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 600, 'a retried Points Award changes Lifetime Points once');

insert into public.orders (
  id, order_number, user_id, merchandise_subtotal_cents, total_cents,
  idempotency_key
) values (
  '18400000-0000-4000-8000-000000000101', 'TICKET-187-ORDER',
  '18400000-0000-4000-8000-000000000001', 1000, 1000,
  'ticket-187-order-idempotency'
);

select is(
  public.reserve_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-187-reservation-one', 'Ticket 187 Points Reservation.',
    '18400000-0000-4000-8000-000000000101'
  ),
  public.reserve_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-187-reservation-one', 'Ticket 187 Points Reservation.',
    '18400000-0000-4000-8000-000000000101'
  ),
  'a Points Reservation retry returns the same ledger identity'
);

select is((select count(*)::integer from public.rewards_reservations where source_key = 'ticket-187-reservation-one'), 1, 'a retry creates one Points Reservation');

select is(
  public.release_rewards_reservations_for_order(
    '18400000-0000-4000-8000-000000000001',
    '18400000-0000-4000-8000-000000000101',
    'Checkout did not complete'
  ),
  1,
  'the Points Release restores one Checkout reservation'
);

select is(
  public.release_rewards_reservations_for_order(
    '18400000-0000-4000-8000-000000000001',
    '18400000-0000-4000-8000-000000000101',
    'Checkout retry did not complete'
  ),
  0,
  'a retried Points Release is idempotent'
);

select is((select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 600, 'the Points Release restores the Available Points Balance exactly once');
select is((select status::text from public.rewards_reservations where source_key = 'ticket-187-reservation-one'), 'reversed', 'the reservation records its released state');
select is(
  (select count(*)::integer from public.rewards_ledger_entries where source_key = 'reward-release:' || (select id::text from public.rewards_reservations where source_key = 'ticket-187-reservation-one')),
  1,
  'the Points Release appends one immutable ledger entry'
);

select is(
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', -200, 'purchase_refund',
    'ticket-187-purchase-refund', 'Ticket 187 purchase refund.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', -200, 'purchase_refund',
    'ticket-187-purchase-refund', 'Ticket 187 purchase refund.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  'operational adjustment retries return the same ledger identity'
);

select is((select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 400, 'a retried purchase refund removes Points once');

select is(
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', 200, 'redemption_reversal',
    'ticket-187-redemption-reversal', 'Ticket 187 Points Redemption reversal.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', 200, 'redemption_reversal',
    'ticket-187-redemption-reversal', 'Ticket 187 Points Redemption reversal.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  'a Points Reversal retry preserves ledger identity'
);

select is((select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 600, 'a retried Points Reversal restores Points once');
select is((select lifetime_points from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'), 600, 'operational balance adjustments preserve Lifetime Points');

select throws_ok(
  $$select public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', -700, 'manual_adjustment',
    'ticket-187-insufficient-adjustment', 'Ticket 187 insufficient adjustment.',
    null, '{}'::jsonb
  )$$,
  'Insufficient Available Points Balance',
  'operational adjustments use the canonical insufficient-balance contract'
);

select set_config('request.jwt.claims', '{"sub":"18400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.rewards_accounts), 1, 'rewards account RLS hides another Account Holder');
select is((select count(*)::integer from public.rewards_ledger_entries), 5, 'Points Ledger RLS returns only the caller history');
select is((select count(*)::integer from public.rewards_reservations), 1, 'Points Reservation RLS returns only the caller holds');
reset role;

select * from finish();
rollback;
