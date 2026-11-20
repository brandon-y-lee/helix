\set ON_ERROR_STOP on
-- Read-only development psql entry. Preserve the caller's transaction.
do $$
begin
  if not exists (select 1 from public.read_helix_environment()
      where environment = 'development' and project_ref = 'zyfkunnpnlmgvrojmrbg') then
    raise exception 'A verified development Catalog connection is required';
  end if;
end;
$$;
\ir product-url-inventory.sql
select pg_temp.product_url_inventory('development');
