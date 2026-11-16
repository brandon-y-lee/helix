-- Temporary helix rewards expansion boundary for ticket #184.
--
-- Tickets #185 and #186 move customer and operational consumers to these
-- rewards-named interfaces. Ticket #187 removes this boundary and renames the
-- underlying active implementation. Until then, the views deliberately share
-- the existing rows and the wrappers deliberately share the existing mutation
-- functions so Points identity, audit history, locking, and idempotency cannot
-- diverge between names.

create view public.rewards_accounts
with (security_invoker = true)
as
select
  account.user_id,
  account.points_balance,
  account.lifetime_points,
  account.created_at,
  account.updated_at
from public.loyalty_accounts as account;

create view public.rewards_ledger_entries
with (security_invoker = true)
as
select
  entry.id,
  entry.user_id,
  entry.order_id,
  entry.entry_type,
  entry.status,
  entry.points,
  entry.description,
  entry.source_key,
  entry.metadata,
  entry.created_at
from public.loyalty_ledger_entries as entry;

create view public.rewards_redemptions
with (security_invoker = true)
as
select
  redemption.id,
  redemption.user_id,
  redemption.order_id,
  redemption.status,
  redemption.points,
  redemption.amount_cents,
  redemption.source_key,
  redemption.created_at,
  redemption.updated_at
from public.loyalty_redemptions as redemption;

revoke all privileges on table public.rewards_accounts from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_ledger_entries from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_redemptions from public, anon, authenticated, service_role;

grant select on table public.rewards_accounts to authenticated;
grant select on table public.rewards_ledger_entries to authenticated;
grant select on table public.rewards_redemptions to authenticated;

grant select, insert, update on table public.rewards_accounts to service_role;
grant select, insert, update on table public.rewards_ledger_entries to service_role;
grant select, insert, update on table public.rewards_redemptions to service_role;

create function public.ensure_rewards_account(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.ensure_loyalty_account(p_user_id);
end;
$$;

create function public.award_rewards_points(
  p_user_id uuid,
  p_points integer,
  p_entry_type public.loyalty_ledger_entry_type,
  p_source_key text,
  p_description text,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.award_loyalty_points(
    p_user_id,
    p_points,
    p_entry_type,
    p_source_key,
    p_description,
    p_order_id,
    p_metadata
  );
end;
$$;

create function public.redeem_rewards_points(
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
begin
  return public.redeem_loyalty_points(
    p_user_id,
    p_points,
    p_amount_cents,
    p_source_key,
    p_description,
    p_order_id
  );
end;
$$;

create function public.release_rewards_redemptions_for_order(
  p_user_id uuid,
  p_order_id uuid,
  p_reason text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.release_loyalty_redemptions_for_order(
    p_user_id,
    p_order_id,
    p_reason
  );
end;
$$;

revoke all on function public.ensure_rewards_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public.award_rewards_points(uuid, integer, public.loyalty_ledger_entry_type, text, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.redeem_rewards_points(uuid, integer, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_rewards_redemptions_for_order(uuid, uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.ensure_rewards_account(uuid) to service_role;
grant execute on function public.award_rewards_points(uuid, integer, public.loyalty_ledger_entry_type, text, text, uuid, jsonb) to service_role;
grant execute on function public.redeem_rewards_points(uuid, integer, integer, text, text, uuid) to service_role;
grant execute on function public.release_rewards_redemptions_for_order(uuid, uuid, text) to service_role;

comment on view public.rewards_accounts is
  'Temporary ticket #184 rewards interface over loyalty_accounts; remove in ticket #187.';
comment on view public.rewards_ledger_entries is
  'Temporary ticket #184 rewards interface over loyalty_ledger_entries; remove in ticket #187.';
comment on view public.rewards_redemptions is
  'Temporary ticket #184 rewards interface over loyalty_redemptions; remove in ticket #187.';
