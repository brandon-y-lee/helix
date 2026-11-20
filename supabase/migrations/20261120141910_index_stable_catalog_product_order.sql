DO $migration$
begin
  if current_user <> session_user or not exists (
    select from pg_catalog.pg_proc p
    where p.oid = 'private.apply_helix_catalog_order_index()'::pg_catalog.regprocedure
      and p.proowner = (select relowner from pg_catalog.pg_class where oid = 'public.products'::pg_catalog.regclass)
      and p.proowner = (select relowner from pg_catalog.pg_class where oid = 'private.helix_environment'::pg_catalog.regclass)
      and p.prosecdef and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
      and p.proconfig = array['search_path=pg_catalog, pg_temp','lock_timeout=3s','default_tablespace=']
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') =
        'ceda02a7e8606d134ee7c4142378ee1dfb4d0019fcffef0cc06c322f6543e3eb'
      and p.proowner <> session_user::pg_catalog.regrole
      and exists (select from pg_catalog.aclexplode(p.proacl) a
        where a.grantee = session_user::pg_catalog.regrole and a.grantor = p.proowner and a.privilege_type = 'EXECUTE')
      and not exists (select from pg_catalog.aclexplode(p.proacl) a where a.grantee <> p.proowner
        and (a.grantee <> session_user::pg_catalog.regrole or a.grantor <> p.proowner or a.is_grantable))
  ) then raise exception 'Unqualified Catalog ordering index operation or migration login'; end if;
  perform private.apply_helix_catalog_order_index();
end;
$migration$;
