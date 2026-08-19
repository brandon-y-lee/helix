begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_function(
  'public',
  'qualify_referral_for_paid_order',
  array['uuid'],
  'paid Referral Reward qualification has a server contract'
);
select function_privs_are(
  'public',
  'qualify_referral_for_paid_order',
  array['uuid'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot qualify Referral Rewards'
);
select function_privs_are(
  'public',
  'qualify_referral_for_paid_order',
  array['uuid'],
  'service_role',
  array['EXECUTE'],
  'the trusted server can qualify Referral Rewards'
);
select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.qualify_referral_for_paid_order(uuid)'::regprocedure
      and not prosecdef
      and proconfig = array['search_path=""']
  ),
  'Referral Reward qualification uses invoker security and an empty search path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '18500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ticket-185-referrer@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ticket-185-referee@example.test', '', now(), now(), now());

select public.ensure_rewards_account('18500000-0000-4000-8000-000000000001');
select public.ensure_rewards_account('18500000-0000-4000-8000-000000000002');

insert into public.orders (
  id, order_number, user_id, status, paid_at,
  merchandise_subtotal_cents, total_cents, idempotency_key
) values (
  '18500000-0000-4000-8000-000000000101', 'TICKET-185-REFERRAL',
  '18500000-0000-4000-8000-000000000002', 'payment_failed', null,
  5000, 5000, 'ticket-185-referral-order'
);

insert into public.referral_attributions (
  referral_code_id, referrer_user_id, referee_user_id, order_id, status, source_key
)
select
  code.id,
  '18500000-0000-4000-8000-000000000001',
  '18500000-0000-4000-8000-000000000002',
  '18500000-0000-4000-8000-000000000101',
  'pending',
  'ticket-185-referral-attribution'
from public.referral_codes as code
where code.user_id = '18500000-0000-4000-8000-000000000001';

select is(
  public.qualify_referral_for_paid_order(
    '18500000-0000-4000-8000-000000000101'
  ),
  null,
  'an unpaid Order cannot issue a Referral Reward'
);
select is(
  (
    select count(*)::integer
    from public.referral_rewards
    where referral_attribution_id = (
      select id
      from public.referral_attributions
      where source_key = 'ticket-185-referral-attribution'
    )
  ),
  0,
  'an unpaid Order leaves Referral Rewards empty'
);
select is(
  (
    select status::text
    from public.referral_attributions
    where source_key = 'ticket-185-referral-attribution'
  ),
  'pending',
  'an unpaid Order leaves its Referral Attribution pending'
);

update public.orders
set status = 'paid', paid_at = now()
where id = '18500000-0000-4000-8000-000000000101';

create temporary table ticket_185_referral_result as
select public.qualify_referral_for_paid_order(
  '18500000-0000-4000-8000-000000000101'
) as reward_id;

select ok(
  (select reward_id is not null from ticket_185_referral_result),
  'a later verified Paid Order can issue the Referral Reward'
);
select is(
  public.qualify_referral_for_paid_order(
    '18500000-0000-4000-8000-000000000101'
  )::text,
  (select reward_id::text from ticket_185_referral_result),
  'a retried Referral Reward qualification returns the same Reward'
);
select is(
  (
    select count(*)::integer
    from public.referral_rewards
    where source_key like 'referral-reward:%'
      and referral_attribution_id = (
        select id
        from public.referral_attributions
        where source_key = 'ticket-185-referral-attribution'
      )
  ),
  1,
  'a retry creates exactly one Referral Reward'
);
select is(
  (
    select status::text
    from public.referral_attributions
    where source_key = 'ticket-185-referral-attribution'
  ),
  'qualified',
  'Referral Attribution records the qualified outcome'
);

select has_function(
  'public',
  'submit_private_feedback_reward',
  array['uuid', 'uuid', 'integer', 'text'],
  'private feedback has an atomic Points Award contract'
);
select function_privs_are(
  'public',
  'submit_private_feedback_reward',
  array['uuid', 'uuid', 'integer', 'text'],
  'authenticated',
  array[]::text[],
  'browser sessions cannot complete private feedback or award Points'
);
select function_privs_are(
  'public',
  'submit_private_feedback_reward',
  array['uuid', 'uuid', 'integer', 'text'],
  'service_role',
  array['EXECUTE'],
  'the trusted server can submit private feedback'
);
select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.submit_private_feedback_reward(uuid,uuid,integer,text)'::regprocedure
      and not prosecdef
      and proconfig = array['search_path=""']
  ),
  'private feedback submission uses invoker security and an empty search path'
);

insert into public.private_feedback (
  id, user_id, order_id, status
) values (
  '18500000-0000-4000-8000-000000000201',
  '18500000-0000-4000-8000-000000000002',
  '18500000-0000-4000-8000-000000000101',
  'available'
);

update public.loyalty_accounts
set points_balance = 2147483600, lifetime_points = 2147483600
where user_id = '18500000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.submit_private_feedback_reward(
    '18500000-0000-4000-8000-000000000002',
    '18500000-0000-4000-8000-000000000201',
    5,
    'Calm after use.'
  )$$,
  '22003',
  'integer out of range',
  'a failed Points Award rolls back feedback completion'
);
select is(
  (
    select status::text
    from public.private_feedback
    where id = '18500000-0000-4000-8000-000000000201'
  ),
  'available',
  'a failed Points Award leaves private feedback retryable'
);
select is(
  (
    select count(*)::integer
    from public.loyalty_ledger_entries
    where source_key = 'private-feedback:18500000-0000-4000-8000-000000000101'
  ),
  0,
  'a failed Points Award leaves no partial Points Ledger entry'
);

update public.loyalty_accounts
set points_balance = 0, lifetime_points = 0
where user_id = '18500000-0000-4000-8000-000000000002';

create temporary table ticket_185_feedback_result as
select public.submit_private_feedback_reward(
  '18500000-0000-4000-8000-000000000002',
  '18500000-0000-4000-8000-000000000201',
  5,
  'Calm after use.'
) as entry_id;

select ok(
  (select entry_id is not null from ticket_185_feedback_result),
  'feedback can be retried after the rolled-back failure'
);
select is(
  public.submit_private_feedback_reward(
    '18500000-0000-4000-8000-000000000002',
    '18500000-0000-4000-8000-000000000201',
    5,
    'Calm after use.'
  )::text,
  (select entry_id::text from ticket_185_feedback_result),
  'a feedback retry returns the same Points Ledger entry'
);
select is(
  (
    select status::text
    from public.private_feedback
    where id = '18500000-0000-4000-8000-000000000201'
  ),
  'rewarded',
  'successful feedback records the rewarded outcome'
);
select is(
  (
    select count(*)::integer
    from public.loyalty_ledger_entries
    where source_key = 'private-feedback:18500000-0000-4000-8000-000000000101'
  ),
  1,
  'feedback retries create exactly one Points Ledger entry'
);

select * from finish();

rollback;
