DO $migration$
begin
  if current_user <> session_user or not exists (
    select from pg_catalog.pg_proc p
    where p.oid = 'private.install_live_checkout_contract()'::pg_catalog.regprocedure
      and p.proowner = (select typowner from pg_catalog.pg_type where oid = 'public.checkout_environment'::pg_catalog.regtype)
      and p.proowner = (select relowner from pg_catalog.pg_class where oid = 'private.helix_environment'::pg_catalog.regclass)
      and p.proowner <> session_user::pg_catalog.regrole
      and p.prosecdef and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
      and p.proconfig = array['search_path=pg_catalog, pg_temp','lock_timeout=3s']
      and p.prorettype = 'void'::pg_catalog.regtype and p.prokind = 'f' and not p.proretset and p.provolatile = 'v'
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') =
        '665b199538c8280057bade308542d3e485dbc0d5aeed90dbc45c4f2146e07b46'
      and exists (select from pg_catalog.aclexplode(p.proacl) a where a.grantee = session_user::pg_catalog.regrole
        and a.grantor = p.proowner and a.privilege_type = 'EXECUTE' and not a.is_grantable)
      and not exists (select from pg_catalog.aclexplode(p.proacl) a where a.grantee <> p.proowner
        and (a.grantee <> session_user::pg_catalog.regrole or a.grantor <> p.proowner or a.is_grantable))
  ) then raise exception 'Unqualified Checkout deployment capability or writer'; end if;
  perform private.install_live_checkout_contract();
end;
$migration$;
