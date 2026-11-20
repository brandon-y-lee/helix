DO $migration$
begin
  -- The owner enrolls this one operation on the externally verified project.
  -- The release login can call it but cannot install, replace or change it.
  if not exists (
    select from pg_catalog.pg_proc p
    where p.oid = 'private.apply_helix_catalog_media_binding()'::regprocedure
      and p.proowner = (select relowner from pg_catalog.pg_class where oid='private.helix_environment'::regclass)
      and p.prosecdef and p.proconfig = array['search_path=pg_catalog, pg_temp']
      and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') = '70b8a9c17b3e41612239d5692da70be837ad90be4d13f629a62bce97c800cb2b'
  ) then raise exception 'Unqualified Catalog media release capability'; end if;
  perform private.apply_helix_catalog_media_binding();
end;
$migration$;
