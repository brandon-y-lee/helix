-- Keep runtime access to the Points Ledger append-only and retire the final
-- temporary compatibility description left by the expansion migrations.

revoke update on table public.rewards_ledger_entries from service_role;

comment on function public.record_rewards_points_adjustment(
  uuid,
  integer,
  public.rewards_ledger_entry_type,
  text,
  text,
  uuid,
  jsonb
) is 'Trusted server-only operational Points adjustment contract.';
