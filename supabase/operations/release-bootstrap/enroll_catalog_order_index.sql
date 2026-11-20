-- Owner operation after enroll_catalog_media_release.sql on the verified project.
-- Supply its same psql variables writer_role, expected_environment and expected_project_ref.
-- The owner installs a single operation. The normal release records its application.
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
  media constant oid := 'private.apply_helix_catalog_media_binding()'::regprocedure;
  history constant oid := 'supabase_migrations.schema_migrations'::regclass;
  marker constant oid := 'private.helix_environment'::regclass;
begin
  if current_user <> session_user
    or exists (select from pg_class where oid in (marker,'public.products'::regclass) and relowner <> owner_id)
    or not exists (select from private.helix_environment where singleton
      and (environment,project_ref) in (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'))
      and environment = current_setting('helix.enroll_environment') and project_ref = current_setting('helix.enroll_project_ref')) then
    raise exception 'Expected the authenticated original owner and independently verified environment';
  end if;

  -- Bind the existing #560 login, never enroll an additional grantee. Check
  -- its media capability and both marker readers before trusting their ACLs.
  if exists (select from (values
      (media,true,'plpgsql','search_path=pg_catalog, pg_temp','70b8a9c17b3e41612239d5692da70be837ad90be4d13f629a62bce97c800cb2b'),
      ('private.read_helix_environment()'::regprocedure,true,'sql','search_path=""','d0da1cc1d6378efa182afcfc20f1dad42f55786b8be334f1e69ab1850fdc966e'),
      ('public.read_helix_environment()'::regprocedure,false,'sql','search_path=""','1a5d68297f34755d92cb4ea80e1432a76443861ff66a90e16b7eb651666996e7')
    ) expected(routine,definer,language,setting,digest) join pg_proc p on p.oid = expected.routine
    where p.proowner <> owner_id or p.prosecdef <> expected.definer or p.proconfig is distinct from array[expected.setting]
      or p.prolang <> (select oid from pg_language where lanname = expected.language)
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') <> expected.digest
      or not has_function_privilege(writer,p.oid,'EXECUTE')
      or exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee <> owner_id and (a.is_grantable or a.grantor <> owner_id or
          (a.grantee <> writer and (p.oid = media or a.grantee <> 'service_role'::regrole)))))
    or not exists (select from pg_roles r where r.oid = writer and r.rolcanlogin and writer <> owner_id
      and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication and not r.rolbypassrls
      and r.rolname not in ('anon','authenticated','authenticator','service_role')
      and r.rolname !~ '^(pg_|supabase_)')
    or exists (select from pg_auth_members where member = writer or (roleid = writer and member <> owner_id))
    or has_database_privilege(writer,current_database(),'CREATE')
    or exists (select from pg_namespace n where n.nspname in ('private','public','supabase_migrations')
      and (has_schema_privilege(writer,n.oid,'CREATE') or not has_schema_privilege(writer,n.oid,'USAGE')))
    or exists (select from pg_class c where c.relnamespace in ('private'::regnamespace,'public'::regnamespace,'supabase_migrations'::regnamespace)
      and c.relkind in ('r','p','v','m','f') and (
        has_table_privilege(writer,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege(writer,c.oid,'UPDATE,REFERENCES')
        or (c.oid <> history and has_any_column_privilege(writer,c.oid,'INSERT'))
        or (c.relnamespace = 'private'::regnamespace and has_any_column_privilege(writer,c.oid,'SELECT'))))
    or not has_table_privilege(writer,history,'SELECT') or not has_table_privilege(writer,history,'INSERT')
    or has_table_privilege(writer,history,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION') then
    raise exception 'The verified, restricted Catalog media migration login is required';
  end if;

  -- The media release may already have run or may still be the next genuine
  -- ledger entry. Its one additional private definer is a read-only predicate.
  if exists (select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('private','public','supabase_migrations') and p.prosecdef
      and has_function_privilege(writer,p.oid,'EXECUTE')
      and p.oid not in (media,'private.read_helix_environment()'::regprocedure)
      and not (p.oid is not distinct from to_regprocedure('private.is_bound_catalog_product_media_url(text)')
        and p.proowner = owner_id and p.proconfig is not distinct from array['search_path=""']
        and p.prolang = (select oid from pg_language where lanname = 'sql') and p.provolatile = 's'
        and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = 'fccaf85a521fe40a2a7b4990e27ddf1dc0a7824f6a56c2aa78a7043ed104d8d7')
      and not (n.nspname = 'public' and exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) then
    raise exception 'Unexpected privileged routine available to the migration login';
  end if;
end;
$owner$;

create function private.apply_helix_catalog_order_index()
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '3s'
set default_tablespace = ''
as $capability$
begin
  -- Take the writer-conflicting lock immediately or leave this migration
  -- pending. Ordinary storefront SELECTs continue during the index build.
  lock table public.products in share row exclusive mode nowait;
  if to_regclass('public.products_catalog_status_sort_id_idx') is null then
    create index products_catalog_status_sort_id_idx
      on public.products using btree (catalog_status, sort_order, id);
  end if;

  -- A name collision, partial index, nondefault collation/order, or invalid
  -- index must roll back before the CLI can record this version.
  if not exists (select from pg_index i
    where i.indexrelid = to_regclass('public.products_catalog_status_sort_id_idx')
      and i.indrelid = 'public.products'::regclass and i.indisvalid and i.indisready and i.indislive
      and pg_get_indexdef(i.indexrelid) =
        'CREATE INDEX products_catalog_status_sort_id_idx ON public.products USING btree (catalog_status, sort_order, id)') then
    raise exception 'Unexpected Catalog ordering index definition or readiness';
  end if;
end;
$capability$;
revoke all on function private.apply_helix_catalog_order_index() from public, anon, authenticated, service_role;
grant execute on function private.apply_helix_catalog_order_index() to :"writer_role";

do $acl$
declare
  writer constant oid := current_setting('helix.enroll_writer')::regrole;
begin
  if exists (select from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid = 'private.apply_helix_catalog_order_index()'::regprocedure and a.grantee <> p.proowner
      and (a.grantee <> writer or a.grantor <> p.proowner or a.is_grantable))
    or not has_function_privilege(writer,'private.apply_helix_catalog_order_index()','EXECUTE') then
    raise exception 'Unexpected Catalog index capability grant';
  end if;
end;
$acl$;
commit;
