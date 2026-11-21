-- Enroll first-order checkout once as the authenticated original owner.
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
  versions text[];
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

  -- A combined protected push can first release settlement and then admission.
  -- Authenticate the actual currently installed prefix, including its CLI-recorded
  -- content, and accept only the enrolled settlement package in the remaining slots.
  select array_agg(version order by version) into versions
    from supabase_migrations.schema_migrations where version >= '20261120000000';
  if versions is null or versions not in (
      array['20261120131137','20261120141910'],
      array['20261120131137','20261120141910','20261121073052'],
      array['20261120131137','20261120141910','20261121073052','20261121073053'])
    or exists (select from (values
      ('20261120131137', 'bind_catalog_media_to_environment_a3a4689005e528cc5b9e5dfb19296e13c40e7f4bc08ae0b473bc647d64bc3b79', '485fe5f157dc4d84e44d42e60c3ad42aae1e54d7c155cb68276ffd49e4fdad01'),
      ('20261120141910', 'index_stable_catalog_product_order_c101adbf089dad57a12a41458ef19e78e62288346022b127385ee02eb3f8de60', '729381a3661c6e763245e1b40a58d8e2bbc12a2ff35c0fe06044fce92cfc3670'),
      ('20261121073052', 'extend_checkout_environment_c4c02b088368680d6f9cf150c77d88b954f470555f95d9c6a2ac2a2eea82886e', 'e030a5786aa424f3f9c668a1a4c6a0fb3d7ebfea3506f92a208adcbb96755a2b'),
      ('20261121073053', 'install_live_checkout_contract_7e9401f94ae9560023436e248a6c8c85282bbcfe847cc34a2333a5210394aa95', '77c6e37ca1766e1c177c1922ca3a14f63c4c522f2a75729d4e5d62852fd9c092')
    ) expected(version,name,digest) join supabase_migrations.schema_migrations l using (version)
    where l.name is distinct from expected.name or
      encode(sha256(convert_to(to_jsonb(l.statements)::text,'UTF8')),'hex') is distinct from expected.digest)
    or (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where
      enumtypid='public.checkout_environment'::regtype) is distinct from
        (case when cardinality(versions)=2 then array['sandbox'] else array['sandbox','live'] end)
    or (to_regclass('private.live_checkout_bindings') is not null) <> (cardinality(versions)=4)
    or (to_regprocedure('private.live_checkout_contract_installed()') is not null) <> (cardinality(versions)=4) then
      raise exception 'Unexpected pre-admission Checkout release prefix';
  end if;
  if cardinality(versions)=4 then
    if not exists (select from pg_proc p where p.oid='private.live_checkout_contract_installed()'::regprocedure
        and p.proowner=owner_id and not p.prosecdef and p.prolang=(select oid from pg_language where lanname='sql')
        and p.proconfig=array['search_path=pg_catalog, pg_temp'] and p.provolatile='s'
        and p.prorettype='bool'::regtype and not p.proretset and p.prokind='f'
        and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='7572f1b1b11e8212bb8db9417de87dc2370328b0aa4ea33b12094e24021d6ac4'
        and has_function_privilege(writer,p.oid,'EXECUTE')
        and not exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>p.proowner and (a.grantee<>writer or a.grantor<>p.proowner or a.is_grantable))) then
      raise exception 'Unqualified Checkout settlement verifier';
    end if;
    if private.live_checkout_contract_installed() is not true then
      raise exception 'Checkout settlement contract drifted';
    end if;
  end if;

  if exists (select from (values
      ('private.extend_checkout_environment()'::regprocedure,'22402553e06d27f061cd711ab1dda066ce2b5069981639c7783a481ac1d593d0'),
      ('private.install_live_checkout_contract()'::regprocedure,'62a0cc228bf5cfa0c9615723bed8e9cfcddd251b5123b4d9c391f1fc7c473dac')
    ) expected(routine,body_sha) join pg_proc p on p.oid=expected.routine
    where p.proowner<>owner_id or not p.prosecdef or p.prolang<>(select oid from pg_language where lanname='plpgsql')
      or p.proconfig is distinct from array['search_path=pg_catalog, pg_temp','lock_timeout=3s']
      or p.prorettype <> 'void'::regtype or p.prokind<>'f' or p.proretset or p.provolatile<>'v'
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.body_sha
      or not has_function_privilege(writer,p.oid,'EXECUTE')
      or exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee<>owner_id and (a.grantee<>writer or a.grantor<>owner_id or a.is_grantable))) then
    raise exception 'Unqualified Checkout predecessor capability or writer';
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
      and p.oid not in (previous, 'private.extend_checkout_environment()'::regprocedure,
        'private.install_live_checkout_contract()'::regprocedure, 'private.read_helix_environment()'::regprocedure,
        'private.apply_helix_catalog_media_binding()'::regprocedure,
        'private.is_bound_catalog_product_media_url(text)'::regprocedure)
      and not (p.pronamespace = 'public'::regnamespace and exists (
        select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) then
    raise exception 'Unexpected default grant or privileged operation available to the forward writer';
  end if;
end;
$owner$;

\ir ../business-checkout/inventory.sql
\ir ../business-checkout/issuer.sql
\ir ../business-checkout/admission.sql
\ir ../business-checkout/manual-fulfillment.sql
revoke all on function private.install_first_order_inventory(), private.install_first_order_issuer(), private.install_first_order_admission(), private.install_first_order_fulfillment() from public,anon,authenticated,service_role;
\ir ../live-checkout/extend-business-checkout-environment.sql
\ir ../live-checkout/install-first-order-checkout.sql
revoke all on function private.extend_business_checkout_environment(), private.install_first_order_checkout()
  from public, anon, authenticated, service_role;
grant execute on function private.extend_business_checkout_environment(), private.install_first_order_checkout()
  to :"writer_role";

do $acl$
declare
  writer constant oid := current_setting('helix.enroll_writer')::regrole;
begin
  if exists (select from (values
    ('private.install_first_order_inventory()'::regprocedure,'a480c3708e19291468240b7d8aafa457f6c5a167bcd0b78d4aabe4585a602549'),
    ('private.install_first_order_issuer()'::regprocedure,'0cb8040b9f9a702e05c820dd39bb135f3ce8ff068955250cbbeabcd9cb964f44'),
    ('private.install_first_order_admission()'::regprocedure,'a2cdf64146874bb21d96883891ac00e07d510bcc66e0984a6af68ac6f13a5829'),
    ('private.install_first_order_fulfillment()'::regprocedure,'1d0502c757be333f737ef0200db9ccb8319deca9e41025d4b58e6161c4a7e3f5')
  ) expected(routine,sha) join pg_proc p on p.oid=expected.routine
  where p.proowner <> current_user::regrole or p.prosecdef or p.prolang <> (select oid from pg_language where lanname='plpgsql')
    or p.proconfig is distinct from array['search_path=pg_catalog, pg_temp'] or p.prokind<>'f'
    or p.prorettype<>'void'::regtype or p.proretset or p.provolatile<>'v'
    or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.sha
    or exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantor<>p.proowner or a.grantee<>p.proowner)) then
    raise exception 'Unexpected first-order Checkout phase owner, body or grant';
  end if;
  if exists (
    select from (values
      ('private.extend_business_checkout_environment()'::regprocedure,'15fd48996e7c8fba8b26924abedab3e95ae7794a3418bc1f1850b5204fbd19c5'),
      ('private.install_first_order_checkout()'::regprocedure,'8365592a00bc9f038f20b0d179bd2d65666c23cb59cfc5b824eb1bd048726cac')
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
