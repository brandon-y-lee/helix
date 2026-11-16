-- Additive correction to the ticket #184 expansion boundary.
-- The first migration is already applied and remains immutable. These grants
-- make every rewards view read-only, retire the imprecise provisional
-- redemption entrypoints, and expose Points Reservation terminology.

create view public.rewards_reservations
with (security_invoker = true)
as
select
  reservation.id,
  reservation.user_id,
  reservation.order_id,
  reservation.status,
  reservation.points,
  reservation.amount_cents,
  reservation.source_key,
  reservation.created_at,
  reservation.updated_at
from public.loyalty_redemptions as reservation;

revoke all privileges on table public.rewards_accounts from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_ledger_entries from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_redemptions from public, anon, authenticated, service_role;
revoke all privileges on table public.rewards_reservations from public, anon, authenticated, service_role;

grant select on table public.rewards_accounts to authenticated;
grant select on table public.rewards_ledger_entries to authenticated;
grant select on table public.rewards_reservations to authenticated;

grant select on table public.rewards_accounts to service_role;
grant select on table public.rewards_ledger_entries to service_role;
grant select on table public.rewards_reservations to service_role;

revoke all on function public.redeem_rewards_points(uuid, integer, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_rewards_redemptions_for_order(uuid, uuid, text) from public, anon, authenticated, service_role;

create function public.reserve_rewards_points(
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

create function public.release_rewards_reservations_for_order(
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

revoke all on function public.reserve_rewards_points(uuid, integer, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_rewards_reservations_for_order(uuid, uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.reserve_rewards_points(uuid, integer, integer, text, text, uuid) to service_role;
grant execute on function public.release_rewards_reservations_for_order(uuid, uuid, text) to service_role;

comment on view public.rewards_reservations is
  'Temporary ticket #184 Points Reservation interface over loyalty_redemptions; remove in ticket #187.';
comment on view public.rewards_redemptions is
  'Non-callable provisional ticket #184 alias retained only because its applied migration is immutable.';
comment on function public.redeem_rewards_points(uuid, integer, integer, text, text, uuid) is
  'Non-callable provisional ticket #184 alias retained only because its applied migration is immutable.';
comment on function public.release_rewards_redemptions_for_order(uuid, uuid, text) is
  'Non-callable provisional ticket #184 alias retained only because its applied migration is immutable.';
