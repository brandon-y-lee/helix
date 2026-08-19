-- Two-session probe for the rewards compatibility boundary.
-- Seed an Account Holder with 400 Points, then run SESSION A and SESSION B at
-- the same time. The underlying loyalty redemption row lock must allow exactly
-- one 400-Point reservation; the other session must report insufficient balance.
-- Roll back fixture state after the probe.

-- SETUP
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '18400000-0000-4000-8000-000000000003',
  'authenticated', 'authenticated', 'rewards-concurrency@example.test', '',
  now(), now(), now()
);
select public.award_rewards_points(
  '18400000-0000-4000-8000-000000000003', 400, 'manual_adjustment',
  'ticket-184-concurrency-seed', 'Ticket 184 concurrency seed.', null, '{}'::jsonb
);
commit;

-- SESSION A
begin;
select public.redeem_rewards_points(
  '18400000-0000-4000-8000-000000000003', 400, 1000,
  'ticket-184-concurrency-a', 'Ticket 184 concurrent reservation A.', null
);
select pg_sleep(2);
commit;

-- SESSION B (start while SESSION A is sleeping)
begin;
select public.redeem_rewards_points(
  '18400000-0000-4000-8000-000000000003', 400, 1000,
  'ticket-184-concurrency-b', 'Ticket 184 concurrent reservation B.', null
);
rollback;

-- VERIFY AND CLEAN UP
select count(*) = 1 as exactly_one_reservation
from public.rewards_redemptions
where user_id = '18400000-0000-4000-8000-000000000003'
  and source_key in ('ticket-184-concurrency-a', 'ticket-184-concurrency-b');

delete from auth.users where id = '18400000-0000-4000-8000-000000000003';
