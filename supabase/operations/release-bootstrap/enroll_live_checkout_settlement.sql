-- Run once with psql -f from the reviewed checkout as the original object owner.
-- Supply writer_role, expected_environment and expected_project_ref after verifying
-- the provider target. The forward runner applies each operation and records it.
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
  history constant oid := 'supabase_migrations.schema_migrations'::regclass;
  previous constant oid := 'private.apply_helix_catalog_order_index()'::regprocedure;
begin
  if current_user <> session_user
    or (select typowner from pg_type where oid = 'public.checkout_environment'::regtype) <> owner_id
    or exists (select from pg_class where oid in ('private.helix_environment'::regclass,
      'public.orders'::regclass, 'public.payment_attempts'::regclass, 'public.stripe_customers'::regclass,
      'public.stripe_webhook_events'::regclass, 'private.checkout_payment_contracts'::regclass,
      'private.checkout_verified_payments'::regclass, 'private.checkout_receipt_cohorts'::regclass)
      and relowner <> owner_id)
    or not exists (select from private.helix_environment where singleton
      and (environment, project_ref) in (('development','zyfkunnpnlmgvrojmrbg'), ('production','erasogmsqpgiirovubjh'))
      and environment = current_setting('helix.enroll_environment')
      and project_ref = current_setting('helix.enroll_project_ref')) then
    raise exception 'Checkout enrollment requires the authenticated original owner and verified target';
  end if;

  -- This existing capability has exactly one non-owner grantee. Prove the
  -- proposed login is that writer before giving it another fixed operation.
  if not exists (select from pg_proc p where p.oid = previous and p.proowner = owner_id
     and p.prosecdef and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
     and p.proconfig = array['search_path=pg_catalog, pg_temp','lock_timeout=3s','default_tablespace=']
     and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = '81c750abab9feeb79d5d7c51619bb603d0e7eb09327b32948faadfe3e8167211'
     and exists (select from aclexplode(p.proacl) a where a.grantor = owner_id and a.grantee = writer
       and a.privilege_type = 'EXECUTE' and not a.is_grantable)
     and not exists (select from aclexplode(p.proacl) a where a.grantee <> owner_id and
       (a.grantee <> writer or a.grantor <> owner_id or a.is_grantable)))
    or (select count(*) from supabase_migrations.schema_migrations where version in ('20261120131137','20261120141910')) <> 2
    or not exists (select from pg_roles where oid = writer and oid <> owner_id
      and rolcanlogin and not (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
      and rolname not in ('anon','authenticated','authenticator','service_role')
      and rolname !~ '^(pg_|supabase_|cli_login_)')
    or exists (select from pg_auth_members where member = writer or (roleid = writer and member <> owner_id))
    or has_database_privilege(writer,current_database(),'CREATE')
    or exists (select from pg_namespace n where n.nspname in ('public','private','supabase_migrations')
      and (not has_schema_privilege(writer,n.oid,'USAGE') or has_schema_privilege(writer,n.oid,'CREATE')))
    or exists (select from pg_class c where c.relnamespace in ('private'::regnamespace,'public'::regnamespace,'supabase_migrations'::regnamespace)
      and c.relkind in ('r','p','v','m','f') and (
        has_table_privilege(writer,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege(writer,c.oid,'UPDATE,REFERENCES')
        or (c.oid <> history and has_any_column_privilege(writer,c.oid,'INSERT'))
        or (c.relnamespace = 'private'::regnamespace and has_any_column_privilege(writer,c.oid,'SELECT'))))
    or not has_table_privilege(writer,history,'SELECT') or not has_table_privilege(writer,history,'INSERT')
    or has_table_privilege(writer,history,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION') then
    raise exception 'Checkout enrollment requires the existing restricted forward writer';
  end if;

  if exists (select from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = owner_id and a.grantee = writer and
        d.defaclnamespace in (0,'public'::regnamespace,'private'::regnamespace,'supabase_migrations'::regnamespace))
    or exists (select from pg_proc p where p.prosecdef and has_function_privilege(writer,p.oid,'EXECUTE')
      and p.pronamespace in ('public'::regnamespace,'private'::regnamespace,'supabase_migrations'::regnamespace)
      and p.oid not in (previous, 'private.read_helix_environment()'::regprocedure,
        'private.apply_helix_catalog_media_binding()'::regprocedure,
        'private.is_bound_catalog_product_media_url(text)'::regprocedure)
      and not (p.pronamespace = 'public'::regnamespace and exists (
        select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) then
    raise exception 'Unexpected default grant or privileged operation available to the forward writer';
  end if;
end;
$owner$;

\ir ../live-checkout/extend-checkout-environment.sql
\ir ../live-checkout/install-live-checkout-contract.sql
revoke all on function private.extend_checkout_environment(), private.install_live_checkout_contract()
  from public, anon, authenticated, service_role;
grant execute on function private.extend_checkout_environment(), private.install_live_checkout_contract()
  to :"writer_role";

do $acl$
declare
  writer constant oid := current_setting('helix.enroll_writer')::regrole;
begin
  if exists (
    select from (values
      ('private.extend_checkout_environment()'::regprocedure,'22402553e06d27f061cd711ab1dda066ce2b5069981639c7783a481ac1d593d0'),
      ('private.install_live_checkout_contract()'::regprocedure,'665b199538c8280057bade308542d3e485dbc0d5aeed90dbc45c4f2146e07b46')
    ) expected(routine,body_sha) join pg_proc p on p.oid = expected.routine
    where p.proowner <> current_user::regrole or not p.prosecdef or p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
      or p.proconfig is distinct from array['search_path=pg_catalog, pg_temp','lock_timeout=3s']
      or p.prorettype <> 'void'::regtype or p.prokind <> 'f' or p.proretset or p.provolatile <> 'v'
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') <> expected.body_sha
      or not has_function_privilege(writer,p.oid,'EXECUTE')
      or exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee <> p.proowner
        and (a.grantee <> writer or a.grantor <> p.proowner or a.is_grantable))
  ) then raise exception 'Unexpected Checkout deployment capability definition or permissions'; end if;
end;
$acl$;
commit;
