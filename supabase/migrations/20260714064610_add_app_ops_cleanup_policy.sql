-- Keep the private cleanup audit table explicit under RLS. The schema/table
-- remains revoked from anon/authenticated; service_role is the only operational
-- role allowed to read or write cleanup metadata.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'app_ops'
      and tablename = 'data_cleanup_runs'
      and policyname = 'data_cleanup_runs_service_role_all'
  ) then
    create policy "data_cleanup_runs_service_role_all"
      on app_ops.data_cleanup_runs
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
