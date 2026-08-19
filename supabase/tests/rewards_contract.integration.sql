-- Run after both ticket #184 migrations against the approved non-production
-- project. All fixture writes are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

select has_view('public', 'rewards_accounts', 'rewards accounts exposes the existing Points account');
select has_view('public', 'rewards_ledger_entries', 'the Points Ledger exposes existing history');
select has_view('public', 'rewards_reservations', 'Points Reservations expose existing Checkout holds');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_accounts'::regclass), false),
  'rewards accounts runs with invoker security'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_ledger_entries'::regclass), false),
  'the Points Ledger runs with invoker security'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_reservations'::regclass), false),
  'Points Reservations run with invoker security'
);

select table_privs_are('public', 'rewards_accounts', 'authenticated', array['SELECT'], 'Account Holders can only read their rewards account');
select table_privs_are('public', 'rewards_ledger_entries', 'authenticated', array['SELECT'], 'Account Holders can only read their Points Ledger');
select table_privs_are('public', 'rewards_reservations', 'authenticated', array['SELECT'], 'Account Holders can only read their Points Reservations');
select table_privs_are('public', 'rewards_accounts', 'anon', array[]::text[], 'Visitors cannot access rewards accounts');
select table_privs_are('public', 'rewards_ledger_entries', 'anon', array[]::text[], 'Visitors cannot access the Points Ledger');
select table_privs_are('public', 'rewards_reservations', 'anon', array[]::text[], 'Visitors cannot access Points Reservations');
select table_privs_are('public', 'rewards_accounts', 'service_role', array['SELECT'], 'the trusted server reads accounts through the view');
select table_privs_are('public', 'rewards_ledger_entries', 'service_role', array['SELECT'], 'the trusted server reads immutable history through the view');
select table_privs_are('public', 'rewards_reservations', 'service_role', array['SELECT'], 'the trusted server reads reservations through the view');
select hasnt_view('public', 'rewards_redemptions', 'the provisional misnamed view is removed');

select has_function('public', 'ensure_rewards_account', array['uuid'], 'rewards account setup has a rewards-named RPC');
select has_function('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'Points Awards have a rewards-named RPC');
select has_function('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'Points Reservations have a rewards-named RPC');
select has_function('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'Points Releases have a rewards-named RPC');
select has_function('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'operational Points adjustments have a rewards-named RPC');

select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'authenticated', array[]::text[], 'browser sessions cannot initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'authenticated', array[]::text[], 'browser sessions cannot award Points');
select function_privs_are('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'authenticated', array[]::text[], 'browser sessions cannot reserve Points');
select function_privs_are('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'authenticated', array[]::text[], 'browser sessions cannot release Points');
select function_privs_are('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'authenticated', array[]::text[], 'browser sessions cannot adjust Points');
select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'service_role', array['EXECUTE'], 'the trusted server can initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'the trusted server can award Points');
select function_privs_are('public', 'reserve_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'service_role', array['EXECUTE'], 'the trusted server can reserve Points');
select function_privs_are('public', 'release_rewards_reservations_for_order', array['uuid', 'uuid', 'text'], 'service_role', array['EXECUTE'], 'the trusted server can release Points');
select function_privs_are('public', 'record_rewards_points_adjustment', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'the trusted server can record operational adjustments');
select hasnt_function('public', 'redeem_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'the provisional reservation-as-redemption RPC is removed');
select hasnt_function('public', 'release_rewards_redemptions_for_order', array['uuid', 'uuid', 'text'], 'the provisional misnamed release RPC is removed');

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.ensure_rewards_account(uuid)'::regprocedure,
      'public.award_rewards_points(uuid,integer,loyalty_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure,
      'public.reserve_rewards_points(uuid,integer,integer,text,text,uuid)'::regprocedure,
      'public.release_rewards_reservations_for_order(uuid,uuid,text)'::regprocedure,
      'public.record_rewards_points_adjustment(uuid,integer,loyalty_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure
    )
      and (prosecdef or proconfig is distinct from array['search_path=""'])
  ),
  'all active rewards wrappers are invoker-safe with an empty fixed search path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rewards-contract-one@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rewards-contract-two@example.test', '', now(), now(), now());

create temporary table ticket_184_referral_identity as
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
  'the rewards view preserves the existing account identity'
);

select is(
  (select code.id::text from public.referral_codes as code where code.user_id = '18400000-0000-4000-8000-000000000001'),
  (select referral_id::text from ticket_184_referral_identity),
  'rewards account setup preserves the Referral Code identity'
);

select is(
  public.award_rewards_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-184-award-one', 'Ticket 184 Points Award.', null, '{}'::jsonb
  ),
  public.award_loyalty_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-184-award-one', 'Ticket 184 Points Award.', null, '{}'::jsonb
  ),
  'rewards and loyalty award names return the same ledger identity'
);

select is(
  (select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  600,
  'a retried cross-name Points Award changes the Available Points Balance once'
);

select is(
  (select lifetime_points from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  600,
  'a retried cross-name Points Award changes Lifetime Points once'
);

insert into public.orders (
  id, order_number, user_id, merchandise_subtotal_cents, total_cents,
  idempotency_key
) values (
  '18400000-0000-4000-8000-000000000101', 'TICKET-184-ORDER',
  '18400000-0000-4000-8000-000000000001', 1000, 1000,
  'ticket-184-order-idempotency'
);

select is(
  public.reserve_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-184-reservation-one', 'Ticket 184 Points Reservation.',
    '18400000-0000-4000-8000-000000000101'
  ),
  public.redeem_loyalty_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-184-reservation-one', 'Ticket 184 Points Reservation.',
    '18400000-0000-4000-8000-000000000101'
  ),
  'rewards reservation and legacy loyalty names return the same ledger identity'
);

select is(
  (select count(*)::integer
   from public.rewards_reservations as rewards
   join public.loyalty_redemptions as loyalty on loyalty.id = rewards.id
   where rewards.source_key = 'ticket-184-reservation-one'),
  1,
  'the rewards reservation view preserves the existing row identity'
);

select is(
  public.release_rewards_reservations_for_order(
    '18400000-0000-4000-8000-000000000001',
    '18400000-0000-4000-8000-000000000101',
    'Checkout did not complete'
  ),
  1,
  'the rewards release restores one Checkout reservation'
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

select is(
  (select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  600,
  'the Points Release restores the Available Points Balance exactly once'
);

select is(
  (select status::text from public.rewards_reservations where source_key = 'ticket-184-reservation-one'),
  'reversed',
  'the shared reservation row records its released state'
);

select is(
  (select count(*)::integer
   from public.rewards_ledger_entries
   where source_key = 'reward-release:' || (
     select id::text from public.rewards_reservations where source_key = 'ticket-184-reservation-one'
   )),
  1,
  'the Points Release appends one immutable ledger entry'
);

select is(
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', -200, 'purchase_refund',
    'ticket-184-purchase-refund', 'Ticket 184 purchase refund.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', -200, 'purchase_refund',
    'ticket-184-purchase-refund', 'Ticket 184 purchase refund.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  'operational adjustment retries return the same ledger identity'
);

select is(
  (select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  400,
  'a retried purchase refund removes Points once'
);

select is(
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', 200, 'redemption_reversal',
    'ticket-184-redemption-reversal', 'Ticket 184 Points Redemption reversal.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  public.record_rewards_points_adjustment(
    '18400000-0000-4000-8000-000000000001', 200, 'redemption_reversal',
    'ticket-184-redemption-reversal', 'Ticket 184 Points Redemption reversal.',
    '18400000-0000-4000-8000-000000000101', '{}'::jsonb
  ),
  'a Points Reversal retry preserves ledger identity'
);

select is(
  (select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  600,
  'a retried Points Reversal restores Points once'
);

select is(
  (select lifetime_points from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  600,
  'operational balance adjustments preserve Lifetime Points'
);

select set_config('request.jwt.claims', '{"sub":"18400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.rewards_accounts), 1, 'rewards account RLS hides another Account Holder');
select is((select count(*)::integer from public.rewards_ledger_entries), 5, 'Points Ledger RLS returns only the caller history');
select is((select count(*)::integer from public.rewards_reservations), 1, 'Points Reservation RLS returns only the caller holds');
reset role;

select * from finish();
rollback;
