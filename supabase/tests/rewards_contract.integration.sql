-- Run after the rewards contract migration against the approved non-production
-- project. All fixture writes are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

select has_view('public', 'rewards_accounts', 'rewards accounts has an additive read/write interface');
select has_view('public', 'rewards_ledger_entries', 'the Points Ledger has an additive interface');
select has_view('public', 'rewards_redemptions', 'Points redemptions have an additive interface');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_accounts'::regclass), false),
  'rewards accounts runs with invoker security'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_ledger_entries'::regclass), false),
  'the rewards ledger runs with invoker security'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.rewards_redemptions'::regclass), false),
  'rewards redemptions runs with invoker security'
);

select table_privs_are('public', 'rewards_accounts', 'authenticated', array['SELECT'], 'Account Holders can only read their rewards account');
select table_privs_are('public', 'rewards_ledger_entries', 'authenticated', array['SELECT'], 'Account Holders can only read their Points Ledger');
select table_privs_are('public', 'rewards_redemptions', 'authenticated', array['SELECT'], 'Account Holders can only read their redemptions');
select table_privs_are('public', 'rewards_accounts', 'anon', array[]::text[], 'Visitors cannot access rewards accounts');
select table_privs_are('public', 'rewards_ledger_entries', 'anon', array[]::text[], 'Visitors cannot access the Points Ledger');
select table_privs_are('public', 'rewards_redemptions', 'anon', array[]::text[], 'Visitors cannot access redemptions');
select table_privs_are('public', 'rewards_accounts', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server can maintain rewards accounts');
select table_privs_are('public', 'rewards_ledger_entries', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server can maintain the Points Ledger');
select table_privs_are('public', 'rewards_redemptions', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'the trusted server can maintain redemptions');

select has_function('public', 'ensure_rewards_account', array['uuid'], 'rewards account setup has a rewards-named RPC');
select has_function('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'Points awards have a rewards-named RPC');
select has_function('public', 'redeem_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'Points reservations have a rewards-named RPC');
select has_function('public', 'release_rewards_redemptions_for_order', array['uuid', 'uuid', 'text'], 'Points releases have a rewards-named RPC');

select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'authenticated', array[]::text[], 'browser sessions cannot initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'authenticated', array[]::text[], 'browser sessions cannot award Points');
select function_privs_are('public', 'redeem_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'authenticated', array[]::text[], 'browser sessions cannot reserve Points');
select function_privs_are('public', 'release_rewards_redemptions_for_order', array['uuid', 'uuid', 'text'], 'authenticated', array[]::text[], 'browser sessions cannot release Points');
select function_privs_are('public', 'ensure_rewards_account', array['uuid'], 'service_role', array['EXECUTE'], 'the trusted server can initialize rewards state');
select function_privs_are('public', 'award_rewards_points', array['uuid', 'integer', 'loyalty_ledger_entry_type', 'text', 'text', 'uuid', 'jsonb'], 'service_role', array['EXECUTE'], 'the trusted server can award Points');
select function_privs_are('public', 'redeem_rewards_points', array['uuid', 'integer', 'integer', 'text', 'text', 'uuid'], 'service_role', array['EXECUTE'], 'the trusted server can reserve Points');
select function_privs_are('public', 'release_rewards_redemptions_for_order', array['uuid', 'uuid', 'text'], 'service_role', array['EXECUTE'], 'the trusted server can release Points');

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.ensure_rewards_account(uuid)'::regprocedure,
      'public.award_rewards_points(uuid,integer,loyalty_ledger_entry_type,text,text,uuid,jsonb)'::regprocedure,
      'public.redeem_rewards_points(uuid,integer,integer,text,text,uuid)'::regprocedure,
      'public.release_rewards_redemptions_for_order(uuid,uuid,text)'::regprocedure
    )
      and (prosecdef or proconfig is distinct from array['search_path=""'])
  ),
  'all rewards wrappers are invoker-safe with an empty fixed search path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rewards-contract-one@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rewards-contract-two@example.test', '', now(), now(), now());

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
  public.award_rewards_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-184-award-one', 'Ticket 184 award.', null, '{}'::jsonb
  ),
  public.award_rewards_points(
    '18400000-0000-4000-8000-000000000001', 600, 'manual_adjustment',
    'ticket-184-award-one', 'Ticket 184 award.', null, '{}'::jsonb
  ),
  'rewards-named award retries return the same ledger identity'
);

select is(
  public.redeem_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-184-redeem-one', 'Ticket 184 redemption.', null
  ),
  public.redeem_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-184-redeem-one', 'Ticket 184 redemption.', null
  ),
  'rewards-named redemption retries return the same ledger identity'
);

select is(
  (select points_balance from public.rewards_accounts where user_id = '18400000-0000-4000-8000-000000000001'),
  200,
  'a retried reservation spends Points once'
);

select throws_ok(
  $$select public.redeem_rewards_points(
    '18400000-0000-4000-8000-000000000001', 400, 1000,
    'ticket-184-redeem-two', 'Ticket 184 competing redemption.', null
  )$$,
  'Insufficient loyalty balance',
  'serialized balance checks prevent overspending'
);

select set_config('request.jwt.claims', '{"sub":"18400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.rewards_accounts), 1, 'rewards account RLS hides another Account Holder');
select is((select count(*)::integer from public.rewards_ledger_entries), 2, 'Points Ledger RLS returns only the caller history');
reset role;

select * from finish();
rollback;
