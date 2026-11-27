-- Install the fixed capability through the independently verified object owner.
\set ON_ERROR_STOP on
begin;
set local search_path = pg_catalog, pg_temp;
select set_config('helix.enroll_writer', :'writer_role', true),
       set_config('helix.enroll_environment', :'expected_environment', true),
       set_config('helix.enroll_project_ref', :'expected_project_ref', true);

do $owner$
declare
  owner_id constant oid := current_user::regrole;
  writer constant oid := current_setting('helix.enroll_writer')::regrole;
  marker constant regclass := 'private.helix_environment'::regclass;
  history constant regclass := 'supabase_migrations.schema_migrations'::regclass;
begin
  if current_user <> session_user
    or not exists (select from pg_class where oid = marker and relowner = owner_id)
    or not exists (select from private.helix_environment where singleton
      and environment = current_setting('helix.enroll_environment')
      and project_ref = current_setting('helix.enroll_project_ref'))
    or not exists (select from pg_roles r where r.oid = writer and r.rolcanlogin and writer <> owner_id
      and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication and not r.rolbypassrls
      and r.rolname not in ('anon','authenticated','authenticator','service_role') and r.rolname !~ '^(pg_|supabase_)')
    or exists (select from pg_auth_members where member = writer or (roleid = writer and member <> owner_id))
    or has_database_privilege(writer, current_database(), 'CREATE')
    or exists (select from pg_namespace where nspname in ('private','public','supabase_migrations')
      and (not has_schema_privilege(writer, oid, 'USAGE') or has_schema_privilege(writer, oid, 'CREATE')))
    or not has_function_privilege(writer, 'private.read_helix_environment()', 'EXECUTE')
    or not has_function_privilege(writer, 'public.read_helix_environment()', 'EXECUTE')
    or not has_table_privilege(writer, history, 'SELECT') or not has_table_privilege(writer, history, 'INSERT')
    or has_table_privilege(writer, history, 'UPDATE,DELETE,TRUNCATE,TRIGGER')
    or has_any_column_privilege(writer, marker, 'INSERT,UPDATE')
  then
    raise exception 'Expected the verified original owner and restricted forward migration login';
  end if;
end;
$owner$;

\ir retire_product_notifications.sql
revoke all on function private.retire_helix_product_notifications() from public, anon, authenticated, service_role;
grant execute on function private.retire_helix_product_notifications() to :"writer_role";
do $acl$
declare
  capability constant regprocedure := 'private.retire_helix_product_notifications()'::regprocedure;
  writer constant oid := current_setting('helix.enroll_writer')::regrole;
begin
  if not has_function_privilege(writer, capability, 'EXECUTE')
    or exists (select from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = capability and a.grantee <> p.proowner
        and (a.grantee <> writer or a.grantor <> p.proowner or a.is_grantable)) then
    raise exception 'Unexpected Product retirement capability privileges';
  end if;
end;
$acl$;
commit;
